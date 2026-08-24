# AnchorScout Tasks

## Completed

- [x] Research protocol-27 Stellar behavior, Wallets Kit v2, SEP-1, SEP-38, RPC, Horizon, bindings, and events
- [x] Finalize and document architecture, trust boundaries, state invariants, and durable decisions
- [x] Configure Next.js 16, TypeScript, Tailwind, dependencies, environment validation, tests, and GitHub Actions
- [x] Add StellarWalletsKit multi-wallet selection for Freighter, xBull, and LOBSTR with Testnet enforcement and reconnect/disconnect handling
- [x] Add XLM/asset balances, refresh/error states, and the reviewed classic XLM transaction lifecycle
- [x] Add validated route requests, three demo adapters, configurable SEP-1/SEP-38 discovery, timeouts, failure isolation, normalization, expiration, and deterministic ranking
- [x] Deliver the responsive route-comparison, execution, utility, and history UI with loading/error/not-found states
- [x] Implement Route Registry and Settlement Receipt with authorization, bounded storage access, events, globally unique receipts, atomic cross-contract finalization, and negative tests
- [x] Build optimized WASM and generate versioned TypeScript contract bindings
- [x] Add wallet-signed route recording and settlement, contract-event polling/deduplication, and durable wallet-scoped history
- [x] Add Vercel Web Analytics and non-sensitive product events
- [x] Add repeatable PowerShell/Bash Testnet deployment scripts and GitHub Actions release gates
- [x] Pass web lint, typecheck, 69 tests across 11 files, production build, 16 contract tests, and optimized contract builds
- [x] Complete specialist contract review and Testnet release re-review
- [x] Deploy both contracts and complete a real route → 0.1 XLM → receipt/finalization flow on Testnet
- [x] Verify the desktop and 390 px mobile route flow in-browser with no horizontal overflow
- [x] Record public network evidence and maintain 20 meaningful implementation commits before final documentation

## Human-controlled completion gates

- [ ] Connect a real browser wallet extension and capture connected-wallet, balance, rejection, and wallet-signed success screenshots. The available in-app browser has no installed Stellar wallet.
- [ ] Authenticate Vercel and deploy the production application. `vercel whoami` reports logged out; the CLI's anonymous temporary flow also failed before upload.
- [ ] Push the configured GitHub remote and observe the included GitHub Actions workflow. The same workflow gates have passed locally; GitHub CLI authentication is unavailable on this workstation.
- [ ] Run local RPC integration through Stellar Quickstart if Docker is installed. Contract unit and cross-contract tests already cover the local state transitions.
