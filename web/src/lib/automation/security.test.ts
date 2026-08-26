import { randomBytes, randomUUID } from "node:crypto";
import { StrKey } from "@stellar/stellar-sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import { authorizeCron, newSimulationIdentity, simulationKey } from "./security";

afterEach(() => vi.unstubAllEnvs());

describe("simulation credential boundary", () => {
  it("accepts only the exact bearer token and rejects absent or weak configuration", () => {
    const secret = "s".repeat(32);
    expect(authorizeCron(`Bearer ${secret}`, secret)).toBe(true);
    for (const header of [null, "", secret, `bearer ${secret}`, `Bearer ${secret} `, `Bearer ${"x".repeat(5000)}`]) {
      expect(authorizeCron(header, secret)).toBe(false);
    }
    expect(authorizeCron("Bearer short", "short")).toBe(false);
    expect(authorizeCron(`Bearer ${secret}`, "")).toBe(false);
    vi.stubEnv("CRON_SECRET", secret);
    expect(authorizeCron(`Bearer ${secret}`)).toBe(true);
  });

  it("reproduces one run's wallet across restarts, with different keys for different runs and masters", () => {
    const master = randomBytes(32).toString("base64");
    const id = randomUUID();
    const first = simulationKey(id, master);
    expect(simulationKey(id, master).publicKey()).toBe(first.publicKey());
    expect(simulationKey(randomUUID(), master).publicKey()).not.toBe(first.publicKey());
    expect(simulationKey(id, randomBytes(32).toString("base64")).publicKey()).not.toBe(first.publicKey());
    const payload = Buffer.from("test-only challenge");
    expect(first.verify(payload, simulationKey(id, master).sign(payload))).toBe(true);
  });

  it("fails closed on missing, malformed, or wrong-length signing material and invalid run IDs", () => {
    const valid = randomBytes(32).toString("base64");
    vi.stubEnv("SIMULATION_WALLET_KEY", "");
    expect(() => simulationKey(randomUUID())).toThrow("32-byte base64 key");
    for (const master of ["", "secret", randomBytes(31).toString("base64"), randomBytes(33).toString("base64"), "!".repeat(43) + "="]) {
      expect(() => simulationKey(randomUUID(), master)).toThrow("32-byte base64 key");
    }
    for (const id of ["", "not-a-run", "../".repeat(12), "g".repeat(36)]) {
      expect(() => simulationKey(id, valid)).toThrow("Invalid simulation ID");
    }
  });

  it("creates independent public-only identities in the inclusive 507–1777 amount range", () => {
    vi.stubEnv("SIMULATION_WALLET_KEY", randomBytes(32).toString("base64"));
    const runs = Array.from({ length: 200 }, () => newSimulationIdentity());
    expect(new Set(runs.map((run) => run.wallet)).size).toBe(runs.length);
    expect(new Set(runs.map((run) => run.id)).size).toBe(runs.length);
    expect(new Set(runs.map((run) => run.amount)).size).toBeGreaterThan(1);
    for (const run of runs) {
      expect(StrKey.isValidEd25519PublicKey(run.wallet)).toBe(true);
      expect(Number(run.amount)).toBeGreaterThanOrEqual(507);
      expect(Number(run.amount)).toBeLessThanOrEqual(1777);
      expect(Number.isInteger(Number(run.amount))).toBe(true);
      expect(run.routeId).toMatch(/^[a-f0-9]{64}$/);
      expect(run.receiptId).toMatch(/^[a-f0-9]{64}$/);
      expect(run.routeId).not.toBe(run.receiptId);
      expect(Object.keys(run).sort()).toEqual(["amount", "id", "receiptId", "routeId", "wallet"]);
    }
  });
});
