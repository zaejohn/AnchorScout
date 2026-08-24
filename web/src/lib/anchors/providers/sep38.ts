import type {
  AnchorProvider,
  RawProviderQuote,
  RouteRequest,
} from "../types";

const TOML_QUOTE_SERVER = /^ANCHOR_QUOTE_SERVER\s*=\s*["']([^"']+)["']/m;

type Sep38PriceResponse = {
  price: string;
  total_price: string;
  fee: { total: string };
};

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

    const endpoint = new URL("price", quoteServer.endsWith("/") ? quoteServer : `${quoteServer}/`);
    endpoint.searchParams.set(
      "sell_asset",
      request.sourceAsset === "XLM"
        ? "stellar:native"
        : `stellar:USDC:${process.env.TESTNET_USDC_ISSUER ?? "UNCONFIGURED"}`,
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

