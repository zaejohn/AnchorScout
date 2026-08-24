# Codex Stellar + Next.js Starter

A Codex-native operating system for **full-stack Stellar/Soroban applications using Next.js App Router, TypeScript, and Tailwind CSS**.

The application stack is intentionally opinionated:

- Next.js App Router
- TypeScript
- Tailwind CSS
- Next.js frontend + backend
- pnpm by default
- Stellar/Soroban when the product needs on-chain logic

Stellar versions/providers remain researched per project through Stellar's official AI resources rather than copied into stale repository instructions.

## What is included

- Hierarchical `AGENTS.md` rules for the repository, Next.js application, and Soroban contracts.
- Project-specific Codex subagents with model routing.
- Repo-local Codex skills for Next.js full-stack work, Stellar feature implementation, contract review, and verification.
- Stellar Raven MCP + official Stellar Dev Skill setup.
- `create-next-app@latest` scaffold scripts for a security-fresh `web/` application; generated version-matched Next.js agent guidance is preserved and extended with Stellar rules.
- Local Quickstart workflow.
- Testnet deployment discipline.
- Product/architecture/tasks/decisions/network templates.
- No Mainnet automation by default.

## Repository shape

```text
.
├── AGENTS.md
├── PROJECT.md
├── ARCHITECTURE.md
├── TASKS.md
├── DECISIONS.md
├── NETWORKS.md
├── .codex/agents/
├── .agents/skills/
├── contracts/
├── web/                 # created by scaffold-nextjs script
├── scripts/
└── docs/
```

## Clone workflow

1. Clone/copy this starter into a new repository.
2. Edit **`PROJECT.md` first**.
3. Run `scripts/setup-codex-stellar.*`.
4. Run `scripts/scaffold-nextjs.*`.
5. Open Codex at the repository root.
6. Follow `docs/FIRST-RUN.md`.

## Architecture philosophy

**Next.js is the default full stack.** Do not add a separate backend service just to separate frontend/backend. Use Server Components, Server Actions, Route Handlers, and server-only domain modules according to the boundary.

**Main Codex = lead engineer.** Research, mapping, tests, and reviews are delegated to focused subagents so the main context is not filled with documentation dumps or build logs.

**Stellar knowledge stays fresh.** Official Stellar Dev Skills and Raven provide current Stellar context instead of copying SDK docs into the repository.

**Server first.** Server Components are the default. Client Components are intentionally limited to interactivity, wallet/browser APIs, and client state.

**Local first.** Contract/unit tests -> local Quickstart -> Testnet -> Mainnet only after explicit approval.

**Generated interfaces.** When contracts change, prefer generated TypeScript bindings rather than maintaining hand-written frontend contract ABIs/clients.

## Prerequisites

- Codex CLI / IDE
- Git
- Node.js meeting the current Next.js requirement
- pnpm (or change the scaffold script)
- Rust + `wasm32v1-none` for Soroban contract development
- Stellar CLI
- Docker for local Quickstart

Use the setup/scaffold scripts and current official docs rather than assuming the version numbers in an old README are still correct.

## Official references

- https://developers.stellar.org/docs/build/building-with-ai
- https://developers.stellar.org/docs/build/smart-contracts/getting-started/setup
- https://developers.stellar.org/docs/tools/quickstart/getting-started
- https://nextjs.org/docs/app/getting-started/installation
- https://nextjs.org/docs/app/api-reference/cli/create-next-app
- https://tailwindcss.com/docs/installation/framework-guides/nextjs
- https://developers.openai.com/codex/guides/agents-md
- https://developers.openai.com/codex/subagents
- https://developers.openai.com/codex/skills
