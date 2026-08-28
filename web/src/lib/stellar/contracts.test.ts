import { describe, expect, it } from "vitest";

import type { AnchorQuote } from "../anchors/types";
import { hashRouteQuote, recentRouteWindow } from "./contracts";

describe("contract route history window", () => {
  it.each([
    [0, { cursor: 0, limit: 0 }],
    [1, { cursor: 0, limit: 1 }],
    [20, { cursor: 0, limit: 20 }],
    [21, { cursor: 1, limit: 20 }],
    [73, { cursor: 53, limit: 20 }],
  ])("loads the newest records for count %i", (count, expected) => {
    expect(recentRouteWindow(count)).toEqual(expected);
  });
});

describe("route quote commitment", () => {
  const quote: AnchorQuote = {
    anchorId: "provider",
    anchorName: "Provider",
    quoteId: "quote-1",
    sourceAsset: "TEST_USDC",
    sourceAmount: "100",
    destinationCurrency: "PHP",
    destinationAmount: "5700",
    destinationAmountIncludesFees: false,
    exchangeRate: "57",
    fee: null,
    feeCurrency: null,
    payoutMethod: "BANK",
    estimatedMinutes: null,
    estimatedSettlement: "Provider flow",
    expiresAt: "2026-08-28T01:00:00.000Z",
    status: "AVAILABLE",
    quoteKind: "MARKET_REFERENCE",
    settlementMode: "COMPARISON_ONLY",
    rateSource: "Provider",
    feeSource: "Provider",
    availabilitySource: "Provider",
    providerUrl: "https://example.com",
    disclosures: [],
    comparisonComplete: false,
  };

  it("binds the selected payout rail into the on-chain quote hash", async () => {
    const bankHash = await hashRouteQuote(quote);
    const cashHash = await hashRouteQuote({
      ...quote,
      payoutMethod: "CASH_PICKUP",
    });
    expect(bankHash.equals(cashHash)).toBe(false);
  });

  it("binds whether the shown destination amount includes fees", async () => {
    const grossHash = await hashRouteQuote(quote);
    const netHash = await hashRouteQuote({
      ...quote,
      destinationAmountIncludesFees: true,
    });
    expect(grossHash.equals(netHash)).toBe(false);
  });
});
