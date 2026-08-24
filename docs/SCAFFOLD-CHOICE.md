# Next.js Is the Primary Scaffold

This starter is intentionally specialized for a **Next.js App Router full-stack application**. Do not replace `web/` with Scaffold Stellar by default.

## Default
Use `scripts/scaffold-nextjs.*` to create `web/` with the current `create-next-app@latest` template.

Use Stellar CLI/Soroban tooling in `contracts/` and generate TypeScript bindings into the Next.js application when contracts are required.

## When Scaffold Stellar is still useful
Treat Scaffold Stellar as a reference/tool source when a project benefits from its contract tooling, generated clients, or examples. Do not let it replace the fixed Next.js application architecture unless the user explicitly asks to switch stacks.

## Why
The goal of this boilerplate is a consistent full-stack shape:

```text
Next.js App Router (frontend + backend)
            |
            +-- database/auth/storage when needed
            |
            +-- wallet + Stellar RPC
            |
            +-- generated Soroban bindings
            |
            +-- contracts/
```

This removes an unnecessary architecture decision from every new project and lets Codex focus on the product-specific parts.
