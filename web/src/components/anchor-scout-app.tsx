"use client";

import Link from "next/link";
import Image from "next/image";
import { track } from "@vercel/analytics";
import { Buffer } from "buffer";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { isSelectableQuote } from "@/lib/anchors/ranking";
import type {
  AnchorQuote,
  ProviderResult,
  QuoteSearchResult,
  RouteRequest,
} from "@/lib/anchors/types";
import {
  findConfirmedXlmTransaction,
  sendXlm,
  TerminalPaymentFailedError,
} from "@/lib/stellar/classic";
import {
  PROOF_PAYMENT_DESTINATION,
  stellarExpertUrl,
} from "@/lib/stellar/config";
import {
  createRoute,
  createRouteId,
  recordSettlement,
} from "@/lib/stellar/contracts";
import {
  classifyWalletError,
  SubmittedTransactionPendingError,
  type TransactionUpdate,
} from "@/lib/stellar/errors";
import {
  applyBroadcastUpdate,
  parseProofCheckpoint,
  resumableProofLabel,
  type ProofCheckpoint,
} from "@/lib/stellar/proof";
import {
  connectWallet,
  disconnectWallet,
  restoreWallet,
  walletSigner,
} from "@/lib/stellar/wallet";

type WalletSession = { address: string; walletId: string };
type Balance = { asset?: string; balance: string; issuer?: string };
type WorkflowStep = "request" | "compare" | "proof";
type ProofStage = "route" | "payment" | "receipt" | "complete";
type AppModal = "utility" | "history" | null;
type HistoryRoute = {
  routeId: string;
  anchorId: string;
  sourceAsset: string;
  sourceAmount: string;
  destinationCurrency: string;
  destinationAmount: string;
  fee: string;
  selectedAt: number;
  status: string;
  paymentHash: string | null;
  receiptId: string | null;
  routeTransactionHash: string | null;
  receiptTransactionHash: string | null;
};

const initialTransfer: TransactionUpdate = {
  phase: "idle",
  message: "Ready for a XLM transfer.",
};
const PROOF_CHECKPOINT_KEY = "anchorscout:proof-checkpoint";
const short = (value: string, leading = 6) =>
  value.length > 18 ? `${value.slice(0, leading)}…${value.slice(-6)}` : value;
const peso = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  maximumFractionDigits: 2,
});
const phaseLabel = (phase: TransactionUpdate["phase"]) =>
  ({
    idle: "Ready",
    preparing: "Preparing",
    simulating: "Simulating",
    awaiting_signature: "Awaiting signature",
    signed: "Signed",
    submitting: "Submitting",
    submitted: "Submitted",
    pending: "Confirmation pending",
    confirmed: "Confirmed",
    failed: "Failed",
    rejected: "Signature rejected",
    expired: "Quote expired",
  })[phase];
const routeRequestKey = (request: RouteRequest) =>
  [
    request.amount,
    request.sourceAsset,
    request.destinationCurrency,
    request.payoutMethod,
  ].join("|");
const sourceAssetLabel = (asset: RouteRequest["sourceAsset"]) =>
  asset === "TEST_USDC" ? "Test USDC" : "XLM";
const payoutLabel = (payout: RouteRequest["payoutMethod"]) =>
  ({
    BANK: "Bank transfer",
    GCASH: "GCash",
    CASH_PICKUP: "Cash pickup",
  })[payout];

