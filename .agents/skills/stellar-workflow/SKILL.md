---
name: stellar-workflow
description: Plan or implement a Stellar feature end-to-end. Use for features that cross Soroban contracts, assets, wallet/signing, generated bindings, backend, frontend, events, or network deployment. Do not use for tiny isolated edits.
---

1. Read PROJECT.md, ARCHITECTURE.md, TASKS.md, NETWORKS.md and relevant AGENTS.md files.
2. If any Stellar API/tool/version assumption is uncertain, delegate to `stellar_researcher` before coding.
3. Define the complete vertical slice: on-chain state/action, app/backend integration, wallet/signing path, failure states, tests, and observability.
4. Prefer generated TypeScript bindings after contract interface changes.
5. Implement the smallest complete slice rather than disconnected layers.
6. Run contract + application verification.
7. Verify locally first; use Testnet after local behavior is sound.
8. Update TASKS.md, DECISIONS.md, and NETWORKS.md when the change creates durable project knowledge.
