import { Asset, BASE_FEE, Horizon, Operation, TransactionBuilder } from "@stellar/stellar-sdk";
import { STELLAR_HORIZON_URL, STELLAR_NETWORK_PASSPHRASE } from "./config";
import { decimalToUnits } from "./units";

export const usdcBalance = (account: Horizon.AccountResponse, issuer: string) => {
  const balance = account.balances.find((entry) => "asset_code" in entry && entry.asset_code === "USDC" && entry.asset_issuer === issuer);
  return balance ? decimalToUnits(balance.balance, 7) : 0n;
};

export async function prepareUsdcTrustline(source: string, issuer: string) {
  const server = new Horizon.Server(STELLAR_HORIZON_URL);
  const account = await server.loadAccount(source);
  return new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: STELLAR_NETWORK_PASSPHRASE })
    .addOperation(Operation.changeTrust({ asset: new Asset("USDC", issuer), limit: "10000" }))
    .setTimeout(180).build();
}

export async function prepareUsdcSwap(source: string, issuer: string, amount: string) {
  const asset = new Asset("USDC", issuer);
  const server = new Horizon.Server(STELLAR_HORIZON_URL);
  const account = await server.loadAccount(source);
  // Exact receive: acquire the requested random amount, never a fabricated balance.
  const response = await server.strictReceivePaths(source, asset, amount).call();
  const paths = response.records.filter((record) => record.source_asset_type === "native")
    .sort((a, b) => Number(a.source_amount) - Number(b.source_amount));
  const path = paths[0];
  if (!path) throw new Error("USDC_LIQUIDITY_UNAVAILABLE");
  const native = account.balances.find((entry) => entry.asset_type === "native");
  // Leave a generous reserve/contract-fee budget; no unbounded slippage.
  if (!native || decimalToUnits(native.balance, 7) < decimalToUnits(path.source_amount, 7) + 100000000n) {
    throw new Error("USDC_SWAP_BALANCE_TOO_LOW");
  }
  return new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: STELLAR_NETWORK_PASSPHRASE })
    .addOperation(Operation.pathPaymentStrictReceive({
      sendAsset: Asset.native(), sendMax: path.source_amount, destination: source,
      destAsset: asset, destAmount: amount,
      path: path.path.map((entry) => entry.asset_type === "native" ? Asset.native() : new Asset(entry.asset_code!, entry.asset_issuer!)),
    })).setTimeout(180).build();
}
