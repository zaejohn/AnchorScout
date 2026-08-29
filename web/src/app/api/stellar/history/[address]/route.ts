import { Buffer } from "buffer";
import { StrKey } from "@stellar/stellar-sdk";
import { noStoreJson } from "@/lib/server/responses";
import { findConfirmedXlmTransaction } from "@/lib/stellar/classic";
import { hasContractDeployment, STELLAR_NETWORK } from "@/lib/stellar/config";
import { getRouteReceipt, getWalletRoutes } from "@/lib/stellar/contracts";
import { getRouteTransactionEvidence } from "@/lib/stellar/event-evidence";
import { resolveHistoryPayment } from "@/lib/stellar/history";
import { unitsToDecimal } from "@/lib/stellar/units";

const statusTag = (status: { tag: string }) => status.tag.toUpperCase();

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ address: string }> },
) {
  const { address } = await params;
  if (!StrKey.isValidEd25519PublicKey(address)) {
    return noStoreJson({ error: "Invalid Stellar address" }, 400);
  }
  if (!hasContractDeployment()) {
    return noStoreJson({ routes: [], configured: false });
  }
  try {
    const records = await getWalletRoutes(address);
    const routeIds = records.map((route) =>
      Buffer.from(route.route_id).toString("hex"),
    );
    const transactionEvidence = await getRouteTransactionEvidence(routeIds).catch(
      () => new Map(),
    );
    const routes = await Promise.all(
      [...records].reverse().map(async (route) => {
        const receipt =
          route.status.tag === "Pending"
            ? null
            : await getRouteReceipt(Buffer.from(route.route_id));
        const routeId = Buffer.from(route.route_id).toString("hex");
        const evidence = transactionEvidence.get(routeId);
        const storedPaymentHash = route.transaction_hash
          ? Buffer.from(route.transaction_hash).toString("hex")
          : null;
        const payment =
          storedPaymentHash && storedPaymentHash !== "0".repeat(64)
            ? await resolveHistoryPayment(
                storedPaymentHash,
                findConfirmedXlmTransaction,
              )
            : null;
        const transactionHash =
          evidence?.executionTransactionHash ??
          payment?.hash ??
          evidence?.receiptTransactionHash ??
          evidence?.routeTransactionHash ??
          null;
        const transactionStatus = evidence?.executionTransactionHash
          ? "SUCCESS"
          : payment?.hash
            ? payment.status
            : transactionHash
              ? "SUCCESS"
              : payment?.status ?? null;
        const transactionKind = evidence?.executionTransactionHash
          ? "ATOMIC_PROOF"
          : payment?.hash
            ? "LEGACY_PAYMENT"
            : evidence?.receiptTransactionHash
              ? "LEGACY_RECEIPT"
              : evidence?.routeTransactionHash
                ? "ROUTE_SELECTION"
                : null;
        return {
          routeId,
          anchorId: route.anchor_id,
          sourceAsset: route.source_asset,
          sourceAmount: unitsToDecimal(route.source_amount, 7),
          destinationCurrency: route.destination_currency,
          destinationAmount: unitsToDecimal(route.destination_amount, 2),
          fee: unitsToDecimal(route.fee, 7),
          selectedAt: Number(route.selected_at),
          status: statusTag(route.status),
          network: STELLAR_NETWORK,
          transactionHash,
          transactionStatus,
          transactionKind,
          receiptId: receipt
            ? Buffer.from(receipt.receipt_id).toString("hex")
            : null,
        };
      }),
    );
    return noStoreJson({ routes, configured: true });
  } catch (error) {
    console.error("contract_history_failed", error);
    return noStoreJson({ error: "Contract history is temporarily unavailable" }, 503);
  }
}
