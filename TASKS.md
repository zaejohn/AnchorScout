# AnchorScout Tasks

## Completed

- [x] Research protocol-27 Stellar behavior, Wallets Kit v2, SEP-1, SEP-38, RPC, Horizon, bindings, and events
- [x] Finalize and document architecture, trust boundaries, state invariants, and durable decisions
- [x] Configure Next.js 16, TypeScript, Tailwind, dependencies, environment validation, tests, and GitHub Actions
- [x] Add StellarWalletsKit multi-wallet selection for Freighter, xBull, and LOBSTR with Testnet enforcement and reconnect/disconnect handling
- [x] Add XLM/asset balances, refresh/error states, and the reviewed classic XLM transaction lifecycle
- [x] Add validated route requests, configurable SEP-1/SEP-38 discovery, timeouts, failure isolation, normalization, expiration, and deterministic ranking
- [x] Remove fictional default providers; integrate live Coins.ph market depth and MoneyGram Testnet capability; implement a protected-only authenticated Coins.ph adapter; label fiat-step simulation explicitly
- [x] Add quote provenance, nullable missing fields, completeness-aware ranking, and provider-specific disclosures so incomplete data cannot receive a "Best" label
- [x] Deliver the responsive route-comparison, execution, utility, and history UI with loading/error/not-found states
- [x] Implement Route Registry and Settlement Receipt with authorization, bounded storage access, events, globally unique receipts, atomic cross-contract finalization, and negative tests
- [x] Build optimized WASM and generate versioned TypeScript contract bindings
- [x] Add wallet-signed route recording and settlement, contract-event polling/deduplication, and durable wallet-scoped history
- [x] Add Vercel Web Analytics and non-sensitive product events
- [x] Add repeatable PowerShell/Bash Testnet deployment scripts and GitHub Actions release gates
- [x] Pass web lint, typecheck, 78 provider/domain tests across 12 files, production build, 16 contract tests, and optimized contract builds
- [x] Complete specialist contract review and Testnet release re-review
- [x] Deploy both contracts and complete a real route → 0.1 XLM → receipt/finalization flow on Testnet
- [x] Verify the desktop and 390 px mobile route flow in-browser with no horizontal overflow
- [x] Add the public responsive landing page at `/` and preserve the complete route-comparison workflow at `/app`
- [x] Refactor `/app` into a guided wallet → request → compare → sign workflow with accessible navigation, progressive disclosure, stale-quote protection, and responsive proof/history states
- [x] Convert the route workflow into a sequential three-step wizard with focused step transitions, guarded navigation, back actions, and a confirmed completion state
- [x] Add capability-driven multi-quote providers, explicit MoneyGram cash pickup, bearer-protected and durably rate-limited firm Coins.ph registration, and explicit-Testnet-gated Onramper routes without synthetic provider cards
- [x] Record public network evidence and maintain 20 meaningful implementation commits before final documentation
- [x] Add authenticated cron-job.org endpoint, durable Postgres 17-minute scheduler, fenced leases, permanently reserved private profiles, resumable signed transaction checkpoints, retries and safe Google Form submission
- [x] Reuse shared provider/transaction code for real Friendbot, USDC trustline/live swap, route selection, XLM proof and atomic settlement; keep unavailable fiat settlement explicitly simulated
- [x] Pass lint, TypeScript, 208 web tests, production build and specialist app review; verify the production-built comparison UI and unauthorized cron rejection
- [x] Complete one real 1,685-USDC Testnet simulation through confirmed Google Form submission, verify app history, and verify persisted interval gating after process restart; export its consumed profile reservation for hosted import

## Human-controlled completion gates

- [ ] Configure managed Postgres and cron-job.org secrets; seed private profiles and import any local validation reservations before enabling hosted simulation.

- [ ] Connect a real browser wallet extension and capture connected-wallet, balance, rejection, and wallet-signed success screenshots. The available in-app browser has no installed Stellar wallet.
- [ ] Authenticate Vercel and deploy the production application. `vercel whoami` reports logged out; the CLI's anonymous temporary flow also failed before upload.
- [x] Push `main` to the configured GitHub remote and verify both jobs in [AnchorScout CI run #4](https://github.com/zaejohn/AnchorScout/actions/runs/32699582208)
- [ ] Run local RPC integration through Stellar Quickstart if Docker is installed. Contract unit and cross-contract tests already cover the local state transitions.
