import { Account, Asset, Networks, Operation, Transaction, TransactionBuilder } from "@stellar/stellar-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadAccount: vi.fn(), ledgers: vi.fn(), ledgerCall: vi.fn(),
  getTransaction: vi.fn(), sendTransaction: vi.fn(), getNetwork: vi.fn(),
  findClassic: vi.fn(), prepareXlm: vi.fn(), hasDeployment: vi.fn(),
  prepareTrustline: vi.fn(), prepareSwap: vi.fn(),
  verifyExecutor: vi.fn(),
  transactions: vi.fn(), historyCall: vi.fn(), operations: vi.fn(), operationsCall: vi.fn(),
}));

vi.mock("@stellar/stellar-sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@stellar/stellar-sdk")>();
  return {
    ...actual,
    Horizon: { ...actual.Horizon, Server: vi.fn(function () {
      return { loadAccount: mocks.loadAccount, ledgers: mocks.ledgers, transactions: mocks.transactions, operations: mocks.operations };
    }) },
    rpc: { ...actual.rpc, Server: vi.fn(function () {
      return { getTransaction: mocks.getTransaction, sendTransaction: mocks.sendTransaction, getNetwork: mocks.getNetwork };
    }) },
  };
});

vi.mock("../stellar/classic", () => ({
  findConfirmedXlmTransaction: mocks.findClassic, prepareXlmTransaction: mocks.prepareXlm,
}));
vi.mock("../stellar/usdc", async (importOriginal) => ({
  ...await importOriginal<typeof import("../stellar/usdc")>(),
  prepareUsdcTrustline: mocks.prepareTrustline, prepareUsdcSwap: mocks.prepareSwap,
}));
vi.mock("../stellar/contracts", async (importOriginal) => ({
  ...await importOriginal<typeof import("../stellar/contracts")>(),
  verifyRouteExecutorConfiguration: mocks.verifyExecutor,
}));
vi.mock("../stellar/config", async (importOriginal) => ({
  ...await importOriginal<typeof import("../stellar/config")>(),
  PROOF_PAYMENT_DESTINATION: "GDW2INHQPIWK6JYMVDPCT3JZHMBSYPDEWB56PCRC2JSXADAF22VF253M",
  hasExecutableDeployment: mocks.hasDeployment,
}));

import { PROOF_PAYMENT_DESTINATION } from "../stellar/config";
import { OFFICIAL_TESTNET_USDC_ISSUER, simulationKey } from "./security";
import { fundWallet, prepareTransaction, reconcileTransaction, verifySwap, verifyTestnetConfiguration, verifyTransactionIntent } from "./stellar";
import type { SimulationRun } from "./types";

const MAX_TIME = 2_000_000_000;
const ID = "11111111-2222-4333-8444-555555555555";

