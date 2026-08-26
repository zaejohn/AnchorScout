import "server-only";
import { createHash, createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { Keypair } from "@stellar/stellar-sdk";

export const OFFICIAL_TESTNET_USDC_ISSUER = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

export function authorizeCron(header: string | null, secret = process.env.CRON_SECRET) {
  if (!secret || secret.length < 32 || !header) return false;
  return timingSafeEqual(createHash("sha256").update(header).digest(), createHash("sha256").update(`Bearer ${secret}`).digest());
}

export function simulationKey(id: string, master = process.env.SIMULATION_WALLET_KEY) {
  if (!master || !/^[A-Za-z0-9+/]{43}=$/.test(master) || Buffer.from(master, "base64").length !== 32) {
    throw new Error("SIMULATION_WALLET_KEY must be a 32-byte base64 key");
  }
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("Invalid simulation ID");
  // Only generated Testnet wallets: no real user's signing material is accepted.
  // A stable server-only master lets deployments resume without storing seeds.
  return Keypair.fromRawEd25519Seed(createHmac("sha256", Buffer.from(master, "base64"))
    .update(`AnchorScout:testnet-simulation:v1:${id}`).digest());
}

export function newSimulationIdentity() {
  const id = randomUUID();
  return { id, wallet: simulationKey(id).publicKey(), amount: String(randomInt(507, 1778)),
    routeId: randomBytes(32).toString("hex"), receiptId: randomBytes(32).toString("hex") };
}
