import { noStoreJson } from "@/lib/server/responses";
import {
  ROUTE_EXECUTOR_CONTRACT_ID,
  ROUTE_REGISTRY_CONTRACT_ID,
  SETTLEMENT_RECEIPT_CONTRACT_ID,
  STELLAR_RPC_URL,
  hasContractDeployment,
} from "@/lib/stellar/config";
import { buildEventRequest } from "@/lib/stellar/events";

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
    return noStoreJson({ events: [], configured: false, cursor: null });
  }
  try {
    const latest = await rpc<{ sequence: number }>("getLatestLedger", {});
    const searchParams = new URL(request.url).searchParams;
    const requested = Number(searchParams.get("startLedger"));
    const cursor = searchParams.get("cursor");
    const result = await rpc<{
      events: Array<{ id: string; ledger: number; contractId?: string; topic?: string[]; value?: string }>;
      cursor: string;
      latestLedger: number;
      oldestLedger: number;
    }>(
      "getEvents",
      buildEventRequest({
        cursor,
        requestedStartLedger: requested,
        latestLedger: latest.sequence,
        contractIds: [
          ROUTE_EXECUTOR_CONTRACT_ID,
          ROUTE_REGISTRY_CONTRACT_ID,
          SETTLEMENT_RECEIPT_CONTRACT_ID,
        ].filter(Boolean),
      }),
    );
    return noStoreJson({
      configured: true,
      events: result.events,
      cursor: result.cursor,
      latestLedger: result.latestLedger,
      oldestLedger: result.oldestLedger,
    });
  } catch (error) {
    console.error("contract_event_poll_failed", error);
    return noStoreJson({ error: "Contract events are temporarily unavailable" }, 503);
  }
}