function run(maxTime = MAX_TIME, proofOverrides: Partial<Parameters<typeof Operation.payment>[0]> = {}, signed = true): SimulationRun {
  const key = simulationKey(ID);
  const wallet = key.publicKey();
  const transaction = new TransactionBuilder(new Account(wallet, "123"), {
    fee: "100", networkPassphrase: Networks.TESTNET,
  }).addOperation(Operation.payment({ destination: PROOF_PAYMENT_DESTINATION, asset: Asset.native(), amount: "0.1", ...proofOverrides }))
    .setTimebounds(0, maxTime).build();
  if (signed) transaction.sign(key);
  return {
    id: ID, profileId: "synthetic-profile", wallet, amount: "507", state: "FUNDED",
    routeId: "a".repeat(64), receiptId: "b".repeat(64),
    pending: { kind: "proof", hash: transaction.hash().toString("hex"), xdr: transaction.toXDR() },
    hashes: {}, formStatus: "NOT_SENT", attempts: 0,
    createdAt: "2026-08-26T08:00:00.000Z", history: [],
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("SIMULATION_WALLET_KEY", Buffer.alloc(32, 7).toString("base64"));
  vi.stubEnv("TESTNET_USDC_ISSUER", OFFICIAL_TESTNET_USDC_ISSUER);
  vi.stubEnv("NEXT_PUBLIC_TESTNET_USDC_ISSUER", OFFICIAL_TESTNET_USDC_ISSUER);
  mocks.hasDeployment.mockReturnValue(true);
  mocks.verifyExecutor.mockResolvedValue(true);
  mocks.getNetwork.mockResolvedValue({ passphrase: Networks.TESTNET });
  mocks.getTransaction.mockResolvedValue({ status: "NOT_FOUND" });
  mocks.findClassic.mockResolvedValue({ status: "not_found" });
  mocks.ledgerCall.mockResolvedValue({ records: [{ closed_at: new Date((MAX_TIME - 10) * 1000).toISOString() }] });
  mocks.ledgers.mockReturnValue({ order: vi.fn().mockReturnValue({ limit: vi.fn().mockReturnValue({ call: mocks.ledgerCall }) }) });
  mocks.sendTransaction.mockResolvedValue({ status: "PENDING" });
  mocks.loadAccount.mockResolvedValue({ sequenceNumber: () => "123", balances: [] });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ network_passphrase: Networks.TESTNET })));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("signed acquisition transaction intent", () => {
  function signedOperation(operation: Parameters<TransactionBuilder["addOperation"]>[0]) {
    const current = run();
    const transaction = new TransactionBuilder(new Account(current.wallet, "123"), {
      fee: "100", networkPassphrase: Networks.TESTNET,
    }).addOperation(operation).setTimebounds(0, MAX_TIME).build();
    transaction.sign(simulationKey(ID));
    return { current, transaction };
  }

  it("accepts the bounded official USDC trustline", () => {
    const { current, transaction } = signedOperation(Operation.changeTrust({
      asset: new Asset("USDC", OFFICIAL_TESTNET_USDC_ISSUER), limit: "10000",
    }));
    expect(() => verifyTransactionIntent(transaction, "trustline", current)).not.toThrow();
  });

  it.each(["issuer", "code", "limit"])("rejects a trustline with the wrong %s", (field) => {
    const { current, transaction } = signedOperation(Operation.changeTrust({
      asset: new Asset(field === "code" ? "USD" : "USDC", field === "issuer" ? simulationKey(ID).publicKey() : OFFICIAL_TESTNET_USDC_ISSUER),
      limit: field === "limit" ? "20000" : "10000",
    }));
    expect(() => verifyTransactionIntent(transaction, "trustline", current)).toThrow("TRANSACTION_INTENT_MISMATCH");
  });

  it.each(["valid", "destination", "issuer", "amount", "send asset", "send maximum"])("checks exact strict-receive swap intent: %s", (field) => {
    const { current, transaction } = signedOperation(Operation.pathPaymentStrictReceive({
      sendAsset: field === "send asset" ? new Asset("USDC", OFFICIAL_TESTNET_USDC_ISSUER) : Asset.native(),
      sendMax: field === "send maximum" ? "9991" : "1000",
      destination: field === "destination" ? PROOF_PAYMENT_DESTINATION : simulationKey(ID).publicKey(),
      destAsset: new Asset("USDC", field === "issuer" ? simulationKey(ID).publicKey() : OFFICIAL_TESTNET_USDC_ISSUER),
      destAmount: field === "amount" ? "508" : "507",
      path: [],
    }));
    if (field === "valid") expect(() => verifyTransactionIntent(transaction, "swap", current)).not.toThrow();
    else expect(() => verifyTransactionIntent(transaction, "swap", current)).toThrow("TRANSACTION_INTENT_MISMATCH");
  });
});

