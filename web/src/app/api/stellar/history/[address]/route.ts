import { Buffer } from "buffer";
import { StrKey } from "@stellar/stellar-sdk";
import { noStoreJson } from "@/lib/server/responses";
import { hasContractDeployment } from "@/lib/stellar/config";
import { getRouteReceipt, getWalletRoutes } from "@/lib/stellar/contracts";
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
    const routes = await Promise.all(
      [...records].reverse().map(async (route) => {
        const receipt =
          route.status.tag === "Pending"
            ? null
            : await getRouteReceipt(Buffer.from(route.route_id));
        return {
          routeId: Buffer.from(route.route_id).toString("hex"),
          anchorId: route.anchor_id,
          sourceAsset: route.source_asset,
          sourceAmount: unitsToDecimal(route.source_amount, 7),
          destinationCurrency: route.destination_currency,
          destinationAmount: unitsToDecimal(route.destination_amount, 2),
          fee: unitsToDecimal(route.fee, 7),
          selectedAt: Number(route.selected_at),
          status: statusTag(route.status),
          paymentHash: route.transaction_hash
            ? Buffer.from(route.transaction_hash).toString("hex")
            : null,
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
