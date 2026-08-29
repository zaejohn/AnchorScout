# AnchorScout

[![AnchorScout CI](https://github.com/zaejohn/AnchorScout/actions/workflows/ci.yml/badge.svg)](https://github.com/zaejohn/AnchorScout/actions/workflows/ci.yml)

AnchorScout is a non-custodial Stellar Testnet route-comparison dApp. It compares normalized external provider data, distinguishes firm quotes from market references, records a selected route on Soroban, and completes a separate real XLM proof flow with public receipt evidence.

The product solves a simple problem: payment routes expose different rates, fees, speed, and availability, but those differences are hard to compare consistently. AnchorScout isolates each provider behind one adapter interface, validates and normalizes responses server-side, and never invents a missing fee, settlement time, or provider capability. Incomplete routes remain visible and attributed but cannot receive a "Best" badge.

## Evidence at a glance

![Desktop route comparison](docs/evidence/desktop-route-comparison.png)

| Wallet selection | Mobile route comparison |
| --- | --- |
| ![Stellar Wallets Kit options](docs/evidence/wallet-options.png) | ![390 pixel mobile layout](docs/evidence/mobile-route-comparison.png) |

The screenshots are from the locally running production-shaped application. Public Testnet transactions below provide the authoritative route/payment/receipt evidence. A connected extension wallet screenshot remains a physical-browser step because the available verification browser has no Stellar wallet installed.

## How it works

1. Connect Freighter, xBull, or LOBSTR through Stellar Wallets Kit on Testnet.
2. Load XLM and configured asset balances from Horizon.
3. Submit a validated route request to the Next.js backend.
4. Query Coins.ph live market data, MoneyGram Testnet capability, and any configured SEP-38 endpoint concurrently.
5. Normalize provenance, missing fields, expiry, settlement mode, and deterministic ranking.
6. Approve one Route Executor invocation with the user's wallet.
7. In that one atomic transaction, record the route, transfer the 0.1 XLM Testnet proof through the native XLM SAC, and finalize the receipt.
8. Poll contract events and reload durable contract-backed history with one canonical Stellar Expert link.

AnchorScout never holds funds, requests secret keys, accepts a production provider quote, or signs for users. The external PHP payout remains simulated on Testnet and is explicitly separate from the 0.1 XLM proof transfer. `route_executed` is the canonical atomic-proof event; older multi-transaction records remain labeled legacy.

## Routes

- `/` — public landing page explaining the route-comparison model, provider attribution, and Stellar proof layer.
- `/app` — the complete AnchorScout workflow: connect a wallet, enter transfer details, compare providers, select a route, sign, and track the result.

The landing page is intentionally server-rendered and has no wallet state. Its route preview is labeled illustrative; the `/app` comparison cards are the source of live provider data and disclosures.

## Architecture

```text
Browser wallet + responsive client
        │
        ├── Next.js Route Handlers ── provider registry ── Coins.ph / MoneyGram / SEP-38
        │                                  │
        │                                  └── normalization + deterministic ranking
        │
        ├── Horizon ── balances and classic Send XLM utility
        │
        └── Stellar RPC ── simulation, wallet signing, contract submission, events
                                  │
                    Route Executor contract
                      │      │       │
                      │      │       └── native XLM SAC transfer
                      │      └── Settlement Receipt contract
                      └── Route Registry contract
```

- `web/src/lib/anchors/`: request schema, provider interface, adapters, normalization, ranking, and tests
- `web/src/lib/stellar/`: Testnet config, Wallets Kit, retry-safe classic/contract lifecycles, generated-contract wrappers, and history synchronization
- `web/src/app/api/`: quote, account, event, transaction-status, and history boundaries
- `contracts/route-registry/`: wallet-owned route records and final-state transitions
- `contracts/settlement-receipt/`: globally unique receipts and authenticated cross-contract finalization
- `contracts/route-executor/`: one-approval orchestration and atomic native-XLM proof transfer
- `web/src/lib/stellar/generated/`: generated TypeScript bindings from deployed contract specs

See `ARCHITECTURE.md` for boundaries and invariants and `DECISIONS.md` for durable design choices.

## Setup

### Requirements

- Node.js 22+
- pnpm 11+
- Rust 1.96+ with `wasm32v1-none`
- Stellar CLI 27+
- Docker only if local Quickstart RPC testing is desired

### Install and run

```powershell
cd web
Copy-Item .env.example .env.local
pnpm install --frozen-lockfile
pnpm dev
```

Set these public Testnet values in `web/.env.local`:

```dotenv
NEXT_PUBLIC_STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
NEXT_PUBLIC_STELLAR_RPC_URL=https://soroban-testnet.stellar.org
NEXT_PUBLIC_ROUTE_REGISTRY_CONTRACT_ID=CBYCCXCJLFQKUIPNJDQNXXIGV26S4FSXGHRYQQBPU3EYUGE6EXRRDZ5H
NEXT_PUBLIC_SETTLEMENT_RECEIPT_CONTRACT_ID=CBQKALTRUEBNTDOKL7UOOSEFPJMHZRQCWV5C6VZA4T3TO4WEB2OIBDJM
NEXT_PUBLIC_ROUTE_EXECUTOR_CONTRACT_ID=CAFKJQJGL4U3LAGEGXARMHGURTQUUCJYSRBKMZC7AI3JXMQHUZW2BIQH
NEXT_PUBLIC_PROOF_PAYMENT_DESTINATION=GDW2INHQPIWK6JYMVDPCT3JZHMBSYPDEWB56PCRC2JSXADAF22VF253M
```

No provider credential is required for live Coins.ph `XLMPHP`/`USDCPHP` market-reference results or MoneyGram Testnet capability checks. The public market adapter values the requested amount against the bid-side order book, so visible-depth slippage is included.

The authenticated Coins.ph adapter requests a firm Convert quote and live `support-channel` fee, status, limits, and eligible rail. Anonymous `/api/quotes` requests always stay on the public market adapter. A trusted server caller may send `Authorization: Bearer <COINS_PH_QUOTE_ACCESS_TOKEN>`; only then, with `COINS_PH_FIRM_QUOTES_ENABLED=true` and both Coins.ph credentials, does the registry prefer the authenticated quote and safely fall back to the public market if it is unavailable. `DATABASE_URL` provides the durable per-minute abuse limit configured by `COINS_PH_QUOTE_RATE_LIMIT_PER_MINUTE`. Bank requests additionally require `COINS_PH_BANK_SUBJECT`. The adapter never accepts the quote or calls cash-out, and its bearer token must never be shipped to browser code.

Run `pnpm simulation:setup` after deploying this change so the existing database also receives the idempotent `anchorscout_provider_quote_limits` table used by that access boundary.

Onramper is registered only when `ONRAMPER_API_KEY` and at least one provider-issued `ONRAMPER_XLM_TESTNET_ASSET_ID` or `ONRAMPER_USDC_TESTNET_ASSET_ID` explicitly identify Stellar Testnet. For every request it calls the current `/supported/assets` sell endpoint, verifies the exact configured asset and PHP destination, discovers the requested bank/GCash payment method, and then calls the live quote endpoint. Only successful quote entries become route cards; error, blocked, generic/Mainnet-USDC, unsupported-payment, and empty responses remain unavailable. Use `ONRAMPER_ENVIRONMENT=staging` or `production` with the matching key and asset IDs supplied for that environment. Onramper's sandbox does not itself prove Testnet transaction support, so do not invent an ID.

Optional `SEP38_ANCHOR_HOME_DOMAIN` and `SEP38_ANCHOR_NAME` enable a real indicative SEP-38 provider. The adapter discovers `ANCHOR_QUOTE_SERVER` through SEP-1, requires HTTPS, and only calls the home origin or origins explicitly listed in `SEP38_ALLOWED_QUOTE_ORIGINS`.

## Provider and test-environment status

| Provider | Data used now | Test environment | AnchorScout behavior |
| --- | --- | --- | --- |
| Coins.ph | Live public market status and bid depth, or trusted account-scoped firm quote and payout-channel data | No public end-to-end Stellar/fiat sandbox documented | Anonymous traffic remains public-market-only; firm access is bearer-protected and durably rate-limited; conversion and fiat execution are never initiated |
| MoneyGram Ramps | Live Testnet SEP-1 and SEP-24 USDC cash-pickup capability/limits | Yes: Stellar Testnet anchor | Appears only for Test USDC + Cash pickup; PHP reference remains separately attributed to Coins.ph |
| Configured SEP-38 anchor | Live SEP-1 discovery and `/price` response | Provider-specific | Indicative, comparison-only unless the provider supplies a compatible endpoint |
| Onramper | Credentialed dynamic asset/payment/quote discovery | Staging exists, but it is not proof of Stellar Testnet transaction support | Registers only with an explicit provider-issued Stellar Testnet asset ID and emits only real successful quotes for that exact corridor |
| TransFi | Not enabled | Credentialed sandbox exists | Excluded because the public matrix lists Stellar XLM/USDC as payout-only, not direct off-ramp deposits |

Primary sources: [Coins.ph REST API](https://docs.coins.ph/rest-api/), [Coins.ph Business](https://www.coins.ph/en-ph/business), [MoneyGram Stellar integration](https://xramps.moneygram.com/ops/dev/stellar), [Onramper sell quotes](https://docs.onramper.com/reference/get_quotes-crypto-fiat), and [TransFi exchange rates](https://docs.transfi.com/reference/get-exchange-rates).

### Verification

```powershell
cd web
pnpm lint
pnpm typecheck
pnpm test
pnpm build

cd ..\contracts
cargo test --workspace --locked
stellar contract build --optimize
```

Verified release result:

- ESLint: passed
- TypeScript: passed
- Frontend/domain tests: 236 passed across 25 files
- Next.js 16.3.2 production build: passed
- Soroban tests: 22 passed
- Optimized contract builds: passed
- Contract specialist re-review: no release-blocking findings
- Desktop and 390 px mobile browser checks: passed

The same gates are encoded in `.github/workflows/ci.yml`. [GitHub Actions run #4](https://github.com/zaejohn/AnchorScout/actions/runs/32699582208) passed both the web and contract jobs on the pushed implementation.

### Deploy contracts to Testnet

```powershell
powershell -ExecutionPolicy Bypass -File scripts\deploy-testnet.ps1
```

The script retests and rebuilds exact optimized artifacts, creates/funds a secure-store deployer identity, deploys all three contracts, configures the one-shot settlement authority, smoke-reads state, and regenerates TypeScript bindings. No secret is written to the repository.

## Stellar Testnet

| Item | Public identifier |
| --- | --- |
| Route Registry | [`CBYCCX…RDZ5H`](https://lab.stellar.org/r/testnet/contract/CBYCCXCJLFQKUIPNJDQNXXIGV26S4FSXGHRYQQBPU3EYUGE6EXRRDZ5H) |
| Settlement Receipt | [`CBQKALT…IBDJM`](https://lab.stellar.org/r/testnet/contract/CBQKALTRUEBNTDOKL7UOOSEFPJMHZRQCWV5C6VZA4T3TO4WEB2OIBDJM) |
| Route Executor | [`CAFKJQJ…W2BIQH`](https://lab.stellar.org/r/testnet/contract/CAFKJQJGL4U3LAGEGXARMHGURTQUUCJYSRBKMZC7AI3JXMQHUZW2BIQH) |
| One-sign route proof | [`c6948d8c…6551e`](https://stellar.expert/explorer/testnet/tx/c6948d8c82c8413f05d61e6a7f6a11f88a81838ca4a7ec414a17e074ebc6551e) |

The final public reads return a `Completed` route and receipt, while the executor's `route_executed` event and native SAC transfer share the one outer transaction hash. `NETWORKS.md` contains complete artifact hashes, deployment transactions, IDs, asset scope, and reset guidance.

## Operational status

- Mainnet is disabled and was not touched.
- Native XLM is the separate 0.1 XLM proof asset for XLM and Test USDC comparisons; it does not execute a quoted USDC or fiat payout. The optional automated validator acquires real Circle Testnet USDC through live Stellar path payments before comparing routes.
- Vercel Web Analytics is included in the root layout, with non-sensitive quote/route lifecycle events.
- `/api/health` probes Horizon, RPC, protocol/ledger visibility, and public contract configuration for deployment monitoring.
- Production Vercel deployment is ready but requires `vercel login` or a deployment token; this workstation is logged out.
- The in-app browser verified wallet discovery, route comparison, expiration countdowns, mobile responsiveness, and no horizontal overflow. Signing with a real extension wallet remains a human-controlled browser action.

## Security notes

- The browser is untrusted; route input is validated again at the server boundary.
- Wallet signatures remain user-controlled.
- Submission and confirmation are separate states; broadcast hashes are checkpointed before confirmation and reconciled after reload without automatic resubmission.
- Configured SEP-38 HTTPS origins are resolved, public-address validated, DNS-pinned per request, response-bounded, and forbidden from redirecting.
- Contract settlement authority is configured exactly once.
- Receipt IDs are globally unique, and a failed nested Registry invocation rolls back Receipt storage atomically.
- No bank, KYC or real-user private key is stored or emitted. The opt-in validator stores supplied feedback profiles privately in Postgres and derives only its own Testnet wallets from a server-only master.

## Automated Testnet user simulation

See [SIMULATION.md](SIMULATION.md) for the durable 17-minute scheduler, database setup, required secrets, cron-job.org headers, real validation command, exact form fields, and safe recovery. The endpoint is `POST /api/cron/simulate`; no Vercel Cron is used. These are synthetic test runs, not independent human adoption metrics.
