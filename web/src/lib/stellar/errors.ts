export type TransactionPhase =
  | "idle"
  | "preparing"
  | "simulating"
  | "awaiting_signature"
  | "signed"
  | "submitting"
  | "submitted"
  | "pending"
  | "confirmed"
  | "failed"
  | "rejected"
  | "expired";

export type TransactionUpdate = {
  phase: TransactionPhase;
  message: string;
  hash?: string;
};

export class SubmittedTransactionPendingError extends Error {
  constructor(
    readonly stage: "route" | "payment" | "receipt",
    readonly hash: string,
    readonly routeId?: string,
  ) {
    super(`${stage} transaction ${hash} was submitted but is still pending`);
    this.name = "SubmittedTransactionPendingError";
  }
}

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error ?? "Unknown error");

export function classifyWalletError(error: unknown): TransactionUpdate {
  if (error instanceof SubmittedTransactionPendingError) {
    return {
      phase: "pending",
      message: `The ${error.stage} transaction was submitted but confirmation is still pending. AnchorScout will not submit it again.`,
      hash: error.hash,
    };
  }
  const raw = messageOf(error).toLowerCase();
  if (
    raw.includes("reject") ||
    raw.includes("declin") ||
    raw.includes("denied") ||
    raw.includes("cancel")
  ) {
    return {
      phase: "rejected",
      message: "Signature request was rejected. No transaction was sent.",
    };
  }
  if (raw.includes("insufficient") || raw.includes("underfunded")) {
    return {
      phase: "failed",
      message: "Insufficient XLM is available for this amount and network fees.",
    };
  }
  if (raw.includes("network") || raw.includes("passphrase")) {
    return {
      phase: "failed",
      message: "The wallet must be connected to Stellar Testnet.",
    };
  }
  if (raw.includes("timeout") || raw.includes("still pending")) {
    return {
      phase: "failed",
      message: "Confirmation timed out. Check the transaction hash before retrying.",
    };
  }
  if (raw.includes("not installed") || raw.includes("not found")) {
    return {
      phase: "failed",
      message: "No supported Stellar wallet was detected.",
    };
  }
  return {
    phase: "failed",
    message: "The Stellar transaction could not be completed. Please try again.",
  };
}
