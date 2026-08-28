import "server-only";

import { z } from "zod";

import { UnsupportedProviderRouteError } from "../provider-errors";
import type {
  AnchorProvider,
  RawProviderQuote,
  RouteRequest,
  SourceAsset,
} from "../types";

const ONRAMPER_BASES = {
  staging: "https://api-stg.onramper.com",
  production: "https://api.onramper.com",
} as const;

type OnramperEnvironment = keyof typeof ONRAMPER_BASES;

const supportedAssetsSchema = z.object({
  message: z.object({
    assets: z.array(
      z.object({
        crypto: z.string().min(1),
        fiat: z.array(z.string().min(1)),
        paymentMethods: z.array(z.string().min(1)),
      }),
    ),
    country: z.string().optional(),
  }),
});

const paymentTypesSchema = z.object({
  message: z.array(
    z.object({
      paymentTypeId: z.string().min(1),
      name: z.string().min(1),
      details: z
        .object({ currencyStatus: z.string().optional() })
        .optional(),
    }),
  ),
});

const quoteSchema = z.object({
  ramp: z.string().trim().min(1).max(80),
  paymentMethod: z.string().trim().min(1).max(80),
  quoteId: z.string().trim().min(1).max(128),
  payout: z.coerce.number().positive().finite().optional(),
  rate: z.coerce.number().positive().finite().nullish(),
  networkFee: z.coerce.number().min(0).finite().nullish(),
  transactionFee: z.coerce.number().min(0).finite().nullish(),
  feeCurrency: z.string().trim().min(1).max(16).nullish(),
  estimatedMinutes: z.coerce
    .number()
    .int()
    .positive()
    .max(10_080)
    .nullish(),
  expiresAt: z.string().datetime({ offset: true }).nullish(),
  recommendations: z.array(z.string()).nullish().transform((value) => value ?? []),
  errors: z.array(z.unknown()).nullish(),
});

const normalized = (value: string) => value.trim().toLowerCase();

export function isExplicitTestnetOnramperAssetId(
  sourceAsset: SourceAsset,
  assetId: string | undefined,
) {
  if (!assetId) return false;
  const id = normalized(assetId);
  if (!id.includes("testnet")) return false;
  if (!id.includes("stellar")) return false;
  return sourceAsset === "XLM" ? id.includes("xlm") : id.includes("usdc");
}

function routePaymentMethod(
  request: RouteRequest,
  methods: z.infer<typeof paymentTypesSchema>["message"],
) {
  const compatible = methods.filter(
    (method) =>
      !method.details?.currencyStatus ||
      method.details.currencyStatus === "SourceAndDestSupported",
  );
  if (request.payoutMethod === "BANK") {
    return compatible.find((method) =>
      `${method.paymentTypeId} ${method.name}`.toLowerCase().includes("bank"),
    );
  }
  if (request.payoutMethod === "GCASH") {
    return compatible.find((method) =>
      `${method.paymentTypeId} ${method.name}`.toLowerCase().includes("gcash"),
    );
  }
  return undefined;
}

function providerSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 42);
}

function providerName(value: string) {
  const words = value
    .replace(/[-_]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => `${word[0]?.toUpperCase() ?? ""}${word.slice(1)}`);
  return `${words.join(" ")} via Onramper`.slice(0, 80);
}

export class OnramperProvider implements AnchorProvider {
  readonly id = "onramper";
  readonly name = "Onramper live providers";
  readonly timeoutMs = 8_000;
  private readonly baseUrl: string;

  constructor(
    private readonly apiKey: string,
    private readonly environment: OnramperEnvironment = "staging",
    private readonly testnetAssetIds: Partial<Record<SourceAsset, string>> = {},
  ) {
    this.baseUrl = ONRAMPER_BASES[environment];
  }

  supports(request: RouteRequest) {
    if (request.payoutMethod === "CASH_PICKUP") {
      return {
        supported: false,
        message: "Onramper cash-pickup routes are not enabled",
      };
    }
    if (
      !isExplicitTestnetOnramperAssetId(
        request.sourceAsset,
        this.testnetAssetIds[request.sourceAsset],
      )
    ) {
      return {
        supported: false,
        message: `Onramper has no explicitly configured ${request.sourceAsset} Testnet asset`,
      };
    }
    return true;
  }

  private async getJson(path: string, signal: AbortSignal) {
    const response = await fetch(`${this.baseUrl}${path}`, {
      cache: "no-store",
      headers: {
        accept: "application/json",
        Authorization: this.apiKey,
      },
      signal,
    });
    if (!response.ok) {
      throw new Error(`Onramper API failed (${response.status})`);
    }
    return response.json() as Promise<unknown>;
  }

