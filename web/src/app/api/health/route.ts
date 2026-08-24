import { noStoreJson } from "@/lib/server/responses";
import {
  STELLAR_HORIZON_URL,
  STELLAR_NETWORK,
  STELLAR_RPC_URL,
  hasContractDeployment,
} from "@/lib/stellar/config";

async function probeHorizon() {
  const startedAt = performance.now();
  const response = await fetch(STELLAR_HORIZON_URL, {
    cache: "no-store",
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error(`Horizon returned ${response.status}`);
  return { ok: true, latencyMs: Math.round(performance.now() - startedAt) };
}

async function probeRpc() {
  const startedAt = performance.now();
  const response = await fetch(STELLAR_RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getLatestLedger" }),
    cache: "no-store",
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error(`RPC returned ${response.status}`);
  const payload = (await response.json()) as {
    result?: { sequence?: number; protocolVersion?: number };
    error?: unknown;
  };
  if (payload.error || !payload.result?.sequence) throw new Error("RPC probe failed");
  return {
    ok: true,
    latencyMs: Math.round(performance.now() - startedAt),
    latestLedger: payload.result.sequence,
    protocolVersion: payload.result.protocolVersion,
  };
}

export async function GET() {
  const [horizon, rpc] = await Promise.allSettled([probeHorizon(), probeRpc()]);
  const contractsConfigured = hasContractDeployment();
  const ready =
    contractsConfigured && horizon.status === "fulfilled" && rpc.status === "fulfilled";

  return noStoreJson(
    {
      status: ready ? "ready" : "degraded",
      network: STELLAR_NETWORK,
      contractsConfigured,
      horizon:
        horizon.status === "fulfilled" ? horizon.value : { ok: false },
      rpc: rpc.status === "fulfilled" ? rpc.value : { ok: false },
      checkedAt: new Date().toISOString(),
    },
    ready ? 200 : 503,
  );
}
