# AnchorScout

AnchorScout is a non-custodial Stellar Testnet route-comparison dApp. It lets a user compare normalized Anchor-style quotes, select a live route, sign a real XLM payment, record the selection on Soroban, and finalize it through a second contract with public receipt evidence.

The product solves a simple problem: payment routes expose different rates, fees, speed, and availability, but those differences are hard to compare consistently. AnchorScout isolates each provider behind one adapter interface, validates and normalizes responses server-side, and ranks only complete, live quotes.

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
4. Query all providers concurrently; isolate timeouts and malformed responses.
5. Normalize, expire, and deterministically rank valid quotes.
6. Sign a Route Registry invocation with the user's wallet.
7. Sign and confirm a real classic XLM payment.
8. Sign a Settlement Receipt invocation. That contract atomically invokes Route Registry and finalizes the route.
9. Poll contract events and reload durable contract-backed history.

AnchorScout never holds funds, requests secret keys, or signs for users. Demo PHP quotes are indicative; no fiat payout occurs. The classic payment hash is confirmed through Horizon by the app and user-attested on-chain because Soroban cannot independently query classic transaction history.

## Architecture

```text
Browser wallet + responsive client
        │
        ├── Next.js Route Handlers ── provider registry ── SEP-1/SEP-38 or demo adapters
        │                                  │
        │                                  └── normalization + deterministic ranking
        │
        ├── Horizon ── balances, classic XLM submission, payment confirmation
        │
        └── Stellar RPC ── simulation, wallet signing, contract submission, events
                                  │
                    Route Registry contract
                                  ▲
                                  │ atomic authenticated invocation
                    Settlement Receipt contract
```

- `web/src/lib/anchors/`: request schema, provider interface, adapters, normalization, ranking, and tests
- `web/src/lib/stellar/`: Testnet config, Wallets Kit, classic payment lifecycle, generated-contract wrappers, and history synchronization
- `web/src/app/api/`: quote, account, event, and history boundaries
- `contracts/route-registry/`: wallet-owned route records and final-state transitions
- `contracts/settlement-receipt/`: globally unique receipts and authenticated cross-contract finalization
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
NEXT_PUBLIC_DEMO_PAYMENT_DESTINATION=GDW2INHQPIWK6JYMVDPCT3JZHMBSYPDEWB56PCRC2JSXADAF22VF253M
```

Optional server-only `SEP38_ANCHOR_HOME_DOMAIN` and `SEP38_ANCHOR_NAME` enable a real indicative provider. The configured adapter discovers `ANCHOR_QUOTE_SERVER` through SEP-1 and never exposes server configuration to the browser.

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
- Frontend/domain tests: 11 passed
- Next.js 16.3.2 production build: passed
- Soroban tests: 16 passed
- Optimized contract builds: passed
- Contract specialist re-review: no release-blocking findings
- Desktop and 390 px mobile browser checks: passed

The same gates are encoded in `.github/workflows/ci.yml`. A remote GitHub run requires configuring and pushing a Git remote.

### Deploy contracts to Testnet

```powershell
powershell -ExecutionPolicy Bypass -File scripts\deploy-testnet.ps1
```

The script retests and rebuilds exact optimized artifacts, creates/funds a secure-store deployer identity, deploys both contracts, configures the one-shot settlement authority, smoke-reads state, and regenerates TypeScript bindings. No secret is written to the repository.

## Stellar Testnet

| Item | Public identifier |
| --- | --- |
| Route Registry | [`CBYCCX…RDZ5H`](https://lab.stellar.org/r/testnet/contract/CBYCCXCJLFQKUIPNJDQNXXIGV26S4FSXGHRYQQBPU3EYUGE6EXRRDZ5H) |
| Settlement Receipt | [`CBQKALT…IBDJM`](https://lab.stellar.org/r/testnet/contract/CBQKALTRUEBNTDOKL7UOOSEFPJMHZRQCWV5C6VZA4T3TO4WEB2OIBDJM) |
| Route selection | [`c1875852…c1d2`](https://stellar.expert/explorer/testnet/tx/c18758523958bcb4738664364bbd401a8fe225f46f3b68efc324bbb4ad41c1d2) |
| Confirmed 0.1 XLM payment | [`707e08de…b164`](https://stellar.expert/explorer/testnet/tx/707e08de52ba122c2d9ae992bf3a9c0d03b58f7d39ebd194f993ef3fe091b164) |
| Receipt + cross-contract finalization | [`eefe216d…d93a`](https://stellar.expert/explorer/testnet/tx/eefe216d59c3a7123a1a59a18e5edd660478c2ab3becb0ec06e930657467d93a) |

The final public reads return a `Completed` route and `Completed` receipt linked to the same payment hash. `NETWORKS.md` contains complete artifact hashes, deployment transactions, IDs, asset scope, and reset guidance.

## Operational status

- Mainnet is disabled and was not touched.
- Native XLM is the executable Testnet asset. Test USDC is indicative until an issuer is configured.
- Vercel Web Analytics is included in the root layout, with non-sensitive quote/route lifecycle events.
- Production Vercel deployment is ready but requires `vercel login` or a deployment token; this workstation is logged out.
- The in-app browser verified wallet discovery, route comparison, expiration countdowns, mobile responsiveness, and no horizontal overflow. Signing with a real extension wallet remains a human-controlled browser action.

## Security notes

- The browser is untrusted; route input is validated again at the server boundary.
- Wallet signatures remain user-controlled.
- Submission and confirmation are separate states.
- Contract settlement authority is configured exactly once.
- Receipt IDs are globally unique, and a failed nested Registry invocation rolls back Receipt storage atomically.
- No bank, KYC, seed, private key, or sensitive payout data is stored or emitted.
