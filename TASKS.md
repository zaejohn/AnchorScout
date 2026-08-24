# AnchorScout Tasks

## Phase 0 — Research and architecture

- [x] Validate current protocol-27, CLI, RPC, Horizon, Wallets Kit v2, SEP-1, SEP-38, bindings, and event APIs
- [x] Finalize product architecture and state invariants
- [x] Record durable decisions

## Phase 1 — Foundation

- [x] Confirm Next.js 16 App Router, TypeScript, Tailwind, lint, and production-build conventions
- [x] Initialize meaningful Git history
- [x] Add application dependencies, environment validation, and test scripts
- [ ] Add complete CI workflow

## Phase 2 — Wallet utility

- [ ] Add StellarWalletsKit v2 multi-wallet selection with Freighter and Testnet enforcement
- [ ] Add reconnect, disconnect, address display, and recoverable wallet errors
- [ ] Add balance API, XLM/asset balance display, refresh, and empty/failure states
- [ ] Add reviewed XLM payment flow with explicit transaction lifecycle and explorer evidence

## Phase 3 — Route comparison

- [ ] Add route request validation and typed quote model
- [ ] Add three demo adapters and configurable SEP-1/SEP-38 adapter
- [ ] Add concurrent provider isolation, timeouts, normalization, expiration, and deterministic ranking
- [ ] Add responsive route request and comparison UI

## Phase 4 — Contracts

- [ ] Implement and test Route Registry authorization, persistence, transitions, pagination, and events
- [ ] Implement and test Settlement Receipt persistence and events
- [ ] Verify actual cross-contract settlement finalization
- [ ] Build optimized WASM and generate TypeScript bindings

## Phase 5 — Settlement and synchronization

- [ ] Record selected quotes on-chain through the connected wallet
- [ ] Execute real Testnet XLM demo payment and record settlement outcome
- [ ] Poll and deduplicate contract events
- [ ] Load wallet-scoped durable contract history and receipts

## Phase 6 — Product polish and operations

- [ ] Add loading/error/not-found states and accessible mobile polish
- [ ] Add Vercel Web Analytics and non-sensitive product events
- [ ] Add repeatable Testnet deployment and smoke scripts
- [ ] Add Vercel configuration and deploy when authenticated
- [ ] Document public network identifiers, transaction evidence, and reviewer workflow

## Phase 7 — Final verification

- [ ] Pass web lint, typecheck, tests, and production build
- [ ] Pass Rust tests and Stellar contract build
- [ ] Complete contract and app specialist reviews
- [ ] Verify browser flow and public Testnet flow
- [ ] Confirm 15+ meaningful commits and update final evidence
