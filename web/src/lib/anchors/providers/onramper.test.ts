import { afterEach, describe, expect, it, vi } from "vitest";

import { UnsupportedProviderRouteError } from "../provider-errors";
import type { RouteRequest } from "../types";
import { OnramperProvider } from "./onramper";

const request: RouteRequest = {
  amount: "100",
  sourceAsset: "TEST_USDC",
  destinationCurrency: "PHP",
  payoutMethod: "BANK",
};

function json(value: unknown) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Onramper provider", () => {
  it("discovers the exact Stellar corridor and emits only successful live provider quotes", async () => {
    const fetchMock = vi.fn((input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/supported/assets?")) {
        return Promise.resolve(
          json({
            message: {
              assets: [
                {
                  crypto: "usdc_stellar_testnet",
                  fiat: ["php"],
                  paymentMethods: ["banktransfer"],
                },
              ],
              country: "PH",
            },
          }),
        );
      }
      if (url.includes("/supported/payment-types/")) {
        return Promise.resolve(
          json({
            message: [
              {
                paymentTypeId: "banktransfer",
                name: "Bank",
                details: { currencyStatus: "SourceAndDestSupported" },
              },
            ],
          }),
        );
      }
      if (url.includes("/quotes/")) {
        return Promise.resolve(
          json([
            {
              ramp: "moonpay",
              paymentMethod: "banktransfer",
              quoteId: "quote-moonpay",
              payout: 5_700,
              rate: 57,
              networkFee: 0.1,
              transactionFee: 0.2,
              recommendations: ["BestPrice"],
            },
            {
              ramp: "blocked-provider",
              paymentMethod: "banktransfer",
              quoteId: "quote-blocked",
              payout: 5_800,
              recommendations: ["CustomerBlocked"],
            },
            {
              ramp: "unavailable-provider",
              paymentMethod: "banktransfer",
              quoteId: "quote-error",
              errors: [{ type: "NoSupportedPaymentFound" }],
            },
          ]),
        );
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const quotes = await new OnramperProvider("test-key", "staging", {
      TEST_USDC: "usdc_stellar_testnet",
    }).getQuotes(request, new AbortController().signal);

    expect(quotes).toHaveLength(1);
    expect(quotes[0]).toMatchObject({
      anchorId: "onramper-moonpay",
      anchorName: "Moonpay via Onramper",
      quoteId: "quote-moonpay",
      sourceAsset: "TEST_USDC",
      destinationAmount: 5_700,
      destinationAmountIncludesFees: true,
      exchangeRate: 57,
      fee: null,
      payoutMethod: "BANK",
      quoteKind: "FIRM",
    });
    expect(String(fetchMock.mock.calls[2][0])).toContain("txInitiation=true");
    expect(String(fetchMock.mock.calls[2][0])).toContain("platform=web");
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      "source=usdc_stellar_testnet",
    );
  });

  it("rejects a generic or Mainnet USDC asset before making an external request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const provider = new OnramperProvider("test-key", "staging", {
      TEST_USDC: "usdc_stellar",
    });

    expect(provider.supports(request)).toMatchObject({ supported: false });
    await expect(
      provider.getQuotes(request, new AbortController().signal),
    ).rejects.toBeInstanceOf(UnsupportedProviderRouteError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not treat XLM text as proof of the Stellar network", () => {
    const provider = new OnramperProvider("test-key", "staging", {
      XLM: "xlm_testnet_evm",
    });
    expect(
      provider.supports({
        ...request,
        sourceAsset: "XLM",
      }),
    ).toMatchObject({ supported: false });
  });

  it("rejects cash pickup before making an external request", () => {
    expect(
      new OnramperProvider("test-key", "staging", {
        TEST_USDC: "usdc_stellar_testnet",
      }).supports({
        ...request,
        payoutMethod: "CASH_PICKUP",
      }),
    ).toMatchObject({ supported: false });
  });
});
