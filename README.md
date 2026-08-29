# AnchorScout — Level 1–5 Verification

AnchorScout compares live Stellar payment-route data before a user signs. It shows provider, rate, fee, payout type, time, and availability in one flow.

> **Scope:** Stellar Testnet. AnchorScout records an on-chain route proof and sends a 0.1 XLM proof payment. It does **not** send the quoted PHP payout. Unsupported fiat steps are clearly simulated.

[Live app](https://anchorscout.vercel.app/app) · [Public GitHub](https://github.com/zaejohn/AnchorScout) · [Demo video](https://drive.google.com/file/d/1OyA98uTZ0VAnub3cu1voecrTvb2NwfNb/view?usp=sharing) · [Pitch deck](https://docs.google.com/presentation/d/1LDgXMJheC_ddSYXd-xuqscZ-rdoLyhER/edit?usp=sharing&ouid=101415220365621969880&rtpof=true&sd=true) · [User response sheet](https://docs.google.com/spreadsheets/d/11oEpTGkshRKcEfe2DZspYGqoi27uqUCLUvwlB54x1EI/edit?usp=sharing)

Evidence checked: **2026-08-29**.

## Verification status

| Level | Status | Main result |
| --- | --- | --- |
| Level 1 | ✅ Verified | Wallet, XLM balance, Testnet XLM payment, and UI result |
| Level 2 | ✅ Verified | Multi-wallet UI, errors, deployed contracts, contract call, status, and events |
| Level 3 | ✅ Verified | Cross-contract flow, tests, CI/CD, responsive UI, architecture, and demo |
| Level 4 | ✅ Verified | MVP, deployment, analytics, health monitoring, and 70 user-wallet transactions |
| Level 5 | ✅ Verified | 70 users, 70 unique wallets, 70 successful transactions, feedback, deck, demo, and iteration commits |

## Verified growth evidence

The project owner confirms that the submitted identities are real users. The verification script independently checks the public form data, AnchorScout contract-backed History API, and Stellar Testnet Horizon.

| Verified result | Count |
| --- | ---: |
| Unique submitted users | **70** |
| Unique Stellar wallets | **70** |
| Users with a successful AnchorScout transaction | **70** |
| Unique successful AnchorScout transactions | **70** |
| Nonblank feedback responses | **58** |

[Full JSON evidence](docs/evidence/level-4-5-verification.json) · [Verification script](scripts/verify-level-evidence.mjs)

```bash
node scripts/verify-level-evidence.mjs
```

The script does not store names or emails in the JSON. It verifies distinct form identities, wallets, completed routes, transaction source accounts, expected proof operations, and successful Testnet results. Public form and blockchain data cannot independently prove that each identity is a different human; that part depends on the project owner's collection record.

## Level 1 — White Belt

| Requirement | Proof |
| --- | --- |
| Freighter and Stellar Testnet | [Wallet options screenshot](<docs/evidence/wallet options available.png>) and [wallet integration](web/src/lib/stellar/wallet.ts) |
| Connect and disconnect | [Connected wallet screenshot](<docs/evidence/Wallet-connected-state&Balance-displayed.png>) and [app UI](web/src/components/anchor-scout-app.tsx) |
| Fetch and show XLM balance | [Connected wallet and balance screenshot](<docs/evidence/Wallet-connected-state&Balance-displayed.png>) and [account code](web/src/lib/stellar/classic.ts) |
| Send XLM on Testnet | [Successful 0.1 XLM payment](https://stellar.expert/explorer/testnet/tx/707e08de52ba122c2d9ae992bf3a9c0d03b58f7d39ebd194f993ef3fe091b164) |
| Success/failure and confirmation | [Result screenshot](<docs/evidence/transaction result is shown to the user.png>) and [error mapping](web/src/lib/stellar/errors.ts) |
| Public repo and commit history | [38+ commits on `main`](https://github.com/zaejohn/AnchorScout/commits/main/) |

## Level 2 — Yellow Belt

| Requirement | Proof |
| --- | --- |
| Multi-wallet support | [Freighter, xBull, and LOBSTR screenshot](<docs/evidence/wallet options available.png>) |
| Three error types | [Wallet missing, user rejection, and insufficient balance handling](web/src/lib/stellar/errors.ts) |
| Contracts deployed on Testnet | Route Registry [`CBYCCX…RDZ5H`](https://lab.stellar.org/r/testnet/contract/CBYCCXCJLFQKUIPNJDQNXXIGV26S4FSXGHRYQQBPU3EYUGE6EXRRDZ5H), Settlement Receipt [`CBQKAL…IBDJM`](https://lab.stellar.org/r/testnet/contract/CBQKALTRUEBNTDOKL7UOOSEFPJMHZRQCWV5C6VZA4T3TO4WEB2OIBDJM), Route Executor [`CAFKJQ…W2BIQH`](https://lab.stellar.org/r/testnet/contract/CAFKJQJGL4U3LAGEGXARMHGURTQUUCJYSRBKMZC7AI3JXMQHUZW2BIQH) |
| Contract called by the frontend | [Frontend contract client](web/src/lib/stellar/contracts.ts) and [successful one-sign contract transaction](https://stellar.expert/explorer/testnet/tx/c6948d8c82c8413f05d61e6a7f6a11f88a81838ca4a7ec414a17e074ebc6551e) |
| Pending, success, failure, rejection | [Transaction-state UI](web/src/components/anchor-scout-app.tsx) and [result screenshot](<docs/evidence/transaction result is shown to the user.png>) |
| Event updates and state sync | [RPC event reader](web/src/lib/stellar/event-evidence.ts), [events API](web/src/app/api/stellar/events/route.ts), and [flow design](ARCHITECTURE.md) |

## Level 3 — Orange Belt

| Requirement | Proof |
| --- | --- |
| Advanced and inter-contract logic | [Route Executor](contracts/route-executor/src/lib.rs) calls Route Registry and Settlement Receipt in one atomic flow; [architecture](ARCHITECTURE.md) |
| Events and live updates | Contract events are read through RPC and refresh durable history: [event code](web/src/lib/stellar/event-evidence.ts) |
| CI/CD pipeline | [Passing GitHub Actions run](https://github.com/zaejohn/AnchorScout/actions/runs/33241073171) and [workflow](.github/workflows/ci.yml) |
| Testnet deployment workflow | [PowerShell deploy script](scripts/deploy-testnet.ps1), [shell deploy script](scripts/deploy-testnet.sh), and [network proof](NETWORKS.md) |
| Mobile responsive UI | [Mobile wizard screenshot](<docs/evidence/Mobile responsive UI 2.png>) and [mobile Send XLM modal](<docs/evidence/Mobile responsive UI 3.png>) |
| Loading and error states | [Wizard state UI](web/src/components/anchor-scout-app.tsx) and [error handling](web/src/lib/stellar/errors.ts) |
| Frontend and contract tests | [236 passing web tests screenshot](<docs/evidence/Test output with 3+ passing tests.png>) and [CI test commands](.github/workflows/ci.yml) |
| Production architecture and docs | [Architecture](ARCHITECTURE.md), [decisions](DECISIONS.md), this README, and the [demo video](https://drive.google.com/file/d/1OyA98uTZ0VAnub3cu1voecrTvb2NwfNb/view?usp=sharing) |

## Level 4 — Green Belt

| Requirement | Proof |
| --- | --- |
| Functional deployed MVP | [Live application](https://anchorscout.vercel.app/app) and [`ready` Testnet health endpoint](https://anchorscout.vercel.app/api/health) |
| Stable frontend and contract design | [Architecture](ARCHITECTURE.md), server-side provider boundaries, and atomic contract flow |
| Mobile UI and user states | [Mobile wizard](<docs/evidence/Mobile responsive UI 2.png>) and [result evidence](<docs/evidence/transaction result is shown to the user.png>) |
| Analytics | [Vercel Analytics screenshot](<docs/evidence/Vercel analytics screenshot.jpg>) and [Analytics integration](web/src/app/layout.tsx) |
| Monitoring | [`ready` health check](https://anchorscout.vercel.app/api/health) verifies Horizon, RPC, and Route Executor configuration; Vercel runtime logs record failures |
| Product UI and UX | Focused three-step wizard, wallet profile, Send XLM modal, History modal, and one-sign proof flow |
| 15+ commits | [38+ commits on `main`](https://github.com/zaejohn/AnchorScout/commits/main/) |
| 10+ users and wallet interactions | [Verified JSON](docs/evidence/level-4-5-verification.json): 70 distinct users, 70 unique wallets, and 70 successful proof transactions |

## Level 5 — Blue Belt

| Requirement | Proof |
| --- | --- |
| 20+ commits and updated docs | [38+ commits](https://github.com/zaejohn/AnchorScout/commits/main/) and this README |
| Product improvements | [Live provider layer](https://github.com/zaejohn/AnchorScout/commit/91ebc9f0466579a51b1f9b28dbf38b4c883443ed), [cleaner wizard](https://github.com/zaejohn/AnchorScout/commit/931a30935fa8e801d72198cafd7d724978db373f), and [one-sign route proof](https://github.com/zaejohn/AnchorScout/commit/918053a5e10ae84a537f3483a98899c8ee825e4d) |
| Pitch deck | [10-slide pitch deck](https://docs.google.com/presentation/d/1LDgXMJheC_ddSYXd-xuqscZ-rdoLyhER/edit?usp=sharing&ouid=101415220365621969880&rtpof=true&sd=true): problem, solution, market, architecture, growth, and roadmap |
| Full demo | [Demo video](https://drive.google.com/file/d/1OyA98uTZ0VAnub3cu1voecrTvb2NwfNb/view?usp=sharing) |
| Google Form and feedback | [Public sheet](https://docs.google.com/spreadsheets/d/11oEpTGkshRKcEfe2DZspYGqoi27uqUCLUvwlB54x1EI/edit?usp=sharing) and [verified JSON](docs/evidence/level-4-5-verification.json): 70 responses and 58 nonblank feedback entries |
| 50+ users and active-use proof | [Verified JSON](docs/evidence/level-4-5-verification.json): 70 distinct users, 70 unique wallets, and 70 successful Testnet proof transactions |
| Feedback-based iteration | Easy flow → [wizard improvement](https://github.com/zaejohn/AnchorScout/commit/931a30935fa8e801d72198cafd7d724978db373f); smooth signing → [one-sign proof](https://github.com/zaejohn/AnchorScout/commit/918053a5e10ae84a537f3483a98899c8ee825e4d); fee visibility → [provider layer](https://github.com/zaejohn/AnchorScout/commit/91ebc9f0466579a51b1f9b28dbf38b4c883443ed) |

### Next-phase improvement plan

| Current sheet theme | Next step | Existing base |
| --- | --- | --- |
| Easy and simple flow | Run five human usability sessions and measure completion, rejection, and retry points | [Wizard improvement commit](https://github.com/zaejohn/AnchorScout/commit/931a30935fa8e801d72198cafd7d724978db373f) |
| Fee visibility | Show verified net receive, fee source, quote age, and provider availability for every eligible route | [Provider-layer commit](https://github.com/zaejohn/AnchorScout/commit/91ebc9f0466579a51b1f9b28dbf38b4c883443ed) |
| Smooth transaction flow | Measure one-sign completion rate and improve recoverable failure messages | [One-sign commit](https://github.com/zaejohn/AnchorScout/commit/918053a5e10ae84a537f3483a98899c8ee825e4d) |

## Evidence screenshots

| Wallet and balance | Successful Testnet transaction |
| --- | --- |
| ![Connected Testnet wallet with XLM balance](<docs/evidence/Wallet-connected-state&Balance-displayed.png>) | ![Successful transaction on Stellar Expert](<docs/evidence/Successful testnet transaction.png>) |

| CI/CD | Responsive UI | Analytics |
| --- | --- | --- |
| ![Passing GitHub Actions runs](<docs/evidence/CI-CD pipeline running.png>) | ![Mobile AnchorScout application wizard](<docs/evidence/Mobile responsive UI 2.png>) | ![Vercel Analytics](<docs/evidence/Vercel analytics screenshot.jpg>) |

## Run locally

```bash
git clone https://github.com/zaejohn/AnchorScout.git
cd AnchorScout/web
cp .env.example .env.local
pnpm install
pnpm dev
```

Open `http://localhost:3000/app`, set Freighter to **Testnet**, and fund the wallet with Friendbot. Environment details are in [`web/.env.example`](web/.env.example). Mainnet is disabled.
