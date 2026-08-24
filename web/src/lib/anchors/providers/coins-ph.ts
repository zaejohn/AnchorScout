import "server-only";

import { createHash, createHmac } from "node:crypto";
import { z } from "zod";

import type {
  AnchorProvider,
  RawProviderQuote,
  RouteRequest,
} from "../types";

const COINS_API = "https://api.pro.coins.ph";

const exchangeInfoSchema = z.object({
  serverTime: z.number(),
  symbols: z.array(
    z.object({
      symbol: z.string(),
      status: z.string(),
      baseAsset: z.string(),
      quoteAsset: z.string(),
      filters: z.array(
        z.object({
          filterType: z.string(),
          minQty: z.coerce.number().positive().optional(),
          minNotional: z.coerce.number().positive().optional(),
        }),
      ),
    }),
  ),
});

const depthSchema = z.object({
  lastUpdateId: z.union([z.number(), z.string()]),
  bids: z.array(z.tuple([z.coerce.number().positive(), z.coerce.number().positive()])),
});

const convertQuoteSchema = z.object({
  status: z.number(),
  error: z.string().optional(),
  data: z.object({
    quoteId: z.string().min(1),
    sourceCurrency: z.string(),
    targetCurrency: z.string(),
    sourceAmount: z.coerce.number().positive(),
    price: z.coerce.number().positive(),
    targetAmount: z.coerce.number().positive(),
    expiry: z.coerce.number().int().positive(),
  }),
});

const channelSchema = z.object({
  status: z.number(),
  error: z.string().optional(),
  data: z.array(
    z.object({
      transactionChannel: z.string(),
      transactionSubject: z.string(),
      transactionSubjectType: z.string(),
      transactionSubjectName: z.string(),
      minimum: z.coerce.number().min(0),
      maximum: z.coerce.number().positive(),
      fee: z.coerce.number().min(0),
      feeType: z.string(),
      status: z.coerce.string(),
    }),
  ),
});

async function getJson(url: URL, signal: AbortSignal) {
  const response = await fetch(url, {
    cache: "no-store",
    headers: { accept: "application/json" },
    signal,
  });
  if (!response.ok) throw new Error(`Coins.ph market API failed (${response.status})`);
  return response.json() as Promise<unknown>;
}

export type CoinsMarketReference = {
  symbol: string;
  sourceAmount: number;
  destinationAmount: number;
  exchangeRate: number;
  marketUpdateId: string;
  observedAt: number;
};

/**
 * Values a sale against the live bid side instead of multiplying by a last
 * trade. This includes visible order-book slippage for the requested amount.
 */
export async function getCoinsMarketReference(
  request: RouteRequest,
  signal: AbortSignal,
): Promise<CoinsMarketReference> {
  const baseAsset = request.sourceAsset === "XLM" ? "XLM" : "USDC";
  const symbol = `${baseAsset}PHP`;
  const exchangeUrl = new URL("/openapi/v1/exchangeInfo", COINS_API);
  exchangeUrl.searchParams.set("symbol", symbol);
  const depthUrl = new URL("/openapi/quote/v1/depth", COINS_API);
  depthUrl.searchParams.set("symbol", symbol);
  depthUrl.searchParams.set("limit", "1000");

  const [exchangeRaw, depthRaw] = await Promise.all([
    getJson(exchangeUrl, signal),
    getJson(depthUrl, signal),
  ]);
  const exchange = exchangeInfoSchema.parse(exchangeRaw);
  const market = exchange.symbols.find((entry) => entry.symbol === symbol);
  if (
    !market ||
    market.status.toLowerCase() !== "trading" ||
    market.baseAsset !== baseAsset ||
    market.quoteAsset !== "PHP"
  ) {
    throw new Error("Coins.ph market is not trading");
  }
  const depth = depthSchema.parse(depthRaw);
  const sourceAmount = Number(request.amount);
  let remaining = sourceAmount;
  let destinationAmount = 0;
  for (const [price, quantity] of depth.bids) {
    if (remaining <= 0) break;
    const filled = Math.min(remaining, quantity);
    destinationAmount += filled * price;
    remaining -= filled;
  }
  if (remaining > 1e-7 || destinationAmount <= 0) {
    throw new Error("Coins.ph order book has insufficient visible liquidity");
  }
  const minimumQuantity = market.filters.find(
    (filter) => filter.filterType === "LOT_SIZE",
  )?.minQty;
  const minimumNotional = market.filters.find(
    (filter) => filter.filterType === "MIN_NOTIONAL",
  )?.minNotional;
  if (
    (minimumQuantity !== undefined && sourceAmount < minimumQuantity) ||
    (minimumNotional !== undefined && destinationAmount < minimumNotional)
  ) {
    throw new Error("Amount is below the live Coins.ph market minimum");
  }

  return {
    symbol,
    sourceAmount,
    destinationAmount,
    exchangeRate: destinationAmount / sourceAmount,
    marketUpdateId: String(depth.lastUpdateId),
    observedAt: exchange.serverTime,
  };
}

