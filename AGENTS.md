# Codex + Stellar + Next.js Engineering Rules

## Start here

Before significant work, read `PROJECT.md`, `ARCHITECTURE.md`, `TASKS.md`, and relevant nested `AGENTS.md` files.

This starter has an intentional application stack:

- Next.js App Router
- TypeScript
- Tailwind CSS
- Next.js frontend + backend in `web/`
- Stellar/Soroban contracts in `contracts/` when contracts are required

Do not replace this stack unless the user explicitly asks to change the boilerplate architecture.

For version-sensitive Stellar behavior, do not trust memory. Use the `stellar_researcher` subagent and/or Stellar Raven MCP plus the official Stellar Dev Skills.
For version-sensitive Next.js behavior, inspect the installed version and use its version-matched agent docs/current official docs before using old patterns.

## Development strategy

- Prefer the simplest architecture that satisfies `PROJECT.md`.
- Build one complete vertical slice at a time.
- Inspect the existing implementation before editing.
- Keep unrelated changes out of the diff.
- Prefer Next.js server capabilities before adding a separate backend service.
- Use local Quickstart for fast Stellar integration work before Testnet.
- Mainnet is disabled unless explicitly requested.
- Record durable architectural decisions in `DECISIONS.md`.
- Update `TASKS.md` when meaningful work is completed.

## Full-stack boundaries

- The browser is untrusted.
- Secrets, private credentials, database admin access, privileged Stellar operations, and webhook verification stay server-side.
- Validate untrusted input at server boundaries.
- Enforce authorization server-side even if UI already hides an action.
- Keep authoritative business rules in one server/domain implementation.
- Prefer idempotent designs for payments, webhooks, retries, and on-chain/off-chain synchronization.

## Stellar rules

- Never expose or commit secret keys, seed phrases, signing material, or production credentials.
- Prefer a Stellar Asset / SAC when it solves the token requirement; do not invent a custom token unnecessarily.
- Prefer generated TypeScript contract bindings over hand-written contract interfaces.
- Treat transaction preparation, wallet signing, submission, confirmation, and final outcome as distinct states.
- Treat wallet rejection and network mismatch as normal recoverable states.
- Use current Stellar RPC/data APIs verified through official sources.
- Important on-chain state transitions should have tests and observable events where appropriate.

## Verification

Do not claim completion only because code compiles.

For contract changes, run at minimum:

- `cargo test`
- `stellar contract build`

For web changes, run the available lint, typecheck, test, and production-build scripts in `web/`.

For user-facing blockchain flows, verify the actual flow on local Quickstart and then Testnet when appropriate.

## Subagent routing

Delegate when it reduces noise or requires specialization:

- `stellar_researcher`: current Stellar APIs/docs/ecosystem behavior.
- `code_mapper`: read-only repository/execution-path mapping.
- `test_runner`: builds/tests/log-heavy verification.
- `contract_reviewer`: security/correctness review of Soroban contracts.
- `app_reviewer`: Next.js + wallet + transaction + frontend/backend integration review.

Use the main agent for architecture synthesis, implementation, and final decisions.

## Autonomy

When PROJECT.md is populated, treat it as the authoritative product specification.

Work end-to-end without requiring routine user confirmation.

You may autonomously:

- research
- plan
- update architecture
- create and modify code
- install normal project dependencies
- run tests
- fix failures
- use configured subagents
- review code
- create meaningful commits
- deploy contracts to Stellar Testnet
- update NETWORKS.md
- configure CI/CD
- prepare/deploy the Next.js application when credentials permit
- update documentation

Continue to the next required task automatically.

Only stop for genuinely human-controlled actions such as:

- OAuth/account login
- unavailable credentials
- real-user participation
