import { Buffer } from "buffer";
import { scValToNative, xdr } from "@stellar/stellar-sdk";

import {
  ROUTE_EXECUTOR_CONTRACT_ID,
  ROUTE_REGISTRY_CONTRACT_ID,
  SETTLEMENT_RECEIPT_CONTRACT_ID,
  STELLAR_RPC_URL,
} from "./config";

type RawContractEvent = {
  id: string;
  txHash: string;
  inSuccessfulContractCall?: boolean;
  topic?: string[];
};

export type RouteTransactionEvidence = {
  executionTransactionHash?: string;
  routeTransactionHash?: string;
  receiptTransactionHash?: string;
};

const TRANSACTION_HASH = /^[0-9a-f]{64}$/;

function topicValue(value: string) {
  return scValToNative(xdr.ScVal.fromXDR(value, "base64"));
}

export function evidenceFromEvents(events: RawContractEvent[]) {
  const evidence = new Map<string, RouteTransactionEvidence>();
  for (const event of events) {
    if (event.inSuccessfulContractCall === false || !event.topic?.[0] || !event.topic[1]) {
      continue;
    }
    try {
      const name = String(topicValue(event.topic[0]));
      const routeId = Buffer.from(topicValue(event.topic[1])).toString("hex");
      if (!/^[0-9a-f]{64}$/.test(routeId)) continue;
      const transactionHash = event.txHash.toLowerCase();
      if (!TRANSACTION_HASH.test(transactionHash)) continue;
      const current = evidence.get(routeId) ?? {};
      if (name === "route_selected") current.routeTransactionHash = transactionHash;
      if (name === "route_executed") current.executionTransactionHash = transactionHash;
      if (name === "settlement_recorded" || name === "route_status_changed") {
        current.receiptTransactionHash = transactionHash;
      }
      evidence.set(routeId, current);
    } catch {
      // Unknown events remain available through the raw event endpoint.
    }
  }
  return evidence;
}

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
  if (payload.error || !payload.result) throw new Error(payload.error?.message ?? "RPC failed");
  return payload.result;
}

export async function getRouteTransactionEvidence(routeIds: string[]) {
  if (routeIds.length === 0) return new Map<string, RouteTransactionEvidence>();
  const wanted = new Set(routeIds);
  const latest = await rpc<{ sequence: number }>("getLatestLedger", {});
  const probe = await rpc<{ oldestLedger: number }>("getEvents", {
    startLedger: latest.sequence,
    filters: [],
    pagination: { limit: 1 },
  });
  // Public RPC nodes cap how far one getEvents query scans before returning.
  // History is intentionally the newest 20 routes, so scan a recent bounded
  // window and leave older transaction evidence absent rather than guessing.
  const startLedger = Math.max(probe.oldestLedger, latest.sequence - 10_000);
  let cursor: string | undefined;
  const collected: RawContractEvent[] = [];
  const found = new Set<string>();

  for (let page = 0; page < 20 && found.size < wanted.size; page += 1) {
    const result = await rpc<{
      events: RawContractEvent[];
      cursor: string;
    }>("getEvents", {
      filters: [
        {
          type: "contract",
          contractIds: [
            ROUTE_EXECUTOR_CONTRACT_ID,
            ROUTE_REGISTRY_CONTRACT_ID,
            SETTLEMENT_RECEIPT_CONTRACT_ID,
          ].filter(Boolean),
        },
      ],
      pagination: { limit: 100, ...(cursor ? { cursor } : {}) },
      ...(!cursor ? { startLedger } : {}),
    });
    collected.push(...result.events);
    const pageEvidence = evidenceFromEvents(result.events);
    for (const [routeId, routeEvidence] of pageEvidence) {
      if (
        wanted.has(routeId) &&
        (routeEvidence.executionTransactionHash ||
          routeEvidence.receiptTransactionHash)
      ) {
        found.add(routeId);
      }
    }
    if (result.events.length < 100 || result.cursor === cursor) break;
    cursor = result.cursor;
  }
  return evidenceFromEvents(collected);
}
