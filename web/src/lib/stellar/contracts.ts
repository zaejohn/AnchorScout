import { Buffer } from "buffer";
import type { SignTransaction } from "@stellar/stellar-sdk/contract";

import { Client as RouteRegistryClient } from "./generated/route-registry/src";
import type { RouteRecord } from "./generated/route-registry/src";
import { Client as SettlementReceiptClient } from "./generated/settlement-receipt/src";
import type { SettlementReceiptRecord } from "./generated/settlement-receipt/src";
import {
  ROUTE_REGISTRY_CONTRACT_ID,
  SETTLEMENT_RECEIPT_CONTRACT_ID,
  STELLAR_NETWORK_PASSPHRASE,
  STELLAR_RPC_URL,
  hasContractDeployment,
} from "./config";
import { SubmittedTransactionPendingError, type TransactionUpdate } from "./errors";
import { decimalToUnits } from "./units";
import type { AnchorQuote } from "../anchors/types";
import { isSelectableQuote } from "../anchors/ranking";

export const createRouteId = () =>
  Buffer.from(crypto.getRandomValues(new Uint8Array(32)));

const randomId = createRouteId;

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Buffer.from(digest);
}

export function hashRouteQuote(quote: AnchorQuote) {
  return sha256(JSON.stringify({ anchorId: quote.anchorId, quoteId: quote.quoteId,
    sourceAmount: quote.sourceAmount, destinationAmount: quote.destinationAmount,
    fee: quote.fee, expiresAt: quote.expiresAt }));
}

function baseClientOptions(address?: string) {
  if (!hasContractDeployment()) {
    throw new Error("Testnet contracts are not configured");
  }
  return {
    publicKey: address,
    rpcUrl: STELLAR_RPC_URL,
    networkPassphrase: STELLAR_NETWORK_PASSPHRASE,
  };
}

export async function prepareRouteTransaction(params: {
  address: string;
  quote: AnchorQuote;
  routeId: Buffer;
  signTransaction?: SignTransaction;
}) {
  const { address, quote, routeId } = params;
  if (!isSelectableQuote(quote, new Date())) throw new Error("Route quote expired or unavailable");
  const quoteHash = await hashRouteQuote(quote);
  const client = new RouteRegistryClient({
    ...baseClientOptions(address),
    contractId: ROUTE_REGISTRY_CONTRACT_ID,
    signTransaction: params.signTransaction,
  });

  return client.create_route({
    route_id: routeId,
    user: address,
    anchor_id: quote.anchorId,
    source_asset: quote.sourceAsset,
    source_amount: decimalToUnits(quote.sourceAmount, 7),
    destination_currency: quote.destinationCurrency,
    destination_amount: decimalToUnits(quote.destinationAmount, 2),
    // The current contract ABI has no nullable fee. Zero is an explicit
    // sentinel for externally sourced quotes whose fee is only disclosed in
    // the provider's authenticated payout flow; the quote hash still commits
    // to the nullable normalized value shown to the user.
    fee: decimalToUnits(quote.fee ?? "0", 7),
    quote_hash: quoteHash,
  });
}

export async function createRoute(params: {
  address: string;
  quote: AnchorQuote;
  routeId?: Buffer;
  signTransaction: SignTransaction;
  onUpdate: (update: TransactionUpdate) => void;
}) {
  const { onUpdate } = params;
  const routeId = params.routeId ?? randomId();
  onUpdate({ phase: "simulating", message: "Simulating route selection…" });
  const transaction = await prepareRouteTransaction({ ...params, routeId });
  if (!isSelectableQuote(params.quote, new Date())) throw new Error("Route quote expired during preparation");
  onUpdate({ phase: "awaiting_signature", message: "Authorize route selection in your wallet." });
  let submittedHash: string | undefined;
  let lastStatus: string | undefined;
  let sent: Awaited<ReturnType<typeof transaction.signAndSend>>;
  try {
    sent = await transaction.signAndSend({
      watcher: {
        onSubmitted(response) {
          submittedHash = response?.hash;
          onUpdate({ phase: "submitted", message: "Route transaction submitted…", hash: submittedHash });
        },
        onProgress(response) {
          lastStatus = response?.status;
          if (response?.status === "NOT_FOUND") {
            onUpdate({ phase: "pending", message: "Waiting for route confirmation…", hash: submittedHash });
          } else if (response?.status === "FAILED") {
            onUpdate({ phase: "failed", message: "Route transaction failed on-chain.", hash: submittedHash });
          }
        },
      },
    });
  } catch (error) {
    if (submittedHash && lastStatus !== "FAILED" && lastStatus !== "SUCCESS") {
      throw new SubmittedTransactionPendingError(
        "route",
        submittedHash,
        routeId.toString("hex"),
      );
    }
    throw error;
  }
  if (sent.getTransactionResponse?.status !== "SUCCESS") {
    throw new Error("Route transaction failed on-chain");
  }
  void sent.result;
  onUpdate({ phase: "confirmed", message: "Route selection recorded on-chain.", hash: submittedHash });
  return { routeId, hash: submittedHash };
}