describe("durable Testnet transaction reconciliation", () => {
  it("does not resubmit without a valid latest ledger close time", async () => {
    mocks.ledgerCall.mockResolvedValue({ records: [{ closed_at: "invalid-date" }] });
    await expect(reconcileTransaction(run())).rejects.toThrow("LEDGER_TIME_UNAVAILABLE");
    expect(mocks.sendTransaction).not.toHaveBeenCalled();
  });
  it.each([["SUCCESS", "confirmed"], ["FAILED", "failed"]])("treats RPC %s as %s without resubmission", async (status, expected) => {
    mocks.getTransaction.mockResolvedValue({ status });
    await expect(reconcileTransaction(run())).resolves.toBe(expected);
    expect(mocks.findClassic).not.toHaveBeenCalled();
    expect(mocks.sendTransaction).not.toHaveBeenCalled();
  });

  it.each([["successful", "confirmed"], ["failed", "failed"]])("treats Horizon %s as %s without resubmission", async (status, expected) => {
    mocks.findClassic.mockResolvedValue({ status });
    await expect(reconcileTransaction(run())).resolves.toBe(expected);
    expect(mocks.getTransaction).toHaveBeenCalledOnce();
    expect(mocks.sendTransaction).not.toHaveBeenCalled();
    expect(mocks.ledgerCall).not.toHaveBeenCalled();
  });

  it("checks both histories and ledger validity before re-submitting the exact persisted signed envelope", async () => {
    const current = run();
    await expect(reconcileTransaction(current)).resolves.toBe("pending");
    expect(mocks.sendTransaction).toHaveBeenCalledOnce();
    const submitted = mocks.sendTransaction.mock.calls[0][0] as Transaction;
    expect(submitted.toXDR()).toBe(current.pending!.xdr);
    expect(submitted.hash().toString("hex")).toBe(current.pending!.hash);
    expect(submitted.signatures).toHaveLength(1);
    expect(mocks.getTransaction.mock.invocationCallOrder[0]).toBeLessThan(mocks.findClassic.mock.invocationCallOrder[0]);
    expect(mocks.findClassic.mock.invocationCallOrder[0]).toBeLessThan(mocks.ledgerCall.mock.invocationCallOrder[0]);
    expect(mocks.ledgerCall.mock.invocationCallOrder[0]).toBeLessThan(mocks.sendTransaction.mock.invocationCallOrder[0]);
  });

  it.each(["PENDING", "DUPLICATE", "TRY_AGAIN_LATER", "ERROR"])("never mistakes submission status %s for confirmation", async (status) => {
    mocks.sendTransaction.mockResolvedValue({ status });
    await expect(reconcileTransaction(run())).resolves.toBe("pending");
  });

  it("does not submit if either history lookup fails", async () => {
    mocks.getTransaction.mockRejectedValueOnce(new Error("RPC unavailable"));
    await expect(reconcileTransaction(run())).rejects.toThrow("RPC unavailable");
    expect(mocks.findClassic).not.toHaveBeenCalled();
    expect(mocks.sendTransaction).not.toHaveBeenCalled();

    mocks.findClassic.mockRejectedValueOnce(new Error("Horizon unavailable"));
    await expect(reconcileTransaction(run())).rejects.toThrow("Horizon unavailable");
    expect(mocks.sendTransaction).not.toHaveBeenCalled();
  });

  it("permits rebuilding an expired transaction only when its sequence was never consumed", async () => {
    mocks.ledgerCall.mockResolvedValue({ records: [{ closed_at: new Date((MAX_TIME + 1) * 1000).toISOString() }] });
    await expect(reconcileTransaction(run())).resolves.toBe("expired");
    expect(mocks.loadAccount).toHaveBeenCalledWith(simulationKey(ID).publicKey());
    expect(mocks.sendTransaction).not.toHaveBeenCalled();
  });

  it.each(["124", "125"])("blocks expired transaction with consumed account sequence %s instead of rebuilding", async (sequence) => {
    mocks.ledgerCall.mockResolvedValue({ records: [{ closed_at: new Date((MAX_TIME + 1) * 1000).toISOString() }] });
    mocks.loadAccount.mockResolvedValue({ sequenceNumber: () => sequence });
    await expect(reconcileTransaction(run())).rejects.toThrow("TRANSACTION_HISTORY_AMBIGUOUS");
    expect(mocks.sendTransaction).not.toHaveBeenCalled();
  });

  it("blocks an unbounded saved transaction", async () => {
    await expect(reconcileTransaction(run(0))).rejects.toThrow("TRANSACTION_INTENT_MISMATCH");
    expect(mocks.getTransaction).not.toHaveBeenCalled();
    expect(mocks.sendTransaction).not.toHaveBeenCalled();
  });

  it.each([
    ["recipient", () => ({ destination: simulationKey(ID).publicKey() })],
    ["asset", () => ({ asset: new Asset("USDC", OFFICIAL_TESTNET_USDC_ISSUER) })],
    ["amount", () => ({ amount: "1" })],
    ["operation source", () => ({ source: PROOF_PAYMENT_DESTINATION })],
  ])("rejects a saved proof with wrong %s before network access", async (_description, overrides) => {
    await expect(reconcileTransaction(run(MAX_TIME, overrides()))).rejects.toThrow("TRANSACTION_INTENT_MISMATCH");
    expect(mocks.getTransaction).not.toHaveBeenCalled();
    expect(mocks.sendTransaction).not.toHaveBeenCalled();
  });

  it("rejects an unsigned saved envelope before network access", async () => {
    await expect(reconcileTransaction(run(MAX_TIME, {}, false))).rejects.toThrow("TRANSACTION_INTENT_MISMATCH");
    expect(mocks.getTransaction).not.toHaveBeenCalled();
    expect(mocks.sendTransaction).not.toHaveBeenCalled();
  });

  it("rejects tampered checkpoint hashes before network access", async () => {
    const current = run();
    current.pending!.hash = "f".repeat(64);
    await expect(reconcileTransaction(current)).rejects.toThrow("CHECKPOINT_MISMATCH");
    expect(mocks.getTransaction).not.toHaveBeenCalled();
    expect(mocks.sendTransaction).not.toHaveBeenCalled();
  });

  it("rejects rotated wallet derivation keys before preparing or submitting", async () => {
    const current = run();
    vi.stubEnv("SIMULATION_WALLET_KEY", Buffer.alloc(32, 8).toString("base64"));
    await expect(reconcileTransaction(current)).rejects.toThrow("SIMULATION_WALLET_KEY_CHANGED");
    await expect(prepareTransaction("trustline", current)).rejects.toThrow("SIMULATION_WALLET_KEY_CHANGED");
    expect(mocks.prepareTrustline).not.toHaveBeenCalled();
    expect(mocks.getTransaction).not.toHaveBeenCalled();
    expect(mocks.sendTransaction).not.toHaveBeenCalled();
  });
});