export function AnchorScoutApp({
  contractsConfigured,
}: {
  contractsConfigured: boolean;
}) {
  const [wallet, setWallet] = useState<WalletSession | null>(null);
  const [walletMessage, setWalletMessage] = useState(
    "Choose a wallet to begin.",
  );
  const [walletBusy, setWalletBusy] = useState(true);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [balanceBusy, setBalanceBusy] = useState(false);
  const [balanceError, setBalanceError] = useState("");
  const [destination, setDestination] = useState("");
  const [xlmAmount, setXlmAmount] = useState("0.1");
  const [transfer, setTransfer] = useState<TransactionUpdate>(initialTransfer);
  const [openModal, setOpenModal] = useState<AppModal>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<WorkflowStep>("request");
  const [routeRequest, setRouteRequest] = useState<RouteRequest>({
    amount: "100",
    sourceAsset: "XLM",
    destinationCurrency: "PHP",
    payoutMethod: "BANK",
  });
  const [searchedRequest, setSearchedRequest] = useState<RouteRequest | null>(
    null,
  );
  const [searchedAt, setSearchedAt] = useState<string | null>(null);
  const [quotes, setQuotes] = useState<AnchorQuote[]>([]);
  const [providers, setProviders] = useState<ProviderResult[]>([]);
  const [quoteBusy, setQuoteBusy] = useState(false);
  const [quoteError, setQuoteError] = useState("");
  const [selected, setSelected] = useState<AnchorQuote | null>(null);
  const [execution, setExecution] = useState<TransactionUpdate>({
    phase: "idle",
    message: "Select an externally sourced route to start the Testnet proof.",
  });
  const [proofStage, setProofStage] = useState<ProofStage>("route");
  const [checkpoint, setCheckpoint] = useState<ProofCheckpoint | null>(null);
  const [history, setHistory] = useState<HistoryRoute[]>([]);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [clock, setClock] = useState(0);
  const eventCursor = useRef<string | null>(null);
  const seenEvents = useRef(new Set<string>());
  const eventPollInitialized = useRef(false);
  const executionLock = useRef(false);
  const requestHeadingRef = useRef<HTMLHeadingElement>(null);
  const resultsHeadingRef = useRef<HTMLHeadingElement>(null);
  const proofHeadingRef = useRef<HTMLHeadingElement>(null);
  const utilityDialogRef = useRef<HTMLDivElement>(null);
  const historyDialogRef = useRef<HTMLDivElement>(null);
  const profileTriggerRef = useRef<HTMLButtonElement>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const utilityOpen = openModal === "utility";
  const historyOpen = openModal === "history";
  const nativeBalance = balances.find(
    (balance) => balance.asset === "XLM",
  )?.balance;

  const persistCheckpoint = useCallback((value: ProofCheckpoint | null) => {
    setCheckpoint(value);
    if (value)
      localStorage.setItem(PROOF_CHECKPOINT_KEY, JSON.stringify(value));
    else localStorage.removeItem(PROOF_CHECKPOINT_KEY);
  }, []);

  const refreshBalances = useCallback(async (address: string) => {
    setBalanceBusy(true);
    setBalanceError("");
    try {
      const response = await fetch(`/api/stellar/account/${address}`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as {
        balances?: Balance[];
        error?: string;
      };
      if (!response.ok)
        throw new Error(payload.error ?? "Balance lookup failed");
      setBalances(payload.balances ?? []);
    } catch (error) {
      setBalanceError(
        error instanceof Error ? error.message : "Balance lookup failed",
      );
      setBalances([]);
    } finally {
      setBalanceBusy(false);
    }
  }, []);

  const refreshHistory = useCallback(
    async (address: string) => {
      if (!contractsConfigured) return;
      setHistoryBusy(true);
      setHistoryError("");
      try {
        const response = await fetch(`/api/stellar/history/${address}`, {
          cache: "no-store",
        });
        const payload = (await response.json()) as {
          routes?: HistoryRoute[];
          error?: string;
        };
        if (!response.ok)
          throw new Error(payload.error ?? "History lookup failed");
        setHistory(payload.routes ?? []);
      } catch (error) {
        setHistoryError(
          error instanceof Error ? error.message : "History lookup failed",
        );
      } finally {
        setHistoryBusy(false);
      }
    },
    [contractsConfigured],
  );

  useEffect(() => {
    let active = true;
    restoreWallet()
      .then((session) => {
        if (!active || !session) return;
        setWallet(session);
        setWalletMessage("Wallet reconnected on Stellar Testnet.");
      })
      .finally(() => {
        if (active) setWalletBusy(false);
      });
    return () => {
      active = false;
    };
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
      setWizardStep("proof");
      setProofStage(
        restored.receiptPending || restored.paymentHash
          ? "receipt"
          : restored.paymentPending || restored.routeTransactionHash
            ? "payment"
            : "route",
      );
      setExecution({
        phase: "pending",
        message:
          "Checking the saved proof before any transaction can be submitted again.",
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
    const savedRoute = history.find(
      (route) => route.routeId === checkpoint.routeId,
    );
    if (!savedRoute) return;
    const timer = window.setTimeout(() => {
      if (savedRoute.status === "COMPLETED" || savedRoute.status === "FAILED") {
        persistCheckpoint(null);
        setProofStage(savedRoute.status === "COMPLETED" ? "complete" : "route");
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
          message:
            "The submitted receipt is still pending. AnchorScout will not submit another receipt.",
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
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!openModal) return;
    const previousActive =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const dialogRef = openModal === "utility" ? utilityDialogRef : historyDialogRef;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpenModal(null);
      }
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", closeOnEscape);
    dialogRef.current
      ?.querySelector<HTMLElement>("input, button")
      ?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
      previousActive?.focus();
    };
  }, [openModal]);

  useEffect(() => {
    if (!profileOpen) return;
    const previousActive =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setProfileOpen(false);
      }
    };
    const closeOnPointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      if (
        !profileMenuRef.current?.contains(event.target) &&
        !profileTriggerRef.current?.contains(event.target)
      ) {
        setProfileOpen(false);
      }
    };
    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("pointerdown", closeOnPointerDown);
    profileMenuRef.current?.querySelector<HTMLElement>("button, a")?.focus();
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("pointerdown", closeOnPointerDown);
      previousActive?.focus();
    };
  }, [profileOpen]);

  useEffect(() => {
    if (!wallet || !contractsConfigured) return;
    let active = true;
    const poll = async () => {
      try {
        const query = eventCursor.current
          ? `?cursor=${encodeURIComponent(eventCursor.current)}`
          : "";
        const response = await fetch(`/api/stellar/events${query}`, {
          cache: "no-store",
        });
        if (!response.ok || !active) return;
        const payload = (await response.json()) as {
          events: Array<{ id: string }>;
          cursor: string;
        };
        const newEvent = payload.events.some((event) => {
          if (seenEvents.current.has(event.id)) return false;
          seenEvents.current.add(event.id);
          return true;
        });
        eventCursor.current = payload.cursor;
        const shouldRefresh = eventPollInitialized.current && newEvent;
        eventPollInitialized.current = true;
        if (shouldRefresh) await refreshHistory(wallet.address);
      } catch {
        /* Manual refresh remains available during transient RPC failures. */
      }
    };
    void poll();
    const timer = window.setInterval(poll, 8_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [wallet, contractsConfigured, refreshHistory]);

  const liveQuotes = useMemo(
    () =>
      quotes.map((quote) => ({
        ...quote,
        status:
          quote.status === "AVAILABLE" && Date.parse(quote.expiresAt) <= clock
            ? ("EXPIRED" as const)
            : quote.status,
      })),
    [quotes, clock],
  );
  const requestChanged = Boolean(
    searchedRequest &&
      routeRequestKey(routeRequest) !== routeRequestKey(searchedRequest),
  );
  const requestSummary = `${routeRequest.amount} ${sourceAssetLabel(routeRequest.sourceAsset)} → ${routeRequest.destinationCurrency} · ${payoutLabel(routeRequest.payoutMethod)}`;
  const searchedSummary = searchedRequest
    ? `${searchedRequest.amount} ${sourceAssetLabel(searchedRequest.sourceAsset)} → ${searchedRequest.destinationCurrency} · ${payoutLabel(searchedRequest.payoutMethod)}`
    : requestSummary;
  const proofActive = Boolean(selected || checkpoint);
  const proofStageIndex = { route: 0, payment: 1, receipt: 2, complete: 3 }[
    proofStage
  ];
  const proofStepState = (stage: Exclude<ProofStage, "complete">) => {
    const stageIndex = { route: 0, payment: 1, receipt: 2 }[stage];
    if (proofStage === "complete" || stageIndex < proofStageIndex)
      return "complete";
    if (stageIndex === proofStageIndex) return "current";
    return "pending";
  };
  const activeRouteLabel = selected?.anchorName ?? checkpoint?.anchorId ?? "Saved route";
  const activeRouteSummary = selected
    ? `${selected.sourceAmount} ${sourceAssetLabel(selected.sourceAsset)} → ${selected.destinationCurrency} · ${payoutLabel(selected.payoutMethod)}`
    : checkpoint
      ? `Route ${short(checkpoint.routeId, 8)}`
      : "";
  const activeDestination = selected
    ? peso.format(Number(selected.destinationAmount))
    : "Saved Testnet route";
  const proofCanStart = Boolean(
    wallet &&
      proofActive &&
      contractsConfigured &&
      ["idle", "failed", "rejected", "expired"].includes(execution.phase),
  );

  const handleConnect = async () => {
    setWalletBusy(true);
    setWalletMessage("Opening secure wallet selection…");
    try {
      const session = await connectWallet();
      setWallet(session);
      setWalletMessage("Connected and verified on Stellar Testnet.");
    } catch (error) {
      setWalletMessage(classifyWalletError(error).message);
    } finally {
      setWalletBusy(false);
    }
  };

  const handleDisconnect = async () => {
    setProfileOpen(false);
    setWalletBusy(true);
    await disconnectWallet().catch(() => undefined);
    setWallet(null);
    setBalances([]);
    setBalanceError("");
    setHistory([]);
    setSelected(null);
    setCheckpoint(null);
    setWizardStep("request");
    setProofStage("route");
    setExecution({
      phase: "idle",
      message: "Select an externally sourced route to start the Testnet proof.",
    });
    setWalletMessage("Wallet disconnected. Your keys never left the wallet.");
    setWalletBusy(false);
  };

  const handleTransfer = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!wallet)
      return setTransfer({
        phase: "failed",
        message: "Connect a Testnet wallet first.",
      });
    try {
      await sendXlm({
        source: wallet.address,
        destination,
        amount: xlmAmount,
        signTransaction: walletSigner(wallet.address),
        onUpdate: setTransfer,
      });
      track("xlm_transfer_confirmed");
      setDestination("");
      await refreshBalances(wallet.address);
    } catch {
      track("xlm_transfer_failed");
    }
  };

  const searchQuotes = useCallback(async () => {
    setQuoteBusy(true);
    setQuoteError("");
    setSelected(null);
    setProofStage("route");
    try {
      const response = await fetch("/api/quotes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(routeRequest),
      });
      const payload = (await response.json()) as QuoteSearchResult & {
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error ?? "Route search failed");
      setQuotes(payload.quotes);
      setProviders(payload.providers);
      setSearchedRequest({ ...routeRequest });
      setSearchedAt(payload.searchedAt ?? new Date().toISOString());
      setWizardStep("compare");
      track("quote_search", { routes: payload.quotes.length });
      window.setTimeout(() => resultsHeadingRef.current?.focus(), 0);
      if (payload.quotes.length === 0)
        setQuoteError("No valid routes are available. Try again shortly.");
    } catch (error) {
      setQuotes([]);
      setProviders([]);
      setSearchedRequest(null);
      setSearchedAt(null);
      setQuoteError(
        error instanceof Error ? error.message : "Route search failed",
      );
    } finally {
      setQuoteBusy(false);
    }
  }, [routeRequest]);

  const handleQuoteSearch = async (event: React.FormEvent) => {
    event.preventDefault();
    await searchQuotes();
  };

  const updateRouteRequest = (next: RouteRequest) => {
    setRouteRequest(next);
    if (searchedRequest && routeRequestKey(next) !== routeRequestKey(searchedRequest)) {
      setSelected(null);
      setProofStage("route");
      setExecution({
        phase: "idle",
        message: "Transfer details changed. Refresh routes before selecting one.",
      });
    }
  };

  const focusWizardStep = (step: WorkflowStep) => {
    window.setTimeout(() => {
      const heading =
        step === "request"
          ? requestHeadingRef.current
          : step === "compare"
            ? resultsHeadingRef.current
            : proofHeadingRef.current;
      heading?.focus();
    }, 0);
  };

  const openWizardStep = (step: WorkflowStep) => {
    setWizardStep(step);
    focusWizardStep(step);
  };

  const handleExecute = async () => {
    if (executionLock.current) return;
    if (!wallet || (!selected && !checkpoint)) return;
    if (!checkpoint && selected && !isSelectableQuote(selected, new Date()))
      return setExecution({
        phase: "expired",
        message: "This quote expired. Refresh routes before signing.",
      });
    if (!contractsConfigured || !PROOF_PAYMENT_DESTINATION)
      return setExecution({
        phase: "failed",
        message:
          "The public Testnet proof deployment is not configured in this build.",
      });
    executionLock.current = true;
    try {
      let progress =
        checkpoint?.walletAddress === wallet.address ? checkpoint : null;
      const updateProgress = (
        stage: "route" | "payment" | "receipt",
        update: TransactionUpdate,
        messagePrefix = "",
      ) => {
        setProofStage(stage);
        setExecution({
          ...update,
          message: messagePrefix
            ? `${messagePrefix}${update.message}`
            : update.message,
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
            signTransaction: walletSigner(wallet.address),
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
          message:
            "The payment did not complete and the original route was finalized as failed.",
          hash: paymentHash === "0".repeat(64) ? undefined : paymentHash,
        });
        await refreshHistory(wallet.address);
      };

      if (!progress) {
        if (!selected) return;
        setProofStage("route");
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
            signTransaction: walletSigner(wallet.address),
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
            message:
              "The saved payment is not confirmed yet. Check it again before continuing; no new payment will be sent.",
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
        setProofStage("payment");
        try {
          const payment = await sendXlm({
            source: wallet.address,
            destination: PROOF_PAYMENT_DESTINATION,
            amount: "0.1",
            signTransaction: walletSigner(wallet.address),
            onUpdate: (update) =>
              updateProgress("payment", update, "Proof payment: "),
          });
          progress = {
            ...progress,
            paymentHash: payment.hash,
            paymentPending: false,
          };
          persistCheckpoint(progress);
        } catch (error) {
          if (
            error instanceof SubmittedTransactionPendingError &&
            error.stage === "payment"
          ) {
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
      if (!confirmedPaymentHash)
        throw new Error("Confirmed payment hash is missing");
      setProofStage("receipt");
      try {
        await recordSettlement({
          address: wallet.address,
          signTransaction: walletSigner(wallet.address),
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
      setProofStage("complete");
      track("route_settlement_confirmed", { anchor: progress.anchorId });
      await Promise.all([
        refreshHistory(wallet.address),
        refreshBalances(wallet.address),
      ]);
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
    <main className="app-page">
      <header className="topbar app-topbar">
        <Link className="brand" href="/" aria-label="AnchorScout home">
          <span className="brand-mark">
            <Image
              className="brand-logo"
              src="/logo.png"
              alt=""
              width={42}
              height={42}
              priority
            />
          </span>
          <span>AnchorScout</span>
        </Link>
        <div className="topbar-status">
          <div className="network-chip" aria-label="Network: Stellar Testnet">
            <span aria-hidden="true" />
            <span className="network-label">Stellar Testnet</span>
          </div>
        </div>
        <button
          type="button"
          className="button ghost small topbar-utility-button"
          onClick={() => setOpenModal("utility")}
          aria-haspopup="dialog"
          aria-expanded={utilityOpen}
          aria-label="Open Send XLM utility"
        >
          Send XLM
        </button>
        <button
          type="button"
          className="button ghost small topbar-history-button"
          onClick={() => setOpenModal("history")}
          aria-haspopup="dialog"
          aria-expanded={historyOpen}
          aria-label="Open route history"
        >
          History
        </button>
        <div className="topbar-profile">
          <button
            ref={profileTriggerRef}
            type="button"
            className={`profile-trigger ${wallet ? "is-connected" : "is-disconnected"}`}
            onClick={() => setProfileOpen((open) => !open)}
            aria-haspopup="dialog"
            aria-expanded={profileOpen}
            aria-label={wallet ? "Open connected wallet profile" : "Open wallet profile"}
          >
            <span className="profile-avatar" aria-hidden="true">
              {wallet ? "✓" : "◎"}
            </span>
            <span className="profile-trigger-copy">
              <strong>{wallet ? "Wallet" : walletBusy ? "Checking…" : "Connect"}</strong>
              <small>{wallet ? short(wallet.address, 4) : "Stellar Testnet"}</small>
            </span>
            <span className="profile-trigger-chevron" aria-hidden="true">
              {profileOpen ? "⌃" : "⌄"}
            </span>
          </button>
          {profileOpen && (
            <div
              ref={profileMenuRef}
              className="profile-menu"
              role="dialog"
              aria-label="Wallet profile"
            >
              <div className="profile-menu-heading">
                <span className="profile-menu-avatar" aria-hidden="true">
                  {wallet ? "✓" : "◎"}
                </span>
                <div>
                  <p className="profile-menu-kicker">Stellar Testnet</p>
                  <strong>{wallet ? "Wallet connected" : "Connect your wallet"}</strong>
                </div>
              </div>
              {wallet ? (
                <>
                  <a
                    className="profile-address"
                    href={stellarExpertUrl("account", wallet.address)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {wallet.address} ↗
                  </a>
                  <div className="profile-balance">
                    <div>
                      <span>Available XLM</span>
                      <strong>
                        {balanceBusy
                          ? "Loading…"
                          : nativeBalance
                            ? `${Number(nativeBalance).toLocaleString(undefined, { maximumFractionDigits: 4 })} XLM`
                            : "—"}
                      </strong>
                    </div>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => refreshBalances(wallet.address)}
                      disabled={balanceBusy}
                    >
                      ↻ Refresh
                    </button>
                  </div>
                  {balanceError && <div className="notice error">{balanceError}</div>}
                  {balances.filter((balance) => balance.asset !== "XLM").length > 0 && (
                    <div className="profile-assets">
                      {balances
                        .filter((balance) => balance.asset !== "XLM")
                        .slice(0, 3)
                        .map((balance) => (
                          <span key={`${balance.asset}:${balance.issuer}`}>
                            <span>{balance.asset}</span>
                            <strong>{Number(balance.balance).toLocaleString()}</strong>
                          </span>
                        ))}
                    </div>
                  )}
                  <p className="profile-message">{walletMessage}</p>
                  <button
                    type="button"
                    className="button ghost wide profile-disconnect-button"
                    onClick={handleDisconnect}
                    disabled={walletBusy}
                  >
                    Disconnect wallet
                  </button>
                </>
              ) : (
                <>
                  <p className="profile-description">
                    Freighter, xBull, and LOBSTR are supported. Your keys never leave the wallet.
                  </p>
                  <button
                    type="button"
                    className="button secondary wide"
                    onClick={handleConnect}
                    disabled={walletBusy}
                  >
                    {walletBusy ? "Checking wallet…" : "Connect wallet"}
                  </button>
                  <a
                    className="profile-link"
                    href="https://www.freighter.app/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Get Freighter ↗
                  </a>
                  <p className="profile-message">{walletMessage}</p>
                </>
              )}
            </div>
          )}
        </div>
      </header>

      <div className="app-flow">
        {wizardStep === "request" && (
          <section id="request" className="workflow-section request-section" aria-labelledby="request-title">
          <div className="workflow-heading">
            <div className="workflow-title">
              <span className="step">01</span>
              <div>
                <p className="workflow-kicker">Transfer details</p>
                <h2 id="request-title" ref={requestHeadingRef} tabIndex={-1}>
                  Where do you want to send money?
                </h2>
              </div>
            </div>
            <span className="workflow-status info">
              {wallet ? "Wallet connected" : "Preview mode"}
            </span>
          </div>
          <p className="workflow-lede">
            Set the amount and payout preference. We&apos;ll compare live provider
            data for this exact request.
          </p>
          {!wallet && (
            <div className="preview-note" role="note">
              <strong>Preview mode</strong>
              <span>Compare routes now; connect a wallet before signing.</span>
            </div>
          )}
          <form className="route-form" onSubmit={handleQuoteSearch}>
            <label className="amount-field">
              <span>Amount to send</span>
              <div>
                <input
                  aria-label="Amount to send"
                  inputMode="decimal"
                  value={routeRequest.amount}
                  onChange={(event) =>
                    updateRouteRequest({
                      ...routeRequest,
                      amount: event.target.value,
                    })
                  }
                  required
                />
                <select
                  aria-label="Source asset"
                  value={routeRequest.sourceAsset}
                  onChange={(event) => {
                    const sourceAsset = event.target
                      .value as RouteRequest["sourceAsset"];
                    updateRouteRequest({
                      ...routeRequest,
                      sourceAsset,
                      payoutMethod:
                        sourceAsset === "XLM" &&
                        routeRequest.payoutMethod === "CASH_PICKUP"
                          ? "BANK"
                          : routeRequest.payoutMethod,
                    });
                  }}
                >
                  <option value="XLM">XLM · Testnet</option>
                  <option value="TEST_USDC">Test USDC · Testnet</option>
                </select>
              </div>
            </label>
            <div className="field-pair">
              <label>
                <span>Receive currency</span>
                <select
                  value={routeRequest.destinationCurrency}
                  onChange={(event) =>
                    updateRouteRequest({
                      ...routeRequest,
                      destinationCurrency: event.target.value as "PHP",
                    })
                  }
                >
                  <option value="PHP">PHP · Philippine peso</option>
                </select>
              </label>
              <label>
                <span>Payout method</span>
                <select
                  value={routeRequest.payoutMethod}
                  onChange={(event) =>
                    updateRouteRequest({
                      ...routeRequest,
                      payoutMethod: event.target
                        .value as RouteRequest["payoutMethod"],
                    })
                  }
                >
                  <option value="BANK">Bank transfer</option>
                  <option value="GCASH">GCash</option>
                  <option
                    value="CASH_PICKUP"
                    disabled={routeRequest.sourceAsset !== "TEST_USDC"}
                  >
                    Cash pickup · MoneyGram Testnet
                  </option>
                </select>
              </label>
            </div>
            <button className="button primary wide" disabled={quoteBusy}>
              {quoteBusy ? "Comparing live routes…" : "Compare routes"}
            </button>
          </form>
          {quoteError && (
            <div className="notice error" role="alert">
              {quoteError}
            </div>
          )}
          <div className="wizard-step-footer">
            <span className="wizard-step-progress">
              <strong>Step 1</strong> of 3
            </span>
            <span>Next: compare live provider routes</span>
          </div>
          </section>
        )}

        {wizardStep === "compare" && (
          <section
            id="compare"
            className="workflow-section results-section"
            aria-labelledby="compare-title"
            aria-live="polite"
            aria-busy={quoteBusy}
          >
          <div className="workflow-heading">
            <div className="workflow-title">
              <span className="step">02</span>
              <div>
                <p className="workflow-kicker">Live comparison</p>
                <h2 id="compare-title" ref={resultsHeadingRef} tabIndex={-1}>
                  Available routes
                </h2>
              </div>
            </div>
            <div className="results-heading-actions">
              {searchedAt && (
                <span className="results-updated">
                  Updated {new Date(searchedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                </span>
              )}
              {searchedRequest && (
                <button
                  type="button"
                  className="button ghost small"
                  onClick={() => void searchQuotes()}
                  disabled={quoteBusy}
                >
                  {quoteBusy ? "Refreshing…" : "Refresh quotes"}
                </button>
              )}
            </div>
          </div>
          <div className="results-context">
            <span>{searchedRequest ? `For ${searchedSummary}` : `For ${requestSummary}`}</span>
            {liveQuotes.length > 0 && (
              <strong>
                {liveQuotes.length} {liveQuotes.length === 1 ? "route" : "routes"}
              </strong>
            )}
          </div>
          {quoteError && (
            <div className="notice error" role="alert">
              {quoteError}
            </div>
          )}
          {requestChanged && (
            <div className="notice warning stale-results" role="status">
              <span>Transfer details changed. Refresh to compare the new request.</span>
              <button type="button" className="text-button" onClick={() => void searchQuotes()}>
                Refresh now
              </button>
            </div>
          )}
          {quoteBusy ? (
            <div className="quote-grid" aria-label="Loading route quotes">
              {[1, 2].map((item) => (
                <div className="quote-card skeleton" key={item} />
              ))}
            </div>
          ) : liveQuotes.length > 0 ? (
            <div className="quote-grid">
              {liveQuotes.map((quote) => (
                <QuoteCard
                  key={quote.quoteId}
                  quote={quote}
                  clock={clock}
                  selected={selected?.quoteId === quote.quoteId}
                  checkpointActive={Boolean(checkpoint)}
                  stale={requestChanged}
                  onSelect={() => {
                    setSelected(quote);
                    setProofStage("route");
                    setExecution({
                      phase: "idle",
                      message:
                        "Route selected. Review the Testnet proof before signing.",
                    });
                    openWizardStep("proof");
                  }}
                />
              ))}
            </div>
          ) : (
            <div className="results-empty">
              <strong>Ready when you are.</strong>
              <span>Run a comparison to see live route data and provider evidence here.</span>
              <button
                type="button"
                className="text-button"
                onClick={() => openWizardStep("request")}
              >
                Edit transfer details
              </button>
            </div>
          )}
          {providers.length > 0 && <ProviderHealth providers={providers} />}
          <div className="wizard-step-actions">
            <button
              type="button"
              className="button ghost"
              onClick={() => openWizardStep("request")}
            >
              ← Back to details
            </button>
            <span>
              <strong>Step 2 of 3</strong> · Select a route to continue
            </span>
          </div>
          </section>
        )}

        {wizardStep === "proof" && (
          <section
            id="proof"
            className={`workflow-section proof-section ${proofActive ? "is-active" : "is-locked"}`}
            aria-labelledby="proof-title"
          >
          <div className="workflow-heading">
            <div className="workflow-title">
              <span className="step">03</span>
              <div>
                <p className="workflow-kicker">Wallet-authorized proof</p>
                <h2 id="proof-title" ref={proofHeadingRef} tabIndex={-1}>
                  Review &amp; sign
                </h2>
              </div>
            </div>
            <span className="workflow-status info">Testnet only</span>
          </div>
          {!proofActive ? (
            <div className="proof-locked">
              <div className="proof-locked-icon" aria-hidden="true">4</div>
              <div>
                <strong>Select a route to unlock signing</strong>
                <p>
                  Your wallet will approve the route record, a 0.1 XLM proof
                  payment, and the final receipt.
                </p>
              </div>
              <button
                type="button"
                className="text-button"
                onClick={() => openWizardStep("compare")}
              >
                See available routes
              </button>
            </div>
          ) : (
            <>
              <div className="selected-route-summary">
                <div>
                  <span>Selected route</span>
                  <strong>{activeRouteLabel}</strong>
                  <small>{activeRouteSummary}</small>
                </div>
                <div className="selected-route-amount">
                  <strong>{activeDestination}</strong>
                  <span>estimated receive</span>
                </div>
              </div>
              <div className="proof-disclosure" role="note">
                <strong>Testnet proof, not a fiat payout.</strong>
                <span>
                  The route data is externally sourced. The proof records your
                  selection and sends 0.1 XLM on Testnet; it does not transfer
                  the quoted amount or execute a PHP payout.
                </span>
              </div>
              <ol className="proof-timeline">
                {(
                  [
                    ["route", "Record route", "Route Registry contract"],
                    ["payment", "Send 0.1 XLM", "Horizon-confirmed Testnet payment"],
                    ["receipt", "Finalize receipt", "Wallet-authorized cross-contract result"],
                  ] as const
                ).map(([stage, label, detail], index) => {
                  const state = proofStepState(stage);
                  return (
                    <li className={`proof-timeline-step ${state}`} key={stage}>
                      <span className="proof-step-number" aria-hidden="true">
                        {state === "complete" ? "✓" : index + 1}
                      </span>
                      <span>
                        <strong>{label}</strong>
                        <small>{detail}</small>
                      </span>
                      <em>{state === "complete" ? "Done" : state === "current" ? "Current" : "Next"}</em>
                    </li>
                  );
                })}
              </ol>
              {proofStage === "complete" && (
                <div className="wizard-complete" role="status">
                  <span className="wizard-complete-icon" aria-hidden="true">✓</span>
                  <div>
                    <strong>Proof complete</strong>
                    <span>Route, payment, and receipt evidence are confirmed on Testnet.</span>
                  </div>
                </div>
              )}
              {!contractsConfigured && (
                <div className="notice warning">
                  Contract actions unlock after the Testnet deployment IDs are configured.
                </div>
              )}
              <TransactionStatus update={execution} />
              <div className="proof-actions">
                <button
                  className="button primary"
                  disabled={!wallet ? walletBusy : !proofCanStart}
                  onClick={() => {
                    if (wallet) void handleExecute();
                    else void handleConnect();
                  }}
                >
                  {!wallet
                    ? walletBusy
                      ? "Checking wallet…"
                      : "Connect wallet to sign"
                    : proofStage === "complete"
                    ? "Proof complete"
                    : checkpoint
                      ? resumableProofLabel(checkpoint)
                      : "Sign Testnet proof"}
                </button>
                {proofStage === "complete" && (
                  <button
                    type="button"
                    className="button ghost"
                    onClick={() => {
                      setSelected(null);
                      setProofStage("route");
                      setExecution({
                        phase: "idle",
                        message: "Select an externally sourced route to start the Testnet proof.",
                      });
                      openWizardStep("compare");
                    }}
                  >
                    Choose another route
                  </button>
                )}
                {proofStage !== "complete" && selected && !checkpoint && (
                  <button
                    type="button"
                    className="button ghost"
                    onClick={() => {
                      setSelected(null);
                      setProofStage("route");
                      setExecution({
                        phase: "idle",
                        message: "Select an externally sourced route to start the Testnet proof.",
                      });
                      openWizardStep("compare");
                    }}
                  >
                    ← Back to routes
                  </button>
                )}
              </div>
              <div className="wizard-step-footer">
                <span className="wizard-step-progress">
                  <strong>Step 3</strong> of 3
                </span>
                <span>{proofStage === "complete" ? "All steps complete" : "Authorize the proof from your wallet"}</span>
              </div>
              <p className="fine-print">
                Every signature stays in your wallet. The confirmed hashes and
                contract records remain available from History in the navbar.
              </p>
            </>
          )}
          </section>
        )}
      </div>

      <footer>
        <div className="brand">
          <span className="brand-mark">
            <Image
              className="brand-logo"
              src="/logo.png"
              alt=""
              width={42}
              height={42}
            />
          </span>
          <span>AnchorScout</span>
        </div>
        <p>Real provider data, Testnet proof settlement. Not a production payout service.</p>
        <a href="https://github.com/stellar" target="_blank" rel="noreferrer">
          Built on Stellar ↗
        </a>
      </footer>

      {utilityOpen && (
        <div
          className="utility-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpenModal(null);
          }}
        >
          <div
            ref={utilityDialogRef}
            className="utility-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="utility-modal-title"
            aria-describedby="utility-modal-description"
          >
            <div className="utility-modal-header">
              <div>
                <p className="workflow-kicker">Developer utility</p>
                <h2 id="utility-modal-title">Send XLM</h2>
                <p id="utility-modal-description">
                  Send a classic Stellar payment without leaving your route comparison.
                </p>
              </div>
              <button
                type="button"
                className="utility-modal-close"
                onClick={() => setOpenModal(null)}
                aria-label="Close Send XLM utility"
              >
                ×
              </button>
            </div>
            <form onSubmit={handleTransfer} className="transfer-form">
              <label>
                <span>Destination address</span>
                <input
                  value={destination}
                  onChange={(event) => setDestination(event.target.value.trim())}
                  placeholder="G…"
                  autoComplete="off"
                  required
                />
              </label>
              <label>
                <span>Amount</span>
                <div className="input-suffix">
                  <input
                    value={xlmAmount}
                    onChange={(event) => setXlmAmount(event.target.value)}
                    inputMode="decimal"
                    required
                  />
                  <b>XLM</b>
                </div>
              </label>
              <TransactionStatus update={transfer} />
              <button
                className="button secondary wide"
                disabled={
                  !wallet ||
                  !["idle", "failed", "rejected", "confirmed"].includes(
                    transfer.phase,
                  )
                }
              >
                {wallet ? "Review and sign transfer" : "Connect wallet first"}
              </button>
            </form>
          </div>
        </div>
      )}
      {historyOpen && (
        <div
          className="utility-modal-backdrop history-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpenModal(null);
          }}
        >
          <div
            ref={historyDialogRef}
            className="utility-modal history-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="history-modal-title"
            aria-describedby="history-modal-description"
          >
            <div className="utility-modal-header">
              <div>
                <p className="workflow-kicker">On-chain records</p>
                <h2 id="history-modal-title">Your route history</h2>
                <p id="history-modal-description">
                  Review durable Route Registry records and their Stellar transaction evidence.
                </p>
              </div>
              <div className="history-modal-actions">
                {wallet && (
                  <button
                    type="button"
                    className="button ghost small"
                    onClick={() => refreshHistory(wallet.address)}
                    disabled={historyBusy}
                  >
                    {historyBusy ? "Refreshing…" : "Refresh"}
                  </button>
                )}
                <button
                  type="button"
                  className="utility-modal-close"
                  onClick={() => setOpenModal(null)}
                  aria-label="Close route history"
                >
                  ×
                </button>
              </div>
            </div>
            {!wallet ? (
              <div className="history-empty compact-empty">
                <span>Connect a wallet to load its durable Route Registry records.</span>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    setOpenModal(null);
                    setProfileOpen(true);
                  }}
                >
                  Connect wallet
                </button>
              </div>
            ) : historyBusy && history.length === 0 ? (
              <div className="history-empty compact-empty">Reading contract state…</div>
            ) : historyError ? (
              <div className="notice error">{historyError}</div>
            ) : history.length === 0 ? (
              <div className="history-empty compact-empty">
                <span>No routes recorded for this wallet yet.</span>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    setOpenModal(null);
                    openWizardStep("request");
                  }}
                >
                  Start a comparison
                </button>
              </div>
            ) : (
              <div className="history-list">
                {history.map((route) => (
                  <article key={route.routeId}>
                    <div>
                      <span className={`status-dot ${route.status.toLowerCase()}`} />
                      <strong>{route.anchorId}</strong>
                      <small>{new Date(route.selectedAt * 1000).toLocaleString()}</small>
                    </div>
                    <div>
                      <strong>{route.sourceAmount} {route.sourceAsset}</strong>
                      <span>→</span>
                      <strong>{peso.format(Number(route.destinationAmount))}</strong>
                    </div>
                    <div>
                      <span className={`status-badge ${route.status.toLowerCase()}`}>
                        {route.status}
                      </span>
                      {route.routeTransactionHash && (
                        <a href={stellarExpertUrl("tx", route.routeTransactionHash)} target="_blank" rel="noreferrer">
                          Route tx ↗
                        </a>
                      )}
                      {route.paymentHash && (
                        <a href={stellarExpertUrl("tx", route.paymentHash)} target="_blank" rel="noreferrer">
                          Payment {short(route.paymentHash, 8)} ↗
                        </a>
                      )}
                      {route.receiptTransactionHash && (
                        <a href={stellarExpertUrl("tx", route.receiptTransactionHash)} target="_blank" rel="noreferrer">
                          Receipt tx ↗
                        </a>
                      )}
                      <span title={route.receiptId ?? undefined}>
                        {route.receiptId ? `Receipt ${short(route.receiptId, 8)}` : "Receipt pending"}
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

function QuoteCard({
  quote,
  clock,
  selected,
  checkpointActive,
  stale,
  onSelect,
}: {
  quote: AnchorQuote;
  clock: number;
  selected: boolean;
  checkpointActive: boolean;
  stale: boolean;
  onSelect: () => void;
}) {
  const seconds = Math.max(
    0,
    Math.floor((Date.parse(quote.expiresAt) - clock) / 1000),
  );
  const selectable = isSelectableQuote(quote, new Date(clock));
  const feeLabel =
    quote.fee === null
      ? "Not supplied"
      : `${quote.fee} ${quote.feeCurrency ?? ""}`.trim();
  const kindLabel = quote.quoteKind.replaceAll("_", " ").toLowerCase();
  return (
    <article className={`quote-card ${selected ? "selected" : ""}`}>
      <div className="quote-top">
        <span className="rank">#{quote.rank}</span>
        {quote.best && <span className="best">Best value</span>}
        <span className={`expiry ${!selectable || stale ? "expired" : ""}`}>
          {!stale && selectable
            ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")} left`
            : stale
              ? "Refresh required"
              : "Expired"}
        </span>
      </div>
      <p className="anchor-name">
        <a href={quote.providerUrl} target="_blank" rel="noreferrer">
          {quote.anchorName} ↗
        </a>
        <small>{kindLabel}</small>
      </p>
      <strong className="receive">
        {peso.format(Number(quote.destinationAmount))}
      </strong>
      <span className="amount-qualifier">
        {quote.destinationAmountIncludesFees
          ? "provider-reported payout after quoted deductions"
          : quote.fee === null
            ? "gross reference; payout fee not deducted"
            : "after reported payout fee"}
      </span>
      <dl>
        <div>
          <dt>Rate</dt>
          <dd>₱{quote.exchangeRate}</dd>
        </div>
        <div>
          <dt>Fee</dt>
          <dd>{feeLabel}</dd>
        </div>
        <div>
          <dt>Estimate</dt>
          <dd>
            {quote.estimatedMinutes
              ? `~${quote.estimatedMinutes} min`
              : "Provider flow"}
          </dd>
        </div>
      </dl>
      <details className="quote-evidence">
        <summary>View source &amp; route details</summary>
        <div>
          <p>
            <b>Rate:</b> {quote.rateSource}
          </p>
          <p>
            <b>Fee:</b> {quote.feeSource}
          </p>
          <p>
            <b>Availability:</b> {quote.availabilitySource}
          </p>
          <p>
            <b>Settlement:</b> {quote.estimatedSettlement}
          </p>
          {quote.disclosures.map((disclosure) => (
            <p key={disclosure}>• {disclosure}</p>
          ))}
        </div>
      </details>
      <button
        type="button"
        className="button secondary wide"
        disabled={!selectable || checkpointActive || stale}
        aria-pressed={selected}
        onClick={onSelect}
      >
        {checkpointActive
          ? "Finish saved proof first"
          : stale
            ? "Refresh quotes"
          : selected
            ? "Selected ✓"
            : selectable
              ? "Choose this route"
              : "Refresh required"}
      </button>
    </article>
  );
}

function ProviderHealth({ providers }: { providers: ProviderResult[] }) {
  const healthy = providers.filter(
    (provider) => provider.status === "ok",
  ).length;
  return (
    <details className="provider-health">
      <summary>
        <b>
          {healthy}/{providers.length}
        </b>{" "}
        sources returned usable data
      </summary>
      <div className="provider-health-list">
        {providers.map((provider) => (
          <div className={provider.status} key={provider.providerId}>
            <span>
              {provider.providerName}
              {provider.status === "unsupported" ? " · not compatible" : ""}
              {provider.status === "ok" && provider.quoteCount
                ? ` · ${provider.quoteCount} ${provider.quoteCount === 1 ? "route" : "routes"}`
                : ""}
            </span>
            {provider.message && <small>{provider.message}</small>}
          </div>
        ))}
      </div>
    </details>
  );
}

function TransactionStatus({ update }: { update: TransactionUpdate }) {
  return (
    <div
      className={`transaction-status ${update.phase}`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <span className="phase-icon" aria-hidden="true">
        {update.phase === "confirmed"
          ? "✓"
          : update.phase === "failed" || update.phase === "rejected"
            ? "!"
            : "•"}
      </span>
      <div>
        <strong>{phaseLabel(update.phase)}</strong>
        <p>{update.message}</p>
        {update.hash && (
          <a
            href={stellarExpertUrl("tx", update.hash)}
            target="_blank"
            rel="noreferrer"
          >
            View transaction {short(update.hash, 8)} ↗
          </a>
        )}
      </div>
    </div>
  );
}
