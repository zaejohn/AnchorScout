import "server-only";
import { Address, Asset, Horizon, Keypair, Networks, Transaction, TransactionBuilder, rpc, scValToNative } from "@stellar/stellar-sdk";
import { prepareRouteExecutionTransaction, prepareRouteTransaction, prepareSettlementTransaction, getRouteReceipt, hashRouteQuote, verifyRouteExecutorConfiguration } from "../stellar/contracts";
import { isSelectableQuote } from "../anchors/ranking";
import { Client as RouteClient } from "../stellar/generated/route-registry/src";
import { prepareXlmTransaction, findConfirmedXlmTransaction } from "../stellar/classic";
import { prepareUsdcSwap, prepareUsdcTrustline, usdcBalance } from "../stellar/usdc";
import { decimalToUnits } from "../stellar/units";
import { PROOF_PAYMENT_DESTINATION, ROUTE_EXECUTOR_CONTRACT_ID, ROUTE_REGISTRY_CONTRACT_ID, SETTLEMENT_RECEIPT_CONTRACT_ID, STELLAR_HORIZON_URL, STELLAR_RPC_URL, hasExecutableDeployment } from "../stellar/config";
import { OFFICIAL_TESTNET_USDC_ISSUER, simulationKey } from "./security";
import type { SimulationRun } from "./types";

type Pending = NonNullable<SimulationRun["pending"]>;
export type TransactionResult = "confirmed" | "pending" | "expired" | "failed";
export class SimulationBlockedError extends Error {}

const horizon = () => new Horizon.Server(STELLAR_HORIZON_URL);
const soroban = () => new rpc.Server(STELLAR_RPC_URL, { timeout: 10_000 });

export async function verifyTestnetConfiguration() {
  if (!hasExecutableDeployment()) throw new SimulationBlockedError("TESTNET_DEPLOYMENT_MISSING");
  const issuer = process.env.TESTNET_USDC_ISSUER;
  const publicIssuer = process.env.NEXT_PUBLIC_TESTNET_USDC_ISSUER;
  if (issuer !== OFFICIAL_TESTNET_USDC_ISSUER || (publicIssuer && publicIssuer !== issuer)) {
    throw new SimulationBlockedError("OFFICIAL_TESTNET_USDC_ISSUER_REQUIRED");
  }
  const [root, network] = await Promise.all([
    fetch(STELLAR_HORIZON_URL, { signal: AbortSignal.timeout(8000), cache: "no-store" }).then(async (r) => {
      if (!r.ok) throw new Error("HORIZON_UNAVAILABLE");
      return r.json() as Promise<{ network_passphrase: string }>;
    }), soroban().getNetwork(),
  ]);
  if (root.network_passphrase !== Networks.TESTNET || network.passphrase !== Networks.TESTNET) {
    throw new SimulationBlockedError("TESTNET_NETWORK_MISMATCH");
  }
  await verifyRouteExecutorConfiguration();
}

export async function fundWallet(wallet: string) {
  let exists = false;
  let friendbotHash: string | undefined;
  try { await horizon().loadAccount(wallet); exists = true; }
  catch (error) {
    if ((error as { response?: { status?: number } }).response?.status !== 404) throw error;
  }
  if (!exists) {
    const response = await fetch(`https://friendbot.stellar.org/?addr=${wallet}`, { signal: AbortSignal.timeout(25_000) });
    if (!response.ok) throw new Error("FRIENDBOT_UNAVAILABLE");
    const funding = await response.json() as { hash?: string };
    if (!funding.hash || !/^[a-f0-9]{64}$/.test(funding.hash)) throw new Error("FRIENDBOT_CONFIRMATION_MISSING");
    friendbotHash = funding.hash;
  }
  const account = await horizon().loadAccount(wallet);
  const balance = account.balances.find((entry) => entry.asset_type === "native");
  if (!balance || decimalToUnits(balance.balance, 7) < 10000n * 10000000n) throw new SimulationBlockedError("FUNDING_BALANCE_MISMATCH");
  const history = await horizon().transactions().forAccount(wallet).order("asc").limit(1).call();
  const first = history.records[0];
  if (!first || !first.successful || (friendbotHash && first.hash !== friendbotHash)) throw new Error("FUNDING_NOT_CONFIRMED");
  const confirmed = await findConfirmedXlmTransaction(first.hash);
  if (confirmed.status !== "successful") throw new Error("FUNDING_NOT_CONFIRMED");
  // Also covers a crash after Friendbot accepted funding but before DB checkpoint.
  const operations = await horizon().operations().forTransaction(first.hash).call();
  if (!operations.records.some((op) => op.type === "create_account" && op.account === wallet && decimalToUnits(op.starting_balance, 7) >= 10000n * 10000000n)) {
    throw new SimulationBlockedError("FUNDING_OPERATION_MISMATCH");
  }
  return first.hash;
}