describe("verified Friendbot funding", () => {
  const fundingHash = "c".repeat(64);
  beforeEach(() => {
    mocks.loadAccount.mockResolvedValue({ balances: [{ asset_type: "native", balance: "10000.0000000" }] });
    mocks.transactions.mockReturnValue({ forAccount: vi.fn().mockReturnValue({ order: vi.fn().mockReturnValue({ limit: vi.fn().mockReturnValue({ call: mocks.historyCall }) }) }) });
    mocks.operations.mockReturnValue({ forTransaction: vi.fn().mockReturnValue({ call: mocks.operationsCall }) });
    mocks.historyCall.mockResolvedValue({ records: [{ hash: fundingHash, successful: true }] });
    mocks.operationsCall.mockResolvedValue({ records: [{ type: "create_account", account: simulationKey(ID).publicKey(), starting_balance: "10000.0000000" }] });
    mocks.findClassic.mockResolvedValue({ status: "successful" });
  });

  it("funds a new wallet once and verifies returned hash, balance, and account-creation operation", async () => {
    const wallet = simulationKey(ID).publicKey();
    mocks.loadAccount.mockRejectedValueOnce({ response: { status: 404 } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ hash: fundingHash })));
    await expect(fundWallet(wallet)).resolves.toBe(fundingHash);
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith(`https://friendbot.stellar.org/?addr=${wallet}`, expect.any(Object));
    expect(mocks.loadAccount).toHaveBeenCalledTimes(2);
    expect(mocks.findClassic).toHaveBeenCalledWith(fundingHash);
    expect(mocks.operationsCall).toHaveBeenCalledOnce();
  });

  it("recovers an already-funded wallet without calling Friendbot again", async () => {
    await expect(fundWallet(simulationKey(ID).publicKey())).resolves.toBe(fundingHash);
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.operationsCall).toHaveBeenCalledOnce();
  });

  it("does not mistake an account lookup failure for an absent account", async () => {
    mocks.loadAccount.mockRejectedValueOnce(new Error("Horizon unavailable"));
    await expect(fundWallet(simulationKey(ID).publicKey())).rejects.toThrow("Horizon unavailable");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects a Friendbot response without an actual transaction hash", async () => {
    mocks.loadAccount.mockRejectedValueOnce({ response: { status: 404 } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ status: "ok" })));
    await expect(fundWallet(simulationKey(ID).publicKey())).rejects.toThrow("FRIENDBOT_CONFIRMATION_MISSING");
    expect(mocks.historyCall).not.toHaveBeenCalled();
  });

  it("rejects a funding hash different from the wallet's first transaction", async () => {
    mocks.loadAccount.mockRejectedValueOnce({ response: { status: 404 } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ hash: "d".repeat(64) })));
    await expect(fundWallet(simulationKey(ID).publicKey())).rejects.toThrow("FUNDING_NOT_CONFIRMED");
    expect(mocks.operationsCall).not.toHaveBeenCalled();
  });

  it("does not accept a failed funding transaction", async () => {
    mocks.findClassic.mockResolvedValue({ status: "failed" });
    await expect(fundWallet(simulationKey(ID).publicKey())).rejects.toThrow("FUNDING_NOT_CONFIRMED");
    expect(mocks.operationsCall).not.toHaveBeenCalled();
  });

  it("rejects an underfunded wallet", async () => {
    mocks.loadAccount.mockResolvedValue({ balances: [{ asset_type: "native", balance: "9999.9999999" }] });
    await expect(fundWallet(simulationKey(ID).publicKey())).rejects.toThrow("FUNDING_BALANCE_MISMATCH");
    expect(mocks.historyCall).not.toHaveBeenCalled();
  });

  it.each(["account", "amount", "type"])("rejects a funding operation with mismatched %s", async (field) => {
    mocks.operationsCall.mockResolvedValue({ records: [{
      type: field === "type" ? "payment" : "create_account",
      account: field === "account" ? PROOF_PAYMENT_DESTINATION : simulationKey(ID).publicKey(),
      starting_balance: field === "amount" ? "9999.9999999" : "10000.0000000",
    }] });
    await expect(fundWallet(simulationKey(ID).publicKey())).rejects.toThrow("FUNDING_OPERATION_MISMATCH");
  });
});

