# Decisions

## 2026-08-24 — Keep authoritative history on-chain

- Context: RPC event retention is bounded, but route history must remain verifiable.
- Decision: Store route records, per-user paginated indexes, and settlement receipts in persistent contract storage. Use events only as near-real-time invalidation signals.
- Why: This preserves durable history without adding a database or indexer.
- Consequences: History reads use contract simulation and cap each page at 20 records.
- Revisit when: Traffic or history depth justifies a dedicated indexer.

## 2026-08-24 — Use reliable demo routes by default

- Context: Public Testnet SEP-38/PHP payout providers are not reliable enough to be a hard application dependency.
- Decision: Ship three clearly labeled demo adapters behind the production provider interface, plus one configurable server-only SEP-1/SEP-38 adapter.
- Why: The MVP demonstrates normalization, ranking, expiry, isolation, and selection without making fake production-liquidity claims.
- Consequences: Demo settlement is real Testnet Stellar activity, not a real PHP payout.
- Revisit when: A partner supplies a Testnet SEP-38 endpoint and its authentication requirements.

## 2026-08-24 — User-authorized two-transaction settlement

- Context: AnchorScout must not hold funds or sign for users.
- Decision: The user first records route selection, performs a wallet-signed Testnet XLM payment, then signs `record_outcome`. Settlement Receipt atomically finalizes Route Registry through a cross-contract call.
- Why: It proves the complete lifecycle while preserving wallet authority and avoiding server custody.
- Consequences: A route may remain pending if the user stops before the final receipt transaction; the UI offers recovery from pending state.
- Revisit when: A real SEP-24/SEP-31 provider supplies a callback or claimable settlement primitive.

## 2026-08-24 — No off-chain database

- Context: The specification does not require identities beyond wallet ownership, private user data, or long-lived off-chain workflow state.
- Decision: Use Next.js server routes for stateless aggregation and Stellar contracts for authoritative route state.
- Why: This is the smallest architecture satisfying the product.
- Consequences: Provider health is request-scoped and route analytics remain aggregate Vercel Analytics events.
- Revisit when: Webhook reconciliation or multi-device non-chain drafts are introduced.

## 2026-08-24 — Testnet replaces unavailable local Quickstart smoke

- Context: Stellar CLI and Rust are installed, but Docker is unavailable on this workstation.
- Decision: Require contract unit/cross-contract tests and WASM builds locally, then run the actual deployment and integration smoke on Stellar Testnet.
- Why: Installing Docker is a human/system action and not required to validate the public MVP network.
- Consequences: `NETWORKS.md` must state that the local network smoke was unavailable rather than claiming it ran.
- Revisit when: Docker or another local Quickstart runtime is installed.

## 2026-08-24 — Classic payment references are user-attested

- Context: Soroban contracts cannot query historical classic transactions by hash.
- Decision: The browser waits for Horizon-confirmed payment inclusion before asking the same wallet to authorize a Settlement Receipt containing that transaction hash. The contract validates wallet ownership and finalizes both contract records atomically, but does not claim independent verification of the classic payment.
- Why: Adding a trusted oracle or custodial server signer would violate the MVP's simplicity and wallet-authority boundary.
- Consequences: UI and documentation call the hash a confirmed-by-client, user-attested reference. Verifiers should follow the public explorer link.
- Revisit when: Settlement moves to an atomic SAC transfer or a governed attestation oracle is intentionally introduced.
