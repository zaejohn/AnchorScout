import { existsSync } from "node:fs";
import { mkdir, open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import type { SqlConnection, SqlDatabase } from "../src/lib/automation/store";

async function main() {
  const envPath = resolve(process.cwd(), ".env.local");
  if (existsSync(envPath)) process.loadEnvFile(envPath);
  const local = process.argv.includes("--local");
  const directory = resolve(process.cwd(), ".simulation");
  await mkdir(directory, { recursive: true });
  const lockPath = resolve(directory, "validation.lock");
  // Do not allow a second local process to mutate the embedded database/export.
  // A crash leaves this small lock for explicit operator reconciliation.
  const lock = await open(lockPath, "wx", 0o600);
  let database: SqlDatabase | undefined;
  let initialized = false;
  const exportPath = resolve(directory, "validation-export.json");
  try {
    if (local && !process.env.SIMULATION_WALLET_KEY) {
      const keyPath = resolve(directory, "wallet-key");
      if (!existsSync(keyPath)) await writeFile(keyPath, randomBytes(32).toString("base64"), { flag: "wx", mode: 0o600 });
      process.env.SIMULATION_WALLET_KEY = (await readFile(keyPath, "utf8")).trim();
    }
    const { OFFICIAL_TESTNET_USDC_ISSUER } = await import("../src/lib/automation/security");
    process.env.TESTNET_USDC_ISSUER ||= OFFICIAL_TESTNET_USDC_ISSUER;
    process.env.NEXT_PUBLIC_TESTNET_USDC_ISSUER ||= process.env.TESTNET_USDC_ISSUER;
    // Imports below read environment at module initialization: keep after loading.
    const { createPostgresDatabase, seedProfiles, SimulationStore } = await import("../src/lib/automation/store");
    const { exportValidationSnapshot, importValidationSnapshot } = await import("../src/lib/automation/validation-import");
    const schema = await readFile(resolve(process.cwd(), "src/lib/automation/schema.sql"), "utf8");
    if (local) {
      const { PGlite } = await import("@electric-sql/pglite");
      const postgres = new PGlite(resolve(directory, "testnet-db"));
      const connection = (client: Pick<typeof postgres, "query">): SqlConnection => ({
        async query<T>(sql: string, values?: unknown[]) { return { rows: (await client.query(sql, values)).rows as T[] }; },
      });
      database = { ...connection(postgres), transaction: (work) => postgres.transaction((tx) => work(connection(tx))), close: () => postgres.close() };
      await postgres.exec(schema);
      console.log("Validation persistence: local durable PGlite. Deployment still requires DATABASE_URL and simulation:setup.");
    } else {
      database = createPostgresDatabase(process.env.DATABASE_URL ?? "");
      await database.query(schema);
      console.log("Validation persistence: configured Postgres database.");
    }
    await seedProfiles(database, JSON.parse(await readFile(resolve(process.cwd(), "names_emails_feedback.json"), "utf8")));
    if (existsSync(exportPath)) await importValidationSnapshot(database, JSON.parse(await readFile(exportPath, "utf8")));
    initialized = true;
    const store = new SimulationStore(database);
    const { runSimulation } = await import("../src/lib/automation/worker");
    const saveExport = async () => {
      await writeFile(`${exportPath}.tmp`, JSON.stringify(await exportValidationSnapshot(database!), null, 2), { mode: 0o600 });
      await rename(`${exportPath}.tmp`, exportPath);
    };
    const deadline = Date.now() + 10 * 60_000;
    while (Date.now() < deadline) {
      const result = await runSimulation(store);
      await saveExport();
      console.log(JSON.stringify(result));
      if (result.kind === "retry" || result.kind === "blocked") process.exitCode = 1;
      if (result.kind !== "running") return;
      await new Promise((done) => setTimeout(done, 5_000));
    }
    console.log("Validation time budget reached; durable run can be resumed by rerunning this command.");
  } finally {
    try {
      if (database && initialized) {
        const { exportValidationSnapshot } = await import("../src/lib/automation/validation-import");
        await writeFile(`${exportPath}.tmp`, JSON.stringify(await exportValidationSnapshot(database), null, 2), { mode: 0o600 });
        await rename(`${exportPath}.tmp`, exportPath);
      }
    } finally {
      await database?.close?.();
      await lock.close();
      await unlink(lockPath);
    }
  }
}

main().catch(() => {
  console.error("Validation stopped safely. Check configuration, network/database access, and .simulation/validation.lock. No private error payload is printed; reserved runs remain durable.");
  process.exitCode = 1;
});
