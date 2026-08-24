import { afterEach, describe, expect, it, vi } from "vitest";

import type { RouteRequest } from "../types";
import {
  CoinsPhAuthenticatedProvider,
  CoinsPhMarketProvider,
} from "./coins-ph";
import { MoneyGramTestnetProvider } from "./moneygram";
import { configuredProviders } from "./registry";

const request: RouteRequest = {
  amount: "10",
  sourceAsset: "XLM",
  destinationCurrency: "PHP",
  payoutMethod: "BANK",
};

function json(value: unknown) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function coinsPublicResponse(url: string) {
  if (url.includes("exchangeInfo")) {
    const symbol = url.includes("USDCPHP") ? "USDCPHP" : "XLMPHP";
    return json({
      serverTime: Date.now(),
      symbols: [{
        symbol,
        status: "trading",
        baseAsset: symbol.replace("PHP", ""),
        quoteAsset: "PHP",
        filters: [
          { filterType: "LOT_SIZE", minQty: "0.1" },
          { filterType: "MIN_NOTIONAL", minNotional: "50" },
        ],
      }],
    });
  }
  if (url.includes("/depth")) {
    return json({ lastUpdateId: 42, bids: [["12", "4"], ["11", "200"]], asks: [] });
  }
  throw new Error(`Unexpected URL: ${url}`);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("provider registry", () => {
  it("contains only real external sources by default", () => {
    vi.stubEnv("SEP38_ANCHOR_HOME_DOMAIN", "");
    const providers = configuredProviders();
    expect(providers.map((provider) => provider.id)).toEqual([
      "coins-ph-market",
      "moneygram-testnet",
    ]);
    expect(providers.map((provider) => provider.name).join(" ")).not.toMatch(
      /Harbor|Bayani|Sampaguita/,
    );
  });
});

describe("Coins.ph providers", () => {
  it("values the requested amount against live bid depth and exposes missing fields", async () => {
    vi.stubGlobal("fetch", vi.fn((input: string | URL | Request) =>
      Promise.resolve(coinsPublicResponse(String(input)))));
    const quote = await new CoinsPhMarketProvider().getQuote(
      request,
      new AbortController().signal,
    );

    expect(quote).toMatchObject({
      anchorId: "coins-ph-market",
      destinationAmount: 114,
      exchangeRate: 11.4,
      fee: null,
      estimatedMinutes: null,
      quoteKind: "MARKET_REFERENCE",
      settlementMode: "FIAT_SIMULATED",
    });
    expect(quote.disclosures.join(" ")).toContain("gross market reference");
  });

  it("combines an authenticated firm Convert quote with live channel fee/status", async () => {
    const fetchMock = vi.fn((input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("get-quote")) {
        return Promise.resolve(json({
          status: 0,
          data: {
            quoteId: "firm-1",
            sourceCurrency: "XLM",
            targetCurrency: "PHP",
            sourceAmount: "10",
            price: "12",
            targetAmount: "120",
            expiry: "10",
          },
        }));
      }
      return Promise.resolve(json({
        status: 0,
        data: [
          {
            transactionChannel: "INSTAPAY",
            transactionSubject: "allbank",
            transactionSubjectType: "bank",
            transactionSubjectName: "AllBank",
            minimum: "50",
            maximum: "50000",
            fee: "10",
            feeType: "fixed",
            status: "1",
          },
          {
            transactionChannel: "SWIFTPAY_PESONET",
            transactionSubject: "allbank",
            transactionSubjectType: "bank",
            transactionSubjectName: "AllBank",
            minimum: "50",
            maximum: "50000",
            fee: "5",
            feeType: "fixed",
            status: "1",
          },
        ],
      }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const provider = new CoinsPhAuthenticatedProvider({
      apiKey: "api-key",
      secretKey: "server-secret",
    }, "allbank");
    const quote = await provider.getQuote(
      request,
      new AbortController().signal,
    );

    expect(quote).toMatchObject({
      quoteId: "firm-1",
      destinationAmount: 115,
      fee: 5,
      feeCurrency: "PHP",
      quoteKind: "FIRM",
    });
    expect(quote.estimatedSettlement).toContain("T+1");
    const firstUrl = String(fetchMock.mock.calls[0][0]);
    expect(firstUrl).toContain("timestamp=");
    expect(firstUrl).toContain("signature=");
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain("server-secret");
  });
});

describe("MoneyGram capability composite", () => {
  it("uses live Testnet capability and external market data without claiming a bank payout", async () => {
    vi.stubGlobal("fetch", vi.fn((input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("stellar.toml")) {
        return Promise.resolve(new Response(
          'NETWORK_PASSPHRASE="Test SDF Network ; September 2015"\nTRANSFER_SERVER_SEP0024="https://example.test/sep24"\n[[CURRENCIES]]\ncode="USDC"',
          { status: 200 },
        ));
      }
      if (url.endsWith("/sep24/info")) {
        return Promise.resolve(json({
          withdraw: { USDC: { enabled: true, min_amount: 15, max_amount: 2500 } },
          fee: { enabled: false },
        }));
      }
      return Promise.resolve(coinsPublicResponse(url));
    }));
    const provider = new MoneyGramTestnetProvider();
    const quote = await provider.getQuote(
      { ...request, amount: "100", sourceAsset: "TEST_USDC" },
      new AbortController().signal,
    );

    expect(quote).toMatchObject({
      quoteKind: "MARKET_REFERENCE",
      settlementMode: "FIAT_SIMULATED",
      fee: null,
    });
    expect(quote.rateSource).toContain("Coins.ph");
    expect(quote.disclosures.join(" ")).toContain("bank payout is simulated");
  });
});
