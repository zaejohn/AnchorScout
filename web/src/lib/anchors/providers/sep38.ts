import type {
  AnchorProvider,
  RawProviderQuote,
  RouteRequest,
} from "../types";
import { lookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { BlockList, isIP } from "node:net";

const TOML_QUOTE_SERVER = /^ANCHOR_QUOTE_SERVER\s*=\s*["']([^"']+)["']/m;

type Sep38PriceResponse = {
  price: string;
  total_price: string;
  fee: { total: string };
};

const blockedIpv4 = new BlockList();
const blockedIpv6 = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10],
  ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16],
  ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24],
  ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) {
  blockedIpv4.addSubnet(network, prefix, "ipv4");
}
for (const [network, prefix] of [
  ["::", 128], ["::1", 128], ["::ffff:0:0", 96], ["fc00::", 7],
  ["fe80::", 10], ["ff00::", 8], ["2001:db8::", 32],
] as const) {
  blockedIpv6.addSubnet(network, prefix, "ipv6");
}

export function isPublicAddress(address: string) {
  const version = isIP(address);
  if (version === 4) return !blockedIpv4.check(address, "ipv4");
  if (version === 6) return !blockedIpv6.check(address, "ipv6");
  return false;
}

async function resolvePublicAddress(hostname: string) {
  if (isIP(hostname)) {
    if (!isPublicAddress(hostname)) throw new Error("Provider resolved to a private host");
    return { address: hostname, family: isIP(hostname) as 4 | 6 };
  }
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some(({ address }) => !isPublicAddress(address))) {
    throw new Error("Provider resolved to a private host");
  }
  return addresses[0];
}

async function pinnedHttpsGet(url: URL, signal: AbortSignal) {
  const pinned = await resolvePublicAddress(url.hostname);
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const request = httpsRequest(
      {
        protocol: "https:",
        hostname: url.hostname,
        servername: url.hostname,
        port: url.port || 443,
        method: "GET",
        path: `${url.pathname}${url.search}`,
        headers: { accept: "application/json, text/plain;q=0.9" },
        lookup: (_hostname, _options, callback) =>
          callback(null, pinned.address, pinned.family),
      },
      (response) => {
        const status = response.statusCode ?? 500;
        if (status >= 300 && status < 400) {
          response.resume();
          reject(new Error("Provider redirects are not allowed"));
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > 512 * 1024) {
            request.destroy(new Error("Provider response is too large"));
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () =>
          resolve({ status, body: Buffer.concat(chunks).toString("utf8") }),
        );
      },
    );
    request.once("error", reject);
    if (signal.aborted) request.destroy(signal.reason);
    else signal.addEventListener("abort", () => request.destroy(signal.reason), { once: true });
    request.end();
  });
}

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
  if (
    hostname === "localhost" ||
    (isIP(hostname) > 0 && !isPublicAddress(hostname))
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
    const tomlResponse = await pinnedHttpsGet(tomlUrl, signal);
    if (tomlResponse.status < 200 || tomlResponse.status >= 300) {
      throw new Error("SEP-1 metadata unavailable");
    }
    const quoteServer = tomlResponse.body.match(TOML_QUOTE_SERVER)?.[1];
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
    const response = await pinnedHttpsGet(endpoint, signal);
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`SEP-38 price failed (${response.status})`);
    }
    const price = JSON.parse(response.body) as Sep38PriceResponse;
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
