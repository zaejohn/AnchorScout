import { describe, expect, it } from "vitest";

import { classifyWalletError } from "./errors";

describe("wallet error mapping", () => {
  it.each([
    ["User rejected request", "rejected"],
    ["tx_insufficient_balance", "failed"],
    ["Wrong network passphrase", "failed"],
    ["confirmation timeout", "failed"],
  ])("maps %s to a recoverable state", (message, phase) => {
    expect(classifyWalletError(new Error(message)).phase).toBe(phase);
  });

  it("does not expose unknown provider details", () => {
    const result = classifyWalletError(new Error("private upstream payload"));
    expect(result.message).not.toContain("private upstream");
  });
});
