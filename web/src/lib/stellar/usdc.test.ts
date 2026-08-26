import { Account, Asset, Horizon, Keypair, Networks } from "@stellar/stellar-sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ loadAccount: vi.fn(), strictReceivePaths: vi.fn(), pathsCall: vi.fn() }));
vi.mock("@stellar/stellar-sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@stellar/stellar-sdk")>();
  return { ...actual, Horizon: { ...actual.Horizon, Server: vi.fn(function () {
    return { loadAccount: mocks.loadAccount, strictReceivePaths: mocks.strictReceivePaths };
  }) } };
});

import { prepareUsdcSwap, prepareUsdcTrustline, usdcBalance } from "./usdc";

const issuer = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
const source = Keypair.random().publicKey();
const intermediateIssuer = Keypair.random().publicKey();

function account(balance = "10000.0000000") {
  return Object.assign(new Account(source, "123"), { balances: [{ asset_type: "native", balance }] });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.loadAccount.mockResolvedValue(account());
  mocks.strictReceivePaths.mockReturnValue({ call: mocks.pathsCall });
  mocks.pathsCall.mockResolvedValue({ records: [{ source_asset_type: "native", source_amount: "1000.1234567", path: [] }] });
});

describe("shared Testnet USDC transaction builders", () => {
  it("builds a bounded trustline for the actual issuer using the source account", async () => {
    const tx = await prepareUsdcTrustline(source, issuer);
    expect(tx.source).toBe(source);
    expect(tx.networkPassphrase).toBe(Networks.TESTNET);
    expect(tx.signatures).toHaveLength(0);
    expect(tx.operations).toHaveLength(1);
    const operation = tx.operations[0];
    expect(operation.type).toBe("changeTrust");
    if (operation.type !== "changeTrust") throw new Error("Expected trustline");
    expect(operation.line).toEqual(new Asset("USDC", issuer));
    expect(operation.limit).toBe("10000.0000000");
    expect(Number(tx.timeBounds?.maxTime)).toBeGreaterThan(0);
  });

  it("uses the cheapest returned XLM path and exact sendMax without inventing liquidity", async () => {
    mocks.pathsCall.mockResolvedValue({ records: [
      { source_asset_type: "native", source_amount: "1200.0000000", path: [] },
      { source_asset_type: "credit_alphanum4", source_amount: "1.0000000", path: [] },
      { source_asset_type: "native", source_amount: "1000.1234567", path: [
        { asset_type: "credit_alphanum4", asset_code: "USD", asset_issuer: intermediateIssuer },
        { asset_type: "native" },
      ] },
    ] });
    const tx = await prepareUsdcSwap(source, issuer, "1777");
    expect(mocks.strictReceivePaths).toHaveBeenCalledWith(source, new Asset("USDC", issuer), "1777");
    expect(tx.source).toBe(source);
    expect(tx.networkPassphrase).toBe(Networks.TESTNET);
    expect(tx.signatures).toHaveLength(0);
    expect(tx.operations).toHaveLength(1);
    const operation = tx.operations[0];
    expect(operation.type).toBe("pathPaymentStrictReceive");
    if (operation.type !== "pathPaymentStrictReceive") throw new Error("Expected strict-receive payment");
    expect(operation.sendAsset).toEqual(Asset.native());
    expect(operation.sendMax).toBe("1000.1234567");
    expect(operation.destination).toBe(source);
    expect(operation.destAsset).toEqual(new Asset("USDC", issuer));
    expect(operation.destAmount).toBe("1777.0000000");
    expect(operation.path).toEqual([new Asset("USD", intermediateIssuer), Asset.native()]);
  });

  it.each([[], [{ source_asset_type: "credit_alphanum4", source_amount: "1", path: [] }]])("rejects absent usable XLM liquidity", async (...records) => {
    mocks.pathsCall.mockResolvedValue({ records: records.length === 1 && Array.isArray(records[0]) ? records[0] : records });
    await expect(prepareUsdcSwap(source, issuer, "507")).rejects.toThrow("USDC_LIQUIDITY_UNAVAILABLE");
  });

  it("rejects a path that would consume the reserve/contract-fee budget", async () => {
    mocks.loadAccount.mockResolvedValue(account("1010.1234566"));
    await expect(prepareUsdcSwap(source, issuer, "507")).rejects.toThrow("USDC_SWAP_BALANCE_TOO_LOW");
  });

  it("accepts the exact minimum with the full reserve budget remaining", async () => {
    mocks.loadAccount.mockResolvedValue(account("1010.1234567"));
    await expect(prepareUsdcSwap(source, issuer, "507")).resolves.toHaveProperty("source", source);
  });

  it("rejects a missing native balance", async () => {
    mocks.loadAccount.mockResolvedValue(Object.assign(new Account(source, "123"), { balances: [] }));
    await expect(prepareUsdcSwap(source, issuer, "507")).rejects.toThrow("USDC_SWAP_BALANCE_TOO_LOW");
  });
});

describe("USDC balance asset identity", () => {
  it("returns exact integer stroops and ignores unrelated assets", () => {
    const result = usdcBalance({ balances: [
      { asset_type: "native", balance: "9000.0000000" },
      { asset_type: "credit_alphanum4", asset_code: "USDC", asset_issuer: intermediateIssuer, balance: "9999.0000000" },
      { asset_type: "credit_alphanum4", asset_code: "USD", asset_issuer: issuer, balance: "1111.0000000" },
      { asset_type: "credit_alphanum4", asset_code: "USDC", asset_issuer: issuer, balance: "507.1234567" },
    ] } as Horizon.AccountResponse, issuer);
    expect(result).toBe(5_071_234_567n);
  });

  it("returns zero when the expected issuer's asset is absent", () => {
    expect(usdcBalance({ balances: [] } as unknown as Horizon.AccountResponse, issuer)).toBe(0n);
  });
});