function keyForRun(run: SimulationRun): Keypair {
  const key = simulationKey(run.id);
  if (key.publicKey() !== run.wallet) throw new SimulationBlockedError("SIMULATION_WALLET_KEY_CHANGED");
  return key;
}

export function verifyTransactionIntent(transaction: Transaction, kind: Pending["kind"], run: SimulationRun) {
  const key = keyForRun(run);
  const op = transaction.operations[0];
  const matchesUsdc = (asset: Asset) => asset.getCode() === "USDC" && asset.getIssuer() === OFFICIAL_TESTNET_USDC_ISSUER;
  if (transaction.source !== run.wallet || transaction.networkPassphrase !== Networks.TESTNET ||
      !transaction.timeBounds || Number(transaction.timeBounds.maxTime) <= 0 ||
      transaction.operations.length !== 1 || !op || (op.source && op.source !== run.wallet) ||
      !transaction.signatures.some((signature) => key.verify(transaction.hash(), signature.signature()))) {
    throw new SimulationBlockedError("TRANSACTION_INTENT_MISMATCH");
  }
  let valid = false;
  if (kind === "trustline") valid = op.type === "changeTrust" && op.line instanceof Asset && matchesUsdc(op.line) && decimalToUnits(op.limit, 7) === 10000n * 10000000n;
  if (kind === "swap") valid = op.type === "pathPaymentStrictReceive" && op.sendAsset.isNative() && op.destination === run.wallet &&
    matchesUsdc(op.destAsset) && decimalToUnits(op.destAmount, 7) === decimalToUnits(run.amount, 7) &&
    decimalToUnits(op.sendMax, 7) > 0n && decimalToUnits(op.sendMax, 7) <= 9990n * 10000000n;
  if (kind === "proof") valid = op.type === "payment" && op.asset.isNative() && op.destination === PROOF_PAYMENT_DESTINATION && decimalToUnits(op.amount, 7) === 1000000n;
  if ((kind === "execution" || kind === "route" || kind === "receipt") && op.type === "invokeHostFunction" && op.func.switch().name === "hostFunctionTypeInvokeContract") {
    const call = op.func.invokeContract();
    const expectedContract = kind === "execution" ? ROUTE_EXECUTOR_CONTRACT_ID : kind === "route" ? ROUTE_REGISTRY_CONTRACT_ID : SETTLEMENT_RECEIPT_CONTRACT_ID;
    const expectedMethod = kind === "execution" ? "execute_route" : kind === "route" ? "create_route" : "record_outcome";
    valid = Address.fromScAddress(call.contractAddress()).toString() === expectedContract &&
      call.functionName().toString() === expectedMethod;
    if (valid && kind === "execution") {
      if (!run.quote) throw new SimulationBlockedError("QUOTE_MISSING");
      const args = call.args().map((arg) => scValToNative(arg));
      valid =
        Buffer.from(args[0]).toString("hex") === run.routeId &&
        Buffer.from(args[1]).toString("hex") === run.receiptId &&
        args[2] === run.wallet &&
        args[3] === run.quote.anchorId &&
        args[4] === run.quote.sourceAsset &&
        args[5] === decimalToUnits(run.quote.sourceAmount, 7) &&
        args[6] === run.quote.destinationCurrency &&
        args[7] === decimalToUnits(run.quote.destinationAmount, 2) &&
        args[8] === decimalToUnits(run.quote.fee ?? "0", 7);
    }
  }
  if (!valid) throw new SimulationBlockedError("TRANSACTION_INTENT_MISMATCH");
}

export async function prepareTransaction(kind: Pending["kind"], run: SimulationRun): Promise<Pending> {
  const key = keyForRun(run);
  let transaction: Transaction;
  if (kind === "execution" || kind === "route" || kind === "receipt") {
    if (!run.quote) throw new SimulationBlockedError("QUOTE_MISSING");
    const assembled = kind === "execution"
      ? await prepareRouteExecutionTransaction({ address: run.wallet, routeId: Buffer.from(run.routeId, "hex"),
        receiptId: Buffer.from(run.receiptId, "hex"), quote: run.quote })
      : kind === "route"
        ? await prepareRouteTransaction({ address: run.wallet, routeId: Buffer.from(run.routeId, "hex"), quote: run.quote })
        : await prepareSettlementTransaction({ address: run.wallet, routeId: Buffer.from(run.routeId, "hex"),
          receiptId: Buffer.from(run.receiptId, "hex"), paymentHash: run.hashes.proof!, succeeded: true });
    if ((kind === "route" || kind === "execution") && !isSelectableQuote(run.quote, new Date())) {
      throw new Error("QUOTE_EXPIRED_BEFORE_SIGNING");
    }
    await assembled.sign({ signTransaction: key });
    if (!assembled.signed || !(assembled.signed instanceof Transaction)) throw new Error("SIGNING_FAILED");
    transaction = assembled.signed;
  } else {
    transaction = kind === "trustline"
      ? await prepareUsdcTrustline(run.wallet, OFFICIAL_TESTNET_USDC_ISSUER)
      : kind === "swap"
        ? await prepareUsdcSwap(run.wallet, OFFICIAL_TESTNET_USDC_ISSUER, run.amount)
        : await prepareXlmTransaction(run.wallet, PROOF_PAYMENT_DESTINATION, "0.1");
    transaction.sign(key);
  }
  if (transaction.source !== run.wallet || transaction.networkPassphrase !== Networks.TESTNET) throw new SimulationBlockedError("TRANSACTION_WALLET_MISMATCH");
  verifyTransactionIntent(transaction, kind, run);
  return { kind, hash: transaction.hash().toString("hex"), xdr: transaction.toXDR() };
}

