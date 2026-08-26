import { StrKey } from "@stellar/stellar-sdk";
import { noStoreJson } from "@/lib/server/responses";
import { STELLAR_HORIZON_URL } from "@/lib/stellar/config";

type HorizonBalance = {
  balance: string;
  asset_type: string;
  asset_code?: string;
  asset_issuer?: string;
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ address: string }> },
) {
  const { address } = await params;
  if (!StrKey.isValidEd25519PublicKey(address)) {
    return noStoreJson({ error: "Invalid Stellar address" }, 400);
  }
  try {
    const response = await fetch(`${STELLAR_HORIZON_URL}/accounts/${address}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (response.status === 404) {
      return noStoreJson({ error: "Account is not funded" }, 404);
    }
    if (!response.ok) throw new Error(`Horizon returned ${response.status}`);
    const account = (await response.json()) as {
      balances: HorizonBalance[];
      sequence: string;
    };
    return noStoreJson({
      address,
      sequence: account.sequence,
      balances: account.balances.map((balance) => ({
        asset: balance.asset_type === "native" ? "XLM" : balance.asset_code,
        issuer: balance.asset_issuer,
        balance: balance.balance,
      })),
    });
  } catch (error) {
    console.error("horizon_account_lookup_failed", error);
    return noStoreJson({ error: "Horizon is temporarily unavailable" }, 503);
  }
}
