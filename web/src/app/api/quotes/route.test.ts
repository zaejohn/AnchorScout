import { afterEach, describe, expect, it, vi } from "vitest";

import { POST } from "./route";

function json(value: unknown) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function externalResponse(input: string | URL | Request) {
  const url = String(input);
  if (url.endsWith("stellar.toml")) {
    return new Response(
      'NETWORK_PASSPHRASE="Test SDF Network ; September 2015"\nTRANSFER_SERVER_SEP0024="https://example.test/sep24"\n[[CURRENCIES]]\ncode="USDC"',
      { status: 200 },
    );
  }
  if (url.endsWith("/sep24/info")) {
    return json({
      withdraw: { USDC: { enabled: true, min_amount: 15, max_amount: 2500 } },
      fee: { enabled: false },
    });
  }
  if (url.includes("exchangeInfo")) {
    const symbol = url.includes("USDCPHP") ? "USDCPHP" : "XLMPHP";
    return json({
      serverTime: Date.now(),
      symbols: [
        {
          symbol,
          status: "trading",
          baseAsset: symbol.replace("PHP", ""),
          quoteAsset: "PHP",
          filters: [
            { filterType: "LOT_SIZE", minQty: "0.1" },
            { filterType: "MIN_NOTIONAL", minNotional: "50" },
          ],
        },
      ],
    });
  }
  if (url.includes("/depth")) {
    return json({ lastUpdateId: 42, bids: [["57", "5000"]], asks: [] });
  }
  throw new Error(`Unexpected URL: ${url}`);
}

function quoteRequest(body: Record<string, string>) {
  return new Request("http://localhost/api/quotes", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validBody = {
  amount: "100",
  sourceAsset: "XLM",
  destinationCurrency: "PHP",
  payoutMethod: "BANK",
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("POST /api/quotes", () => {
  it("rejects unauthorized account-scoped provider access", async () => {
    vi.stubEnv("COINS_PH_QUOTE_ACCESS_TOKEN", "a".repeat(32));
    const request = quoteRequest(validBody);
    request.headers.set("authorization", "Bearer wrong-token");

    const response = await POST(request);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Account-scoped provider authorization failed",
    });
  });

  it("keeps MoneyGram out of bank results", async () => {
    vi.stubEnv("COINS_PH_FIRM_QUOTES_ENABLED", "");
    vi.stubEnv("ONRAMPER_API_KEY", "");
    vi.stubEnv("SEP38_ANCHOR_HOME_DOMAIN", "");
    vi.stubGlobal("fetch", vi.fn((input) => Promise.resolve(externalResponse(input))));

    const response = await POST(
      quoteRequest(validBody),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.quotes.map((quote: { anchorId: string }) => quote.anchorId)).toEqual([
      "coins-ph-market",
    ]);
    expect(payload.providers).toContainEqual(
      expect.objectContaining({
        providerId: "moneygram-testnet",
        status: "unsupported",
      }),
    );
  });

  it("returns MoneyGram only for the explicit Test USDC cash-pickup rail", async () => {
    vi.stubEnv("COINS_PH_FIRM_QUOTES_ENABLED", "");
    vi.stubEnv("ONRAMPER_API_KEY", "");
    vi.stubEnv("SEP38_ANCHOR_HOME_DOMAIN", "");
    vi.stubGlobal("fetch", vi.fn((input) => Promise.resolve(externalResponse(input))));

    const response = await POST(
      quoteRequest({
        amount: "100",
        sourceAsset: "TEST_USDC",
        destinationCurrency: "PHP",
        payoutMethod: "CASH_PICKUP",
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.quotes).toHaveLength(1);
    expect(payload.quotes[0]).toMatchObject({
      anchorId: "moneygram-testnet",
      payoutMethod: "CASH_PICKUP",
      settlementMode: "PROVIDER_TEST",
    });
    expect(payload.providers).toContainEqual(
      expect.objectContaining({
        providerId: "coins-ph-market",
        status: "unsupported",
      }),
    );
  });
});
