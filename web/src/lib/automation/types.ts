import type { AnchorQuote } from "../anchors/types";

export const SIMULATION_STATES = [
  "CREATED", "FUNDED", "SWAPPED", "ROUTES_COMPARED", "ROUTE_SELECTED",
  "PROOF_SIGNED", "COMPLETED", "FORM_SUBMITTED",
] as const;

export type SimulationState = (typeof SIMULATION_STATES)[number];
export type TransactionKind = "trustline" | "swap" | "execution" | "route" | "proof" | "receipt";
export type SimulationFormStatus = "NOT_SENT" | "SENDING" | "CONFIRMED" | "UNKNOWN";

export interface SimulationRun {
  id: string;
  profileId: string;
  wallet: string;
  amount: string;
  state: SimulationState;
  routeId: string;
  receiptId: string;
  quote?: AnchorQuote;
  quotes?: AnchorQuote[];
  pending?: { kind: TransactionKind; hash: string; xdr: string };
  failedTransactions?: { kind: TransactionKind; hash: string; outcome: "expired" | "failed" }[];
  hashes: Partial<Record<TransactionKind | "funding", string>>;
  formStatus: SimulationFormStatus;
  attempts: number;
  nextAttemptAt?: string;
  blocked?: string;
  error?: string;
  createdAt: string;
  history: { state: SimulationState; at: string }[];
}

export interface SimulationProfile {
  id: string;
  full_name: string;
  email: string;
  feedback: string | null;
}

export interface ProfileInput {
  full_name: string;
  email: string;
  feedback: string | null;
}

export interface NewSimulationIdentity {
  id: string;
  wallet: string;
  amount: string;
  routeId: string;
  receiptId: string;
}

export type SimulationClaim =
  | { kind: "claimed"; run: SimulationRun; token: string }
  | { kind: "skipped"; reason: string; nextRunAt?: string };

export interface SimulationStatus {
  lastRunAt: string | null;
  nextRunAt: string | null;
  remainingProfiles: number;
  activeRun: null | Pick<SimulationRun, "id" | "wallet" | "state" | "hashes" | "blocked" | "formStatus" | "nextAttemptAt">;
}