describe("Testnet configuration boundary", () => {
  it("accepts matching official issuer and both verified Testnet endpoints", async () => {
    await expect(verifyTestnetConfiguration()).resolves.toBeUndefined();
    expect(mocks.sendTransaction).not.toHaveBeenCalled();
  });

  it.each(["horizon", "rpc"])("rejects %s on the wrong network without taking an action", async (endpoint) => {
    if (endpoint === "horizon") vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ network_passphrase: Networks.PUBLIC })));
    else mocks.getNetwork.mockResolvedValue({ passphrase: Networks.PUBLIC });
    await expect(verifyTestnetConfiguration()).rejects.toThrow("TESTNET_NETWORK_MISMATCH");
    expect(mocks.sendTransaction).not.toHaveBeenCalled();
    expect(mocks.loadAccount).not.toHaveBeenCalled();
  });

  it("rejects issuer disagreement before network access", async () => {
    vi.stubEnv("NEXT_PUBLIC_TESTNET_USDC_ISSUER", simulationKey(ID).publicKey());
    await expect(verifyTestnetConfiguration()).rejects.toThrow("OFFICIAL_TESTNET_USDC_ISSUER_REQUIRED");
    expect(mocks.getNetwork).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("blocks a syntactically valid but miswired executor", async () => {
    mocks.verifyExecutor.mockRejectedValueOnce(
      new Error("Atomic Testnet executor configuration mismatch"),
    );
    await expect(verifyTestnetConfiguration()).rejects.toThrow(
      "Atomic Testnet executor configuration mismatch",
    );
    expect(mocks.sendTransaction).not.toHaveBeenCalled();
  });
});

describe("exact acquired USDC verification", () => {
  it("accepts the exact amount of the official asset", async () => {
    mocks.loadAccount.mockResolvedValue({ balances: [
      { asset_type: "native", balance: "9000.0000000" },
      { asset_type: "credit_alphanum4", asset_code: "USDC", asset_issuer: OFFICIAL_TESTNET_USDC_ISSUER, balance: "507.0000000" },
    ] });
    await expect(verifySwap(run())).resolves.toBeUndefined();
  });

  it.each(["506.9999999", "507.0000001", "0.0000000"])("rejects non-exact balance %s", async (balance) => {
    mocks.loadAccount.mockResolvedValue({ balances: [{ asset_type: "credit_alphanum4", asset_code: "USDC", asset_issuer: OFFICIAL_TESTNET_USDC_ISSUER, balance }] });
    await expect(verifySwap(run())).rejects.toThrow("USDC_BALANCE_MISMATCH");
  });

  it("does not count a same-code asset from a different issuer", async () => {
    mocks.loadAccount.mockResolvedValue({ balances: [{ asset_type: "credit_alphanum4", asset_code: "USDC", asset_issuer: simulationKey(ID).publicKey(), balance: "507.0000000" }] });
    await expect(verifySwap(run())).rejects.toThrow("USDC_BALANCE_MISMATCH");
  });
});
