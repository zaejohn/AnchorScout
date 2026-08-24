import type { AnchorQuote } from "./types";

export function isSelectableQuote(quote: AnchorQuote, now = new Date()) {
  return (
    quote.status === "AVAILABLE" && Date.parse(quote.expiresAt) > now.getTime()
  );
}

export function rankQuotes(quotes: AnchorQuote[], now = new Date()) {
  const eligible = quotes.filter((quote) => isSelectableQuote(quote, now));
  const sorted = [...eligible].sort((left, right) => {
    if (left.comparisonComplete !== right.comparisonComplete) {
      return left.comparisonComplete ? -1 : 1;
    }
    const amountDelta =
      Number(right.destinationAmount) - Number(left.destinationAmount);
    if (amountDelta !== 0) return amountDelta;

    const feeDelta = Number(left.fee ?? Number.POSITIVE_INFINITY) -
      Number(right.fee ?? Number.POSITIVE_INFINITY);
    if (feeDelta !== 0) return feeDelta;

    const timeDelta = (left.estimatedMinutes ?? Number.POSITIVE_INFINITY) -
      (right.estimatedMinutes ?? Number.POSITIVE_INFINITY);
    if (timeDelta !== 0) return timeDelta;

    return `${left.anchorId}:${left.quoteId}`.localeCompare(
      `${right.anchorId}:${right.quoteId}`,
    );
  });

  return sorted.map((quote, index) => ({
    ...quote,
    rank: index + 1,
    best: index === 0 && quote.comparisonComplete,
  }));
}