export async function prepareSettlementTransaction(params: {
  address: string;
  routeId: Buffer;
  receiptId: Buffer;
  paymentHash: string;
  succeeded: boolean;
  signTransaction?: SignTransaction;
}) {
  const { address, routeId, paymentHash, succeeded } = params;
  const client = new SettlementReceiptClient({
    ...baseClientOptions(address),
    contractId: SETTLEMENT_RECEIPT_CONTRACT_ID,
    signTransaction: params.signTransaction,
  });
  return client.record_outcome({
    receipt_id: params.receiptId,
    route_id: routeId,
    user: address,
    transaction_hash: Buffer.from(paymentHash, "hex"),
    status_code: succeeded ? 1 : 2,
  });
}

export async function recordSettlement(params: {
  address: string;
  routeId: Buffer;
  receiptId?: Buffer;
  paymentHash: string;
  succeeded: boolean;
  signTransaction: SignTransaction;
  onUpdate: (update: TransactionUpdate) => void;
}) {
  const { routeId, onUpdate } = params;
  onUpdate({ phase: "simulating", message: "Simulating settlement receipt…" });
  const transaction = await prepareSettlementTransaction({ ...params, receiptId: params.receiptId ?? randomId() });
  onUpdate({ phase: "awaiting_signature", message: "Authorize the settlement receipt." });
  let submittedHash: string | undefined;
  let lastStatus: string | undefined;
  let sent: Awaited<ReturnType<typeof transaction.signAndSend>>;
  try {
    sent = await transaction.signAndSend({
      watcher: {
        onSubmitted(response) {
          submittedHash = response?.hash;
          onUpdate({ phase: "submitted", message: "Receipt transaction submitted…", hash: submittedHash });
        },
        onProgress(response) {
          lastStatus = response?.status;
          if (response?.status === "NOT_FOUND") {
            onUpdate({ phase: "pending", message: "Waiting for settlement confirmation…", hash: submittedHash });
          } else if (response?.status === "FAILED") {
            onUpdate({ phase: "failed", message: "Settlement transaction failed on-chain.", hash: submittedHash });
          }
        },
      },
    });
  } catch (error) {
    if (submittedHash && lastStatus !== "FAILED" && lastStatus !== "SUCCESS") {
      throw new SubmittedTransactionPendingError(
        "receipt",
        submittedHash,
        routeId.toString("hex"),
      );
    }
    throw error;
  }
  if (sent.getTransactionResponse?.status !== "SUCCESS") {
    throw new Error("Settlement transaction failed on-chain");
  }
  void sent.result;
  onUpdate({ phase: "confirmed", message: "Settlement finalized across both contracts.", hash: submittedHash });
  return { hash: submittedHash };
}

export async function getWalletRoutes(address: string): Promise<RouteRecord[]> {
  const client = new RouteRegistryClient({
    ...baseClientOptions(),
    contractId: ROUTE_REGISTRY_CONTRACT_ID,
  });
  const countTransaction = await client.get_user_route_count({ user: address });
  const { cursor, limit } = recentRouteWindow(countTransaction.result);
  if (limit === 0) return [];
  const transaction = await client.get_user_routes({ user: address, cursor, limit });
  return transaction.result;
}

export function recentRouteWindow(count: number, pageSize = 20) {
  const limit = Math.min(Math.max(count, 0), pageSize);
  return { cursor: Math.max(0, count - limit), limit };
}

export async function getRouteReceipt(
  routeId: Buffer,
): Promise<SettlementReceiptRecord | null> {
  const client = new SettlementReceiptClient({
    ...baseClientOptions(),
    contractId: SETTLEMENT_RECEIPT_CONTRACT_ID,
  });
  const transaction = await client.get_receipt({ route_id: routeId });
  return transaction.result;
}