  async getQuotes(
    request: RouteRequest,
    signal: AbortSignal,
  ): Promise<RawProviderQuote[]> {
    const source = this.testnetAssetIds[request.sourceAsset];
    if (!isExplicitTestnetOnramperAssetId(request.sourceAsset, source)) {
      throw new UnsupportedProviderRouteError(
        `Onramper has no explicitly configured ${request.sourceAsset} Testnet asset`,
      );
    }
    const sourceId = source as string;
    const assetsUrl = new URL("/supported/assets", this.baseUrl);
    assetsUrl.searchParams.set("source", sourceId);
    assetsUrl.searchParams.set("type", "sell");
    assetsUrl.searchParams.set("country", "ph");
    const supported = supportedAssetsSchema.parse(
      await this.getJson(`${assetsUrl.pathname}${assetsUrl.search}`, signal),
    ).message.assets;
    const advertisedRoute = supported.find(
      (asset) =>
        normalized(asset.crypto) === normalized(sourceId) &&
        asset.fiat.some((fiat) => normalized(fiat) === "php"),
    );
    if (!advertisedRoute) {
      throw new UnsupportedProviderRouteError(
        `Onramper does not currently advertise ${sourceId} to PHP`,
      );
    }
    const destination = "php";

    const paymentUrl = new URL(
      `/supported/payment-types/${encodeURIComponent(sourceId)}`,
      this.baseUrl,
    );
    paymentUrl.searchParams.set("destination", destination);
    paymentUrl.searchParams.set("type", "sell");
    paymentUrl.searchParams.set("country", "ph");
    const methods = paymentTypesSchema.parse(
      await this.getJson(
        `${paymentUrl.pathname}${paymentUrl.search}`,
        signal,
      ),
    ).message;
    const payment = routePaymentMethod(request, methods);
    if (!payment) {
      throw new UnsupportedProviderRouteError(
        `Onramper does not currently advertise ${request.payoutMethod === "GCASH" ? "GCash" : "bank"} payout for this Stellar corridor`,
      );
    }
    if (
      advertisedRoute.paymentMethods.length > 0 &&
      !advertisedRoute.paymentMethods.some(
        (method) => normalized(method) === normalized(payment.paymentTypeId),
      )
    ) {
      throw new UnsupportedProviderRouteError(
        `Onramper's live asset response does not list ${payment.name} for this corridor`,
      );
    }

    const quoteUrl = new URL(
      `/quotes/${encodeURIComponent(sourceId)}/${destination}`,
      this.baseUrl,
    );
    quoteUrl.searchParams.set("amount", request.amount);
    quoteUrl.searchParams.set("paymentMethod", payment.paymentTypeId);
    quoteUrl.searchParams.set("type", "sell");
    quoteUrl.searchParams.set("country", "ph");
    quoteUrl.searchParams.set("txInitiation", "true");
    quoteUrl.searchParams.set("platform", "web");
    const receivedAt = Date.now();
    const responses = z
      .array(z.unknown())
      .parse(
        await this.getJson(`${quoteUrl.pathname}${quoteUrl.search}`, signal),
      )
      .flatMap((value) => {
        const parsed = quoteSchema.safeParse(value);
        return parsed.success ? [parsed.data] : [];
      });
    const sourceAmount = Number(request.amount);
    const seen = new Set<string>();
    const quotes = responses
      .filter(
        (quote) =>
          quote.payout !== undefined &&
          !quote.errors?.length &&
          normalized(quote.paymentMethod) ===
            normalized(payment.paymentTypeId) &&
          !quote.recommendations.some(
            (label) => normalized(label) === "customerblocked",
          ),
      )
      .filter((quote) => {
        const key = normalized(quote.ramp);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((quote): RawProviderQuote => {
        const payout = quote.payout!;
        const feeTotal =
          (quote.networkFee ?? 0) + (quote.transactionFee ?? 0);
        const expiresAt =
          quote.expiresAt && Date.parse(quote.expiresAt) > receivedAt
            ? quote.expiresAt
            : new Date(receivedAt + 60_000).toISOString();
        return {
          anchorId: `onramper-${providerSlug(quote.ramp)}`,
          anchorName: providerName(quote.ramp),
          quoteId: quote.quoteId,
          sourceAsset: request.sourceAsset,
          sourceAmount: request.amount,
          destinationCurrency: request.destinationCurrency,
          destinationAmount: payout,
          destinationAmountIncludesFees: true,
          exchangeRate: payout / sourceAmount,
          fee: quote.feeCurrency ? feeTotal : null,
          feeCurrency: quote.feeCurrency ?? null,
          payoutMethod: request.payoutMethod,
          estimatedMinutes: quote.estimatedMinutes ?? null,
          estimatedSettlement:
            "Completed in the selected provider's hosted off-ramp flow",
          expiresAt,
          available: true,
          quoteKind: "FIRM",
          settlementMode: "COMPARISON_ONLY",
          rateSource: `Live Onramper sell quote from ${quote.ramp}`,
          feeSource: quote.feeCurrency
            ? "Live Onramper network and transaction fee fields"
            : "Onramper returned a net payout but did not label the fee currency",
          availabilitySource: `Live Onramper ${this.environment} quote for ${sourceId} to ${destination} via ${payment.paymentTypeId}`,
          providerUrl: "https://www.onramper.com/",
          disclosures: [
            `This route was returned live by ${quote.ramp} through Onramper; the provider name is not configured locally.`,
            "The displayed receive amount is the payout returned by Onramper after its quoted deductions.",
            "The configured Onramper source asset explicitly identifies a Stellar Testnet route; generic or Mainnet asset IDs are rejected.",
            "AnchorScout executes only its separate Stellar Testnet proof and does not start the provider checkout.",
            "No Onramper checkout, KYC session, production asset transfer, or PHP payout is initiated.",
            ...(quote.expiresAt
              ? []
              : [
                  "Onramper did not return an expiry, so AnchorScout requires a refresh after 60 seconds.",
                ]),
          ],
        };
      });

    if (quotes.length === 0) {
      throw new UnsupportedProviderRouteError(
        "Onramper returned no usable live provider quote for this request",
      );
    }
    return quotes;
  }
}
