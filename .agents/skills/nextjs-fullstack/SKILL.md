---
name: nextjs-fullstack
description: Plan or implement a full-stack Next.js App Router feature in the web application. Use when a task spans routes, Server Components, Client Components, Server Actions, Route Handlers, validation, backend logic, or Stellar integration.
---

1. Read `PROJECT.md`, `ARCHITECTURE.md`, root `AGENTS.md`, and `web/AGENTS.md`.
2. Verify the installed Next.js version and use its version-matched documentation instead of relying on stale framework memory.
3. Define the vertical slice: data/state, server operation, authorization, validation, UI, loading/error state, tests, and browser verification.
4. Default to Server Components. Introduce Client Components only at necessary interactive/browser boundaries.
5. Choose the backend entry point deliberately:
   - Server Action for first-party UI mutation when suitable.
   - Route Handler for webhooks, third-party callbacks, public/programmatic APIs, or non-React consumers.
6. Keep privileged Stellar/database/provider logic server-side. Never expose secrets to `NEXT_PUBLIC_*` or client bundles.
7. Keep business logic out of presentation components and avoid duplicating authoritative logic between client and server.
8. For contract changes, regenerate typed bindings before integrating the UI.
9. Run lint/typecheck/tests/build, then exercise the actual user flow.
10. Update `TASKS.md` and `DECISIONS.md` when the implementation creates durable project knowledge.
