import { z } from "zod";

import type { AnchorQuote, RawProviderQuote } from "./types";
import { routeRequestSchema } from "./validation";

const rawQuoteSchema = z.object({
  anchorId: z.string().trim().min(1).max(64),
  anchorName: z.string().trim().min(1).max(80),
  quoteId: z.string().trim().min(1).max(128),
  sourceAsset: z.enum(["XLM", "TEST_USDC"]),
  sourceAmount: z.coerce.number().positive().finite(),
  destinationCurrency: z.literal("PHP"),
  destinationAmount: z.coerce.number().positive().finite(),
  exchangeRate: z.coerce.number().positive().finite(),
  fee: z.union([z.null(), z.coerce.number().min(0).finite()]),
  feeCurrency: z.string().trim().min(1).max(16).nullable(),
  payoutMethod: z.enum(["BANK", "GCASH", "CASH_PICKUP"]),
  destinationAmountIncludesFees: z.boolean().optional().default(false),
  estimatedMinutes: z.number().int().positive().max(10_080).nullable(),
  estimatedSettlement: z.string().trim().min(1).max(120),
  expiresAt: z.string().datetime({ offset: true }),
  available: z.boolean(),
  quoteKind: z.enum(["FIRM", "INDICATIVE", "MARKET_REFERENCE"]),
  settlementMode: z.enum([
    "PROVIDER_LIVE",
    "PROVIDER_TEST",
    "FIAT_SIMULATED",
    "COMPARISON_ONLY",
  ]),
  rateSource: z.string().trim().min(1).max(160),
  feeSource: z.string().trim().min(1).max(160),
  availabilitySource: z.string().trim().min(1).max(160),
  providerUrl: z.string().url(),
  disclosures: z.array(z.string().trim().min(1).max(240)).max(8),
});

const decimal = (value: number, places = 7) =>
  value.toFixed(places).replace(/\.?0+$/, "");

export function normalizeQuote(
  raw: RawProviderQuote,
  now = new Date(),
): AnchorQuote {
  const parsed = rawQuoteSchema.parse(raw);
  const requestFields = routeRequestSchema.pick({
    sourceAsset: true,
    destinationCurrency: true,
    payoutMethod: true,
    amount: true,
  });
  requestFields.parse({
    amount: String(parsed.sourceAmount),
    sourceAsset: parsed.sourceAsset,
    destinationCurrency: parsed.destinationCurrency,
    payoutMethod: parsed.payoutMethod,
  });

  const expired = Date.parse(parsed.expiresAt) <= now.getTime();
  return {
    anchorId: parsed.anchorId,
    anchorName: parsed.anchorName,
    quoteId: parsed.quoteId,
    sourceAsset: parsed.sourceAsset,
    sourceAmount: decimal(parsed.sourceAmount),
    destinationCurrency: parsed.destinationCurrency,
    destinationAmount: decimal(parsed.destinationAmount, 2),
    destinationAmountIncludesFees: parsed.destinationAmountIncludesFees,
    exchangeRate: decimal(parsed.exchangeRate, 4),
    fee: parsed.fee === null ? null : decimal(parsed.fee),
    feeCurrency: parsed.feeCurrency,
    payoutMethod: parsed.payoutMethod,
    estimatedMinutes: parsed.estimatedMinutes,
    estimatedSettlement: parsed.estimatedSettlement,
    expiresAt: parsed.expiresAt,
    status: expired ? "EXPIRED" : parsed.available ? "AVAILABLE" : "UNAVAILABLE",
    quoteKind: parsed.quoteKind,
    settlementMode: parsed.settlementMode,
    rateSource: parsed.rateSource,
    feeSource: parsed.feeSource,
    availabilitySource: parsed.availabilitySource,
    providerUrl: parsed.providerUrl,
    disclosures: parsed.disclosures,
    comparisonComplete:
      parsed.fee !== null && parsed.estimatedMinutes !== null,
  };
}
