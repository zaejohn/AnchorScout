import type {
  AnchorProvider,
  RawProviderQuote,
  RouteRequest,
} from "../types";
import { isIP } from "node:net";

const TOML_QUOTE_SERVER = /^ANCHOR_QUOTE_SERVER\s*=\s*["']([^"']+)["']/m;

type Sep38PriceResponse = {
  price: string;
  total_price: string;
  fee: { total: string };
};

const PRIVATE_IPV4 = /^(?:10\.|127\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/;

export function assertSafeQuoteServer(
  homeDomain: string,
  advertisedServer: string,
  allowedOrigins = process.env.SEP38_ALLOWED_QUOTE_ORIGINS ?? "",
) {
  const home = new URL(homeDomain);
  const candidate = new URL(advertisedServer);
  if (candidate.protocol !== "https:" || candidate.username || candidate.password) {
    throw new Error("SEP-38 server must use authenticated HTTPS");
  }
  const hostname = candidate.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const ipVersion = isIP(hostname);
  if (
    hostname === "localhost" ||
    (ipVersion === 4 && PRIVATE_IPV4.test(hostname)) ||
    (ipVersion === 6 && (hostname === "::1" || hostname.startsWith("fc") || hostname.startsWith("fd") || hostname.startsWith("fe80")))
  ) {
    throw new Error("SEP-38 server cannot target a private host");
  }
  const allowlist = new Set(
    [home.origin, ...allowedOrigins.split(",").map((value) => value.trim())]
      .filter(Boolean)
      .map((value) => new URL(value).origin),
  );
  if (!allowlist.has(candidate.origin)) {
    throw new Error("SEP-38 server origin is not explicitly allowed");
  }
  return candidate;
}

export class Sep38IndicativeProvider implements AnchorProvider {
  constructor(
    readonly id: string,
    readonly name: string,
    private readonly homeDomain: string,
  ) {}

  async getQuote(
    request: RouteRequest,
    signal: AbortSignal,
  ): Promise<RawProviderQuote> {
    const tomlUrl = new URL("/.well-known/stellar.toml", this.homeDomain);
    if (tomlUrl.protocol !== "https:") throw new Error("SEP-1 requires HTTPS");
    const tomlResponse = await fetch(tomlUrl, {
      signal,
      cache: "force-cache",
      next: { revalidate: 3_600 },
    });
    if (!tomlResponse.ok) throw new Error("SEP-1 metadata unavailable");
    const quoteServer = (await tomlResponse.text()).match(TOML_QUOTE_SERVER)?.[1];
    if (!quoteServer) throw new Error("Anchor does not advertise SEP-38");

    const safeQuoteServer = assertSafeQuoteServer(this.homeDomain, quoteServer);
    const endpoint = new URL(
      "price",
      safeQuoteServer.href.endsWith("/") ? safeQuoteServer : `${safeQuoteServer.href}/`,
    );
    endpoint.searchParams.set(
      "sell_asset",
      request.sourceAsset === "XLM"
        ? "stellar:native"
        : `stellar:USDC:${process.env.TESTNET_USDC_ISSUER ?? process.env.NEXT_PUBLIC_TESTNET_USDC_ISSUER ?? "UNCONFIGURED"}`,
    );
    endpoint.searchParams.set("buy_asset", "iso4217:PHP");
    endpoint.searchParams.set("sell_amount", request.amount);
    endpoint.searchParams.set("context", "sep31");
    const response = await fetch(endpoint, { signal, cache: "no-store" });
    if (!response.ok) throw new Error(`SEP-38 price failed (${response.status})`);
    const price = (await response.json()) as Sep38PriceResponse;
    const sourceAmount = Number(request.amount);
    const totalPrice = Number(price.total_price || price.price);
    const fee = Number(price.fee?.total ?? 0);
    if (![totalPrice, fee].every(Number.isFinite) || totalPrice <= 0 || fee < 0) {
      throw new Error("Malformed SEP-38 price response");
    }

    return {
      anchorId: this.id,
      anchorName: this.name,
      quoteId: `indicative_${this.id}_${Date.now()}`,
      sourceAsset: request.sourceAsset,
      sourceAmount,
      destinationCurrency: request.destinationCurrency,
      destinationAmount: sourceAmount * totalPrice,
      exchangeRate: Number(price.price),
      fee,
      payoutMethod: request.payoutMethod,
      estimatedMinutes: 10,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      available: true,
      isDemo: false,
    };
  }
}
