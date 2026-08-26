import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { Keypair } from "@stellar/stellar-sdk";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AnchorQuote } from "../anchors/types";
import { FormPreflightError, FormSubmissionUnknownError } from "./form";
import { LeaseLostError, seedProfiles, SimulationStore, type SqlConnection, type SqlDatabase } from "./store";
import { SimulationBlockedError } from "./stellar";
import { SIMULATION_STATES, type SimulationRun, type TransactionKind } from "./types";
import { runSimulation, type SimulationServices } from "./worker";

const profiles = [
  { full_name: "Synthetic Worker One", email: "one@example.invalid", feedback: null },
  { full_name: "Synthetic Worker Two", email: "two@example.invalid", feedback: "Synthetic test." },
];
function identity() {
  return { id: randomUUID(), wallet: Keypair.random().publicKey(), amount: "1777", routeId: randomBytes(32).toString("hex"), receiptId: randomBytes(32).toString("hex") };
}
function quote(overrides: Partial<AnchorQuote> = {}): AnchorQuote {
  return {
    anchorId: "external-test-fixture", anchorName: "External provider fixture", quoteId: "quote-1",
    sourceAsset: "TEST_USDC", sourceAmount: "1777", destinationCurrency: "PHP", destinationAmount: "100000",
    exchangeRate: "56.27462", fee: null, feeCurrency: null, payoutMethod: "BANK", estimatedMinutes: null,
    estimatedSettlement: "Unavailable", expiresAt: new Date(Date.now() + 60_000).toISOString(), status: "AVAILABLE",
    quoteKind: "MARKET_REFERENCE", settlementMode: "FIAT_SIMULATED", rateSource: "Fixture", feeSource: "Unavailable",
    availabilitySource: "Fixture", providerUrl: "https://provider.example.invalid", disclosures: [], comparisonComplete: false,
    ...overrides,
  };
}
function services() {
  return {
    verifyTestnetConfiguration: vi.fn<SimulationServices["verifyTestnetConfiguration"]>().mockResolvedValue(undefined),
    fundWallet: vi.fn<SimulationServices["fundWallet"]>().mockResolvedValue("f".repeat(64)),
    prepareTransaction: vi.fn<SimulationServices["prepareTransaction"]>().mockImplementation(async (kind) => ({ kind, hash: randomBytes(32).toString("hex"), xdr: `signed-${kind}-envelope` })),
    reconcileTransaction: vi.fn<SimulationServices["reconcileTransaction"]>().mockResolvedValue("confirmed"),
    verifySwap: vi.fn<SimulationServices["verifySwap"]>().mockResolvedValue(undefined),
    verifyRoute: vi.fn<SimulationServices["verifyRoute"]>().mockResolvedValue(undefined),
    compare: vi.fn<SimulationServices["compare"]>().mockImplementation(async () => [quote(), quote({ quoteId: "expired", expiresAt: "2000-01-01T00:00:00Z" }), quote({ quoteId: "unavailable", status: "UNAVAILABLE" })]),
    preflightForm: vi.fn<SimulationServices["preflightForm"]>().mockResolvedValue(undefined),
    submitForm: vi.fn<SimulationServices["submitForm"]>().mockResolvedValue(undefined),
    SimulationBlockedError,
  } satisfies SimulationServices;
}

