import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findConfirmedXlmTransaction: vi.fn(),
  getRouteReceipt: vi.fn(),
  getRouteTransactionEvidence: vi.fn(),
  getWalletRoutes: vi.fn(),
}));

vi.mock("@/lib/stellar/classic", () => ({
  findConfirmedXlmTransaction: mocks.findConfirmedXlmTransaction,
}));
vi.mock("@/lib/stellar/config", () => ({
  hasContractDeployment: () => true,
  STELLAR_NETWORK: "TESTNET",
}));
vi.mock("@/lib/stellar/contracts", () => ({
  getRouteReceipt: mocks.getRouteReceipt,
  getWalletRoutes: mocks.getWalletRoutes,
}));
vi.mock("@/lib/stellar/event-evidence", () => ({
  getRouteTransactionEvidence: mocks.getRouteTransactionEvidence,
}));

import { GET } from "./route";

const ADDRESS = "GC3X6QDXCPBDF7UKQQDPQXOYAY3IJAOZILG7OJR2UHXUMRJFY5IBREJV";
const HASH = "ab".repeat(32);
const ROUTE_ID = "cd".repeat(32);

function routeRecord() {
  return {
    route_id: Buffer.from(ROUTE_ID, "hex"),
    anchor_id: "coins-ph-market",
    source_asset: "XLM",
    source_amount: 1_000_000_000n,
    destination_currency: "PHP",
    destination_amount: 125_000n,
    fee: 0n,
    selected_at: 1_787_925_877n,
    status: { tag: "Completed" },
    transaction_hash: Buffer.from(HASH, "hex"),
  };
}

async function requestHistory() {
  const response = await GET(new Request("http://localhost"), {
    params: Promise.resolve({ address: ADDRESS }),
  });
  return { response, payload: await response.json() };
}

describe("wallet history transaction evidence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getWalletRoutes.mockResolvedValue([routeRecord()]);
    mocks.getRouteReceipt.mockResolvedValue({ receipt_id: Buffer.alloc(32, 1) });
    mocks.getRouteTransactionEvidence.mockResolvedValue(
      new Map([
        [
          ROUTE_ID,
          {
            routeTransactionHash: "1".repeat(64),
            receiptTransactionHash: "2".repeat(64),
          },
        ],
      ]),
    );
  });

  it("returns only the matching Horizon-confirmed payment hash on Testnet", async () => {
    mocks.findConfirmedXlmTransaction.mockResolvedValue({
      status: "successful",
      transaction: { hash: HASH, ledger: 123, successful: true },
    });

    const { response, payload } = await requestHistory();

    expect(response.status).toBe(200);
    expect(payload.routes[0]).toMatchObject({
      network: "TESTNET",
      paymentHash: HASH,
      paymentStatus: "SUCCESS",
      routeTransactionHash: "1".repeat(64),
      receiptTransactionHash: "2".repeat(64),
    });
  });

  it("does not expose a payment hash Horizon cannot find", async () => {
    mocks.findConfirmedXlmTransaction.mockResolvedValue({ status: "not_found" });

    const { response, payload } = await requestHistory();

    expect(response.status).toBe(200);
    expect(payload.routes[0]).toMatchObject({
      network: "TESTNET",
      paymentHash: null,
      paymentStatus: "NOT_FOUND",
    });
  });

  it("keeps durable History available during a transient Horizon failure", async () => {
    mocks.findConfirmedXlmTransaction.mockRejectedValue(new Error("Horizon timeout"));

    const { response, payload } = await requestHistory();

    expect(response.status).toBe(200);
    expect(payload.routes[0]).toMatchObject({
      network: "TESTNET",
      paymentHash: null,
      paymentStatus: "UNAVAILABLE",
    });
  });
});
