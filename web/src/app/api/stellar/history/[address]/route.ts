import { Buffer } from "buffer";
import { StrKey } from "@stellar/stellar-sdk";
import { NextResponse } from "next/server";

import { hasContractDeployment } from "@/lib/stellar/config";
import { getRouteReceipt, getWalletRoutes } from "@/lib/stellar/contracts";

const statusTag = (status: { tag: string }) => status.tag.toUpperCase();

function formatUnits(value: bigint, decimals: number) {
  const negative = value < 0n;
  const digits = (negative ? -value : value).toString().padStart(decimals + 1, "0");
  const integer = digits.slice(0, -decimals);
  const fraction = digits.slice(-decimals).replace(/0+$/, "");
  return `${negative ? "-" : ""}${integer}${fraction ? `.${fraction}` : ""}`;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ address: string }> },
) {
  const { address } = await params;
  if (!StrKey.isValidEd25519PublicKey(address)) {
    return NextResponse.json({ error: "Invalid Stellar address" }, { status: 400 });
  }
  if (!hasContractDeployment()) {
    return NextResponse.json({ routes: [], configured: false });
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
          sourceAmount: formatUnits(route.source_amount, 7),
          destinationCurrency: route.destination_currency,
          destinationAmount: formatUnits(route.destination_amount, 2),
          fee: formatUnits(route.fee, 7),
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
    return NextResponse.json({ routes, configured: true });
  } catch (error) {
    console.error("contract_history_failed", error);
    return NextResponse.json(
      { error: "Contract history is temporarily unavailable" },
      { status: 503 },
    );
  }
}
