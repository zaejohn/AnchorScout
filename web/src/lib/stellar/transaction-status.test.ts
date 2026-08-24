import { describe, expect, it } from "vitest";

import { parseContractTransactionStatus } from "./transaction-status";

describe("contract transaction status", () => {
  it.each(["NOT_FOUND", "SUCCESS", "FAILED"] as const)(
    "accepts terminal RPC status %s",
    (status) => {
      expect(parseContractTransactionStatus(status)).toBe(status);
    },
  );

  it("rejects unknown statuses instead of treating them as confirmation", () => {
    expect(() => parseContractTransactionStatus("PENDING")).toThrow(/unknown/);
  });
});
