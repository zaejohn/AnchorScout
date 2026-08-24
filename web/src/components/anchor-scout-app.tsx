"use client";

import Link from "next/link";
import { track } from "@vercel/analytics";
import { Buffer } from "buffer";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { isSelectableQuote } from "@/lib/anchors/ranking";
import type { AnchorQuote, ProviderResult, QuoteSearchResult, RouteRequest } from "@/lib/anchors/types";
import { findConfirmedXlmTransaction, sendXlm, TerminalPaymentFailedError } from "@/lib/stellar/classic";
import { PROOF_PAYMENT_DESTINATION, stellarExpertUrl } from "@/lib/stellar/config";
import { createRoute, createRouteId, recordSettlement } from "@/lib/stellar/contracts";
import { classifyWalletError, SubmittedTransactionPendingError, type TransactionUpdate } from "@/lib/stellar/errors";
import { applyBroadcastUpdate, parseProofCheckpoint, resumableProofLabel, type ProofCheckpoint } from "@/lib/stellar/proof";
import { connectWallet, disconnectWallet, restoreWallet, walletSigner } from "@/lib/stellar/wallet";

type WalletSession = { address: string; walletId: string };
type Balance = { asset?: string; balance: string; issuer?: string };
type HistoryRoute = {
  routeId: string; anchorId: string; sourceAsset: string; sourceAmount: string;
  destinationCurrency: string; destinationAmount: string; fee: string;
  selectedAt: number; status: string; paymentHash: string | null; receiptId: string | null;
  routeTransactionHash: string | null; receiptTransactionHash: string | null;
};

const initialTransfer: TransactionUpdate = { phase: "idle", message: "Ready for a Testnet XLM transfer." };
const PROOF_CHECKPOINT_KEY = "anchorscout:proof-checkpoint";
const short = (value: string, leading = 6) => value.length > 18 ? `${value.slice(0, leading)}…${value.slice(-6)}` : value;
const peso = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 2 });
const phaseLabel = (phase: TransactionUpdate["phase"]) => phase.replaceAll("_", " ");

