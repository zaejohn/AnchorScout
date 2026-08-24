import { describe, expect, it } from "vitest";

import { applyBroadcastUpdate, parseProofCheckpoint, resumableProofLabel } from "./proof";

const wallet = "GDW2INHQPIWK6JYMVDPCT3JZHMBSYPDEWB56PCRC2JSXADAF22VF253M";
const routeId = "a".repeat(64);

describe("resumable proof checkpoints", () => {
  it("restores only the matching wallet and valid transaction identifiers", () => {
    const stored = JSON.stringify({ walletAddress: wallet, anchorId: "demo", routeId });
    expect(parseProofCheckpoint(stored, wallet)).toMatchObject({ routeId });
    expect(parseProofCheckpoint(stored, `G${"A".repeat(55)}`)).toBeNull();
    expect(
      parseProofCheckpoint(
        JSON.stringify({ walletAddress: wallet, anchorId: "demo", routeId: "bad" }),
        wallet,
      ),
    ).toBeNull();
  });

  it("never labels a pending receipt as a fresh proof", () => {
    expect(
      resumableProofLabel({
        walletAddress: wallet,
        anchorId: "demo",
        routeId,
        paymentHash: "b".repeat(64),
        receiptPending: true,
      }),
    ).toBe("Waiting for receipt confirmation");
  });

  it("resumes a failed payment at its receipt without sending again", () => {
    expect(
      resumableProofLabel({
        walletAddress: wallet,
        anchorId: "demo",
        routeId,
        failedPaymentHash: "0".repeat(64),
      }),
    ).toBe("Resume failed-route receipt");
  });

  it("checkpoints payment and receipt hashes as soon as they are broadcast", () => {
    const base = { walletAddress: wallet, anchorId: "demo", routeId };
    const payment = applyBroadcastUpdate(base, "payment", {
      phase: "submitting",
      hash: "b".repeat(64),
    });
    expect(payment).toMatchObject({
      paymentHash: "b".repeat(64),
      paymentPending: true,
    });
    const receipt = applyBroadcastUpdate(payment, "receipt", {
      phase: "submitted",
      hash: "c".repeat(64),
    });
    expect(receipt).toMatchObject({
      receiptTransactionHash: "c".repeat(64),
      receiptPending: true,
    });
  });

  it("marks a checkpoint confirmed only after the terminal update", () => {
    const pending = {
      walletAddress: wallet,
      anchorId: "demo",
      routeId,
      paymentHash: "b".repeat(64),
      paymentPending: true,
    };
    expect(
      applyBroadcastUpdate(pending, "payment", {
        phase: "confirmed",
        hash: "b".repeat(64),
      }).paymentPending,
    ).toBe(false);
  });
});
