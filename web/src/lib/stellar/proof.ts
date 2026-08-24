export type ProofCheckpoint = {
  walletAddress: string;
  anchorId: string;
  routeId: string;
  routeTransactionHash?: string;
  paymentHash?: string;
  paymentPending?: boolean;
  receiptTransactionHash?: string;
  receiptPending?: boolean;
};

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
      [value.routeTransactionHash, value.paymentHash, value.receiptTransactionHash]
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
  if (checkpoint.paymentPending) return "Check pending payment";
  if (checkpoint.paymentHash) return "Resume settlement receipt";
  return "Resume route payment";
}
