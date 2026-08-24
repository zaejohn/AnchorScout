# AnchorScout Architecture

## System shape

AnchorScout is a hybrid Next.js dApp. Next.js 16 App Router provides the public UI and server-side Anchor aggregation. User-controlled wallets sign every payment and contract transaction. Two protocol-27 Stellar contracts own route and settlement state on Testnet.

No database, separate backend, custody layer, or production-fiat system is required for the MVP.

```text
Browser wallet + interactive UI
  |-- classic XLM payment ----------------------> Horizon / Testnet
  |-- signed contract transactions ------------> Stellar RPC / Testnet
  `-- validated route request -----------------> Next.js Route Handler
                                                   `-> parallel Anchor adapters

Settlement Receipt contract --finalize_route--> Route Registry contract
          |                                            |
          `------------- contract events --------------'
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

An authenticated Coins.ph adapter is implemented and tested for a future protected deployment. It requests a firm Convert quote and combines it with account-scoped `support-channel` fee, limit, status, and rail data without accepting the quote or initiating cash-out. It is deliberately not registered on the public `/api/quotes` endpoint: exposing a business TRADE key through an anonymous proxy would leak account-scoped availability and permit quota abuse. Activating it requires a real user/tenant authorization boundary and durable rate limiting.

MoneyGram's real Testnet SEP-1 and SEP-24 endpoints are checked for Testnet USDC capability and limits. MoneyGram exposes a hosted cash route rather than PHP bank/GCash or SEP-38 pricing, so the composite card attributes its PHP rate to Coins.ph and marks only the unsupported fiat payout as simulated. A configurable generic SEP-38 provider remains available through server-only environment variables.

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
- The referenced classic transaction hash is user-attested. The application confirms it through Horizon before requesting the receipt signature, but the contract cannot inspect historical classic transactions. The receipt proves the user's attestation and atomic two-contract finalization, not independent payment verification.

## State invariants

1. Route IDs and receipt IDs are globally unique within their contracts.
2. Only the route owner can create the route and authorize its settlement outcome.
3. Only the configured Settlement Receipt contract can finalize a route.
4. A route can transition exactly once from `Pending` to `Completed` or `Failed`.
5. A receipt's user must equal the stored route owner.
6. Source and destination amounts are positive; fees are non-negative; stored text is non-empty and bounded.
7. Quote selection requires an unexpired `AVAILABLE` quote. A "Best" label additionally requires complete fee and numeric timing data.
8. Submitted transactions are not shown as confirmed until Horizon or RPC confirms them.
9. A receipt's classic transaction hash is a wallet-authorized reference; clients must verify it with Horizon before presenting payment confirmation.

## Transaction lifecycle

Classic payments use `preparing -> awaiting_signature -> submitted -> confirmed|failed|rejected` through Horizon. Contract calls add simulation before signing and use RPC polling until a terminal ledger result. Wrong network, wallet absence, rejection, insufficient balance, simulation errors, submission errors, and confirmation timeout are recoverable UI states.

## Event and history synchronization

The application polls RPC `getEvents` for both deployed contract IDs, overlaps the last scanned ledger, and deduplicates by event ID. Events trigger a durable contract-history refresh. Event retention is not treated as permanent storage: wallet history is rebuilt from the Route Registry's paginated user index and receipt reads.

## Environment and trust boundaries

- The browser is untrusted and receives only public Testnet URLs, passphrase, asset metadata, and contract IDs.
- Wallet secret material never enters application code or server routes.
- Anchor URLs, provider credentials, request signing, and timeouts are server-only; responses are schema-validated before reaching the UI.
- Testnet deployment identities remain in Stellar CLI's local key store and are never committed.
- Mainnet configuration and deployment are intentionally absent.

## Testing and promotion

- Vitest covers request validation, normalization, incomplete-data ranking, expiration, live-depth math, authenticated request handling, MoneyGram capability composition, provider failure isolation, and transaction-state error mapping.
- Rust tests cover authorization requirements, route creation, duplicates, invalid input/state, settlement success/failure, receipt uniqueness, events, and cross-contract finalization.
- Local contract tests and optimized WASM builds precede Testnet deployment.
- Docker is not available in this workstation, so a local Quickstart network smoke test is recorded as unavailable; Testnet is the real network integration gate.
- CI runs lint, typecheck, frontend tests, Next.js production build, Rust tests, and `stellar contract build`.
