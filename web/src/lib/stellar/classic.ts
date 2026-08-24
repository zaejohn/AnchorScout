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
import { classifyWalletError, type TransactionUpdate } from "./errors";

const AMOUNT_PATTERN = /^\d+(?:\.\d{1,7})?$/;

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
    if (!StrKey.isValidEd25519PublicKey(destination)) {
      throw new Error("Invalid Stellar destination address");
    }
    if (!AMOUNT_PATTERN.test(amount) || Number(amount) <= 0) {
      throw new Error("Invalid XLM amount");
    }

    const server = new Horizon.Server(STELLAR_HORIZON_URL);
    const account = await server.loadAccount(source);
    const native = account.balances.find((balance) => balance.asset_type === "native");
    if (!native || Number(native.balance) <= Number(amount) + Number(BASE_FEE) / 1e7) {
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
    onUpdate({ phase: "submitting", message: "Submitting transaction…" });
    const result = await server.submitTransaction(signed);
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
    }
    onUpdate(update);
    throw error;
  }
}

