# Automated Testnet validation

This is synthetic product testing, **not evidence of independent human adoption**. The supplied profiles are used only for the requested feedback form. No production funds, conversion acceptance, bank payout, GCash payout or KYC interaction is performed.

## What runs

`cron-job.org → POST /api/cron/simulate → Postgres lease → same AnchorScout domain code`

Each new run permanently reserves one unused profile, a unique generated Testnet wallet, and a cryptographically random integer amount of 507–1777 USDC. The persistent progression is:

`CREATED → FUNDED → SWAPPED → ROUTES_COMPARED → ROUTE_SELECTED → PROOF_SIGNED → COMPLETED → FORM_SUBMITTED`

- Friendbot funding is verified through Horizon.
- A real trustline and a live strict-receive XLM→Circle Testnet USDC path payment acquire the exact amount in the same wallet. `sendMax` is the returned path price, with no added slippage. Missing/stale liquidity fails safely; no invented balance or custom asset is substituted.
- `searchQuotes`, `configuredProviders`, request validation and `isSelectableQuote` are the application's existing comparison implementation. A random available, unexpired returned route is selected. The snapshot retains provider provenance, missing fees/ETA, and fiat-simulation disclosures.
- Shared generated-binding transaction builders record the quote, create the same separate **0.1 XLM proof payment**, and record the receipt that atomically completes both contracts. The quote's USDC amount is **not** transferred to a provider. The manual app supports the same proof for Test USDC comparison and explains this distinction.
- Every signed envelope is saved before submission. Confirmation, USDC balance, route owner/amount/quote hash, receipt owner/ID and payment reference are checked before advancing. No form is sent until final contract state is verified.
- Each cron invocation advances a bounded step. In-progress runs resume on subsequent minute ticks; only **new runs** are gated to at least 37 minutes after the last start. There is no backlog burst after downtime, and an unfinished/blocked run prevents another start.

## Configure and seed

Use a managed Postgres connection with TLS (for example, a pooled Postgres URL supplied by your database host). The repository previously had no database; a live database account/connection must be supplied. No serverless filesystem fallback is used by the endpoint.

Set in `web/.env.local`, then in the Vercel project's server environment:

```dotenv
DATABASE_URL=postgresql://...your-provider-TLS-connection...
CRON_SECRET=<at-least-32-random-characters>
SIMULATION_WALLET_KEY=<32-random-bytes-in-base64>
TESTNET_USDC_ISSUER=GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5
NEXT_PUBLIC_TESTNET_USDC_ISSUER=GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5
```

Keep the existing Testnet Horizon/RPC URLs, both deployed contract IDs, and `NEXT_PUBLIC_PROOF_PAYMENT_DESTINATION` (the legacy `NEXT_PUBLIC_DEMO_PAYMENT_DESTINATION` also works). SEP-38 variables are optional; leave them blank without a compatible provider.

Generate each secret locally with `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"`. Do not use a real user's Stellar seed. Do not change the wallet master while a run is active: resumption checks the derived public key. Secrets must never have a `NEXT_PUBLIC_` prefix.

Keep the provided `web/names_emails_feedback.json` locally; it is ignored by Git and is not imported into any application bundle. From `web/`:

```powershell
pnpm install --frozen-lockfile
pnpm simulation:setup
pnpm verify
```

Setup applies the idempotent SQL schema and seeds profiles directly into Postgres. Repeat setup preserves reservations, including records from failed runs. Email uniqueness is case-insensitive; the original email value is preserved for submission. Never drop/reseed the database to retry a run.

The three tables are `anchorscout_simulation_control`, `anchorscout_simulation_profiles`, and `anchorscout_simulation_runs`. Run JSON includes checkpoint/history, selected quote, public transaction hashes, retry schedule and form status. Profiles are private. Restrict DB access and backups; do not expose tables via a public client database API. Pending signed envelopes contain no seed but are still sensitive bearer-authorized artifacts, so never log/serve them. They are removed on confirmation; hashes remain.

