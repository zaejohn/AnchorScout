import { NextResponse } from "next/server";

import {
  ROUTE_REGISTRY_CONTRACT_ID,
  SETTLEMENT_RECEIPT_CONTRACT_ID,
  STELLAR_RPC_URL,
  hasContractDeployment,
} from "@/lib/stellar/config";

async function rpc<T>(method: string, params: Record<string, unknown>) {
  const response = await fetch(STELLAR_RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`RPC returned ${response.status}`);
  const payload = (await response.json()) as { result?: T; error?: { message?: string } };
  if (payload.error || !payload.result) {
    throw new Error(payload.error?.message ?? "RPC response missing result");
  }
  return payload.result;
}

export async function GET(request: Request) {
  if (!hasContractDeployment()) {
    return NextResponse.json({ events: [], configured: false, nextLedger: null });
  }
  try {
    const latest = await rpc<{ sequence: number }>("getLatestLedger", {});
    const requested = Number(new URL(request.url).searchParams.get("startLedger"));
    const startLedger = Number.isInteger(requested) && requested > 0
      ? Math.min(requested, latest.sequence)
      : Math.max(1, latest.sequence - 100);
    const result = await rpc<{
      events: Array<{ id: string; ledger: number; contractId?: string; topic?: string[]; value?: string }>;
    }>("getEvents", {
      startLedger,
      filters: [
        {
          type: "contract",
          contractIds: [
            ROUTE_REGISTRY_CONTRACT_ID,
            SETTLEMENT_RECEIPT_CONTRACT_ID,
          ],
        },
      ],
      pagination: { limit: 100 },
    });
    return NextResponse.json({
      configured: true,
      events: result.events,
      nextLedger: latest.sequence + 1,
    });
  } catch (error) {
    console.error("contract_event_poll_failed", error);
    return NextResponse.json(
      { error: "Contract events are temporarily unavailable" },
      { status: 503 },
    );
  }
}

