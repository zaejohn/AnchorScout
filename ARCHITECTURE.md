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

- Server Components render the static application shell and product metadata.
- A focused Client Component owns wallet selection, balance refresh, forms, countdowns, signatures, transaction lifecycle, event polling, and user feedback.
- `POST /api/quotes` validates untrusted input, runs providers concurrently with per-provider timeouts, normalizes responses, filters expired/malformed quotes, and ranks deterministically.
- `GET /api/stellar/account/:address` reads public Testnet balances from Horizon.
- Provider implementations are server-only. Demo adapters use the same interface as a configurable SEP-38 adapter and are labeled as demos in every response.
- Contract bindings are generated from built WASM into `web/src/lib/stellar/generated/` and wrapped by small browser adapters.

## Anchor provider strategy

The default registry contains three deterministic Testnet/demo providers. This makes route comparison reliable without pretending that production PHP payout liquidity exists. A configurable SEP-38 provider can be enabled by server-only environment variables and discovers `ANCHOR_QUOTE_SERVER` through SEP-1 over HTTPS.

One provider failure or timeout is returned as provider health metadata and never cancels successful quotes. Firm authenticated SEP-38 quotes, SEP-24 deposit flows, SEP-31 cross-border payments, real bank payouts, and KYC are explicitly outside this MVP.

## Contracts

### Route Registry

- Constructor stores the administrator.
- The administrator configures the Settlement Receipt contract address.
- `create_route` requires the route user's authorization, rejects duplicate IDs and invalid values, persists one route per key, writes a paginated per-user index, and emits `route_selected`.
- `finalize_route` requires authorization by the configured Settlement Receipt contract and only permits `Pending -> Completed|Failed`.
- Durable records use persistent storage with bounded TTL extension; global configuration uses instance storage.

### Settlement Receipt

- Constructor stores the Route Registry address.
- `record_outcome` requires the route user's authorization, verifies the route owner with the registry, prevents duplicate settlement, stores a durable receipt, and calls `RouteRegistry.finalize_route` in the same atomic transaction.
- The nested call is the required inter-contract communication. Any failure rolls back both contracts.

## State invariants

1. A route ID and settlement receipt are unique.
2. Only the route owner can create the route and authorize its settlement outcome.
3. Only the configured Settlement Receipt contract can finalize a route.
4. A route can transition exactly once from `Pending` to `Completed` or `Failed`.
5. A receipt's user must equal the stored route owner.
6. Source and destination amounts are positive; fees are non-negative; stored text is non-empty and bounded.
7. Quote selection requires complete comparison data and an unexpired `AVAILABLE` quote.
8. Submitted transactions are not shown as confirmed until Horizon or RPC confirms them.

## Transaction lifecycle

Classic payments use `preparing -> awaiting_signature -> submitted -> confirmed|failed|rejected` through Horizon. Contract calls add simulation before signing and use RPC polling until a terminal ledger result. Wrong network, wallet absence, rejection, insufficient balance, simulation errors, submission errors, and confirmation timeout are recoverable UI states.

## Event and history synchronization

The application polls RPC `getEvents` for both deployed contract IDs, overlaps the last scanned ledger, and deduplicates by event ID. Events trigger a durable contract-history refresh. Event retention is not treated as permanent storage: wallet history is rebuilt from the Route Registry's paginated user index and receipt reads.

## Environment and trust boundaries

- The browser is untrusted and receives only public Testnet URLs, passphrase, asset metadata, and contract IDs.
- Wallet secret material never enters application code or server routes.
- Anchor URLs and timeouts are server configuration; responses are validated before reaching the UI.
- Testnet deployment identities remain in Stellar CLI's local key store and are never committed.
- Mainnet configuration and deployment are intentionally absent.

## Testing and promotion

- Vitest covers request validation, normalization, ranking, expiration, provider failure isolation, and transaction-state error mapping.
- Rust tests cover authorization requirements, route creation, duplicates, invalid input/state, settlement success/failure, receipt uniqueness, events, and cross-contract finalization.
- Local contract tests and optimized WASM builds precede Testnet deployment.
- Docker is not available in this workstation, so a local Quickstart network smoke test is recorded as unavailable; Testnet is the real network integration gate.
- CI runs lint, typecheck, frontend tests, Next.js production build, Rust tests, and `stellar contract build`.

