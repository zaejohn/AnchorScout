import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createPostgresDatabase, seedProfiles } from "../src/lib/automation/store";
import { importValidationSnapshot } from "../src/lib/automation/validation-import";

async function main() {
  const envPath = resolve(process.cwd(), ".env.local");
  if (existsSync(envPath)) process.loadEnvFile(envPath);
  const database = createPostgresDatabase(process.env.DATABASE_URL ?? "");
  try {
    const schema = await readFile(resolve(process.cwd(), "src/lib/automation/schema.sql"), "utf8");
    const profiles: unknown = JSON.parse(await readFile(resolve(process.cwd(), "names_emails_feedback.json"), "utf8"));
    await database.query(schema);
    const result = await seedProfiles(database, profiles);
    const exportPath = resolve(process.cwd(), ".simulation/validation-export.json");
    if (existsSync(exportPath)) {
      await importValidationSnapshot(database, JSON.parse(await readFile(exportPath, "utf8")));
      console.log("Local validation reservations and schedule imported; profiles cannot be reused.");
    }
    console.log(`Simulation schema ready. Profiles inserted: ${result.inserted}; stored: ${result.total}. Existing reservations preserved.`);
  } finally {
    await database.close?.();
  }
}

main().catch(() => {
  // Driver errors can contain connection details or profile values; never print them.
  console.error("Simulation setup failed. Check DATABASE_URL, private profiles, and validation-export/master-key consistency. Keep cron disabled until setup succeeds.");
  process.exitCode = 1;
});
