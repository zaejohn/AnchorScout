import { noStoreJson } from "@/lib/server/responses";
import { getContractTransactionStatus } from "@/lib/stellar/transaction-status";

const TRANSACTION_HASH = /^[0-9a-f]{64}$/;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ hash: string }> },
) {
  const { hash } = await params;
  if (!TRANSACTION_HASH.test(hash)) {
    return noStoreJson({ error: "Invalid transaction hash" }, 400);
  }
  try {
    const status = await getContractTransactionStatus(hash);
    return noStoreJson({ status });
  } catch (error) {
    console.error("contract_transaction_lookup_failed", error);
    return noStoreJson({ error: "Transaction status is temporarily unavailable" }, 503);
  }
}
