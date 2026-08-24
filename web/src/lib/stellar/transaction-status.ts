import { STELLAR_RPC_URL } from "./config";

export type ContractTransactionStatus = "NOT_FOUND" | "SUCCESS" | "FAILED";

export function parseContractTransactionStatus(value: unknown): ContractTransactionStatus {
  if (value === "NOT_FOUND" || value === "SUCCESS" || value === "FAILED") {
    return value;
  }
  throw new Error("RPC returned an unknown transaction status");
}

export async function getContractTransactionStatus(hash: string) {
  const response = await fetch(STELLAR_RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getTransaction",
      params: { hash },
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`RPC returned ${response.status}`);
  const payload = (await response.json()) as {
    result?: { status?: unknown };
    error?: { message?: string };
  };
  if (payload.error || !payload.result) {
    throw new Error(payload.error?.message ?? "RPC transaction lookup failed");
  }
  return parseContractTransactionStatus(payload.result.status);
}
