import "server-only";
import { z } from "zod";
import { simulationKey } from "./security";
import type { SqlDatabase } from "./store";
import { SIMULATION_STATES, type SimulationRun } from "./types";

const hex = z.string().regex(/^[a-f0-9]{64}$/);
const date = z.string().datetime();
const transactionKind = z.enum(["trustline", "swap", "route", "proof", "receipt"]);
const runSchema = z.object({
  id: z.string().uuid(), profileId: hex, wallet: z.string().regex(/^G[A-Z2-7]{55}$/),
  amount: z.string().regex(/^\d+$/).refine((value) => Number(value) >= 507 && Number(value) <= 1777),
  state: z.enum(SIMULATION_STATES), routeId: hex, receiptId: hex,
  quote: z.record(z.string(), z.unknown()).optional(),
  quotes: z.array(z.record(z.string(), z.unknown())).optional(),
  pending: z.object({ kind: transactionKind, hash: hex, xdr: z.string().min(1) }).strict().optional(),
  failedTransactions: z.array(z.object({ kind: transactionKind, hash: hex, outcome: z.enum(["expired", "failed"]) }).strict()).optional(),
  hashes: z.record(z.enum(["funding", "trustline", "swap", "route", "proof", "receipt"]), hex.optional()),
  formStatus: z.enum(["NOT_SENT", "SENDING", "CONFIRMED", "UNKNOWN"]), attempts: z.number().int().nonnegative(),
  nextAttemptAt: date.optional(), blocked: z.string().optional(), error: z.string().optional(), createdAt: date,
  history: z.array(z.object({ state: z.enum(SIMULATION_STATES), at: date }).strict()).min(1),
}).strict();

const snapshotSchema = z.object({
  version: z.literal(1), runs: z.array(runSchema), lastRunAt: date.nullable(), nextRunAt: date.nullable(),
  activeRunId: z.string().uuid().nullable(),
}).strict();

export interface ValidationSnapshot {
  version: 1;
  runs: SimulationRun[];
  lastRunAt: string | null;
  nextRunAt: string | null;
  activeRunId: string | null;
}

export async function exportValidationSnapshot(database: SqlDatabase): Promise<ValidationSnapshot> {
  return database.transaction(async (connection) => {
    const controls = await connection.query<{ last_run_at: Date | string | null; next_run_at: Date | string | null; active_run_id: string | null }>(
      "SELECT last_run_at, next_run_at, active_run_id FROM anchorscout_simulation_control WHERE id = 1 FOR UPDATE",
    );
    if (!controls.rows[0]) throw new Error("SIMULATION_SCHEMA_MISSING");
    const runs = await connection.query<{ data: SimulationRun }>("SELECT data FROM anchorscout_simulation_runs ORDER BY created_at, id");
    const control = controls.rows[0];
    return {
      version: 1, runs: runs.rows.map((row) => row.data), activeRunId: control.active_run_id,
      lastRunAt: control.last_run_at ? new Date(control.last_run_at).toISOString() : null,
      nextRunAt: control.next_run_at ? new Date(control.next_run_at).toISOString() : null,
    };
  });
}

