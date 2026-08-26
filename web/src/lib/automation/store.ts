import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { Pool } from "pg";
import type {
  NewSimulationIdentity, ProfileInput, SimulationClaim, SimulationProfile,
  SimulationRun, SimulationStatus,
} from "./types";

export interface SqlConnection {
  query<T = Record<string, unknown>>(text: string, parameters?: unknown[]): Promise<{ rows: T[] }>;
}

export interface SqlDatabase extends SqlConnection {
  transaction<T>(work: (connection: SqlConnection) => Promise<T>): Promise<T>;
  close?(): Promise<void>;
}

export function createPostgresDatabase(connectionString: string): SqlDatabase {
  if (!connectionString) throw new Error("DATABASE_URL is required for simulation persistence.");
  const pool = new Pool({ connectionString, max: 3, connectionTimeoutMillis: 10_000, idleTimeoutMillis: 20_000 });
  return {
    async query<T>(text: string, parameters?: unknown[]) {
      const result = await pool.query(text, parameters);
      return { rows: result.rows as T[] };
    },
    async transaction<T>(work: (connection: SqlConnection) => Promise<T>) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await work({
          async query<R>(text: string, parameters?: unknown[]) {
            const response = await client.query(text, parameters);
            return { rows: response.rows as R[] };
          },
        });
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

interface Control {
  last_run_at: Date | string | null;
  next_run_at: Date | string | null;
  active_run_id: string | null;
  lease_token: string | null;
  lease_until: Date | string | null;
}

const iso = (date: Date | string | null): string | null => date ? new Date(date).toISOString() : null;

export class LeaseLostError extends Error {
  constructor() { super("Simulation lease expired or was replaced; stop this worker."); }
}

export class SimulationStore {
  constructor(readonly database: SqlDatabase) {}

  private async lock(connection: SqlConnection): Promise<{ control: Control; now: Date }> {
    const { rows } = await connection.query<Control>("SELECT * FROM anchorscout_simulation_control WHERE id = 1 FOR UPDATE");
    if (!rows[0]) throw new Error("Simulation database is not initialized. Run simulation:setup.");
    const clock = await connection.query<{ now: Date | string }>("SELECT clock_timestamp() AS now");
    return { control: rows[0], now: new Date(clock.rows[0].now) };
  }

  private assertLease(control: Control, now: Date, runId: string, token: string) {
    if (control.active_run_id !== runId || control.lease_token !== token ||
        !control.lease_until || new Date(control.lease_until).getTime() <= now.getTime()) {
      throw new LeaseLostError();
    }
  }

  async claim(factory: (profileId: string) => NewSimulationIdentity): Promise<SimulationClaim> {
    return this.database.transaction(async (connection) => {
      const { control, now } = await this.lock(connection);
      const nextRunAt = iso(control.next_run_at) ?? undefined;
      if (control.lease_until && new Date(control.lease_until) > now) {
        return { kind: "skipped", reason: "lease_active", nextRunAt };
      }
      let run: SimulationRun;
      if (control.active_run_id) {
        const result = await connection.query<{ data: SimulationRun }>(
          "SELECT data FROM anchorscout_simulation_runs WHERE id = $1", [control.active_run_id],
        );
        if (!result.rows[0]) throw new Error("Simulation active run is missing.");
        run = result.rows[0].data;
        if (run.blocked || run.formStatus === "UNKNOWN") return { kind: "skipped", reason: "run_blocked", nextRunAt };
        if (run.nextAttemptAt && new Date(run.nextAttemptAt) > now) {
          return { kind: "skipped", reason: "retry_not_due", nextRunAt: run.nextAttemptAt };
        }
      } else {
        if (control.next_run_at && new Date(control.next_run_at) > now) {
          return { kind: "skipped", reason: "interval_not_due", nextRunAt };
        }
        const profiles = await connection.query<{ id: string }>(
          "SELECT id FROM anchorscout_simulation_profiles WHERE reserved_run_id IS NULL ORDER BY created_at, id LIMIT 1 FOR UPDATE",
        );
        if (!profiles.rows[0]) return { kind: "skipped", reason: "profiles_exhausted", nextRunAt };
        const profileId = profiles.rows[0].id;
        const identity = factory(profileId);
        if (!/^\d+$/.test(identity.amount) || Number(identity.amount) < 507 || Number(identity.amount) > 1777 ||
            !/^G[A-Z2-7]{55}$/.test(identity.wallet) || !/^[a-f0-9]{64}$/.test(identity.routeId) ||
            !/^[a-f0-9]{64}$/.test(identity.receiptId)) throw new Error("Invalid simulation identity.");
        run = {
          ...identity, profileId, state: "CREATED", hashes: {}, formStatus: "NOT_SENT", attempts: 0,
          createdAt: now.toISOString(), history: [{ state: "CREATED", at: now.toISOString() }],
        };
        await connection.query(
          "INSERT INTO anchorscout_simulation_runs(id, profile_id, wallet, state, data, created_at) VALUES ($1, $2, $3, $4, $5::jsonb, $6)",
          [run.id, profileId, run.wallet, run.state, JSON.stringify(run), now],
        );
        await connection.query(
          "UPDATE anchorscout_simulation_profiles SET reserved_run_id = $1, reserved_at = $2 WHERE id = $3 AND reserved_run_id IS NULL",
          [run.id, now, profileId],
        );
        await connection.query(
          "UPDATE anchorscout_simulation_control SET active_run_id = $1, last_run_at = $2, next_run_at = $2::timestamptz + interval '17 minutes' WHERE id = 1",
          [run.id, now],
        );
      }
      const token = randomUUID();
      await connection.query(
        "UPDATE anchorscout_simulation_control SET lease_token = $1, lease_until = $2::timestamptz + interval '120 seconds' WHERE id = 1",
        [token, now],
      );
      return { kind: "claimed", run, token };
    });
  }

  private async write(connection: SqlConnection, run: SimulationRun) {
    const result = await connection.query<{ data: SimulationRun }>("SELECT data FROM anchorscout_simulation_runs WHERE id = $1", [run.id]);
    const stored = result.rows[0]?.data;
    if (!stored || (["id", "profileId", "wallet", "amount", "routeId", "receiptId", "createdAt"] as const)
      .some((key) => stored[key] !== run[key])) throw new Error("Simulation identity cannot change after reservation.");
    run.history = stored.history ?? [{ state: stored.state, at: stored.createdAt }];
    if (stored.state !== run.state) {
      const clock = await connection.query<{ now: Date | string }>("SELECT clock_timestamp() AS now");
      run.history.push({ state: run.state, at: new Date(clock.rows[0].now).toISOString() });
    }
    await connection.query(
      "UPDATE anchorscout_simulation_runs SET state = $2, data = $3::jsonb, updated_at = clock_timestamp() WHERE id = $1",
      [run.id, run.state, JSON.stringify(run)],
    );
  }

  async save(run: SimulationRun, token: string): Promise<void> {
    await this.database.transaction(async (connection) => {
      const { control, now } = await this.lock(connection);
      this.assertLease(control, now, run.id, token);
      if (run.state === "FORM_SUBMITTED") throw new Error("Use finish to finalize a simulation atomically.");
      await this.write(connection, run);
    });
  }

  async release(runId: string, token: string): Promise<void> {
    await this.database.transaction(async (connection) => {
      const { control, now } = await this.lock(connection);
      this.assertLease(control, now, runId, token);
      await connection.query("UPDATE anchorscout_simulation_control SET lease_token = NULL, lease_until = NULL WHERE id = 1");
    });
  }

  async finish(run: SimulationRun, token: string): Promise<void> {
    if (run.state !== "FORM_SUBMITTED" || run.formStatus !== "CONFIRMED" || run.pending) {
      throw new Error("Only a confirmed form submission without pending transactions can finish.");
    }
    await this.database.transaction(async (connection) => {
      const { control, now } = await this.lock(connection);
      this.assertLease(control, now, run.id, token);
      await this.write(connection, run);
      await connection.query("UPDATE anchorscout_simulation_control SET active_run_id = NULL, lease_token = NULL, lease_until = NULL WHERE id = 1");
    });
  }

  async getProfile(profileId: string): Promise<SimulationProfile> {
    const { rows } = await this.database.query<SimulationProfile>(
      "SELECT id, full_name, email, feedback FROM anchorscout_simulation_profiles WHERE id = $1", [profileId],
    );
    if (!rows[0]) throw new Error("Simulation profile is missing.");
    return rows[0];
  }

  async status(): Promise<SimulationStatus> {
    const { rows } = await this.database.query<Control & { data: SimulationRun | null; remaining: string }>(
      `SELECT c.*, r.data, (SELECT count(*) FROM anchorscout_simulation_profiles WHERE reserved_run_id IS NULL) AS remaining
       FROM anchorscout_simulation_control c LEFT JOIN anchorscout_simulation_runs r ON r.id = c.active_run_id WHERE c.id = 1`,
    );
    if (!rows[0]) throw new Error("Simulation database is not initialized.");
    const { data, remaining, ...control } = rows[0];
    return {
      lastRunAt: iso(control.last_run_at), nextRunAt: iso(control.next_run_at), remainingProfiles: Number(remaining),
      activeRun: data ? {
        id: data.id, wallet: data.wallet, state: data.state, hashes: data.hashes,
        blocked: data.blocked, formStatus: data.formStatus, nextAttemptAt: data.nextAttemptAt,
      } : null,
    };
  }
}

export function validateProfiles(value: unknown): ProfileInput[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error("Profiles must be a non-empty JSON array.");
  const emails = new Set<string>();
  return value.map((record: unknown, index) => {
    if (!record || typeof record !== "object") throw new Error(`Profile ${index + 1} is invalid.`);
    const { full_name, email, feedback } = record as Partial<ProfileInput>;
    if (typeof full_name !== "string" || !full_name.trim() || full_name.length > 300 ||
        typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320 ||
        (feedback !== null && (typeof feedback !== "string" || feedback.length > 20_000))) {
      throw new Error(`Profile ${index + 1} has invalid fields.`);
    }
    const normalizedEmail = email.toLowerCase();
    if (emails.has(normalizedEmail)) throw new Error(`Profile ${index + 1} duplicates an email.`);
    emails.add(normalizedEmail);
    return { full_name, email, feedback };
  });
}

export async function seedProfiles(database: SqlDatabase, inputs: unknown): Promise<{ inserted: number; total: number }> {
  const profiles = validateProfiles(inputs);
  return database.transaction(async (connection) => {
    let inserted = 0;
    for (const profile of profiles) {
      const id = createHash("sha256").update(JSON.stringify([profile.full_name, profile.email.toLowerCase(), profile.feedback])).digest("hex");
      const result = await connection.query<{ id: string }>(
        `INSERT INTO anchorscout_simulation_profiles(id, full_name, email, feedback) VALUES ($1, $2, $3, $4)
         ON CONFLICT (lower(email)) DO NOTHING RETURNING id`,
        [id, profile.full_name, profile.email, profile.feedback],
      );
      inserted += result.rows.length;
    }
    const count = await connection.query<{ total: string }>("SELECT count(*) AS total FROM anchorscout_simulation_profiles");
    return { inserted, total: Number(count.rows[0].total) };
  });
}
