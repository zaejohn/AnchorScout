"use client";

import { track } from "@vercel/analytics";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { isSelectableQuote } from "@/lib/anchors/ranking";
import type { AnchorQuote, ProviderResult, QuoteSearchResult, RouteRequest } from "@/lib/anchors/types";
import { sendXlm } from "@/lib/stellar/classic";
import { DEMO_PAYMENT_DESTINATION, stellarExpertUrl } from "@/lib/stellar/config";
import { createRoute, recordSettlement } from "@/lib/stellar/contracts";
import { classifyWalletError, type TransactionUpdate } from "@/lib/stellar/errors";
import { connectWallet, disconnectWallet, restoreWallet, walletSigner } from "@/lib/stellar/wallet";

type WalletSession = { address: string; walletId: string };
type Balance = { asset?: string; balance: string; issuer?: string };
type HistoryRoute = {
  routeId: string; anchorId: string; sourceAsset: string; sourceAmount: string;
  destinationCurrency: string; destinationAmount: string; fee: string;
  selectedAt: number; status: string; paymentHash: string | null; receiptId: string | null;
};

const initialTransfer: TransactionUpdate = { phase: "idle", message: "Ready for a Testnet XLM transfer." };
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
  const [execution, setExecution] = useState<TransactionUpdate>({ phase: "idle", message: "Select a live quote to start the on-chain route flow." });
  const [history, setHistory] = useState<HistoryRoute[]>([]);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [clock, setClock] = useState(0);
  const eventCursor = useRef<string | null>(null);
  const seenEvents = useRef(new Set<string>());
  const nativeBalance = balances.find((balance) => balance.asset === "XLM")?.balance;

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
        if (newEvent && seenEvents.current.size > payload.events.length) await refreshHistory(wallet.address);
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
    setWallet(null); setBalances([]); setHistory([]);
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
    if (!wallet || !selected) return;
    if (!isSelectableQuote(selected, new Date())) return setExecution({ phase: "expired", message: "This quote expired. Refresh routes before signing." });
    if (!contractsConfigured || !DEMO_PAYMENT_DESTINATION) return setExecution({ phase: "failed", message: "The public Testnet deployment is not configured in this build." });
    try {
      track("route_selected", { anchor: selected.anchorId });
      const route = await createRoute({ address: wallet.address, quote: selected, onUpdate: setExecution });
      const payment = await sendXlm({
        source: wallet.address, destination: DEMO_PAYMENT_DESTINATION, amount: "0.1", signTransaction: walletSigner(wallet.address),
        onUpdate: (update) => setExecution({ ...update, message: `Demo payment: ${update.message}` }),
      });
      await recordSettlement({ address: wallet.address, routeId: route.routeId, paymentHash: payment.hash, succeeded: true, onUpdate: setExecution });
      track("route_settlement_confirmed", { anchor: selected.anchorId });
      await Promise.all([refreshHistory(wallet.address), refreshBalances(wallet.address)]);
    } catch (error) { setExecution(classifyWalletError(error)); track("route_settlement_failed"); }
  };

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="AnchorScout home"><span className="brand-mark">A</span><span>AnchorScout</span></a>
        <div className="network-chip"><span /> Stellar Testnet</div>
        {wallet ? <div className="wallet-actions"><a className="address-chip" href={stellarExpertUrl("account", wallet.address)} target="_blank" rel="noreferrer">{short(wallet.address)} ↗</a><button className="button ghost small" onClick={handleDisconnect} disabled={walletBusy}>Disconnect</button></div> : <button className="button primary small" onClick={handleConnect} disabled={walletBusy}>{walletBusy ? "Checking wallet…" : "Choose wallet"}</button>}
      </header>

      <section className="hero" id="top">
        <div className="eyebrow">Transparent routes. User-owned funds.</div>
        <h1>See more value before you <em>send.</em></h1>
        <p>Compare normalized Stellar payment routes, understand every fee, and verify your demo settlement directly on Testnet.</p>
        <div className="proof-row"><span>✓ Non-custodial</span><span>✓ Three comparable routes</span><span>✓ Contract-backed receipts</span></div>
      </section>

      <section className="workspace" aria-label="AnchorScout workspace">
        <article className="panel route-panel">
          <div className="panel-heading"><div><span className="step">01</span><h2>Compare routes</h2></div><span className="quiet">Indicative demo quotes</span></div>
          <form className="route-form" onSubmit={handleQuoteSearch}>
            <label className="amount-field"><span>You send</span><div><input aria-label="Amount" inputMode="decimal" value={routeRequest.amount} onChange={(event) => setRouteRequest({ ...routeRequest, amount: event.target.value })} required /><select aria-label="Source asset" value={routeRequest.sourceAsset} onChange={(event) => setRouteRequest({ ...routeRequest, sourceAsset: event.target.value as RouteRequest["sourceAsset"] })}><option value="XLM">XLM</option><option value="TEST_USDC">Test USDC</option></select></div></label>
            <div className="field-pair">
              <label><span>You receive</span><select value={routeRequest.destinationCurrency} onChange={(event) => setRouteRequest({ ...routeRequest, destinationCurrency: event.target.value as "PHP" })}><option value="PHP">PHP — Philippine peso</option></select></label>
              <label><span>Payout</span><select value={routeRequest.payoutMethod} onChange={(event) => setRouteRequest({ ...routeRequest, payoutMethod: event.target.value as RouteRequest["payoutMethod"] })}><option value="BANK">Bank transfer</option><option value="GCASH">GCash demo</option></select></label>
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
        <div className="section-heading"><div><span className="step">02</span><h2>Ranked for your outcome</h2></div><p>Highest receive amount first, then fee and speed.</p></div>
        <div className="quote-grid">{quoteBusy ? [1, 2, 3].map((item) => <div className="quote-card skeleton" key={item} />) : liveQuotes.map((quote) => {
          const seconds = Math.max(0, Math.floor((Date.parse(quote.expiresAt) - clock) / 1000)); const selectable = isSelectableQuote(quote, new Date(clock));
          return <article className={`quote-card ${selected?.quoteId === quote.quoteId ? "selected" : ""}`} key={quote.quoteId}><div className="quote-top"><span className="rank">#{quote.rank}</span>{quote.best && <span className="best">Best outcome</span>}<span className={`expiry ${!selectable ? "expired" : ""}`}>{selectable ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")} left` : "Expired"}</span></div><p className="anchor-name">{quote.anchorName} {quote.isDemo && <small>DEMO</small>}</p><strong className="receive">{peso.format(Number(quote.destinationAmount))}</strong><dl><div><dt>Rate</dt><dd>₱{quote.exchangeRate}</dd></div><div><dt>Fee</dt><dd>{quote.fee} {quote.sourceAsset === "TEST_USDC" ? "USDC" : quote.sourceAsset}</dd></div><div><dt>Estimate</dt><dd>~{quote.estimatedMinutes} min</dd></div></dl><button className="button secondary wide" disabled={!selectable} onClick={() => { setSelected(quote); setExecution({ phase: "idle", message: "Route selected. Review the Testnet proof flow below." }); }}>{selected?.quoteId === quote.quoteId ? "Selected ✓" : selectable ? "Choose this route" : "Refresh required"}</button></article>;
        })}</div>
      </section>}

      <section className="action-grid">
        <article className="panel execute-panel">
          <div className="panel-heading"><div><span className="step">03</span><h2>Execute the proof</h2></div><span className="quiet">3 wallet signatures</span></div>
          <ol className="flow-list"><li className={selected ? "active" : ""}><b>1</b><span><strong>Record route</strong><small>Route Registry contract</small></span></li><li><b>2</b><span><strong>Send 0.1 XLM</strong><small>Horizon-confirmed Testnet payment</small></span></li><li><b>3</b><span><strong>Attest receipt</strong><small>Wallet-authorized cross-contract result</small></span></li></ol>
          {!contractsConfigured && <div className="notice warning">Contract actions unlock after the Testnet deployment IDs are configured.</div>}
          <TransactionStatus update={execution} />
          <button className="button primary wide" disabled={!wallet || !selected || !contractsConfigured || !["idle", "failed", "rejected", "expired", "confirmed"].includes(execution.phase)} onClick={handleExecute}>{!wallet ? "Connect wallet to continue" : !selected ? "Choose a live route" : "Sign route and settle"}</button>
          <p className="fine-print">The 0.1 XLM payment is separate from the indicative PHP quote. Its hash is confirmed by the app through Horizon and then user-attested on-chain; the receipt contract cannot independently query classic transaction history. No real fiat payout occurs.</p>
        </article>

        <article className="panel utility-panel">
          <div className="panel-heading"><div><span className="step">Utility</span><h2>Send XLM</h2></div><span className="quiet">Classic Stellar</span></div>
          <form onSubmit={handleTransfer} className="transfer-form"><label><span>Destination address</span><input value={destination} onChange={(event) => setDestination(event.target.value.trim())} placeholder="G…" autoComplete="off" required /></label><label><span>Amount</span><div className="input-suffix"><input value={xlmAmount} onChange={(event) => setXlmAmount(event.target.value)} inputMode="decimal" required /><b>XLM</b></div></label><TransactionStatus update={transfer} /><button className="button secondary wide" disabled={!wallet || !["idle", "failed", "rejected", "confirmed"].includes(transfer.phase)}>{wallet ? "Review and sign transfer" : "Connect wallet first"}</button></form>
        </article>
      </section>

      <section className="history-section">
        <div className="section-heading"><div><span className="step">04</span><h2>Contract-backed history</h2></div>{wallet && <button className="text-button" onClick={() => refreshHistory(wallet.address)} disabled={historyBusy}>↻ Refresh</button>}</div>
        {!wallet ? <div className="history-empty">Connect a wallet to load its durable Route Registry records.</div> : historyBusy && history.length === 0 ? <div className="history-empty">Reading contract state…</div> : historyError ? <div className="notice error">{historyError}</div> : history.length === 0 ? <div className="history-empty">No routes recorded for this wallet yet.</div> : <div className="history-list">{history.map((route) => <article key={route.routeId}><div><span className={`status-dot ${route.status.toLowerCase()}`} /><strong>{route.anchorId}</strong><small>{new Date(route.selectedAt * 1000).toLocaleString()}</small></div><div><strong>{route.sourceAmount} {route.sourceAsset}</strong><span>→</span><strong>{peso.format(Number(route.destinationAmount))}</strong></div><div><span className={`status-badge ${route.status.toLowerCase()}`}>{route.status}</span>{route.paymentHash && <a href={stellarExpertUrl("tx", route.paymentHash)} target="_blank" rel="noreferrer">Payment {short(route.paymentHash, 8)} ↗</a>}<span title={route.receiptId ?? undefined}>{route.receiptId ? `Receipt ${short(route.receiptId, 8)}` : "Receipt pending"}</span></div></article>)}</div>}
      </section>

      <footer><div className="brand"><span className="brand-mark">A</span><span>AnchorScout</span></div><p>Testnet comparison infrastructure. Not a production payout service.</p><a href="https://github.com/stellar" target="_blank" rel="noreferrer">Built on Stellar ↗</a></footer>
    </main>
  );
}

function ProviderHealth({ providers }: { providers: ProviderResult[] }) {
  const healthy = providers.filter((provider) => provider.status === "ok").length;
  return <div className="provider-health"><span><b>{healthy}/{providers.length}</b> providers responded</span>{providers.map((provider) => <span className={provider.status} key={provider.providerId} title={provider.message}>{provider.providerName}</span>)}</div>;
}

function TransactionStatus({ update }: { update: TransactionUpdate }) {
  return <div className={`transaction-status ${update.phase}`} role="status"><span className="phase-icon">{update.phase === "confirmed" ? "✓" : update.phase === "failed" || update.phase === "rejected" ? "!" : "•"}</span><div><strong>{phaseLabel(update.phase)}</strong><p>{update.message}</p>{update.hash && <a href={stellarExpertUrl("tx", update.hash)} target="_blank" rel="noreferrer">View transaction {short(update.hash, 8)} ↗</a>}</div></div>;
}
