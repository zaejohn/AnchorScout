import { describe, expect, it } from "vitest";

import { classifyWalletError, SubmittedTransactionPendingError } from "./errors";

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

  it("preserves an ambiguously submitted hash without making it retryable", () => {
    expect(
      classifyWalletError(
        new SubmittedTransactionPendingError("receipt", "a".repeat(64)),
      ),
    ).toEqual({
      phase: "pending",
      message:
        "The receipt transaction was submitted but confirmation is still pending. AnchorScout will not submit it again.",
      hash: "a".repeat(64),
    });
  });
});
