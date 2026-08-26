import { authorizeCron, simulationKey } from "@/lib/automation/security";
import { createPostgresDatabase, SimulationStore } from "@/lib/automation/store";
import { runSimulation } from "@/lib/automation/worker";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

function response(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

// cron-job.org: POST each minute; database controls new starts every 17 minutes.
export async function POST(request: Request) {
  if (!authorizeCron(request.headers.get("authorization"))) return response({ error: "Unauthorized" }, 401);
  if (!process.env.DATABASE_URL) return response({ error: "Simulation database is not configured" }, 503);
  let database: ReturnType<typeof createPostgresDatabase> | undefined;
  try {
    simulationKey("00000000-0000-0000-0000-000000000000"); // Validate master before reserving a profile.
    database = createPostgresDatabase(process.env.DATABASE_URL);
    const result = await runSimulation(new SimulationStore(database));
    return response(result, result.kind === "blocked" ? 409 : 200);
  } catch {
    return response({ error: "Simulation unavailable; check database, migration, key and Testnet configuration" }, 503);
  } finally {
    await database?.close?.();
  }
}

export async function GET(request: Request) {
  if (!authorizeCron(request.headers.get("authorization"))) return response({ error: "Unauthorized" }, 401);
  if (!process.env.DATABASE_URL) return response({ error: "Simulation database is not configured" }, 503);
  const database = createPostgresDatabase(process.env.DATABASE_URL);
  try { return response(await new SimulationStore(database).status()); }
  catch { return response({ error: "Simulation status unavailable" }, 503); }
  finally { await database.close?.(); }
}
