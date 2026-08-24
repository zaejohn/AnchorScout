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
  fee: z.coerce.number().min(0).finite(),
  payoutMethod: z.enum(["BANK", "GCASH"]),
  estimatedMinutes: z.number().int().positive().max(1_440),
  expiresAt: z.string().datetime({ offset: true }),
  available: z.boolean(),
  isDemo: z.boolean(),
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
    exchangeRate: decimal(parsed.exchangeRate, 4),
    fee: decimal(parsed.fee),
    payoutMethod: parsed.payoutMethod,
    estimatedMinutes: parsed.estimatedMinutes,
    expiresAt: parsed.expiresAt,
    status: expired ? "EXPIRED" : parsed.available ? "AVAILABLE" : "UNAVAILABLE",
    isDemo: parsed.isDemo,
  };
}

