import type { XlmTransactionLookup } from "./classic";

const TRANSACTION_HASH = /^[0-9a-f]{64}$/;

export type HistoryPaymentStatus = "SUCCESS" | "FAILED" | "NOT_FOUND";

export type HistoryPaymentEvidence = {
  hash: string | null;
  status: HistoryPaymentStatus | "UNAVAILABLE";
};

export function verifiedHistoryPayment(
  storedHash: string,
  lookup: XlmTransactionLookup,
): HistoryPaymentEvidence {
  if (!TRANSACTION_HASH.test(storedHash)) {
    return { hash: null, status: "NOT_FOUND" as const };
  }
  if (lookup.status === "not_found") {
    return { hash: null, status: "NOT_FOUND" as const };
  }

  const canonicalHash = lookup.transaction.hash.toLowerCase();
  if (canonicalHash !== storedHash) {
    return { hash: null, status: "NOT_FOUND" as const };
  }

  return {
    hash: canonicalHash,
    status: lookup.status === "successful" ? "SUCCESS" as const : "FAILED" as const,
  };
}

export async function resolveHistoryPayment(
  storedHash: string,
  lookup: (hash: string) => Promise<XlmTransactionLookup>,
): Promise<HistoryPaymentEvidence> {
  try {
    return verifiedHistoryPayment(storedHash, await lookup(storedHash));
  } catch {
    return { hash: null, status: "UNAVAILABLE" };
  }
}
