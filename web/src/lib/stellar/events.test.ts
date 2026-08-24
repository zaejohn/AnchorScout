import { describe, expect, it } from "vitest";

import { buildEventRequest } from "./events";

const contractIds = ["route", "receipt"];

describe("contract event paging", () => {
  it("starts from a bounded recent ledger on the first poll", () => {
    expect(buildEventRequest({ latestLedger: 500, contractIds })).toEqual({
      filters: [{ type: "contract", contractIds }],
      pagination: { limit: 100 },
      startLedger: 400,
    });
  });

  it("continues from the opaque RPC cursor without mixing ledger paging", () => {
    expect(
      buildEventRequest({
        cursor: "00123-00004",
        requestedStartLedger: 10,
        latestLedger: 500,
        contractIds,
      }),
    ).toEqual({
      filters: [{ type: "contract", contractIds }],
      pagination: { limit: 100, cursor: "00123-00004" },
    });
  });

  it("does not request a ledger beyond the current ledger", () => {
    expect(
      buildEventRequest({
        requestedStartLedger: 999,
        latestLedger: 500,
        contractIds,
      }),
    ).toMatchObject({ startLedger: 500 });
  });
});
