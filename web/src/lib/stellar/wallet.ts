import type { SignTransaction } from "@stellar/stellar-sdk/contract";

import { STELLAR_NETWORK_PASSPHRASE } from "./config";

const SESSION_KEY = "anchorscout:wallet";

type WalletSession = { address: string; walletId: string };

async function kit() {
  const [sdk, types, freighter, xbull, lobstr] = await Promise.all([
    import("@creit-tech/stellar-wallets-kit/sdk"),
    import("@creit-tech/stellar-wallets-kit/types"),
    import("@creit-tech/stellar-wallets-kit/modules/freighter"),
    import("@creit-tech/stellar-wallets-kit/modules/xbull"),
    import("@creit-tech/stellar-wallets-kit/modules/lobstr"),
  ]);
  sdk.StellarWalletsKit.init({
    modules: [
      new freighter.FreighterModule(),
      new xbull.xBullModule(),
      new lobstr.LobstrModule(),
    ],
    network: types.Networks.TESTNET,
    authModal: { showInstallLabel: true, hideUnsupportedWallets: false },
  });
  return sdk.StellarWalletsKit;
}

export async function connectWallet(): Promise<WalletSession> {
  const walletKit = await kit();
  const { address } = await walletKit.authModal();
  const { networkPassphrase } = await walletKit.getNetwork();
  if (networkPassphrase !== STELLAR_NETWORK_PASSPHRASE) {
    await walletKit.disconnect();
    throw new Error("Wrong network passphrase");
  }
  const session = {
    address,
    walletId: walletKit.selectedModule.productId,
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

export async function restoreWallet(): Promise<WalletSession | null> {
  const saved = localStorage.getItem(SESSION_KEY);
  if (!saved) return null;
  try {
    const session = JSON.parse(saved) as WalletSession;
    if (!session.address || !session.walletId) return null;
    const walletKit = await kit();
    walletKit.setWallet(session.walletId);
    const { networkPassphrase } = await walletKit.getNetwork();
    if (networkPassphrase !== STELLAR_NETWORK_PASSPHRASE) return null;
    const { address } = await walletKit.fetchAddress();
    if (address !== session.address) {
      const refreshed = { ...session, address };
      localStorage.setItem(SESSION_KEY, JSON.stringify(refreshed));
      return refreshed;
    }
    return session;
  } catch {
    localStorage.removeItem(SESSION_KEY);
    return null;
  }
}

export async function disconnectWallet() {
  const walletKit = await kit();
  await walletKit.disconnect();
  localStorage.removeItem(SESSION_KEY);
}

export const walletSigner = (address: string): SignTransaction =>
  async (xdr, options) => {
    const walletKit = await kit();
    return walletKit.signTransaction(xdr, {
      networkPassphrase:
        options?.networkPassphrase ?? STELLAR_NETWORK_PASSPHRASE,
      address,
    });
  };

