import { describe, expect, it } from "vitest";

import { hasValidContractDeployment } from "./config";

const ROUTE = "CBYCCXCJLFQKUIPNJDQNXXIGV26S4FSXGHRYQQBPU3EYUGE6EXRRDZ5H";
const RECEIPT = "CBQKALTRUEBNTDOKL7UOOSEFPJMHZRQCWV5C6VZA4T3TO4WEB2OIBDJM";

describe("public Testnet configuration", () => {
  it("accepts the deployed contract pair", () => {
    expect(hasValidContractDeployment(ROUTE, RECEIPT)).toBe(true);
  });

  it("does not advertise malformed or partially configured deployments", () => {
    expect(hasValidContractDeployment(ROUTE, "")).toBe(false);
    expect(hasValidContractDeployment("not-a-contract", RECEIPT)).toBe(false);
    expect(
      hasValidContractDeployment(
        "GDW2INHQPIWK6JYMVDPCT3JZHMBSYPDEWB56PCRC2JSXADAF22VF253M",
        RECEIPT,
      ),
    ).toBe(false);
  });
});
