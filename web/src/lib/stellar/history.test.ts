import { describe, expect, it } from "vitest";

import { resolveHistoryPayment, verifiedHistoryPayment } from "./history";

const HASH = "ab".repeat(32);

describe("history payment verification", () => {
  it("uses Horizon's canonical hash only after successful confirmation", () => {
    expect(
      verifiedHistoryPayment(HASH, {
        status: "successful",
        transaction: { hash: HASH, ledger: 123, successful: true },
      }),
    ).toEqual({ hash: HASH, status: "SUCCESS" });
  });

  it("keeps a confirmed failed transaction identifiable on-chain", () => {
    expect(
      verifiedHistoryPayment(HASH, {
        status: "failed",
        transaction: { hash: HASH, ledger: 123, successful: false },
      }),
    ).toEqual({ hash: HASH, status: "FAILED" });
  });

  it("does not expose missing, malformed, or mismatched hashes", () => {
    expect(verifiedHistoryPayment(HASH, { status: "not_found" })).toEqual({
      hash: null,
      status: "NOT_FOUND",
    });
    expect(
      verifiedHistoryPayment("not-a-hash", {
        status: "successful",
        transaction: { hash: HASH, ledger: 123, successful: true },
      }),
    ).toEqual({ hash: null, status: "NOT_FOUND" });
    expect(
      verifiedHistoryPayment(HASH, {
        status: "successful",
        transaction: {
          hash: "cd".repeat(32),
          ledger: 123,
          successful: true,
        },
      }),
    ).toEqual({ hash: null, status: "NOT_FOUND" });
  });

  it("isolates temporary Horizon failures from the rest of History", async () => {
    await expect(
      resolveHistoryPayment(HASH, async () => {
        throw new Error("Horizon timeout");
      }),
    ).resolves.toEqual({ hash: null, status: "UNAVAILABLE" });
  });
});
