export type ProofCheckpoint = {
  version: 2;
  walletAddress: string;
  anchorId: string;
  routeId: string;
  receiptId: string;
  transactionHash?: string;
  pending?: boolean;
  legacy?: boolean;
};

type BroadcastUpdate = { phase: string; hash?: string };

export function applyBroadcastUpdate(
  checkpoint: ProofCheckpoint,
  update: BroadcastUpdate,
) {
  if (!update.hash) return checkpoint;
  const isBroadcast = ["submitting", "submitted", "pending", "confirmed"].includes(
    update.phase,
  );
  if (!isBroadcast) return checkpoint;
  return {
    ...checkpoint,
    transactionHash: update.hash,
    pending: update.phase !== "confirmed",
  };
}

const HEX_32 = /^[0-9a-f]{64}$/;

export function parseProofCheckpoint(
  stored: string | null,
  walletAddress: string,
): ProofCheckpoint | null {
  if (!stored) return null;
  try {
    const value = JSON.parse(stored) as Partial<ProofCheckpoint> & {
      routeTransactionHash?: string;
      paymentHash?: string;
      receiptTransactionHash?: string;
    };
    if (value.version !== 2) {
      const transactionHash =
        value.receiptTransactionHash ?? value.paymentHash ?? value.routeTransactionHash;
      if (
        value.walletAddress !== walletAddress ||
        typeof value.anchorId !== "string" ||
        typeof value.routeId !== "string" ||
        !HEX_32.test(value.routeId) ||
        !transactionHash ||
        !HEX_32.test(transactionHash)
      ) {
        return null;
      }
      return {
        version: 2,
        walletAddress,
        anchorId: value.anchorId,
        routeId: value.routeId,
        receiptId: "0".repeat(64),
        transactionHash,
        pending: true,
        legacy: true,
      };
    }
    if (
      value.walletAddress !== walletAddress ||
      typeof value.anchorId !== "string" ||
      typeof value.routeId !== "string" ||
      typeof value.receiptId !== "string" ||
      !HEX_32.test(value.routeId) ||
      !HEX_32.test(value.receiptId) ||
      (value.transactionHash !== undefined &&
        !HEX_32.test(value.transactionHash))
    ) {
      return null;
    }
    return value as ProofCheckpoint;
  } catch {
    return null;
  }
}

export function resumableProofLabel(checkpoint: ProofCheckpoint) {
  if (checkpoint.pending) return "Check pending transaction";
  if (checkpoint.transactionHash) return "Resume confirmation";
  return "Resume route";
}
