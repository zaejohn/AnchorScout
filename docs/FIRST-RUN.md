# First Run

## 1. Edit one file first
Fill in `PROJECT.md` with the product idea, user flow, MVP, Stellar requirements, non-goals, and definition of done. The Next.js App Router + TypeScript + Tailwind full-stack profile is already fixed.

## 2. Configure Codex + Stellar AI context
Windows:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-codex-stellar.ps1
```

macOS/Linux:

```bash
bash ./scripts/setup-codex-stellar.sh
```

The setup installs/updates the official Stellar Dev Skill in your Codex home when possible, adds Raven MCP, and installs the Rust Wasm target when rustup is available. Raven OAuth may open a browser.

## 3. Scaffold the Next.js application
Windows:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\scaffold-nextjs.ps1
```

macOS/Linux:

```bash
bash ./scripts/scaffold-nextjs.sh
```

This uses the current `create-next-app@latest` template with TypeScript, Tailwind CSS, ESLint, App Router, `src/`, Turbopack defaults, pnpm, and no nested Git repository. It preserves any version-matched `AGENTS.md` created by Next.js and appends the boilerplate's Stellar/full-stack instructions, then adds `web/.env.example`.

## 4. First Codex prompt
Use the main Codex model for synthesis:

> Read PROJECT.md, ARCHITECTURE.md, root AGENTS.md, and web/AGENTS.md. Do not implement product features yet. Have stellar_researcher verify the current Stellar approach with Raven. Keep the fixed Next.js App Router + TypeScript + Tailwind full-stack stack. Decide the minimum off-chain services and whether Soroban contracts are actually required. Update ARCHITECTURE.md, TASKS.md, and DECISIONS.md with the simplest defensible plan. Stop after planning.

## 5. Implement vertically
Example:

> Use $nextjs-fullstack and $stellar-workflow to implement the next complete vertical slice from TASKS.md. Delegate repository mapping/research/tests when useful. Verify it locally before marking the task complete.

## 6. Verify

> Use $fullstack-verify on the completed feature. Fix concrete failures, then summarize what is verified and what is not.

## 7. Testnet promotion

> Use $testnet-deploy for this locally verified feature. Do not touch Mainnet. Update NETWORKS.md with public deployment identifiers.
