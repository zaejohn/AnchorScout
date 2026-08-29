import { describe, expect, it } from "vitest";

import { applyBroadcastUpdate, parseProofCheckpoint, resumableProofLabel } from "./proof";

const wallet = "GDW2INHQPIWK6JYMVDPCT3JZHMBSYPDEWB56PCRC2JSXADAF22VF253M";
const routeId = "a".repeat(64);
const receiptId = "d".repeat(64);
const base = { version: 2 as const, walletAddress: wallet, anchorId: "demo", routeId, receiptId };

describe("resumable proof checkpoints", () => {
  it("restores only the matching wallet and valid transaction identifiers", () => {
    const stored = JSON.stringify(base);
    expect(parseProofCheckpoint(stored, wallet)).toMatchObject({ routeId });
    expect(parseProofCheckpoint(stored, `G${"A".repeat(55)}`)).toBeNull();
    expect(
      parseProofCheckpoint(
        JSON.stringify({ ...base, routeId: "bad" }),
        wallet,
      ),
    ).toBeNull();
  });

  it("migrates a broadcast v1 checkpoint without starting another legacy step", () => {
    const migrated = parseProofCheckpoint(
      JSON.stringify({
        walletAddress: wallet,
        anchorId: "legacy",
        routeId,
        paymentHash: "e".repeat(64),
      }),
      wallet,
    );
    expect(migrated).toMatchObject({
      version: 2,
      legacy: true,
      transactionHash: "e".repeat(64),
      pending: true,
    });
  });

  it("labels an in-flight atomic transaction without inviting a duplicate", () => {
    expect(
      resumableProofLabel({ ...base, transactionHash: "b".repeat(64), pending: true }),
    ).toBe("Check pending transaction");
  });

  it("resumes confirmation from the one saved hash", () => {
    expect(
      resumableProofLabel({ ...base, transactionHash: "b".repeat(64) }),
    ).toBe("Resume confirmation");
  });

  it("checkpoints the transaction hash as soon as it is broadcast", () => {
    const submitted = applyBroadcastUpdate(base, {
      phase: "submitting",
      hash: "b".repeat(64),
    });
    expect(submitted).toMatchObject({
      transactionHash: "b".repeat(64),
      pending: true,
    });
  });

  it("marks a checkpoint confirmed only after the terminal update", () => {
    const pending = { ...base, transactionHash: "b".repeat(64), pending: true };
    expect(
      applyBroadcastUpdate(pending, {
        phase: "confirmed",
        hash: "b".repeat(64),
      }).pending,
    ).toBe(false);
  });
});
