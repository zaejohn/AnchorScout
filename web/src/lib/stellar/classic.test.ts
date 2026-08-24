import { afterEach, describe, expect, it, vi } from "vitest";

import { findConfirmedXlmTransaction, validateXlmTransferInput } from "./classic";

const DESTINATION = "GDW2INHQPIWK6JYMVDPCT3JZHMBSYPDEWB56PCRC2JSXADAF22VF253M";

afterEach(() => vi.unstubAllGlobals());

describe("XLM transfer preflight", () => {
  it("accepts valid G-addresses and exact stroop amounts", () => {
    expect(validateXlmTransferInput(DESTINATION, "0.1")).toBe(1_000_000n);
    expect(validateXlmTransferInput(DESTINATION, "0.0000001")).toBe(1n);
  });

  it("rejects invalid destinations before loading an account", () => {
    expect(() => validateXlmTransferInput("not-a-wallet", "1")).toThrow(
      /destination/,
    );
  });

  it.each(["0", "-1", "1.00000001", "1e2", ""])(
    "rejects invalid amount %s",
    (amount) => {
      expect(() => validateXlmTransferInput(DESTINATION, amount)).toThrow(
        /XLM amount/,
      );
    },
  );
});

describe("ambiguous XLM submission reconciliation", () => {
  it("returns null while Horizon has no record and never invents confirmation", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 404 })));
    await expect(findConfirmedXlmTransaction("a".repeat(64))).resolves.toBeNull();
  });

  it("returns only a successful Horizon transaction", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({ hash: "b".repeat(64), ledger: 123, successful: true }),
      ),
    );
    await expect(findConfirmedXlmTransaction("b".repeat(64))).resolves.toMatchObject({
      hash: "b".repeat(64),
      ledger: 123,
    });
  });
});
