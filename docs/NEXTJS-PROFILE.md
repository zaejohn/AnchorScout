# Next.js Full-Stack Profile

This starter intentionally fixes the web application stack to:

- Next.js App Router
- TypeScript
- Tailwind CSS
- Next.js for frontend and backend
- pnpm by default

## Why `web/` instead of putting Next.js at repository root?
The repository root is the Codex/Stellar engineering workspace. Keeping Next.js in `web/` gives Codex clean hierarchical instructions and leaves `contracts/`, specs, network records, and root automation independent from framework-generated files.

## Backend strategy
Do not create an Express/Nest/Fastify backend by default.

Use:
- Server Components for server-rendered data access.
- Server Actions for suitable first-party UI mutations.
- Route Handlers for webhooks, callbacks, public/programmatic APIs, and third-party integrations.
- `src/lib/server/` for reusable business logic, repositories, authorization, and provider clients.

Add a separate backend only when there is a concrete requirement that Next.js cannot sensibly satisfy.

## Client strategy
Server Components are the default. Use Client Components only for interactivity, wallet/browser APIs, and client-only state. Keep the client boundary narrow so privileged code and unnecessary JavaScript stay off the browser.

## Stellar strategy
Wallet signing belongs at the browser boundary; secret application credentials and privileged operations belong server-side. Use generated bindings for contracts and keep transaction lifecycle handling explicit.

## Version strategy
The scaffold script uses `create-next-app@latest` instead of pinning an old template. After scaffold, the generated package/lockfile becomes the version source of truth. Codex should use version-matched Next.js documentation before framework-specific refactors.
