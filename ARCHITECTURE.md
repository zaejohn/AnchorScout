# AnchorScout Architecture

## System shape

AnchorScout is a hybrid Next.js dApp. Next.js 16 App Router provides the public UI and server-side Anchor aggregation. A user-controlled wallet approves one atomic Route Executor transaction; three protocol-27 Stellar contracts coordinate route state, the native-XLM proof, and receipt state on Testnet.

The interactive MVP remains wallet-controlled and stateless off-chain. The opt-in Testnet simulation adds Postgres persistence for profiles, run checkpoints, scheduling and leases; it does not add production fiat execution or custody of real-user wallets.

```text
Browser wallet + interactive UI
  |-- one signed executor transaction ----------> Stellar RPC / Testnet
  |-- optional Send XLM utility ----------------> Horizon / Testnet
  `-- validated route request -----------------> Next.js Route Handler
                                                   `-> parallel Anchor adapters

Route Executor --> Route Registry + native XLM SAC + Settlement Receipt
                                               `-------> Route Registry finalization
                              |
                     polling + durable reads
                              |
                         route history UI
```

## Application boundaries

- The public `/` route is a server-rendered product landing page. It explains the comparison model and links into `/app` without importing wallet code or adding client state.
- The executable `/app` route renders the existing client-heavy AnchorScout workflow and keeps wallet, balance, forms, countdowns, signatures, transaction lifecycle, event polling, and user feedback together.
- A focused Client Component owns wallet selection, balance refresh, forms, countdowns, signatures, transaction lifecycle, event polling, and user feedback.
- `POST /api/quotes` validates untrusted input, runs providers concurrently with per-provider timeouts, normalizes responses, filters expired/malformed quotes, and ranks deterministically.
- `GET /api/stellar/account/:address` reads public Testnet balances from Horizon.
- Provider implementations and credentials are server-only. The browser receives normalized, attributed provider evidence and never calls privileged provider APIs directly.
- Contract bindings are generated from built WASM into `web/src/lib/stellar/generated/` and wrapped by small browser adapters.

## Anchor provider strategy

The default registry contains no invented providers. It calls the public Coins.ph exchange API for live `XLMPHP` or `USDCPHP` trading status and bid-side order-book depth, then values the requested amount against visible liquidity. This is labeled `MARKET_REFERENCE`; its gross PHP result never claims that a Convert quote, payout fee, or bank/GCash settlement is available.

An authenticated Coins.ph adapter requests a firm Convert quote and combines it with account-scoped `support-channel` fee, limit, status, and rail data without accepting the quote or initiating cash-out. Anonymous requests always use public market data. A trusted server caller must present a dedicated bearer token, then a durable Postgres per-minute limiter authorizes the account-scoped path; complete Coins.ph credentials activate a firm-first adapter with public-market fallback. Partial configuration remains public-market-only. Provider credentials and the access token never enter the client bundle.

MoneyGram's real Testnet SEP-1 and SEP-24 endpoints are checked for Testnet USDC capability and limits. MoneyGram is eligible only for the explicit `CASH_PICKUP` rail; it never appears as bank or GCash. Its composite card attributes the PHP reference to Coins.ph and describes the hosted SEP-24/KYC boundary. A configurable generic SEP-38 provider remains available only for the bank-oriented SEP-31 comparison context.

The optional Onramper adapter is registered only with a server-side API key and at least one provider-issued asset ID that explicitly identifies Stellar Testnet and the requested asset. It performs the current provider-prescribed `/supported/assets` → payment methods → quotes sequence on every comparison and requests transaction-initiation-capable sell quotes for the Philippines. Each successful underlying provider response becomes its own normalized quote; Mainnet/generic assets and blocked/error/empty entries never become cards. Staging and production base URLs are fixed by an environment enum, not caller input.

Every normalized quote carries `quoteKind`, `settlementMode`, rate/fee/availability sources, provider URL, and disclosures. Missing fee or numeric timing stays nullable; such a route can be inspected and selected for the separate Testnet proof but can never be labeled "Best." One provider failure, unsupported corridor, or timeout is health metadata and never cancels other results.

## Contracts

### Route Registry

- Constructor stores the administrator.
- The administrator configures the Settlement Receipt contract address exactly once; it cannot be rotated through the public interface.
- `create_route` requires the route user's authorization, rejects duplicate IDs and invalid values, persists one route per key, writes a paginated per-user index, and emits `route_selected`.
- `finalize_route` requires authorization by the configured Settlement Receipt contract and only permits `Pending -> Completed|Failed`.
- Durable records use persistent storage with bounded TTL extension; global configuration uses instance storage.

### Settlement Receipt

- Constructor stores the Route Registry address.
- `record_outcome` requires the route user's authorization, verifies the route owner with the registry, prevents duplicate settlement, stores a durable receipt, and calls `RouteRegistry.finalize_route` in the same atomic transaction.
- The nested call is the required inter-contract communication. Any failure rolls back both contracts.
- Its legacy hash field stores zero for executor-driven records because a contract cannot know its outer transaction hash while running. RPC `route_executed` evidence supplies the canonical outer hash.

### Route Executor

- Constructor immutably stores the configured registry, settlement contract, native XLM SAC, and proof destination.
- `execute_route` requires the route user's authorization, creates the route, transfers exactly 0.1 XLM, records the receipt, and finalizes the route in one Soroban invocation tree.
- Any nested failure rolls back route state, receipt state, and the token transfer. Clients verify the full on-chain configuration before preparing or automating a transaction.
- The stored source amount and external PHP route are comparison evidence only. The atomic transfer proves the separate 0.1 XLM Testnet action; it does not execute the quoted provider payout.

## State invariants

1. Route IDs and receipt IDs are globally unique within their contracts.
2. Only the route owner can create the route and authorize its settlement outcome.
3. Only the configured Settlement Receipt contract can finalize a route.
4. A route can transition exactly once from `Pending` to `Completed` or `Failed`.
5. A receipt's user must equal the stored route owner.
6. Source and destination amounts are positive; fees are non-negative; stored text is non-empty and bounded.
7. Quote selection requires an unexpired `AVAILABLE` quote. A "Best" label additionally requires complete fee and numeric timing data. The committed quote hash binds the payout method as well as provider, amounts, fee, quote ID, and expiry.
8. Submitted transactions are not shown as confirmed until RPC confirms them.
9. Only a successful `route_executed` event is presented as atomic proof; older payment/receipt records are explicitly legacy evidence.

## Transaction lifecycle

The route proof uses `simulating -> awaiting_signature -> submitted -> confirmed|failed|rejected` through RPC with exactly one wallet approval. The optional Send XLM utility remains a classic Horizon payment. Wrong network, wallet absence, rejection, insufficient balance, simulation errors, submission errors, and confirmation timeout are recoverable UI states.

## Event and history synchronization

The application polls RPC `getEvents` for all deployed contract IDs, overlaps the last scanned ledger, and deduplicates by event ID. Events trigger a durable contract-history refresh. Event retention is not treated as permanent storage: wallet history is rebuilt from the Route Registry's paginated user index and receipt reads. New records use the successful executor event's outer hash; History renders exactly one Stellar Expert Testnet link. Older three-transaction records retain one labeled legacy link.

## Environment and trust boundaries

- The browser is untrusted and receives only public Testnet URLs, passphrase, asset metadata, and contract IDs.
- Real-user wallet secret material never enters application code or server routes. The authenticated simulation worker derives only its own disposable Testnet keys from a server-only master and run UUID; no seed is stored in the database or returned by an endpoint.
- Anchor URLs, provider credentials, request signing, and timeouts are server-only; responses are schema-validated before reaching the UI.
- Testnet deployment identities remain in Stellar CLI's local key store and are never committed.
- Mainnet configuration and deployment are intentionally absent.

## Testing and promotion

- Vitest covers request validation, normalization, incomplete-data ranking, expiration, live-depth math, authenticated request handling, MoneyGram capability composition, provider failure isolation, and transaction-state error mapping.
- Rust tests cover authorization requirements, route creation, duplicates, invalid input/state, settlement success/failure, receipt uniqueness, events, and cross-contract finalization.
- Local contract tests and optimized WASM builds precede Testnet deployment.
- Docker is not available in this workstation, so a local Quickstart network smoke test is recorded as unavailable; Testnet is the real network integration gate.
- CI runs lint, typecheck, frontend tests, Next.js production build, Rust tests, and `stellar contract build`.
