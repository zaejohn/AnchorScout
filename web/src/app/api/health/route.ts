import { noStoreJson } from "@/lib/server/responses";
import {
  STELLAR_HORIZON_URL,
  STELLAR_NETWORK,
  STELLAR_RPC_URL,
  hasExecutableDeployment,
} from "@/lib/stellar/config";
import { verifyRouteExecutorConfiguration } from "@/lib/stellar/contracts";

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
  const contractsConfigured = hasExecutableDeployment();
  const [horizon, rpc, executor] = await Promise.allSettled([
    probeHorizon(),
    probeRpc(),
    contractsConfigured
      ? verifyRouteExecutorConfiguration()
      : Promise.reject(new Error("Executor not configured")),
  ]);
  const ready =
    contractsConfigured &&
    horizon.status === "fulfilled" &&
    rpc.status === "fulfilled" &&
    executor.status === "fulfilled";

  return noStoreJson(
    {
      status: ready ? "ready" : "degraded",
      network: STELLAR_NETWORK,
      contractsConfigured,
      executorConfigured: executor.status === "fulfilled",
      horizon:
        horizon.status === "fulfilled" ? horizon.value : { ok: false },
      rpc: rpc.status === "fulfilled" ? rpc.value : { ok: false },
      checkedAt: new Date().toISOString(),
    },
    ready ? 200 : 503,
  );
}
