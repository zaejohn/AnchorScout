import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { simulationKey } from "./security";
import { seedProfiles, SimulationStore, type SqlConnection, type SqlDatabase } from "./store";
import { exportValidationSnapshot, importValidationSnapshot, type ValidationSnapshot } from "./validation-import";
import type { SimulationRun } from "./types";

describe("private validation reservation migration", () => {
  const master = randomBytes(32).toString("base64");
  let postgres: PGlite;
  let database: SqlDatabase;
  let profileIds: string[];

  beforeAll(async () => {
    postgres = new PGlite();
    const connection = (client: Pick<PGlite, "query">): SqlConnection => ({
      async query<T>(sql: string, values?: unknown[]) { return { rows: (await client.query(sql, values)).rows as T[] }; },
    });
    database = { ...connection(postgres), transaction: (work) => postgres.transaction((tx) => work(connection(tx))), close: () => postgres.close() };
    await postgres.exec(await readFile(new URL("./schema.sql", import.meta.url), "utf8"));
  }, 30_000);

  beforeEach(async () => {
    await database.query("UPDATE anchorscout_simulation_control SET active_run_id = NULL, lease_token = NULL, lease_until = NULL, last_run_at = NULL, next_run_at = NULL WHERE id = 1");
    await database.query("DELETE FROM anchorscout_simulation_runs");
    await database.query("DELETE FROM anchorscout_simulation_profiles");
    await seedProfiles(database, [
      { full_name: "Validation One", email: "one@example.invalid", feedback: null },
      { full_name: "Validation Two", email: "two@example.invalid", feedback: null },
    ]);
    profileIds = (await database.query<{ id: string }>("SELECT id FROM anchorscout_simulation_profiles ORDER BY id")).rows.map((row) => row.id);
  });

  afterAll(async () => { await database.close?.(); });

  function snapshot(completed = true, profileId = profileIds[0]): ValidationSnapshot {
    const id = randomUUID();
    const createdAt = new Date(Date.now() - 60_000).toISOString();
    const state = completed ? "FORM_SUBMITTED" : "FUNDED";
    const run: SimulationRun = {
      id, profileId, wallet: simulationKey(id, master).publicKey(), amount: "777", state,
      routeId: randomBytes(32).toString("hex"), receiptId: randomBytes(32).toString("hex"),
      hashes: { funding: "a".repeat(64) }, formStatus: completed ? "CONFIRMED" : "NOT_SENT", attempts: 0,
      createdAt, history: [{ state: "CREATED", at: createdAt }, { state, at: createdAt }],
    };
    return { version: 1, runs: [run], lastRunAt: createdAt, nextRunAt: new Date(Date.parse(createdAt) + 37 * 60_000).toISOString(), activeRunId: completed ? null : id };
  }

  it("imports completed reservations without a wallet master and preserves the interval", async () => {
    const input = snapshot();
    expect(await importValidationSnapshot(database, input, undefined)).toEqual({ imported: 1, preserved: 0 });
    const status = await new SimulationStore(database).status();
    expect(status.remainingProfiles).toBe(1);
    expect(status.nextRunAt).toBe(input.nextRunAt);
    expect(status.lastRunAt).toBe(input.lastRunAt);
    expect(status.activeRun).toBeNull();
    expect(await new SimulationStore(database).claim(() => { throw new Error("interval must prevent creation"); })).toMatchObject({ kind: "skipped", reason: "interval_not_due" });
  });

  it("is idempotent, exports no names/emails/lease, and never rolls later progress back", async () => {
    const input = snapshot(false);
    await importValidationSnapshot(database, input, master);
    const store = new SimulationStore(database);
    const claim = await store.claim(() => { throw new Error("resume only"); });
    if (claim.kind !== "claimed") throw new Error("Expected claim");
    claim.run.state = "SWAPPED";
    await store.save(claim.run, claim.token);
    await store.release(claim.run.id, claim.token);
    expect(await importValidationSnapshot(database, input, master)).toEqual({ imported: 0, preserved: 1 });
    const exported = await exportValidationSnapshot(database);
    expect(exported.runs[0].state).toBe("SWAPPED");
    expect(await importValidationSnapshot(database, exported, master)).toEqual({ imported: 0, preserved: 1 });
    expect(JSON.stringify(exported)).not.toMatch(/example\.invalid|full_name|lease_token/);
  });

  it("requires the exact wallet derivation master for unfinished runs", async () => {
    const input = snapshot(false);
    await expect(importValidationSnapshot(database, input, randomBytes(32).toString("base64"))).rejects.toThrow("WALLET_KEY_MISMATCH");
    expect((await new SimulationStore(database).status()).remainingProfiles).toBe(2);
    await importValidationSnapshot(database, input, master);
    expect((await new SimulationStore(database).status()).activeRun?.id).toBe(input.activeRunId);
  });

  it("rejects competing active runs and existing profile reservations atomically", async () => {
    await importValidationSnapshot(database, snapshot(false), master);
    await expect(importValidationSnapshot(database, snapshot(false, profileIds[1]), master)).rejects.toThrow("ACTIVE_RUN_CONFLICT");
    await expect(importValidationSnapshot(database, snapshot(true), master)).rejects.toThrow("PROFILE_ALREADY_RESERVED");
    expect((await new SimulationStore(database).status()).remainingProfiles).toBe(1);
  });

  it("rejects an active worker lease and preserves a later production schedule", async () => {
    const input = snapshot(false);
    await importValidationSnapshot(database, input, master);
    const store = new SimulationStore(database);
    const claim = await store.claim(() => { throw new Error("resume only"); });
    expect(claim.kind).toBe("claimed");
    await expect(importValidationSnapshot(database, input, master)).rejects.toThrow("IDLE_WORKER");
    if (claim.kind === "claimed") await store.release(claim.run.id, claim.token);
    const later = new Date(Date.now() + 90 * 60_000).toISOString();
    await database.query("UPDATE anchorscout_simulation_control SET next_run_at = $1 WHERE id = 1", [later]);
    await importValidationSnapshot(database, input, master);
    expect((await store.status()).nextRunAt).toBe(later);
  });

  it("rejects duplicate profiles and snapshots that could bypass the 37-minute interval", async () => {
    const input = snapshot();
    await expect(importValidationSnapshot(database, { ...input, runs: [...input.runs, ...input.runs] })).rejects.toThrow("INVALID_VALIDATION_EXPORT");
    await expect(importValidationSnapshot(database, { ...input, nextRunAt: input.lastRunAt })).rejects.toThrow("INVALID_VALIDATION_SCHEDULE");
  });
});