export class CoinsPhMarketProvider implements AnchorProvider {
  readonly id = "coins-ph-market";
  readonly name = "Coins.ph live market";

  async getQuote(
    request: RouteRequest,
    signal: AbortSignal,
  ): Promise<RawProviderQuote> {
    const market = await getCoinsMarketReference(request, signal);
    // Public market data has no provider-issued expiry. Force a refresh after
    // one minute so the UI cannot present an old order-book snapshot as live.
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    const quoteId = createHash("sha256")
      .update(
        [market.symbol, market.marketUpdateId, request.amount, request.payoutMethod].join(":"),
      )
      .digest("hex")
      .slice(0, 32);

    return {
      anchorId: this.id,
      anchorName: this.name,
      quoteId: `market_${quoteId}`,
      sourceAsset: request.sourceAsset,
      sourceAmount: market.sourceAmount,
      destinationCurrency: request.destinationCurrency,
      destinationAmount: market.destinationAmount,
      exchangeRate: market.exchangeRate,
      fee: null,
      feeCurrency: null,
      payoutMethod: request.payoutMethod,
      estimatedMinutes: null,
      estimatedSettlement:
        request.payoutMethod === "BANK"
          ? "Payout timing shown after authenticated rail selection"
          : "GCash timing shown in the authenticated payout flow",
      expiresAt,
      available: true,
      quoteKind: "MARKET_REFERENCE",
      settlementMode: "FIAT_SIMULATED",
      rateSource: `Live ${market.symbol} bid-side order book observed ${new Date(market.observedAt).toISOString()}`,
      feeSource: "Live payout fee requires a Coins.ph business account",
      availabilitySource: `Live ${market.symbol} trading status and order-book liquidity`,
      providerUrl: "https://www.coins.ph/en-ph/business",
      disclosures: [
        "The PHP amount is a live gross market reference, not a firm Convert quote.",
        "Bank or GCash fees and recipient eligibility require authenticated Coins.ph APIs.",
        "No production Coins.ph deposit, conversion, or fiat payout is initiated from Testnet.",
        ...(request.sourceAsset === "TEST_USDC"
          ? ["The USDC/PHP market is production data used only to value Testnet USDC."]
          : []),
      ],
    };
  }
}

async function signedPost(
  path: string,
  bodyValue: Record<string, string>,
  credentials: { apiKey: string; secretKey: string },
  signal: AbortSignal,
) {
  const body = JSON.stringify(bodyValue);
  const timestamp = String(Date.now());
  const query = `timestamp=${timestamp}`;
  const signature = createHmac("sha256", credentials.secretKey)
    .update(`${query}${body}`)
    .digest("hex");
  const response = await fetch(
    `${COINS_API}${path}?${query}&signature=${signature}`,
    {
      method: "POST",
      cache: "no-store",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "X-COINS-APIKEY": credentials.apiKey,
      },
      body,
      signal,
    },
  );
  if (!response.ok) throw new Error(`Coins.ph authenticated API failed (${response.status})`);
  return response.json() as Promise<unknown>;
}

export class CoinsPhAuthenticatedProvider implements AnchorProvider {
  readonly id = "coins-ph-firm";
  readonly name = "Coins.ph firm quote";

  constructor(
    private readonly credentials: { apiKey: string; secretKey: string },
    private readonly bankSubject?: string,
  ) {}

  supports(request: RouteRequest) {
    return request.payoutMethod === "GCASH" || Boolean(this.bankSubject);
  }

