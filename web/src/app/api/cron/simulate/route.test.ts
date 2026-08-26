import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorizeCron: vi.fn(), simulationKey: vi.fn(), createPostgresDatabase: vi.fn(),
  status: vi.fn(), runSimulation: vi.fn(), close: vi.fn(),
}));
vi.mock("@/lib/automation/security", () => ({ authorizeCron: mocks.authorizeCron, simulationKey: mocks.simulationKey }));
vi.mock("@/lib/automation/store", () => ({
  createPostgresDatabase: mocks.createPostgresDatabase,
  SimulationStore: class { status = mocks.status; },
}));
vi.mock("@/lib/automation/worker", () => ({ runSimulation: mocks.runSimulation }));

import { GET, POST, dynamic, maxDuration, runtime } from "./route";

const request = (method = "POST", header = "Bearer test-only-secret") => new Request("https://anchorscout.example.invalid/api/cron/simulate", {
  method, headers: { authorization: header },
});

describe("protected simulation cron endpoint", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("DATABASE_URL", "postgres://test-only.invalid/database");
    mocks.authorizeCron.mockReturnValue(true);
    mocks.createPostgresDatabase.mockReturnValue({ close: mocks.close });
    mocks.close.mockResolvedValue(undefined);
    mocks.runSimulation.mockResolvedValue({ kind: "skipped", reason: "interval_not_due" });
    mocks.status.mockResolvedValue({ activeRun: null, remainingProfiles: 2 });
  });
  afterEach(() => vi.unstubAllEnvs());

  it("uses a bounded uncached Node endpoint", () => {
    expect(runtime).toBe("nodejs");
    expect(maxDuration).toBe(60);
    expect(dynamic).toBe("force-dynamic");
  });

  it.each([POST, GET])("rejects unauthorized calls before key, database, or worker access", async (handler) => {
    mocks.authorizeCron.mockReturnValue(false);
    const result = await handler(request());
    expect(result.status).toBe(401);
    expect(await result.json()).toEqual({ error: "Unauthorized" });
    expect(result.headers.get("Cache-Control")).toBe("no-store");
    expect(mocks.authorizeCron).toHaveBeenCalledExactlyOnceWith("Bearer test-only-secret");
    expect(mocks.simulationKey).not.toHaveBeenCalled();
    expect(mocks.createPostgresDatabase).not.toHaveBeenCalled();
    expect(mocks.runSimulation).not.toHaveBeenCalled();
  });

  it.each([POST, GET])("returns 503 for missing durable database rather than fallback storage", async (handler) => {
    vi.stubEnv("DATABASE_URL", "");
    expect((await handler(request())).status).toBe(503);
    expect(mocks.createPostgresDatabase).not.toHaveBeenCalled();
    expect(mocks.runSimulation).not.toHaveBeenCalled();
  });

  it("rejects invalid wallet-key configuration before a run can reserve a profile", async () => {
    mocks.simulationKey.mockImplementation(() => { throw new Error("private signing material"); });
    const result = await POST(request());
    expect(result.status).toBe(503);
    expect(JSON.stringify(await result.json())).not.toContain("private signing material");
    expect(mocks.createPostgresDatabase).not.toHaveBeenCalled();
    expect(mocks.runSimulation).not.toHaveBeenCalled();
  });

  it.each(["running", "completed", "retry", "skipped"])("returns successful cron acknowledgement for a %s result and closes its connection", async (kind) => {
    mocks.runSimulation.mockResolvedValue({ kind });
    const result = await POST(request());
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ kind });
    expect(mocks.runSimulation).toHaveBeenCalledTimes(1);
    expect(mocks.close).toHaveBeenCalledTimes(1);
  });

  it("reports a blocked run distinctly without treating it as completed", async () => {
    mocks.runSimulation.mockResolvedValue({ kind: "blocked", run: { blocked: "FORM_OUTCOME_REQUIRES_RECONCILIATION" } });
    const result = await POST(request());
    expect(result.status).toBe(409);
    expect(mocks.close).toHaveBeenCalledTimes(1);
  });

  it("sanitizes configuration and database errors while closing opened connections", async () => {
    mocks.runSimulation.mockRejectedValue(new Error("postgres://password@host/private-profile"));
    const result = await POST(request());
    expect(result.status).toBe(503);
    expect(JSON.stringify(await result.json())).not.toContain("password");
    expect(mocks.close).toHaveBeenCalledTimes(1);
  });

  it("GET only reports safe status and never starts a simulation", async () => {
    const result = await GET(request("GET"));
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ activeRun: null, remainingProfiles: 2 });
    expect(mocks.status).toHaveBeenCalledTimes(1);
    expect(mocks.runSimulation).not.toHaveBeenCalled();
    expect(mocks.close).toHaveBeenCalledTimes(1);
  });

  it("sanitizes status failures", async () => {
    mocks.status.mockRejectedValue(new Error("sensitive data"));
    const result = await GET(request("GET"));
    expect(result.status).toBe(503);
    expect(await result.json()).toEqual({ error: "Simulation status unavailable" });
    expect(mocks.close).toHaveBeenCalledTimes(1);
  });
});
