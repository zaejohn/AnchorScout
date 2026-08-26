import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { Keypair } from "@stellar/stellar-sdk";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { LeaseLostError, seedProfiles, SimulationStore, type SqlConnection, type SqlDatabase, validateProfiles } from "./store";
import { SIMULATION_STATES, type NewSimulationIdentity, type SimulationClaim } from "./types";

const profileInputs = [
  { full_name: "Automation Test One", email: "One@example.invalid", feedback: null },
  { full_name: "Automation Test Two", email: "two@example.invalid", feedback: "Synthetic test profile." },
];

function identity(): NewSimulationIdentity {
  return { id: randomUUID(), wallet: Keypair.random().publicKey(), amount: "507", routeId: randomBytes(32).toString("hex"), receiptId: randomBytes(32).toString("hex") };
}

function claimed(result: SimulationClaim) {
  if (result.kind !== "claimed") throw new Error(`Expected claim, got ${result.reason}`);
  return result;
}

describe("persistent simulation scheduler", () => {
  let postgres: PGlite;
  let database: SqlDatabase;
  let store: SimulationStore;

  beforeAll(async () => {
    postgres = new PGlite();
    const connection = (client: Pick<PGlite, "query">): SqlConnection => ({
      async query<T>(sql: string, values?: unknown[]) {
        const result = await client.query(sql, values);
        return { rows: result.rows as T[] };
      },
    });
    database = {
      ...connection(postgres),
      transaction: (work) => postgres.transaction((tx) => work(connection(tx))),
      close: () => postgres.close(),
    };
    await postgres.exec(await readFile(new URL("./schema.sql", import.meta.url), "utf8"));
    store = new SimulationStore(database);
  }, 30_000);

  beforeEach(async () => {
    await database.query("UPDATE anchorscout_simulation_control SET active_run_id = NULL, lease_token = NULL, lease_until = NULL, last_run_at = NULL, next_run_at = NULL WHERE id = 1");
    await database.query("DELETE FROM anchorscout_simulation_runs");
    await database.query("DELETE FROM anchorscout_simulation_profiles");
    await seedProfiles(database, profileInputs);
  });

  afterAll(async () => { await database.close?.(); });

  it("serializes simultaneous cron calls into one new run and one profile reservation", async () => {
    const results = await Promise.all(Array.from({ length: 8 }, () => store.claim(identity)));
    expect(results.filter((result) => result.kind === "claimed")).toHaveLength(1);
    expect(results.filter((result) => result.kind === "skipped")).toHaveLength(7);
    const counts = await database.query<{ runs: number; used: number }>(
      "SELECT (SELECT count(*)::integer FROM anchorscout_simulation_runs) AS runs, (SELECT count(*)::integer FROM anchorscout_simulation_profiles WHERE reserved_run_id IS NOT NULL) AS used",
    );
    expect(counts.rows[0]).toEqual({ runs: 1, used: 1 });
    const status = await store.status();
    expect(Date.parse(status.nextRunAt!) - Date.parse(status.lastRunAt!)).toBe(37 * 60_000);
  });

  it("resumes the same durable run before 37 minutes and fences old lease tokens", async () => {
    const first = claimed(await store.claim(identity));
    first.run.state = "FUNDED";
    first.run.hashes.funding = "a".repeat(64);
    await store.save(first.run, first.token);
    await store.release(first.run.id, first.token);
    const restartedStore = new SimulationStore(database);
    const second = claimed(await restartedStore.claim(() => { throw new Error("Must not create a second wallet"); }));
    expect(second.run.id).toBe(first.run.id);
    expect(second.run.hashes.funding).toBe("a".repeat(64));
    expect(second.run.history.map((entry) => entry.state)).toEqual(["CREATED", "FUNDED"]);
    expect(second.token).not.toBe(first.token);
    await expect(store.save(first.run, first.token)).rejects.toBeInstanceOf(LeaseLostError);
    await expect(store.release(first.run.id, first.token)).rejects.toBeInstanceOf(LeaseLostError);
  });

  it("expires leases and rejects late writes even before another worker claims", async () => {
    const first = claimed(await store.claim(identity));
    await database.query("UPDATE anchorscout_simulation_control SET lease_until = clock_timestamp() - interval '1 second' WHERE id = 1");
    await expect(store.save(first.run, first.token)).rejects.toBeInstanceOf(LeaseLostError);
    const second = claimed(await store.claim(identity));
    expect(second.run.id).toBe(first.run.id);
    expect(second.token).not.toBe(first.token);
  });

  it("persists every state, finishes atomically, and waits 37 minutes before another profile", async () => {
    const first = claimed(await store.claim(identity));
    for (const state of SIMULATION_STATES.slice(1, -1)) {
      first.run.state = state;
      await store.save(first.run, first.token);
    }
    first.run.state = "FORM_SUBMITTED";
    first.run.formStatus = "CONFIRMED";
    await store.finish(first.run, first.token);
    expect((await store.status()).activeRun).toBeNull();
    const saved = await database.query<{ data: typeof first.run }>("SELECT data FROM anchorscout_simulation_runs WHERE id = $1", [first.run.id]);
    expect(saved.rows[0].data.history.map((entry) => entry.state)).toEqual(SIMULATION_STATES);
    expect(await store.claim(identity)).toMatchObject({ kind: "skipped", reason: "interval_not_due" });
    await database.query("UPDATE anchorscout_simulation_control SET next_run_at = clock_timestamp() - interval '1 second' WHERE id = 1");
    const second = claimed(await store.claim(identity));
    expect(second.run.profileId).not.toBe(first.run.profileId);
    expect(second.run.wallet).not.toBe(first.run.wallet);
  });

  it("never reuses profiles when seeding again, including case-varied email changes", async () => {
    const first = claimed(await store.claim(identity));
    const profile = await store.getProfile(first.run.profileId);
    expect(profileInputs.some((input) => input.email === profile.email)).toBe(true);
    const seeded = await seedProfiles(database, profileInputs.map((input) => ({ ...input, email: input.email.toUpperCase(), feedback: "Changed" })));
    expect(seeded).toEqual({ inserted: 0, total: 2 });
    expect((await store.status()).remainingProfiles).toBe(1);
  });

  it("blocks ambiguous form submissions and respects safe retry time", async () => {
    const claim = claimed(await store.claim(identity));
    claim.run.nextAttemptAt = new Date(Date.now() + 60_000).toISOString();
    await store.save(claim.run, claim.token);
    await store.release(claim.run.id, claim.token);
    expect(await store.claim(identity)).toMatchObject({ kind: "skipped", reason: "retry_not_due" });
    await database.query("UPDATE anchorscout_simulation_runs SET data = jsonb_set(data - 'nextAttemptAt', '{formStatus}', '\"UNKNOWN\"'::jsonb) WHERE id = $1", [claim.run.id]);
    expect(await store.claim(identity)).toMatchObject({ kind: "skipped", reason: "run_blocked" });
    expect((await store.status()).remainingProfiles).toBe(1);
  });

  it("stops cleanly when all profiles are permanently reserved", async () => {
    await database.query("DELETE FROM anchorscout_simulation_profiles");
    expect(await store.claim(identity)).toMatchObject({ kind: "skipped", reason: "profiles_exhausted" });
  });

  it("rejects identity mutation and rolls back invalid creations without consuming a profile", async () => {
    await expect(store.claim(() => ({ ...identity(), amount: "1778" }))).rejects.toThrow("Invalid simulation identity");
    expect((await store.status()).remainingProfiles).toBe(2);
    const claim = claimed(await store.claim(identity));
    await expect(store.save({ ...claim.run, wallet: Keypair.random().publicKey() }, claim.token)).rejects.toThrow("identity cannot change");
  });

  it("does not expose profile data or signed envelopes through status", async () => {
    const claim = claimed(await store.claim(identity));
    claim.run.pending = { kind: "swap", hash: "b".repeat(64), xdr: "signed-envelope" };
    await store.save(claim.run, claim.token);
    const status = JSON.stringify(await store.status());
    expect(status).not.toContain("signed-envelope");
    expect(status).not.toContain("example.invalid");
    expect(status).not.toContain("profileId");
  });
});

describe("private profile validation", () => {
  it("allows null feedback and preserves the supplied email exactly", () => {
    expect(validateProfiles(profileInputs)).toEqual(profileInputs);
  });

  it("rejects duplicate emails and malformed records without including PII in the error", () => {
    expect(() => validateProfiles([profileInputs[0], { ...profileInputs[0], email: "one@example.invalid" }])).toThrow("duplicates an email");
    expect(() => validateProfiles([{ ...profileInputs[0], feedback: undefined }])).toThrow("invalid fields");
    expect(() => validateProfiles([])).toThrow("non-empty JSON array");
  });
});
