import { describe, expect, it } from "vitest";

import { validateXlmTransferInput } from "./classic";

const DESTINATION = "GDW2INHQPIWK6JYMVDPCT3JZHMBSYPDEWB56PCRC2JSXADAF22VF253M";

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