  async getQuote(
    request: RouteRequest,
    signal: AbortSignal,
  ): Promise<RawProviderQuote> {
    const sourceCurrency = request.sourceAsset === "XLM" ? "XLM" : "USDC";
    const quoteRaw = await signedPost(
      "/openapi/convert/v1/get-quote",
      {
        sourceCurrency,
        targetCurrency: "PHP",
        sourceAmount: request.amount,
      },
      this.credentials,
      signal,
    );
    const quote = convertQuoteSchema.parse(quoteRaw);
    if (quote.status !== 0) throw new Error("Coins.ph firm quote unavailable");
    if (
      quote.data.sourceCurrency !== sourceCurrency ||
      quote.data.targetCurrency !== "PHP"
    ) {
      throw new Error("Coins.ph firm quote changed the requested currency pair");
    }

    const subject = request.payoutMethod === "GCASH" ? "gcash" : this.bankSubject!;
    const channelRaw = await signedPost(
      "/openapi/fiat/v1/support-channel",
      {
        transactionType: "-1",
        currency: "PHP",
        transactionSubject: subject,
        amount: String(quote.data.targetAmount),
      },
      this.credentials,
      signal,
    );
    const channels = channelSchema.parse(channelRaw);
    if (channels.status !== 0) throw new Error("Coins.ph payout channel unavailable");
    const eligibleChannels = channels.data.filter(
      (item) =>
        item.status === "1" &&
        item.transactionSubject.toLowerCase() === subject.toLowerCase() &&
        quote.data.targetAmount >= item.minimum &&
        quote.data.targetAmount <= item.maximum,
    );
    const channel = eligibleChannels.sort((left, right) => {
      const feeFor = (item: (typeof eligibleChannels)[number]) =>
        item.feeType.toLowerCase() === "fixed"
          ? item.fee
          : (quote.data.targetAmount * item.fee) / 100;
      const feeDelta = feeFor(left) - feeFor(right);
      if (feeDelta !== 0) return feeDelta;
      if (left.transactionChannel === right.transactionChannel) return 0;
      return left.transactionChannel === "INSTAPAY" ? -1 : 1;
    })[0];
    if (!channel) throw new Error("Coins.ph payout channel is unavailable for this amount");
    const feeType = channel.feeType.toLowerCase();
    if (feeType !== "fixed" && feeType !== "percentage") {
      throw new Error("Coins.ph returned an unknown payout fee type");
    }
    const feePhp = feeType === "fixed"
      ? channel.fee
      : (quote.data.targetAmount * channel.fee) / 100;
    const destinationAmount = quote.data.targetAmount - feePhp;
    if (destinationAmount <= 0) throw new Error("Coins.ph fee exceeds payout amount");

    return {
      anchorId: this.id,
      anchorName: this.name,
      quoteId: quote.data.quoteId,
      sourceAsset: request.sourceAsset,
      sourceAmount: quote.data.sourceAmount,
      destinationCurrency: request.destinationCurrency,
      destinationAmount,
      exchangeRate: quote.data.price,
      fee: feePhp,
      feeCurrency: "PHP",
      payoutMethod: request.payoutMethod,
      estimatedMinutes: null,
      estimatedSettlement:
        channel.transactionChannel === "INSTAPAY"
          ? "InstaPay is described by Coins.ph as near-real-time"
          : "PESONet is described by Coins.ph as T+1",
      expiresAt: new Date(Date.now() + quote.data.expiry * 1_000).toISOString(),
      available: true,
      quoteKind: "FIRM",
      settlementMode: "FIAT_SIMULATED",
      rateSource: "Authenticated Coins.ph Convert quote",
      feeSource: `Authenticated live ${channel.transactionChannel} ${channel.transactionSubjectName} channel`,
      availabilitySource: "Authenticated account-specific payout channel status and limits",
      providerUrl: "https://docs.coins.ph/rest-api/",
      disclosures: [
        "Rate, payout fee, limits, and channel availability are live account-scoped provider data.",
        "The quote is not accepted and no production conversion or payout is initiated.",
        "The external fiat payout remains simulated because AnchorScout executes only on Stellar Testnet.",
        ...(request.sourceAsset === "TEST_USDC"
          ? ["The production USDC quote values Testnet USDC; no production USDC is transferred."]
          : []),
      ],
    };
  }
}