export async function reconcileTransaction(run: SimulationRun): Promise<TransactionResult> {
  const pending = run.pending!;
  const transaction = TransactionBuilder.fromXDR(pending.xdr, Networks.TESTNET);
  if (!(transaction instanceof Transaction) || transaction.source !== run.wallet || transaction.hash().toString("hex") !== pending.hash) {
    throw new SimulationBlockedError("CHECKPOINT_MISMATCH");
  }
  keyForRun(run); // Detect key rotation before doing anything with a saved run.
  verifyTransactionIntent(transaction, pending.kind, run);
  const result = await soroban().getTransaction(pending.hash);
  if (result.status === "SUCCESS") return "confirmed";
  if (result.status === "FAILED") return "failed";
  const classic = await findConfirmedXlmTransaction(pending.hash);
  if (classic.status === "successful") return "confirmed";
  if (classic.status === "failed") return "failed";
  const ledgers = await horizon().ledgers().order("desc").limit(1).call();
  const closedAt = Date.parse(ledgers.records[0].closed_at) / 1000;
  if (!Number.isFinite(closedAt)) throw new Error("LEDGER_TIME_UNAVAILABLE");
  const maxTime = Number(transaction.timeBounds?.maxTime ?? 0);
  if (!maxTime) throw new SimulationBlockedError("UNBOUNDED_TRANSACTION");
  if (closedAt > maxTime) {
    const account = await horizon().loadAccount(run.wallet);
    if (BigInt(account.sequenceNumber()) >= BigInt(transaction.sequence)) throw new SimulationBlockedError("TRANSACTION_HISTORY_AMBIGUOUS");
    return "expired"; // Ledger is past validity and sequence never consumed: safe to rebuild.
  }
  const sent = await soroban().sendTransaction(transaction);
  // ERROR is not confirmation. Keep the same XDR until lookup/expiry proves its fate.
  if (!["PENDING", "DUPLICATE", "TRY_AGAIN_LATER", "ERROR"].includes(sent.status)) throw new Error("SUBMISSION_UNAVAILABLE");
  return "pending";
}

export async function verifySwap(run: SimulationRun) {
  const account = await horizon().loadAccount(run.wallet);
  if (usdcBalance(account, OFFICIAL_TESTNET_USDC_ISSUER) !== decimalToUnits(run.amount, 7)) {
    throw new SimulationBlockedError("USDC_BALANCE_MISMATCH");
  }
}

export async function verifyRoute(run: SimulationRun, completed = false) {
  const client = new RouteClient({ contractId: ROUTE_REGISTRY_CONTRACT_ID, rpcUrl: STELLAR_RPC_URL, networkPassphrase: Networks.TESTNET });
  const route = (await client.get_route({ route_id: Buffer.from(run.routeId, "hex") })).result;
  if (!run.quote) throw new SimulationBlockedError("QUOTE_MISSING");
  if (route.user !== run.wallet || route.route_id.toString("hex") !== run.routeId || route.anchor_id !== run.quote?.anchorId ||
      route.source_asset !== "TEST_USDC" || route.source_amount !== decimalToUnits(run.amount, 7) ||
      route.destination_currency !== run.quote.destinationCurrency || route.destination_amount !== decimalToUnits(run.quote.destinationAmount, 2) ||
      route.fee !== decimalToUnits(run.quote.fee ?? "0", 7) || !route.quote_hash.equals(await hashRouteQuote(run.quote)) ||
      route.status.tag !== (completed ? "Completed" : "Pending")) throw new SimulationBlockedError("ROUTE_VERIFICATION_FAILED");
  if (completed) {
    const receipt = await getRouteReceipt(Buffer.from(run.routeId, "hex"));
    if (!receipt || receipt.user !== run.wallet || receipt.route_id.toString("hex") !== run.routeId ||
        receipt.receipt_id.toString("hex") !== run.receiptId || receipt.status.tag !== "Completed" ||
        receipt.transaction_hash.toString("hex") !== (run.hashes.execution ? "0".repeat(64) : run.hashes.proof) ||
        route.transaction_hash?.toString("hex") !== (run.hashes.execution ? "0".repeat(64) : run.hashes.proof)) {
      throw new SimulationBlockedError("RECEIPT_VERIFICATION_FAILED");
    }
  }
}