describe("durable simulation worker", () => {
  let postgres: PGlite;
  let database: SqlDatabase;
  let store: SimulationStore;
  let external: ReturnType<typeof services>;
  let factory: ReturnType<typeof vi.fn<typeof identity>>;

  beforeAll(async () => {
    postgres = new PGlite();
    const connection = (client: Pick<PGlite, "query">): SqlConnection => ({ async query<T>(sql: string, values?: unknown[]) {
      const result = await client.query(sql, values); return { rows: result.rows as T[] };
    } });
    database = { ...connection(postgres), transaction: (work) => postgres.transaction((tx) => work(connection(tx))), close: () => postgres.close() };
    await postgres.exec(await readFile(new URL("./schema.sql", import.meta.url), "utf8"));
  }, 30_000);
  beforeEach(async () => {
    await database.query("UPDATE anchorscout_simulation_control SET active_run_id = NULL, lease_token = NULL, lease_until = NULL, last_run_at = NULL, next_run_at = NULL WHERE id = 1");
    await database.query("DELETE FROM anchorscout_simulation_runs");
    await database.query("DELETE FROM anchorscout_simulation_profiles");
    await seedProfiles(database, profiles);
    store = new SimulationStore(database);
    external = services();
    factory = vi.fn(identity);
  });
  afterAll(async () => { await database.close?.(); });

  const tick = () => runSimulation(new SimulationStore(database), external, factory);
  async function saved(): Promise<SimulationRun> {
    return (await database.query<{ data: SimulationRun }>("SELECT data FROM anchorscout_simulation_runs ORDER BY created_at LIMIT 1")).rows[0].data;
  }
  async function reserve(state: SimulationRun["state"], pending?: TransactionKind) {
    const claimed = await store.claim(factory);
    if (claimed.kind !== "claimed") throw new Error("Expected claim");
    claimed.run.state = state;
    if (pending) claimed.run.pending = { kind: pending, hash: "a".repeat(64), xdr: "durable-original-envelope" };
    await store.save(claimed.run, claimed.token);
    await store.release(claimed.run.id, claimed.token);
    return claimed.run;
  }
  async function makeRetryDue() {
    await database.query("UPDATE anchorscout_simulation_runs SET data = data - 'nextAttemptAt'");
  }

  it("completes all persisted states with one wallet, amount, selected returned quote, and confirmed receipt before form", async () => {
    const saveStates: string[] = [];
    external.submitForm.mockImplementation(async (profile, wallet) => {
      const run = await saved();
      expect(run.state).toBe("COMPLETED");
      expect(run.formStatus).toBe("SENDING");
      expect(run.hashes.receipt).toBeTruthy();
      expect(run.pending).toBeUndefined();
      expect(wallet).toBe(run.wallet);
      expect(profile).toEqual(await store.getProfile(run.profileId));
      expect(profiles).toContainEqual({ full_name: profile.full_name, email: profile.email, feedback: profile.feedback });
    });
    let result: Awaited<ReturnType<typeof tick>>;
    for (let index = 0; index < 20; index++) {
      result = await tick();
      saveStates.push((await saved()).state);
      if (result.kind === "completed") break;
    }
    expect(result!.kind).toBe("completed");
    const run = await saved();
    expect(run.history.map((entry) => entry.state)).toEqual(SIMULATION_STATES);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(external.fundWallet).toHaveBeenCalledExactlyOnceWith(run.wallet);
    expect(external.compare).toHaveBeenCalledExactlyOnceWith(run.amount);
    expect(run.quote?.quoteId).toBe("quote-1");
    expect(run.quotes).toContainEqual(run.quote);
    expect(external.prepareTransaction.mock.calls.map(([kind]) => kind)).toEqual(["trustline", "swap", "route", "proof", "receipt"]);
    for (const [, passed] of external.prepareTransaction.mock.calls) {
      expect(passed.wallet).toBe(run.wallet); expect(passed.amount).toBe("1777");
    }
    expect(external.verifySwap).toHaveBeenCalledTimes(1);
    expect(external.verifyRoute.mock.calls.map(([, completed]) => completed)).toEqual([undefined, true, true]);
    expect(external.submitForm).toHaveBeenCalledTimes(1);
    expect(saveStates).toContain("PROOF_SIGNED");
    const status = await store.status();
    expect(status.activeRun).toBeNull();
    expect(status.remainingProfiles).toBe(1);
    expect(await tick()).toMatchObject({ kind: "skipped", reason: "interval_not_due" });
    expect(JSON.stringify(result!)).not.toContain("envelope");
    expect(JSON.stringify(result!)).not.toContain("example.invalid");
  });

  it("restarts a pending transaction with exactly the same durable XDR and never advances on pending", async () => {
    const original = await reserve("FUNDED", "swap");
    external.reconcileTransaction.mockResolvedValue("pending");
    for (let index = 0; index < 3; index++) {
      expect(await tick()).toMatchObject({ kind: "running", run: { state: "FUNDED" } });
    }
    const run = await saved();
    expect(run.pending).toEqual(original.pending);
    expect(run.wallet).toBe(original.wallet);
    expect(external.prepareTransaction).not.toHaveBeenCalled();
    expect(external.verifySwap).not.toHaveBeenCalled();
    expect(external.submitForm).not.toHaveBeenCalled();
    expect(factory).toHaveBeenCalledTimes(1);
    expect(external.reconcileTransaction.mock.calls.every(([value]) => value.pending?.xdr === "durable-original-envelope")).toBe(true);
  });

  it.each(["expired", "failed"] as const)("archives a proven %s transaction and retries without replacing wallet/profile", async (outcome) => {
    const original = await reserve("FUNDED", "swap");
    external.reconcileTransaction.mockResolvedValue(outcome);
    expect(await tick()).toMatchObject({ kind: "retry" });
    const failed = await saved();
    expect(failed.pending).toBeUndefined();
    expect(failed.failedTransactions).toEqual([{ kind: "swap", hash: original.pending!.hash, outcome }]);
    expect(failed.attempts).toBe(1);
    expect(await tick()).toMatchObject({ kind: "skipped", reason: "retry_not_due" });
    expect((await saved()).profileId).toBe(original.profileId);
    expect((await saved()).wallet).toBe(original.wallet);
    expect(external.submitForm).not.toHaveBeenCalled();
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("caps safe retries, sanitizes failures, and permanently retains the reserved profile", async () => {
    await reserve("SWAPPED");
    external.compare.mockRejectedValue(new Error("secret-envelope, private@example.invalid"));
    for (let attempt = 1; attempt <= 8; attempt++) {
      await makeRetryDue();
      expect(await tick()).toMatchObject({ kind: attempt === 8 ? "blocked" : "retry" });
      expect((await saved()).attempts).toBe(attempt);
    }
    expect((await saved()).blocked).toBe("RETRY_LIMIT_REACHED");
    expect(await tick()).toMatchObject({ kind: "skipped", reason: "run_blocked" });
    expect((await store.status()).remainingProfiles).toBe(1);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(await saved())).not.toContain("private@example.invalid");
    expect(JSON.stringify(await saved())).not.toContain("secret-envelope");
  });

  it("does not fabricate a route when every returned quote is unavailable or expired", async () => {
    await reserve("SWAPPED");
    external.compare.mockResolvedValue([quote({ status: "UNAVAILABLE" }), quote({ expiresAt: "2000-01-01T00:00:00Z" })]);
    expect(await tick()).toMatchObject({ kind: "retry", run: { state: "SWAPPED" } });
    expect((await saved()).quote).toBeUndefined();
    expect(external.prepareTransaction).not.toHaveBeenCalled();
  });

  it("stops before a submission when the persisted ownership check loses its lease", async () => {
    await reserve("FUNDED", "swap");
    vi.spyOn(store, "save").mockRejectedValue(new LeaseLostError());
    expect(await runSimulation(store, external, factory)).toEqual({ kind: "skipped", reason: "lease_lost" });
    expect(external.reconcileTransaction).not.toHaveBeenCalled();
    expect(external.submitForm).not.toHaveBeenCalled();
  });

  it("handles lease loss while saving an I/O failure without modifying another worker's run", async () => {
    await reserve("SWAPPED");
    external.compare.mockRejectedValue(new Error("provider outage"));
    vi.spyOn(store, "save").mockRejectedValue(new LeaseLostError());
    expect(await runSimulation(store, external, factory)).toEqual({ kind: "skipped", reason: "lease_lost" });
    expect((await saved()).attempts).toBe(0);
    expect(external.prepareTransaction).not.toHaveBeenCalled();
  });

  it("retains the failed-transaction retry count across preparing another envelope", async () => {
    await reserve("FUNDED", "swap");
    await database.query("UPDATE anchorscout_simulation_runs SET data = jsonb_set(data, '{hashes,trustline}', to_jsonb($1::text))", ["b".repeat(64)]);
    external.reconcileTransaction.mockResolvedValue("failed");
    await tick();
    await makeRetryDue();
    expect(await tick()).toMatchObject({ kind: "running" });
    expect((await saved()).pending?.kind).toBe("swap");
    expect((await saved()).attempts).toBe(1);
    await tick();
    expect((await saved()).attempts).toBe(2);
    expect((await saved()).failedTransactions).toHaveLength(2);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("does not submit feedback until a receipt is confirmed and its completed outcome verifies", async () => {
    await reserve("PROOF_SIGNED", "receipt");
    external.reconcileTransaction.mockResolvedValue("pending");
    await tick();
    expect(external.preflightForm).not.toHaveBeenCalled();
    expect(external.submitForm).not.toHaveBeenCalled();
    external.reconcileTransaction.mockResolvedValue("confirmed");
    external.verifyRoute.mockRejectedValue(new SimulationBlockedError("RECEIPT_VERIFICATION_FAILED"));
    expect(await tick()).toMatchObject({ kind: "blocked", run: { state: "PROOF_SIGNED" } });
    expect(external.submitForm).not.toHaveBeenCalled();
    expect((await saved()).pending?.kind).toBe("receipt");
  });

  it("converts a crash after SENDING into UNKNOWN without sending a duplicate", async () => {
    await reserve("COMPLETED");
    await database.query("UPDATE anchorscout_simulation_runs SET data = jsonb_set(data, '{formStatus}', '\"SENDING\"'::jsonb)");
    expect(await tick()).toMatchObject({ kind: "blocked", run: { formStatus: "UNKNOWN" } });
    expect(external.submitForm).not.toHaveBeenCalled();
    expect(await tick()).toMatchObject({ kind: "skipped", reason: "run_blocked" });
    expect((await store.status()).remainingProfiles).toBe(1);
  });

  it("blocks ambiguous form timeouts permanently instead of retrying the POST", async () => {
    await reserve("COMPLETED");
    external.submitForm.mockRejectedValue(new FormSubmissionUnknownError());
    expect(await tick()).toMatchObject({ kind: "blocked", run: { formStatus: "UNKNOWN", state: "COMPLETED" } });
    expect(external.submitForm).toHaveBeenCalledTimes(1);
    expect(await tick()).toMatchObject({ kind: "skipped", reason: "run_blocked" });
    expect(external.submitForm).toHaveBeenCalledTimes(1);
    expect((await store.status()).activeRun).not.toBeNull();
  });

  it("blocks after a successful form POST when the atomic completion write fails", async () => {
    await reserve("COMPLETED");
    vi.spyOn(store, "finish").mockRejectedValue(new Error("database unavailable"));
    expect(await runSimulation(store, external, factory)).toMatchObject({
      kind: "blocked", run: { state: "COMPLETED", formStatus: "UNKNOWN" },
    });
    expect((await saved()).formStatus).toBe("UNKNOWN");
    expect(external.submitForm).toHaveBeenCalledTimes(1);
    expect(await tick()).toMatchObject({ kind: "skipped", reason: "run_blocked" });
    expect(external.submitForm).toHaveBeenCalledTimes(1);
  });

  it("retries a read-only schema failure safely before setting SENDING or submitting", async () => {
    await reserve("COMPLETED");
    external.preflightForm.mockRejectedValueOnce(new FormPreflightError());
    expect(await tick()).toMatchObject({ kind: "retry", run: { formStatus: "NOT_SENT" } });
    expect(external.submitForm).not.toHaveBeenCalled();
    await makeRetryDue();
    expect(await tick()).toMatchObject({ kind: "completed", run: { formStatus: "CONFIRMED" } });
    expect(external.submitForm).toHaveBeenCalledTimes(1);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("checks Testnet configuration before consuming any profile", async () => {
    external.verifyTestnetConfiguration.mockRejectedValue(new SimulationBlockedError("TESTNET_NETWORK_MISMATCH"));
    await expect(tick()).rejects.toThrow("TESTNET_NETWORK_MISMATCH");
    expect(factory).not.toHaveBeenCalled();
    expect((await store.status()).remainingProfiles).toBe(2);
    expect(external.fundWallet).not.toHaveBeenCalled();
  });
});
