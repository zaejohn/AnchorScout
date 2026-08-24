import { z } from "zod";

import {
  DESTINATION_CURRENCIES,
  PAYOUT_METHODS,
  SOURCE_ASSETS,
} from "./types";

export const routeRequestSchema = z.object({
  amount: z
    .string()
    .trim()
    .regex(/^\d+(?:\.\d{1,7})?$/, "Enter a valid amount with up to 7 decimals")
    .refine((value) => Number(value) > 0, "Amount must be greater than zero")
    .refine((value) => Number(value) <= 10_000, "Amount cannot exceed 10,000"),
  sourceAsset: z.enum(SOURCE_ASSETS),
  destinationCurrency: z.enum(DESTINATION_CURRENCIES),
  payoutMethod: z.enum(PAYOUT_METHODS),
});

export function parseRouteRequest(input: unknown) {
  return routeRequestSchema.safeParse(input);
}
