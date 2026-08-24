import { describe, expect, it } from "vitest";

import { parseProofCheckpoint, resumableProofLabel } from "./proof";

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
});
