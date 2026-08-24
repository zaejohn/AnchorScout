import { normalizeQuote } from "./normalize";
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
  const timeoutMs = options.timeoutMs ?? 2_000;
  const settled = await Promise.allSettled(
    providers.map(async (provider) => ({
      provider,
      quote: normalizeQuote(
        await withTimeout(
          (signal) => provider.getQuote(request, signal),
          timeoutMs,
        ),
        now,
      ),
    })),
  );

  const quotes: AnchorQuote[] = [];
  const providerResults: ProviderResult[] = [];
  settled.forEach((result, index) => {
    const provider = providers[index];
    if (result.status === "fulfilled") {
      quotes.push(result.value.quote);
      providerResults.push({
        providerId: provider.id,
        providerName: provider.name,
        status: "ok",
      });
      return;
    }
    const timedOut = result.reason instanceof ProviderTimeoutError;
    providerResults.push({
      providerId: provider.id,
      providerName: provider.name,
      status: timedOut ? "timed_out" : "failed",
      message: timedOut ? TIMEOUT_MESSAGE : "Provider quote unavailable",
    });
  });

  return {
    quotes: rankQuotes(quotes, now),
    providers: providerResults,
    searchedAt: now.toISOString(),
  };
}
