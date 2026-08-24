import { describe, expect, it } from "vitest";

import { normalizeQuote } from "./normalize";
import { rankQuotes } from "./ranking";
import { searchQuotes } from "./service";
import type { AnchorProvider, RawProviderQuote, RouteRequest } from "./types";
import { parseRouteRequest } from "./validation";

const now = new Date("2026-08-24T00:00:00.000Z");
const request: RouteRequest = {
  amount: "100",
  sourceAsset: "XLM",
  destinationCurrency: "PHP",
  payoutMethod: "BANK",
};

function raw(overrides: Partial<RawProviderQuote> = {}): RawProviderQuote {
  return {
    anchorId: "route-a",
    anchorName: "Route A",
    quoteId: "quote-a",
    sourceAsset: "XLM",
    sourceAmount: "100",
    destinationCurrency: "PHP",
    destinationAmount: "5700",
    exchangeRate: "57",
    fee: "0.2",
    payoutMethod: "BANK",
    estimatedMinutes: 5,
    expiresAt: "2026-08-24T00:05:00.000Z",
    available: true,
    isDemo: true,
    ...overrides,
  };
}

describe("route validation and normalization", () => {
  it("rejects invalid amounts and route enums", () => {
    expect(parseRouteRequest({ ...request, amount: "0" }).success).toBe(false);
    expect(parseRouteRequest({ ...request, payoutMethod: "CASH" }).success).toBe(false);
  });

  it("normalizes valid provider data and marks expired quotes", () => {
    expect(normalizeQuote(raw(), now)).toMatchObject({
      sourceAmount: "100",
      destinationAmount: "5700",
      fee: "0.2",
      status: "AVAILABLE",
    });
    expect(
      normalizeQuote(raw({ expiresAt: "2026-08-23T23:59:59.000Z" }), now).status,
    ).toBe("EXPIRED");
  });

  it("rejects missing or malformed comparison fields", () => {
    expect(() =>
      normalizeQuote(raw({ destinationAmount: Number.NaN }), now),
    ).toThrow();
  });
});

describe("deterministic ranking", () => {
  it("uses destination, fee, processing time, then stable provider identity", () => {
    const ranked = rankQuotes(
      [
        normalizeQuote(raw({ anchorId: "b", quoteId: "2", fee: 0.2 }), now),
        normalizeQuote(raw({ anchorId: "a", quoteId: "1", fee: 0.1 }), now),
        normalizeQuote(
          raw({ anchorId: "c", quoteId: "3", destinationAmount: 5710 }),
          now,
        ),
      ],
      now,
    );
    expect(ranked.map((quote) => quote.anchorId)).toEqual(["c", "a", "b"]);
    expect(ranked[0]).toMatchObject({ rank: 1, best: true });
  });
});

describe("provider isolation", () => {
  it("returns healthy quotes when another provider fails", async () => {
    const healthy: AnchorProvider = {
      id: "healthy",
      name: "Healthy",
      getQuote: async () => raw({ anchorId: "healthy", anchorName: "Healthy" }),
    };
    const broken: AnchorProvider = {
      id: "broken",
      name: "Broken",
      getQuote: async () => {
        throw new Error("provider secret failure");
      },
    };
    const result = await searchQuotes(request, [broken, healthy], { now });
    expect(result.quotes).toHaveLength(1);
    expect(result.providers).toEqual([
      expect.objectContaining({ providerId: "broken", status: "failed" }),
      expect.objectContaining({ providerId: "healthy", status: "ok" }),
    ]);
    expect(JSON.stringify(result)).not.toContain("secret failure");
  });

  it("bounds providers that ignore abort signals", async () => {
    const stalled: AnchorProvider = {
      id: "stalled",
      name: "Stalled",
      getQuote: () => new Promise(() => undefined),
    };
    const result = await searchQuotes(request, [stalled], {
      now,
      timeoutMs: 5,
    });
    expect(result.quotes).toHaveLength(0);
    expect(result.providers[0]).toMatchObject({ status: "timed_out" });
  });

  it.each([
    { sourceAmount: "99" },
    { sourceAsset: "TEST_USDC" },
    { destinationCurrency: "USD" },
    { payoutMethod: "GCASH" },
  ])("rejects a provider quote that changes request terms: %j", async (override) => {
    const mismatched: AnchorProvider = {
      id: "mismatched",
      name: "Mismatched",
      getQuote: async () => raw(override),
    };
    const result = await searchQuotes(request, [mismatched], { now });
    expect(result.quotes).toHaveLength(0);
    expect(result.providers[0]).toMatchObject({ status: "failed" });
  });
});
