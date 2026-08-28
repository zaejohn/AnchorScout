import { normalizeQuote } from "./normalize";
import { UnsupportedProviderRouteError } from "./provider-errors";
import { rankQuotes } from "./ranking";
import type {
  AnchorQuote,
  AnchorProvider,
  ProviderResult,
  QuoteSearchResult,
  RouteRequest,
} from "./types";

const TIMEOUT_MESSAGE = "Provider timed out";

class ProviderTimeoutError extends Error {
  constructor() {
    super(TIMEOUT_MESSAGE);
    this.name = "ProviderTimeoutError";
  }
}

const decimalKey = (value: string) => {
  const [integer, fraction = ""] = value.split(".");
  return `${BigInt(integer)}.${fraction.padEnd(7, "0")}`;
};

function assertQuoteMatchesRequest(quote: AnchorQuote, request: RouteRequest) {
  if (
    quote.sourceAsset !== request.sourceAsset ||
    quote.destinationCurrency !== request.destinationCurrency ||
    quote.payoutMethod !== request.payoutMethod ||
    decimalKey(quote.sourceAmount) !== decimalKey(request.amount)
  ) {
    throw new Error("Provider quote does not match the requested route");
  }
  return quote;
}

async function withTimeout<T>(
  run: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
) {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([
      run(controller.signal),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => {
          controller.abort();
          reject(new ProviderTimeoutError());
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timeout!);
  }
}

export async function searchQuotes(
  request: RouteRequest,
  providers: AnchorProvider[],
  options: { timeoutMs?: number; now?: Date } = {},
): Promise<QuoteSearchResult> {
  const now = options.now ?? new Date();
  const timeoutMs = options.timeoutMs ?? 5_000;
  const settled = await Promise.allSettled(
    providers.map(async (provider) => {
      const support = provider.supports?.(request);
      const unsupported =
        typeof support === "boolean"
          ? !support
          : support
            ? !support.supported
            : false;
      const unsupportedMessage =
        typeof support === "object" ? support.message : undefined;
      if (unsupported) {
        return {
          provider,
          unsupported: true,
          unsupportedMessage,
          quotes: [] as AnchorQuote[],
        };
      }
      const rawQuotes = await withTimeout(async (signal) => {
        if (provider.getQuotes) return provider.getQuotes(request, signal);
        if (provider.getQuote) return [await provider.getQuote(request, signal)];
        throw new Error("Provider has no quote implementation");
      }, provider.timeoutMs ?? timeoutMs);
      if (rawQuotes.length === 0) {
        throw new UnsupportedProviderRouteError(
          "Provider returned no live routes for this request",
        );
      }
      return {
        provider,
        unsupported: false,
        unsupportedMessage: undefined,
        quotes: rawQuotes.map((quote) =>
          assertQuoteMatchesRequest(normalizeQuote(quote, now), request),
        ),
      };
    }),
  );

  const quotes: AnchorQuote[] = [];
  const providerResults: ProviderResult[] = [];
  settled.forEach((result, index) => {
    const provider = providers[index];
    if (result.status === "fulfilled") {
      if (result.value.unsupported || result.value.quotes.length === 0) {
        providerResults.push({
          providerId: provider.id,
          providerName: provider.name,
          status: "unsupported",
          message:
            result.value.unsupportedMessage ??
            "Provider does not support this asset and payout combination",
        });
        return;
      }
      quotes.push(...result.value.quotes);
      providerResults.push({
        providerId: provider.id,
        providerName: provider.name,
        status: "ok",
        quoteCount: result.value.quotes.length,
      });
      return;
    }
    const timedOut = result.reason instanceof ProviderTimeoutError;
    const unsupported = result.reason instanceof UnsupportedProviderRouteError;
    providerResults.push({
      providerId: provider.id,
      providerName: provider.name,
      status: timedOut ? "timed_out" : unsupported ? "unsupported" : "failed",
      message: timedOut
        ? TIMEOUT_MESSAGE
        : unsupported
          ? result.reason.message
          : "Provider quote unavailable",
    });
  });

  return {
    quotes: rankQuotes(quotes, now),
    providers: providerResults,
    searchedAt: now.toISOString(),
  };
}
