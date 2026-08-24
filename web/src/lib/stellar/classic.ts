import {
  Asset,
  BASE_FEE,
  Horizon,
  Operation,
  StrKey,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import type { SignTransaction } from "@stellar/stellar-sdk/contract";

import {
  STELLAR_HORIZON_URL,
  STELLAR_NETWORK_PASSPHRASE,
} from "./config";
import {
  classifyWalletError,
  SubmittedTransactionPendingError,
  type TransactionUpdate,
} from "./errors";
import { decimalToUnits } from "./units";

const AMOUNT_PATTERN = /^\d+(?:\.\d{1,7})?$/;

export function validateXlmTransferInput(destination: string, amount: string) {
  if (!StrKey.isValidEd25519PublicKey(destination)) {
    throw new Error("Invalid Stellar destination address");
  }
  if (!AMOUNT_PATTERN.test(amount)) {
    throw new Error("Invalid XLM amount");
  }
  const amountStroops = decimalToUnits(amount, 7);
  if (amountStroops <= 0n) throw new Error("Invalid XLM amount");
  return amountStroops;
}

export async function findConfirmedXlmTransaction(hash: string) {
  const response = await fetch(`${STELLAR_HORIZON_URL}/transactions/${hash}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(5_000),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Horizon returned ${response.status}`);
  const transaction = (await response.json()) as { hash: string; ledger: number; successful: boolean };
  return transaction.successful ? transaction : null;
}

export async function sendXlm(params: {
  source: string;
  destination: string;
  amount: string;
  signTransaction: SignTransaction;
  onUpdate: (update: TransactionUpdate) => void;
}) {
  const { source, destination, amount, signTransaction, onUpdate } = params;
  try {
    onUpdate({ phase: "preparing", message: "Checking account and balance…" });
    const amountStroops = validateXlmTransferInput(destination, amount);

    const server = new Horizon.Server(STELLAR_HORIZON_URL);
    const account = await server.loadAccount(source);
    const native = account.balances.find((balance) => balance.asset_type === "native");
    const availableStroops = native ? decimalToUnits(native.balance, 7) : 0n;
    if (availableStroops <= amountStroops + BigInt(BASE_FEE)) {
      throw new Error("Insufficient XLM balance");
    }
    const transaction = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: STELLAR_NETWORK_PASSPHRASE,
    })
      .addOperation(
        Operation.payment({ destination, asset: Asset.native(), amount }),
      )
      .setTimeout(180)
      .build();

    onUpdate({ phase: "awaiting_signature", message: "Review the XLM transfer in your wallet." });
    const { signedTxXdr } = await signTransaction(transaction.toXDR(), {
      networkPassphrase: STELLAR_NETWORK_PASSPHRASE,
      address: source,
    });
    onUpdate({ phase: "signed", message: "Signed. Submitting to Stellar Testnet…" });
    const signed = TransactionBuilder.fromXDR(
      signedTxXdr,
      STELLAR_NETWORK_PASSPHRASE,
    );
    const paymentHash = signed.hash().toString("hex");
    onUpdate({ phase: "submitting", message: "Submitting transaction…", hash: paymentHash });
    let result: { hash: string; ledger: number };
    try {
      result = await server.submitTransaction(signed);
    } catch {
      const confirmed = await findConfirmedXlmTransaction(paymentHash).catch(() => null);
      if (!confirmed) {
        throw new SubmittedTransactionPendingError("payment", paymentHash);
      }
      result = confirmed;
    }
    onUpdate({
      phase: "submitted",
      message: "Transaction submitted. Confirming ledger inclusion…",
      hash: result.hash,
    });
    onUpdate({
      phase: "confirmed",
      message: `Confirmed in ledger ${result.ledger}.`,
      hash: result.hash,
    });
    return result;
  } catch (error) {
    const update = classifyWalletError(error);
    if (error instanceof Error && error.message.includes("Invalid Stellar")) {
      update.message = "Enter a valid Stellar G-address.";
    } else if (error instanceof Error && error.message.includes("Invalid XLM")) {
      update.message = "Enter a positive XLM amount with at most 7 decimals.";
    }
    onUpdate(update);
    throw error;
  }
}
