import { Networks, StrKey } from "@stellar/stellar-sdk";

export const STELLAR_NETWORK = "TESTNET" as const;
export const STELLAR_NETWORK_PASSPHRASE = Networks.TESTNET;
export const STELLAR_HORIZON_URL =
  process.env.NEXT_PUBLIC_STELLAR_HORIZON_URL ??
  "https://horizon-testnet.stellar.org";
export const STELLAR_RPC_URL =
  process.env.NEXT_PUBLIC_STELLAR_RPC_URL ??
  "https://soroban-testnet.stellar.org";
export const ROUTE_REGISTRY_CONTRACT_ID =
  process.env.NEXT_PUBLIC_ROUTE_REGISTRY_CONTRACT_ID ?? "";
export const SETTLEMENT_RECEIPT_CONTRACT_ID =
  process.env.NEXT_PUBLIC_SETTLEMENT_RECEIPT_CONTRACT_ID ?? "";
export const PROOF_PAYMENT_DESTINATION =
  process.env.NEXT_PUBLIC_PROOF_PAYMENT_DESTINATION ??
  process.env.NEXT_PUBLIC_DEMO_PAYMENT_DESTINATION ??
  "";
export const TESTNET_USDC_ISSUER =
  process.env.NEXT_PUBLIC_TESTNET_USDC_ISSUER ?? "";

export const stellarExpertUrl = (kind: "account" | "tx" | "contract", value: string) => {
  const segment = kind === "tx" ? "tx" : kind;
  return `https://stellar.expert/explorer/testnet/${segment}/${value}`;
};

export function hasContractDeployment() {
  return hasValidContractDeployment(
    ROUTE_REGISTRY_CONTRACT_ID,
    SETTLEMENT_RECEIPT_CONTRACT_ID,
  );
}

export function hasValidContractDeployment(routeId: string, settlementId: string) {
  return StrKey.isValidContract(routeId) && StrKey.isValidContract(settlementId);
}

export function hasExecutableDeployment() {
  return (
    hasContractDeployment() &&
    StrKey.isValidEd25519PublicKey(PROOF_PAYMENT_DESTINATION)
  );
}