## cron-job.org

Create an HTTPS job **after deploying** the endpoint and seeding Postgres:

- URL: `https://anchorscout.vercel.app/api/cron/simulate`
- Method: `POST`
- Header: `Authorization: Bearer <CRON_SECRET>`
- Schedule: every minute, equivalent to `* * * * *`
- Body: empty. Do not put the secret in the URL. Enable job failure notifications.

No Vercel Cron configuration is used. An authenticated `GET` at the same URL is read-only status: active wallet/state/public hashes, next start/retry, remaining profiles, and any blocker. New cron starts require no browser or extension wallet.

## Real validation

`pnpm simulation:validate` uses the configured Postgres and the **same worker**, with live Testnet/providers/form. It consumes one profile and submits one feedback response only after success. Do not run it casually as a unit test.

If a managed database is unavailable, `pnpm simulation:validate --local` uses persistent local PGlite solely for validation, not as a Vercel substitute. Local state and the generated validation-only master are saved under ignored `web/.simulation/`. Keep this folder private and intact. It exports reserved run records to `.simulation/validation-export.json`; subsequent `simulation:setup` automatically imports them into Postgres before enabling production cron, so validation profiles cannot be reused. An unfinished import requires the same validation master; a completed import does not. Never seed on a different machine without also copying this private export.

The CLI stops after one completed run or a blocking/retry condition. It never bypasses the scheduler. Re-running resumes the same active run. Local polling can be faster than cron, but it does not bypass the 37-minute new-run gate.

## Failure and recovery rules

- Transactions: query RPC and Horizon by the saved hash, then resubmit only the identical signed envelope. A missing transaction is rebuilt only when the ledger is past its time bound and the wallet sequence proves it was not consumed. A confirmed failed transaction may be rebuilt from fresh data. Ambiguous consumed sequences stop for investigation. Failed/expired hashes remain in run evidence.
- Transient failures: exponential delay (1–16 minutes), up to eight failures per stage. Confirmed progress resets the counter. Lease fencing rejects stale workers, and the 120-second lease exceeds the endpoint's 60-second execution limit.
- Form IDs were verified against the public form: name `entry.677817133`, email `entry.1360355329`, wallet `entry.1496830545`, rating `entry.237896937`, feedback `entry.864101569`. Rating is always `4`; null feedback is omitted because it is optional. Preflight checks schema drift before POST.
- Google Forms provides no idempotency API. Save `SENDING` before POST and accept only an explicit confirmation page. Timeout, unexpected response, or process loss after POST results in `UNKNOWN` and **no automatic repost**. A form owner must verify whether that exact wallet already exists in responses before reconciling it. Do not clear `UNKNOWN` merely to make cron green.
- Never release a reserved profile, generate a replacement wallet for an active run, delete pending XDR, or force `COMPLETED` after failure. Database/backups and the server master are required for durable recovery.

## Sources

The real 2026-08-26 validation completed all eight states and one Google Form submission for 1,685 USDC. See [NETWORKS.md](NETWORKS.md#automated-simulation--2026-08-26) for all six public transaction hashes. It used local durable PGlite because no managed database or Vercel login was configured; hosted cron is not yet enabled.

Official [Stellar path-payment guide](https://developers.stellar.org/docs/build/guides/transactions/path-payments), [strict-receive API](https://developers.stellar.org/docs/data/apis/horizon/api-reference/list-strict-receive-payment-paths), [Circle Stellar USDC guide](https://developers.circle.com/stablecoins/quickstarts/transfer-usdc-stellar), and [MoneyGram Stellar integration](https://xramps.moneygram.com/ops/dev/stellar). Circle's public faucet cannot supply this per-run amount; the integration uses actual Testnet market liquidity instead. MoneyGram's interactive cash/KYC flow is not an automated PHP bank/GCash settlement.
