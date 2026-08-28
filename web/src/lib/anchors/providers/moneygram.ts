import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";

import type {
  AnchorProvider,
  RawProviderQuote,
  RouteRequest,
} from "../types";
import { UnsupportedProviderRouteError } from "../provider-errors";
import { getCoinsMarketReference } from "./coins-ph";

const MONEYGRAM_HOME = "https://extmgxanchor.moneygram.com";
const sep24InfoSchema = z.object({
  withdraw: z.object({
    USDC: z.object({
      enabled: z.boolean(),
      min_amount: z.number().positive(),
      max_amount: z.number().positive(),
    }),
  }),
  fee: z.object({ enabled: z.boolean() }).optional(),
});

async function fetchText(url: string, signal: AbortSignal) {
  const response = await fetch(url, { cache: "no-store", signal });
  if (!response.ok) throw new Error(`MoneyGram capability check failed (${response.status})`);
  return response.text();
}

export class MoneyGramTestnetProvider implements AnchorProvider {
  readonly id = "moneygram-testnet";
  readonly name = "MoneyGram Ramps Testnet";

  supports(request: RouteRequest) {
    if (request.sourceAsset !== "TEST_USDC") {
      return {
        supported: false,
        message: "MoneyGram Testnet cash pickup requires Test USDC",
      };
    }
    if (request.payoutMethod !== "CASH_PICKUP") {
      return {
        supported: false,
        message: "MoneyGram's Stellar route is cash pickup, not bank or GCash",
      };
    }
    return true;
  }

  async getQuote(
    request: RouteRequest,
    signal: AbortSignal,
  ): Promise<RawProviderQuote> {
    const [toml, infoResponse, market] = await Promise.all([
      fetchText(`${MONEYGRAM_HOME}/.well-known/stellar.toml`, signal),
      fetch(`${MONEYGRAM_HOME}/stellarsepservice/sep24/info`, {
        cache: "no-store",
        headers: { accept: "application/json" },
        signal,
      }),
      getCoinsMarketReference(request, signal),
    ]);
    if (!infoResponse.ok) {
      throw new Error(`MoneyGram SEP-24 info failed (${infoResponse.status})`);
    }
    if (!/NETWORK_PASSPHRASE\s*=\s*["']Test SDF Network/.test(toml)) {
      throw new Error("MoneyGram endpoint is not advertising Stellar Testnet");
    }
    if (!/TRANSFER_SERVER_SEP0024\s*=/.test(toml) || !/code\s*=\s*["']USDC["']/.test(toml)) {
      throw new Error("MoneyGram does not advertise a Testnet USDC SEP-24 route");
    }
    const info = sep24InfoSchema.parse(await infoResponse.json());
    const amount = Number(request.amount);
    const limits = info.withdraw.USDC;
    if (!limits.enabled || amount < limits.min_amount || amount > limits.max_amount) {
      throw new UnsupportedProviderRouteError(
        `Amount is outside MoneyGram Testnet cash-pickup limits (${limits.min_amount}-${limits.max_amount} USDC)`,
      );
    }

    const quoteId = createHash("sha256")
      .update(
        ["moneygram", market.marketUpdateId, request.amount, request.payoutMethod].join(":"),
      )
      .digest("hex")
      .slice(0, 32);

    return {
      anchorId: this.id,
      anchorName: "MoneyGram Testnet cash pickup",
      quoteId: `capability_${quoteId}`,
      sourceAsset: request.sourceAsset,
      sourceAmount: amount,
      destinationCurrency: request.destinationCurrency,
      destinationAmount: market.destinationAmount,
      destinationAmountIncludesFees: false,
      exchangeRate: market.exchangeRate,
      fee: null,
      feeCurrency: null,
      payoutMethod: "CASH_PICKUP",
      estimatedMinutes: null,
      estimatedSettlement:
        "Interactive MoneyGram cash pickup; timing appears after KYC and location selection",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      available: true,
      quoteKind: "MARKET_REFERENCE",
      settlementMode: "PROVIDER_TEST",
      rateSource: `Coins.ph live ${market.symbol} order book observed ${new Date(market.observedAt).toISOString()}`,
      feeSource: info.fee?.enabled
        ? "Shown inside MoneyGram's authenticated hosted flow"
        : "MoneyGram Testnet SEP-24 does not expose a fee endpoint",
      availabilitySource: `Live MoneyGram Testnet SEP-1 + SEP-24 info (${limits.min_amount}-${limits.max_amount} USDC)`,
      providerUrl: "https://xramps.moneygram.com/ops/dev/stellar",
      disclosures: [
        "MoneyGram supplies the live Testnet USDC cash-pickup capability; it does not quote PHP through SEP-38.",
        "The displayed PHP rate comes from Coins.ph live market data, not MoneyGram.",
        "Cash pickup is completed through MoneyGram's hosted SEP-24 flow; AnchorScout does not start that KYC session during the Testnet proof.",
        "No MoneyGram production payout is initiated.",
      ],
    };
  }
}
