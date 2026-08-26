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

type HorizonTransaction = { hash: string; ledger: number; successful: boolean };

export type XlmTransactionLookup =
  | { status: "not_found" }
  | { status: "successful"; transaction: HorizonTransaction }
  | { status: "failed"; transaction: HorizonTransaction };

export class TerminalPaymentFailedError extends Error {
  constructor(readonly hash: string) {
    super(`Payment transaction ${hash} failed on-chain`);
    this.name = "TerminalPaymentFailedError";
  }
}

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

export function parseVerifiedSignedTransaction(
  unsignedTxXdr: string,
  signedTxXdr: string,
) {
  const unsigned = TransactionBuilder.fromXDR(
    unsignedTxXdr,
    STELLAR_NETWORK_PASSPHRASE,
  );
  const signed = TransactionBuilder.fromXDR(
    signedTxXdr,
    STELLAR_NETWORK_PASSPHRASE,
  );
  if (!signed.hash().equals(unsigned.hash())) {
    throw new Error("Wallet returned a different transaction than requested");
  }
  return signed;
}

export async function findConfirmedXlmTransaction(hash: string) {
  const response = await fetch(`${STELLAR_HORIZON_URL}/transactions/${hash}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(5_000),
  });
  if (response.status === 404) return { status: "not_found" } as const;
  if (!response.ok) throw new Error(`Horizon returned ${response.status}`);
  const transaction = (await response.json()) as HorizonTransaction;
  return transaction.successful
    ? ({ status: "successful", transaction } as const)
    : ({ status: "failed", transaction } as const);
}

// Shared by the interactive wallet flow and the durable Testnet worker.
// Preparation never submits: callers must sign and persist/review first.
export async function prepareXlmTransaction(source: string, destination: string, amount: string) {
  const amountStroops = validateXlmTransferInput(destination, amount);
  const server = new Horizon.Server(STELLAR_HORIZON_URL);
  const account = await server.loadAccount(source);
  const native = account.balances.find((balance) => balance.asset_type === "native");
  const availableStroops = native ? decimalToUnits(native.balance, 7) : 0n;
  if (availableStroops <= amountStroops + BigInt(BASE_FEE)) throw new Error("Insufficient XLM balance");
  return new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: STELLAR_NETWORK_PASSPHRASE })
    .addOperation(Operation.payment({ destination, asset: Asset.native(), amount }))
    .setTimeout(180)
    .build();
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
    const server = new Horizon.Server(STELLAR_HORIZON_URL);
    const transaction = await prepareXlmTransaction(source, destination, amount);

    onUpdate({ phase: "awaiting_signature", message: "Review the XLM transfer in your wallet." });
    const unsignedTxXdr = transaction.toXDR();
    const { signedTxXdr } = await signTransaction(unsignedTxXdr, {
      networkPassphrase: STELLAR_NETWORK_PASSPHRASE,
      address: source,
    });
    const signed = parseVerifiedSignedTransaction(
      unsignedTxXdr,
      signedTxXdr,
    );
    onUpdate({ phase: "signed", message: "Signed transaction verified. Submitting to Stellar Testnet…" });
    const paymentHash = signed.hash().toString("hex");
    onUpdate({ phase: "submitting", message: "Submitting transaction…", hash: paymentHash });
    let result: { hash: string; ledger: number };
    try {
      result = await server.submitTransaction(signed);
    } catch (submissionError) {
      const responseStatus = (
        submissionError as { response?: { status?: number } }
      ).response?.status;
      const definitiveRejection =
        typeof responseStatus === "number" &&
        responseStatus >= 400 &&
        responseStatus < 500 &&
        ![408, 429].includes(responseStatus);
      const lookup = await findConfirmedXlmTransaction(paymentHash).catch(() =>
        definitiveRejection
          ? ({ status: "failed", transaction: { hash: paymentHash, ledger: 0, successful: false } } as const)
          : ({ status: "not_found" } as const),
      );
      if (lookup.status === "not_found") {
        if (definitiveRejection) {
          throw new TerminalPaymentFailedError(paymentHash);
        }
        throw new SubmittedTransactionPendingError("payment", paymentHash);
      }
      if (lookup.status === "failed") {
        throw new TerminalPaymentFailedError(paymentHash);
      }
      result = lookup.transaction;
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
