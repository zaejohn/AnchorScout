import "server-only";
import { randomInt } from "node:crypto";
import { searchQuotes } from "../anchors/service";
import { configuredProviders } from "../anchors/providers/registry";
import { isSelectableQuote } from "../anchors/ranking";
import { parseRouteRequest } from "../anchors/validation";
import { preflightForm, submitForm, FormSubmissionUnknownError } from "./form";
import { newSimulationIdentity } from "./security";
import { LeaseLostError, SimulationStore } from "./store";
import * as stellar from "./stellar";
import type { NewSimulationIdentity, SimulationRun, TransactionKind } from "./types";

export const liveSimulationServices = {
  verifyTestnetConfiguration: stellar.verifyTestnetConfiguration,
  fundWallet: stellar.fundWallet,
  prepareTransaction: stellar.prepareTransaction,
  reconcileTransaction: stellar.reconcileTransaction,
  verifySwap: stellar.verifySwap,
  verifyRoute: stellar.verifyRoute,
  SimulationBlockedError: stellar.SimulationBlockedError,
  preflightForm, submitForm,
  async compare(amount: string) {
    const parsed = parseRouteRequest({ amount, sourceAsset: "TEST_USDC", destinationCurrency: "PHP", payoutMethod: "BANK" });
    if (!parsed.success) throw new Error("INVALID_ROUTE_REQUEST");
    return (await searchQuotes(parsed.data, configuredProviders())).quotes;
  },
};
export type SimulationServices = typeof liveSimulationServices;

const clearRetry = (run: SimulationRun) => { run.attempts = 0; delete run.error; delete run.nextAttemptAt; };
const publicRun = (run: SimulationRun) => ({ id: run.id, state: run.state, wallet: run.wallet, amount: run.amount,
  hashes: run.hashes, blocked: run.blocked, formStatus: run.formStatus, nextAttemptAt: run.nextAttemptAt });

export async function runSimulation(
  store: SimulationStore,
  services: SimulationServices = liveSimulationServices,
  factory: () => NewSimulationIdentity = newSimulationIdentity,
) {
  // Configuration failures do not consume a profile or create/fund a wallet.
  await services.verifyTestnetConfiguration();
  const claim = await store.claim(factory);
  if (claim.kind === "skipped") return claim;
  const { run, token } = claim;
  let finished = false;
  const save = () => store.save(run, token);
  const prepare = async (kind: TransactionKind) => {
    run.pending = await services.prepareTransaction(kind, run);
    if (kind === "proof") run.state = "PROOF_SIGNED";
    // Signed envelope is durable before ANY submission; it never leaves the server.
    await save();
  };
  try {
    if (run.formStatus === "SENDING" || run.formStatus === "UNKNOWN") {
      run.formStatus = "UNKNOWN";
      throw new stellar.SimulationBlockedError("FORM_OUTCOME_REQUIRES_RECONCILIATION");
    }
    if (run.pending) {
      // Renew the ownership check immediately before a possible external write.
      await save();
      const result = await services.reconcileTransaction(run);
      const { kind, hash } = run.pending;
      if (result === "pending") return { kind: "running", run: publicRun(run) };
      if (result === "expired" || result === "failed") {
        (run.failedTransactions ??= []).push({ kind, hash, outcome: result });
        delete run.pending;
        throw new Error(result === "expired" ? "TRANSACTION_EXPIRED" : "TRANSACTION_FAILED");
      }
      if (kind === "swap") await services.verifySwap(run);
      if (kind === "route") await services.verifyRoute(run);
      if (kind === "receipt") await services.verifyRoute(run, true);
      run.hashes[kind] = hash;
      delete run.pending;
      if (kind === "swap") run.state = "SWAPPED";
      if (kind === "route") run.state = "ROUTE_SELECTED";
      if (kind === "receipt") run.state = "COMPLETED";
      clearRetry(run);
      await save();
      return { kind: "running", run: publicRun(run) };
    }
    switch (run.state) {
      case "CREATED":
        run.hashes.funding = await services.fundWallet(run.wallet);
        run.state = "FUNDED";
        clearRetry(run);
        break;
      case "FUNDED":
        await prepare(run.hashes.trustline ? "swap" : "trustline");
        break;
      case "SWAPPED":
      case "ROUTES_COMPARED": {
        const quotes = await services.compare(run.amount);
        const available = quotes.filter((quote) => isSelectableQuote(quote, new Date()));
        if (!available.length) throw new Error("NO_AVAILABLE_EXTERNAL_ROUTE");
        run.quotes = quotes;
        run.quote = available[randomInt(available.length)];
        run.state = "ROUTES_COMPARED";
        await save();
        // Compare and prepare during the same tick; provider quotes live ~60s.
        await prepare("route");
        break;
      }
      case "ROUTE_SELECTED":
        await prepare("proof");
        break;
      case "PROOF_SIGNED":
        await prepare(run.hashes.proof ? "receipt" : "proof");
        break;
      case "COMPLETED": {
        // Recheck the atomic route/receipt outcome immediately before feedback.
        await services.verifyRoute(run, true);
        await services.preflightForm();
        const profile = await store.getProfile(run.profileId);
        run.formStatus = "SENDING";
        await save();
        await services.submitForm(profile, run.wallet);
        run.formStatus = "CONFIRMED";
        run.state = "FORM_SUBMITTED";
        clearRetry(run);
        await store.finish(run, token);
        finished = true;
        return { kind: "completed", run: publicRun(run) };
      }
      case "FORM_SUBMITTED":
        throw new stellar.SimulationBlockedError("INVALID_ACTIVE_RUN");
    }
    await save();
    return { kind: "running", run: publicRun(run) };
  } catch (error) {
    if (error instanceof LeaseLostError) return { kind: "skipped", reason: "lease_lost" };
    // Never persist raw SDK/HTTP errors: they can contain signed envelopes or PII.
    if (error instanceof FormSubmissionUnknownError || run.formStatus === "SENDING" || run.formStatus === "CONFIRMED") {
      run.state = "COMPLETED";
      run.formStatus = "UNKNOWN";
      run.blocked = "FORM_OUTCOME_REQUIRES_RECONCILIATION";
    } else if (error instanceof stellar.SimulationBlockedError) {
      run.blocked = error.message;
    } else {
      run.attempts++;
      run.error = "STEP_FAILED_RETRY_SCHEDULED";
      if (run.attempts >= 8) run.blocked = "RETRY_LIMIT_REACHED";
      else run.nextAttemptAt = new Date(Date.now() + Math.min(2 ** (run.attempts - 1), 16) * 60_000).toISOString();
    }
    try { await save(); }
    catch (saveError) {
      if (saveError instanceof LeaseLostError) return { kind: "skipped", reason: "lease_lost" };
      throw saveError;
    }
    return { kind: run.blocked ? "blocked" : "retry", run: publicRun(run) };
  } finally {
    if (!finished) {
      try { await store.release(run.id, token); }
      catch (error) { if (!(error instanceof LeaseLostError)) throw error; }
    }
  }
}
