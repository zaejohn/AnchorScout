export type ProofCheckpoint = {
  walletAddress: string;
  anchorId: string;
  routeId: string;
  routeTransactionHash?: string;
  paymentHash?: string;
  paymentPending?: boolean;
  failedPaymentHash?: string;
  receiptTransactionHash?: string;
  receiptPending?: boolean;
};

type ProofStage = "route" | "payment" | "receipt";
type BroadcastUpdate = { phase: string; hash?: string };

export function applyBroadcastUpdate(
  checkpoint: ProofCheckpoint,
  stage: ProofStage,
  update: BroadcastUpdate,
) {
  if (!update.hash) return checkpoint;
  const isBroadcast = ["submitting", "submitted", "pending", "confirmed"].includes(
    update.phase,
  );
  if (!isBroadcast) return checkpoint;
  if (stage === "route") {
    return { ...checkpoint, routeTransactionHash: update.hash };
  }
  if (stage === "payment") {
    return {
      ...checkpoint,
      paymentHash: update.hash,
      paymentPending: update.phase !== "confirmed",
    };
  }
  return {
    ...checkpoint,
    receiptTransactionHash: update.hash,
    receiptPending: update.phase !== "confirmed",
  };
}

const HEX_32 = /^[0-9a-f]{64}$/;

export function parseProofCheckpoint(
  stored: string | null,
  walletAddress: string,
): ProofCheckpoint | null {
  if (!stored) return null;
  try {
    const value = JSON.parse(stored) as Partial<ProofCheckpoint>;
    if (
      value.walletAddress !== walletAddress ||
      typeof value.anchorId !== "string" ||
      typeof value.routeId !== "string" ||
      !HEX_32.test(value.routeId) ||
      [
        value.routeTransactionHash,
        value.paymentHash,
        value.failedPaymentHash,
        value.receiptTransactionHash,
      ]
        .filter((hash): hash is string => hash !== undefined)
        .some((hash) => !HEX_32.test(hash))
    ) {
      return null;
    }
    return value as ProofCheckpoint;
  } catch {
    return null;
  }
}

export function resumableProofLabel(checkpoint: ProofCheckpoint) {
  if (checkpoint.receiptPending) return "Waiting for receipt confirmation";
  if (checkpoint.failedPaymentHash) return "Resume failed-route receipt";
  if (checkpoint.paymentPending) return "Check pending payment";
  if (checkpoint.paymentHash) return "Resume settlement receipt";
  return "Resume route payment";
}