export async function importValidationSnapshot(database: SqlDatabase, input: unknown, master = process.env.SIMULATION_WALLET_KEY) {
  const parsed = snapshotSchema.safeParse(input);
  if (!parsed.success) throw new Error("INVALID_VALIDATION_EXPORT");
  const snapshot = parsed.data as ValidationSnapshot;
  const ids = new Set(snapshot.runs.map((run) => run.id));
  if (ids.size !== snapshot.runs.length || new Set(snapshot.runs.map((run) => run.profileId)).size !== ids.size ||
      new Set(snapshot.runs.map((run) => run.wallet)).size !== ids.size ||
      snapshot.runs.some((run) => (run.state === "FORM_SUBMITTED") !== (run.formStatus === "CONFIRMED") ||
        (run.state === "FORM_SUBMITTED" && run.pending))) throw new Error("INVALID_VALIDATION_EXPORT");
  if (snapshot.runs.length && (!snapshot.lastRunAt || !snapshot.nextRunAt ||
      Date.parse(snapshot.nextRunAt) < Date.parse(snapshot.lastRunAt) + 17 * 60_000 ||
      snapshot.runs.some((run) => Date.parse(run.createdAt) > Date.parse(snapshot.lastRunAt!) || run.history.at(-1)?.state !== run.state))) {
    throw new Error("INVALID_VALIDATION_SCHEDULE");
  }
  const active = snapshot.runs.find((run) => run.id === snapshot.activeRunId);
  if ((snapshot.activeRunId && (!active || active.state === "FORM_SUBMITTED")) ||
      snapshot.runs.some((run) => run.state !== "FORM_SUBMITTED" && run.id !== snapshot.activeRunId)) {
    throw new Error("INVALID_VALIDATION_ACTIVE_RUN");
  }
  return database.transaction(async (connection) => {
    const controls = await connection.query<{ active_run_id: string | null; lease_active: boolean }>(
      "SELECT active_run_id, lease_until > clock_timestamp() AS lease_active FROM anchorscout_simulation_control WHERE id = 1 FOR UPDATE",
    );
    if (!controls.rows[0]) throw new Error("SIMULATION_SCHEMA_MISSING");
    const control = controls.rows[0];
    if (control.lease_active) throw new Error("VALIDATION_IMPORT_REQUIRES_IDLE_WORKER");
    if (snapshot.activeRunId && control.active_run_id && snapshot.activeRunId !== control.active_run_id) {
      throw new Error("VALIDATION_IMPORT_ACTIVE_RUN_CONFLICT");
    }
    let imported = 0;
    let incomingActive: string | null = null;
    for (const run of snapshot.runs) {
      const profiles = await connection.query<{ reserved_run_id: string | null }>(
        "SELECT reserved_run_id FROM anchorscout_simulation_profiles WHERE id = $1 FOR UPDATE", [run.profileId],
      );
      if (!profiles.rows[0]) throw new Error("VALIDATION_PROFILE_NOT_SEEDED");
      if (profiles.rows[0].reserved_run_id && profiles.rows[0].reserved_run_id !== run.id) {
        throw new Error("VALIDATION_PROFILE_ALREADY_RESERVED");
      }
      const existing = await connection.query<{ data: SimulationRun }>("SELECT data FROM anchorscout_simulation_runs WHERE id = $1", [run.id]);
      const saved = existing.rows[0]?.data;
      if (saved && (["profileId", "wallet", "amount", "routeId", "receiptId", "createdAt"] as const)
        .some((key) => saved[key] !== run[key])) throw new Error("VALIDATION_RUN_IDENTITY_CONFLICT");
      if ((saved ?? run).state !== "FORM_SUBMITTED" && simulationKey(run.id, master).publicKey() !== run.wallet) {
        throw new Error("VALIDATION_WALLET_KEY_MISMATCH");
      }
      if (!saved) {
        await connection.query(
          "INSERT INTO anchorscout_simulation_runs(id, profile_id, wallet, state, data, created_at) VALUES ($1, $2, $3, $4, $5::jsonb, $6)",
          [run.id, run.profileId, run.wallet, run.state, JSON.stringify(run), run.createdAt],
        );
        imported++;
      }
      await connection.query(
        "UPDATE anchorscout_simulation_profiles SET reserved_run_id = $1, reserved_at = COALESCE(reserved_at, $2::timestamptz) WHERE id = $3",
        [run.id, run.createdAt, run.profileId],
      );
      if (run.id === snapshot.activeRunId && (saved ?? run).state !== "FORM_SUBMITTED") incomingActive = run.id;
    }
    await connection.query(
      `UPDATE anchorscout_simulation_control SET
       last_run_at = GREATEST(last_run_at, $1::timestamptz), next_run_at = GREATEST(next_run_at, $2::timestamptz),
       active_run_id = COALESCE(active_run_id, $3::uuid), lease_token = NULL, lease_until = NULL WHERE id = 1`,
      [snapshot.lastRunAt, snapshot.nextRunAt, incomingActive],
    );
    return { imported, preserved: snapshot.runs.length - imported };
  });
}