export function AnchorScoutApp({ contractsConfigured }: { contractsConfigured: boolean }) {
  const [wallet, setWallet] = useState<WalletSession | null>(null);
  const [walletMessage, setWalletMessage] = useState("Choose a wallet to begin.");
  const [walletBusy, setWalletBusy] = useState(true);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [balanceBusy, setBalanceBusy] = useState(false);
  const [balanceError, setBalanceError] = useState("");
  const [destination, setDestination] = useState("");
  const [xlmAmount, setXlmAmount] = useState("0.1");
  const [transfer, setTransfer] = useState<TransactionUpdate>(initialTransfer);
  const [routeRequest, setRouteRequest] = useState<RouteRequest>({ amount: "100", sourceAsset: "XLM", destinationCurrency: "PHP", payoutMethod: "BANK" });
  const [quotes, setQuotes] = useState<AnchorQuote[]>([]);
  const [providers, setProviders] = useState<ProviderResult[]>([]);
  const [quoteBusy, setQuoteBusy] = useState(false);
  const [quoteError, setQuoteError] = useState("");
  const [selected, setSelected] = useState<AnchorQuote | null>(null);
  const [execution, setExecution] = useState<TransactionUpdate>({ phase: "idle", message: "Select an externally sourced route to start the Testnet proof." });
  const [checkpoint, setCheckpoint] = useState<ProofCheckpoint | null>(null);
  const [history, setHistory] = useState<HistoryRoute[]>([]);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [clock, setClock] = useState(0);
  const eventCursor = useRef<string | null>(null);
  const seenEvents = useRef(new Set<string>());
  const eventPollInitialized = useRef(false);
  const executionLock = useRef(false);
  const nativeBalance = balances.find((balance) => balance.asset === "XLM")?.balance;

  const persistCheckpoint = useCallback((value: ProofCheckpoint | null) => {
    setCheckpoint(value);
    if (value) localStorage.setItem(PROOF_CHECKPOINT_KEY, JSON.stringify(value));
    else localStorage.removeItem(PROOF_CHECKPOINT_KEY);
  }, []);

  const refreshBalances = useCallback(async (address: string) => {
    setBalanceBusy(true); setBalanceError("");
    try {
      const response = await fetch(`/api/stellar/account/${address}`, { cache: "no-store" });
      const payload = (await response.json()) as { balances?: Balance[]; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Balance lookup failed");
      setBalances(payload.balances ?? []);
    } catch (error) {
      setBalanceError(error instanceof Error ? error.message : "Balance lookup failed"); setBalances([]);
    } finally { setBalanceBusy(false); }
  }, []);

  const refreshHistory = useCallback(async (address: string) => {
    if (!contractsConfigured) return;
    setHistoryBusy(true); setHistoryError("");
    try {
      const response = await fetch(`/api/stellar/history/${address}`, { cache: "no-store" });
      const payload = (await response.json()) as { routes?: HistoryRoute[]; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "History lookup failed");
      setHistory(payload.routes ?? []);
    } catch (error) { setHistoryError(error instanceof Error ? error.message : "History lookup failed"); }
    finally { setHistoryBusy(false); }
  }, [contractsConfigured]);

  useEffect(() => {
    let active = true;
    restoreWallet().then((session) => {
      if (!active || !session) return;
      setWallet(session); setWalletMessage("Wallet reconnected on Stellar Testnet.");
    }).finally(() => { if (active) setWalletBusy(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!wallet) return;
    const timer = window.setTimeout(() => {
      void refreshBalances(wallet.address);
      void refreshHistory(wallet.address);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [wallet, refreshBalances, refreshHistory]);

  useEffect(() => {
    if (!wallet) return;
    const timer = window.setTimeout(() => {
      const restored = parseProofCheckpoint(
        localStorage.getItem(PROOF_CHECKPOINT_KEY),
        wallet.address,
      );
      setCheckpoint(restored);
      if (!restored) return;
      setExecution({
        phase: "pending",
        message: "Checking the saved proof before any transaction can be submitted again.",
        hash:
          restored.receiptTransactionHash ??
          restored.paymentHash ??
          restored.routeTransactionHash,
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [wallet]);

  useEffect(() => {
    if (!checkpoint) return;
    const savedRoute = history.find((route) => route.routeId === checkpoint.routeId);
    if (!savedRoute) return;
    const timer = window.setTimeout(() => {
      if (savedRoute.status === "COMPLETED" || savedRoute.status === "FAILED") {
        persistCheckpoint(null);
        setExecution({
          phase: savedRoute.status === "COMPLETED" ? "confirmed" : "failed",
          message:
            savedRoute.status === "COMPLETED"
              ? "Saved settlement reconciled from contract state."
              : "The saved route is finalized as failed; no payment will be repeated.",
          hash: checkpoint.receiptTransactionHash ?? checkpoint.paymentHash,
        });
        return;
      }
      if (checkpoint.receiptPending) {
        setExecution({
          phase: "pending",
          message: "The submitted receipt is still pending. AnchorScout will not submit another receipt.",
          hash: checkpoint.receiptTransactionHash,
        });
        return;
      }
      setExecution({
        phase: "idle",
        message: checkpoint.paymentPending
          ? "The route is confirmed. Check the saved payment hash before continuing."
          : checkpoint.paymentHash
            ? "The payment is confirmed. Resume only the settlement receipt."
            : "The saved route is confirmed. Resume from its payment step.",
        hash: checkpoint.paymentHash ?? checkpoint.routeTransactionHash,
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [checkpoint, history, persistCheckpoint]);

  useEffect(() => {
    if (!checkpoint || !wallet) return;
    let active = true;
    const reconcileContractSubmission = async () => {
      const savedRoute = history.find(
        (route) => route.routeId === checkpoint.routeId,
      );
      const stage = !savedRoute
        ? "route"
        : checkpoint.receiptPending
          ? "receipt"
          : null;
      const hash =
        stage === "route"
          ? checkpoint.routeTransactionHash
          : stage === "receipt"
            ? checkpoint.receiptTransactionHash
            : undefined;
      if (!stage || !hash) return;
      try {
        const response = await fetch(`/api/stellar/transaction/${hash}`, {
          cache: "no-store",
        });
        if (!response.ok || !active) return;
        const payload = (await response.json()) as {
          status: "NOT_FOUND" | "SUCCESS" | "FAILED";
        };
        if (payload.status === "SUCCESS") {
          await refreshHistory(wallet.address);
        } else if (payload.status === "FAILED" && stage === "route") {
          persistCheckpoint(null);
          setExecution({
            phase: "failed",
            message:
              "The saved route transaction failed on-chain. You can safely start a new proof.",
            hash,
          });
        } else if (payload.status === "FAILED") {
          persistCheckpoint({
            ...checkpoint,
            receiptPending: false,
            receiptTransactionHash: undefined,
          });
          setExecution({
            phase: "idle",
            message:
              "The prior receipt transaction failed on-chain. Resume to retry only the receipt.",
            hash,
          });
        }
      } catch {
        // The checkpoint remains authoritative during a transient lookup error.
      }
    };
    void reconcileContractSubmission();
    const timer = window.setInterval(reconcileContractSubmission, 8_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [checkpoint, history, persistCheckpoint, refreshHistory, wallet]);

  useEffect(() => {
    const tick = () => setClock(Date.now());
    const initial = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, 1_000);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    if (!wallet || !contractsConfigured) return;
    let active = true;
    const poll = async () => {
      try {
        const query = eventCursor.current
          ? `?cursor=${encodeURIComponent(eventCursor.current)}`
          : "";
        const response = await fetch(`/api/stellar/events${query}`, { cache: "no-store" });
        if (!response.ok || !active) return;
        const payload = (await response.json()) as { events: Array<{ id: string }>; cursor: string };
        const newEvent = payload.events.some((event) => {
          if (seenEvents.current.has(event.id)) return false;
          seenEvents.current.add(event.id); return true;
        });
        eventCursor.current = payload.cursor;
        const shouldRefresh = eventPollInitialized.current && newEvent;
        eventPollInitialized.current = true;
        if (shouldRefresh) await refreshHistory(wallet.address);
      } catch { /* Manual refresh remains available during transient RPC failures. */ }
    };
    void poll(); const timer = window.setInterval(poll, 8_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [wallet, contractsConfigured, refreshHistory]);

  const liveQuotes = useMemo(() => quotes.map((quote) => ({
    ...quote,
    status: quote.status === "AVAILABLE" && Date.parse(quote.expiresAt) <= clock ? ("EXPIRED" as const) : quote.status,
  })), [quotes, clock]);

  const handleConnect = async () => {
    setWalletBusy(true); setWalletMessage("Opening secure wallet selection…");
    try { const session = await connectWallet(); setWallet(session); setWalletMessage("Connected and verified on Stellar Testnet."); }
    catch (error) { setWalletMessage(classifyWalletError(error).message); }
    finally { setWalletBusy(false); }
  };

  const handleDisconnect = async () => {
    setWalletBusy(true); await disconnectWallet().catch(() => undefined);
    setWallet(null); setBalances([]); setHistory([]); setSelected(null); setCheckpoint(null);
    setWalletMessage("Wallet disconnected. Your keys never left the wallet."); setWalletBusy(false);
  };

  const handleTransfer = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!wallet) return setTransfer({ phase: "failed", message: "Connect a Testnet wallet first." });
    try {
      await sendXlm({ source: wallet.address, destination, amount: xlmAmount, signTransaction: walletSigner(wallet.address), onUpdate: setTransfer });
      track("xlm_transfer_confirmed"); setDestination(""); await refreshBalances(wallet.address);
    } catch { track("xlm_transfer_failed"); }
  };

  const handleQuoteSearch = async (event: React.FormEvent) => {
    event.preventDefault(); setQuoteBusy(true); setQuoteError(""); setSelected(null);
    try {
      const response = await fetch("/api/quotes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(routeRequest) });
      const payload = (await response.json()) as QuoteSearchResult & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Route search failed");
      setQuotes(payload.quotes); setProviders(payload.providers); track("quote_search", { routes: payload.quotes.length });
      if (payload.quotes.length === 0) setQuoteError("No valid routes are available. Try again shortly.");
    } catch (error) { setQuotes([]); setProviders([]); setQuoteError(error instanceof Error ? error.message : "Route search failed"); }
    finally { setQuoteBusy(false); }
  };

  const handleExecute = async () => {
    if (executionLock.current) return;
    if (!wallet || (!selected && !checkpoint)) return;
    if (!checkpoint && selected?.sourceAsset !== "XLM") {
      return setExecution({
        phase: "failed",
        message: "Test USDC is comparison-only until a Testnet issuer and asset transfer are configured. Choose XLM to execute the proof.",
      });
    }
    if (!checkpoint && selected && !isSelectableQuote(selected, new Date())) return setExecution({ phase: "expired", message: "This quote expired. Refresh routes before signing." });
    if (!contractsConfigured || !PROOF_PAYMENT_DESTINATION) return setExecution({ phase: "failed", message: "The public Testnet proof deployment is not configured in this build." });
    executionLock.current = true;
    try {
      let progress = checkpoint?.walletAddress === wallet.address ? checkpoint : null;
      const updateProgress = (
        stage: "route" | "payment" | "receipt",
        update: TransactionUpdate,
        messagePrefix = "",
      ) => {
        setExecution({
          ...update,
          message: messagePrefix ? `${messagePrefix}${update.message}` : update.message,
        });
        if (!progress) return;
        const next = applyBroadcastUpdate(progress, stage, update);
        if (next !== progress) {
          progress = next;
          persistCheckpoint(progress);
        }
      };

      const finalizeFailedRoute = async (paymentHash: string) => {
        if (!progress) throw new Error("Route checkpoint is missing");
        progress = {
          ...progress,
          failedPaymentHash: paymentHash,
          paymentPending: false,
        };
        persistCheckpoint(progress);
        const routeId = Buffer.from(progress.routeId, "hex");
        try {
          await recordSettlement({
            address: wallet.address,
            routeId,
            paymentHash,
            succeeded: false,
            onUpdate: (update) => updateProgress("receipt", update),
          });
        } catch (error) {
          if (!(error instanceof SubmittedTransactionPendingError)) {
            progress = {
              ...progress,
              receiptTransactionHash: undefined,
              receiptPending: false,
            };
            persistCheckpoint(progress);
          }
          throw error;
        }
        persistCheckpoint(null);
        setExecution({
          phase: "failed",
          message: "The payment did not complete and the original route was finalized as failed.",
          hash: paymentHash === "0".repeat(64) ? undefined : paymentHash,
        });
        await refreshHistory(wallet.address);
      };

      if (!progress) {
        if (!selected) return;
        track("route_selected", { anchor: selected.anchorId });
        const routeId = createRouteId();
        progress = {
          walletAddress: wallet.address,
          anchorId: selected.anchorId,
          routeId: routeId.toString("hex"),
        };
        try {
          const route = await createRoute({
            address: wallet.address,
            quote: selected,
            routeId,
            onUpdate: (update) => updateProgress("route", update),
          });
          progress = { ...progress, routeTransactionHash: route.hash };
          persistCheckpoint(progress);
        } catch (error) {
          if (!(error instanceof SubmittedTransactionPendingError)) {
            persistCheckpoint(null);
          }
          throw error;
        }
      }

      const routeId = Buffer.from(progress.routeId, "hex");
      if (progress.failedPaymentHash) {
        await finalizeFailedRoute(progress.failedPaymentHash);
        return;
      }
      if (progress.paymentPending && progress.paymentHash) {
        const lookup = await findConfirmedXlmTransaction(progress.paymentHash);
        if (lookup.status === "not_found") {
          setExecution({
            phase: "idle",
            message: "The saved payment is not confirmed yet. Check it again before continuing; no new payment will be sent.",
            hash: progress.paymentHash,
          });
          return;
        }
        if (lookup.status === "failed") {
          await finalizeFailedRoute(lookup.transaction.hash);
          return;
        }
        progress = {
          ...progress,
          paymentHash: lookup.transaction.hash,
          paymentPending: false,
        };
        persistCheckpoint(progress);
      }

      if (!progress.paymentHash) {
        try {
          const payment = await sendXlm({
            source: wallet.address, destination: PROOF_PAYMENT_DESTINATION, amount: "0.1", signTransaction: walletSigner(wallet.address),
            onUpdate: (update) => updateProgress("payment", update, "Proof payment: "),
          });
          progress = { ...progress, paymentHash: payment.hash, paymentPending: false };
          persistCheckpoint(progress);
        } catch (error) {
          if (error instanceof SubmittedTransactionPendingError && error.stage === "payment") {
            throw error;
          }
          await finalizeFailedRoute(
            error instanceof TerminalPaymentFailedError
              ? error.hash
              : "0".repeat(64),
          );
          return;
        }
      }

      const confirmedPaymentHash = progress.paymentHash;
      if (!confirmedPaymentHash) throw new Error("Confirmed payment hash is missing");
      try {
        await recordSettlement({
          address: wallet.address,
          routeId,
          paymentHash: confirmedPaymentHash,
          succeeded: true,
          onUpdate: (update) => updateProgress("receipt", update),
        });
      } catch (error) {
        if (!(error instanceof SubmittedTransactionPendingError)) {
          progress = {
            ...progress,
            receiptTransactionHash: undefined,
            receiptPending: false,
          };
          persistCheckpoint(progress);
        }
        throw error;
      }
      persistCheckpoint(null);
      track("route_settlement_confirmed", { anchor: progress.anchorId });
      await Promise.all([refreshHistory(wallet.address), refreshBalances(wallet.address)]);
    } catch (error) {
      setExecution(classifyWalletError(error));
      if (error instanceof SubmittedTransactionPendingError) {
        void refreshHistory(wallet.address);
      }
      track("route_settlement_failed");
    } finally {
      executionLock.current = false;
    }
  };

  return (
    <main>
      <header className="topbar">
        <Link className="brand" href="/" aria-label="AnchorScout home"><span className="brand-mark">A</span><span>AnchorScout</span></Link>
        <div className="network-chip"><span /> Stellar Testnet</div>
        {wallet ? <div className="wallet-actions"><a className="address-chip" href={stellarExpertUrl("account", wallet.address)} target="_blank" rel="noreferrer">{short(wallet.address)} ↗</a><button className="button ghost small" onClick={handleDisconnect} disabled={walletBusy}>Disconnect</button></div> : <button className="button primary small" onClick={handleConnect} disabled={walletBusy}>{walletBusy ? "Checking wallet…" : "Choose wallet"}</button>}
      </header>

      <section className="hero" id="top">
        <div className="eyebrow">Transparent routes. User-owned funds.</div>
        <h1>See more value before you <em>send.</em></h1>
        <p>Compare live external payment data, see what each provider actually supplies, and verify a non-custodial proof directly on Testnet.</p>
        <div className="proof-row"><span>✓ Non-custodial</span><span>✓ Real external data</span><span>✓ Contract-backed proofs</span></div>
      </section>

      <section className="workspace" aria-label="AnchorScout workspace">
        <article className="panel route-panel">
          <div className="panel-heading"><div><span className="step">01</span><h2>Compare routes</h2></div><span className="quiet">Live external sources</span></div>
          <form className="route-form" onSubmit={handleQuoteSearch}>
            <label className="amount-field"><span>You send</span><div><input aria-label="Amount" inputMode="decimal" value={routeRequest.amount} onChange={(event) => setRouteRequest({ ...routeRequest, amount: event.target.value })} required /><select aria-label="Source asset" value={routeRequest.sourceAsset} onChange={(event) => setRouteRequest({ ...routeRequest, sourceAsset: event.target.value as RouteRequest["sourceAsset"] })}><option value="XLM">XLM</option><option value="TEST_USDC">Test USDC</option></select></div></label>
            <div className="field-pair">
              <label><span>You receive</span><select value={routeRequest.destinationCurrency} onChange={(event) => setRouteRequest({ ...routeRequest, destinationCurrency: event.target.value as "PHP" })}><option value="PHP">PHP — Philippine peso</option></select></label>
              <label><span>Payout</span><select value={routeRequest.payoutMethod} onChange={(event) => setRouteRequest({ ...routeRequest, payoutMethod: event.target.value as RouteRequest["payoutMethod"] })}><option value="BANK">Bank transfer</option><option value="GCASH">GCash</option></select></label>
            </div>
            <button className="button primary wide" disabled={quoteBusy}>{quoteBusy ? "Checking providers…" : "Compare available routes"}</button>
          </form>
          {quoteError && <div className="notice error" role="alert">{quoteError}</div>}
          {providers.length > 0 && <ProviderHealth providers={providers} />}
        </article>

        <aside className="panel wallet-panel">
          <div className="panel-heading"><div><span className="step">Wallet</span><h2>Your Testnet account</h2></div></div>
          {!wallet ? <div className="empty-wallet"><div className="wallet-orbit">◎</div><h3>Connect without giving up control</h3><p>Freighter, xBull, and LOBSTR are available through Stellar Wallets Kit.</p><button className="button secondary wide" onClick={handleConnect} disabled={walletBusy}>Open wallet selection</button><a href="https://www.freighter.app/" target="_blank" rel="noreferrer">Get Freighter ↗</a></div> : <><div className="balance-card"><span>Available balance</span><strong>{balanceBusy ? "Loading…" : nativeBalance ? `${Number(nativeBalance).toLocaleString(undefined, { maximumFractionDigits: 4 })} XLM` : "—"}</strong><button className="text-button" onClick={() => refreshBalances(wallet.address)} disabled={balanceBusy}>↻ Refresh balances</button></div>{balanceError && <div className="notice error">{balanceError}</div>}<div className="asset-list">{balances.filter((balance) => balance.asset !== "XLM").slice(0, 3).map((balance) => <span key={`${balance.asset}:${balance.issuer}`}>{balance.asset} <strong>{Number(balance.balance).toLocaleString()}</strong></span>)}</div><p className="wallet-message">{walletMessage}</p></>}
        </aside>
      </section>

      {(quoteBusy || liveQuotes.length > 0) && <section className="results-section">
        <div className="section-heading"><div><span className="step">02</span><h2>Externally sourced results</h2></div><p>“Best” appears only when fee and numeric timing data are both present.</p></div>
        <div className="quote-grid">{quoteBusy ? [1, 2].map((item) => <div className="quote-card skeleton" key={item} />) : liveQuotes.map((quote) => (
          <QuoteCard
            key={quote.quoteId}
            quote={quote}
            clock={clock}
            selected={selected?.quoteId === quote.quoteId}
            checkpointActive={Boolean(checkpoint)}
            onSelect={() => {
              setSelected(quote);
              setExecution({ phase: "idle", message: "Route selected. Review its disclosures and the separate Testnet proof below." });
            }}
          />
        ))}</div>
      </section>}

      <section className="action-grid">
        <article className="panel execute-panel">
          <div className="panel-heading"><div><span className="step">03</span><h2>Execute the proof</h2></div><span className="quiet">3 wallet signatures</span></div>
          <ol className="flow-list"><li className={selected ? "active" : ""}><b>1</b><span><strong>Record route</strong><small>Route Registry contract</small></span></li><li><b>2</b><span><strong>Send 0.1 XLM</strong><small>Horizon-confirmed Testnet payment</small></span></li><li><b>3</b><span><strong>Attest receipt</strong><small>Wallet-authorized cross-contract result</small></span></li></ol>
          {selected && <div className="notice warning">{selected.settlementMode === "FIAT_SIMULATED" ? "This route uses real external comparison data, but its bank/GCash payout is simulated on Testnet." : "This route is comparison-only; the Testnet proof does not execute the provider payout."}</div>}
          {selected?.sourceAsset === "TEST_USDC" && <div className="notice warning">Test USDC execution is disabled until a Testnet issuer and asset-payment path are configured.</div>}
          {!contractsConfigured && <div className="notice warning">Contract actions unlock after the Testnet deployment IDs are configured.</div>}
          <TransactionStatus update={execution} />
          <button className="button primary wide" disabled={!wallet || (!selected && !checkpoint) || Boolean(selected && selected.sourceAsset !== "XLM" && !checkpoint) || !contractsConfigured || !["idle", "failed", "rejected", "expired", "confirmed"].includes(execution.phase)} onClick={handleExecute}>{!wallet ? "Connect wallet to continue" : checkpoint ? resumableProofLabel(checkpoint) : !selected ? "Choose a route" : selected.sourceAsset !== "XLM" ? "XLM required for Testnet proof" : "Sign Testnet route proof"}</button>
          <p className="fine-print">The 0.1 XLM transfer proves the wallet and contract lifecycle only. It does not fund, accept, or execute the external quote. Its hash is Horizon-confirmed and user-attested on-chain; no real PHP payout occurs.</p>
        </article>

        <article className="panel utility-panel">
          <div className="panel-heading"><div><span className="step">Utility</span><h2>Send XLM</h2></div><span className="quiet">Classic Stellar</span></div>
          <form onSubmit={handleTransfer} className="transfer-form"><label><span>Destination address</span><input value={destination} onChange={(event) => setDestination(event.target.value.trim())} placeholder="G…" autoComplete="off" required /></label><label><span>Amount</span><div className="input-suffix"><input value={xlmAmount} onChange={(event) => setXlmAmount(event.target.value)} inputMode="decimal" required /><b>XLM</b></div></label><TransactionStatus update={transfer} /><button className="button secondary wide" disabled={!wallet || !["idle", "failed", "rejected", "confirmed"].includes(transfer.phase)}>{wallet ? "Review and sign transfer" : "Connect wallet first"}</button></form>
        </article>
      </section>

      <section className="history-section">
        <div className="section-heading"><div><span className="step">04</span><h2>Contract-backed history</h2></div>{wallet && <button className="text-button" onClick={() => refreshHistory(wallet.address)} disabled={historyBusy}>↻ Refresh</button>}</div>
        {!wallet ? <div className="history-empty">Connect a wallet to load its durable Route Registry records.</div> : historyBusy && history.length === 0 ? <div className="history-empty">Reading contract state…</div> : historyError ? <div className="notice error">{historyError}</div> : history.length === 0 ? <div className="history-empty">No routes recorded for this wallet yet.</div> : <div className="history-list">{history.map((route) => <article key={route.routeId}><div><span className={`status-dot ${route.status.toLowerCase()}`} /><strong>{route.anchorId}</strong><small>{new Date(route.selectedAt * 1000).toLocaleString()}</small></div><div><strong>{route.sourceAmount} {route.sourceAsset}</strong><span>→</span><strong>{peso.format(Number(route.destinationAmount))}</strong></div><div><span className={`status-badge ${route.status.toLowerCase()}`}>{route.status}</span>{route.routeTransactionHash && <a href={stellarExpertUrl("tx", route.routeTransactionHash)} target="_blank" rel="noreferrer">Route tx ↗</a>}{route.paymentHash && <a href={stellarExpertUrl("tx", route.paymentHash)} target="_blank" rel="noreferrer">Payment {short(route.paymentHash, 8)} ↗</a>}{route.receiptTransactionHash && <a href={stellarExpertUrl("tx", route.receiptTransactionHash)} target="_blank" rel="noreferrer">Receipt tx ↗</a>}<span title={route.receiptId ?? undefined}>{route.receiptId ? `Receipt ${short(route.receiptId, 8)}` : "Receipt pending"}</span></div></article>)}</div>}
      </section>

      <footer><div className="brand"><span className="brand-mark">A</span><span>AnchorScout</span></div><p>Real provider data, Testnet proof settlement. Not a production payout service.</p><a href="https://github.com/stellar" target="_blank" rel="noreferrer">Built on Stellar ↗</a></footer>
    </main>
  );
}

function QuoteCard({
  quote,
  clock,
  selected,
  checkpointActive,
  onSelect,
}: {
  quote: AnchorQuote;
  clock: number;
  selected: boolean;
  checkpointActive: boolean;
  onSelect: () => void;
}) {
  const seconds = Math.max(0, Math.floor((Date.parse(quote.expiresAt) - clock) / 1000));
  const selectable = isSelectableQuote(quote, new Date(clock));
  const feeLabel = quote.fee === null
    ? "Not supplied"
    : `${quote.fee} ${quote.feeCurrency ?? ""}`.trim();
  const kindLabel = quote.quoteKind.replaceAll("_", " ").toLowerCase();
  return (
    <article className={`quote-card ${selected ? "selected" : ""}`}>
      <div className="quote-top">
        <span className="rank">#{quote.rank}</span>
        {quote.best && <span className="best">Best complete outcome</span>}
        <span className={`expiry ${!selectable ? "expired" : ""}`}>
          {selectable ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")} left` : "Refresh required"}
        </span>
      </div>
      <p className="anchor-name">
        <a href={quote.providerUrl} target="_blank" rel="noreferrer">{quote.anchorName} ↗</a>
        <small>{kindLabel}</small>
      </p>
      <strong className="receive">{peso.format(Number(quote.destinationAmount))}</strong>
      <span className="amount-qualifier">{quote.fee === null ? "gross reference; payout fee not deducted" : "after reported payout fee"}</span>
      <dl>
        <div><dt>Rate</dt><dd>₱{quote.exchangeRate}</dd></div>
        <div><dt>Fee</dt><dd>{feeLabel}</dd></div>
        <div><dt>Estimate</dt><dd>{quote.estimatedMinutes ? `~${quote.estimatedMinutes} min` : "Provider flow"}</dd></div>
      </dl>
      <div className="quote-evidence">
        <p><b>Rate:</b> {quote.rateSource}</p>
        <p><b>Fee:</b> {quote.feeSource}</p>
        <p><b>Availability:</b> {quote.availabilitySource}</p>
        <p><b>Settlement:</b> {quote.estimatedSettlement}</p>
        {quote.disclosures.map((disclosure) => <p key={disclosure}>• {disclosure}</p>)}
      </div>
      <button className="button secondary wide" disabled={!selectable || checkpointActive} onClick={onSelect}>
        {checkpointActive ? "Finish saved proof first" : selected ? "Selected ✓" : selectable ? "Choose this route" : "Refresh required"}
      </button>
    </article>
  );
}

function ProviderHealth({ providers }: { providers: ProviderResult[] }) {
  const healthy = providers.filter((provider) => provider.status === "ok").length;
  return <div className="provider-health"><span><b>{healthy}/{providers.length}</b> sources returned usable data</span>{providers.map((provider) => <span className={provider.status} key={provider.providerId} title={provider.message}>{provider.providerName}{provider.status === "unsupported" ? " · not compatible" : ""}</span>)}</div>;
}

function TransactionStatus({ update }: { update: TransactionUpdate }) {
  return <div className={`transaction-status ${update.phase}`} role="status"><span className="phase-icon">{update.phase === "confirmed" ? "✓" : update.phase === "failed" || update.phase === "rejected" ? "!" : "•"}</span><div><strong>{phaseLabel(update.phase)}</strong><p>{update.message}</p>{update.hash && <a href={stellarExpertUrl("tx", update.hash)} target="_blank" rel="noreferrer">View transaction {short(update.hash, 8)} ↗</a>}</div></div>;
}
