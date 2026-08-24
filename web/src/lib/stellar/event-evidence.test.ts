import { Buffer } from "buffer";
import { xdr } from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";

import { evidenceFromEvents } from "./event-evidence";

const routeId = "ab".repeat(32);
const topic = (name: string) => [
  xdr.ScVal.scvSymbol(name).toXDR("base64"),
  xdr.ScVal.scvBytes(Buffer.from(routeId, "hex")).toXDR("base64"),
];

describe("contract transaction evidence", () => {
  it("associates selection and receipt invocations with the route ID", () => {
    const evidence = evidenceFromEvents([
      { id: "1", txHash: "1".repeat(64), topic: topic("route_selected") },
      { id: "2", txHash: "2".repeat(64), topic: topic("settlement_recorded") },
    ]);
    expect(evidence.get(routeId)).toEqual({
      routeTransactionHash: "1".repeat(64),
      receiptTransactionHash: "2".repeat(64),
    });
  });

  it("ignores failed and malformed events", () => {
    expect(
      evidenceFromEvents([
        {
          id: "1",
          txHash: "1".repeat(64),
          inSuccessfulContractCall: false,
          topic: topic("route_selected"),
        },
        { id: "2", txHash: "2".repeat(64), topic: ["bad"] },
      ]).size,
    ).toBe(0);
  });
});
