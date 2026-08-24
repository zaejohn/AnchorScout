---
name: contract-verify
description: Verify a Soroban smart-contract change for correctness and release readiness. Use after contract logic changes, before Testnet deployment, or when authorization/storage/asset behavior is risky.
---

1. Read `contracts/AGENTS.md` and identify the changed invariants.
2. Run `cargo test` from the appropriate workspace/root.
3. Run `stellar contract build`.
4. Confirm important logic has happy-path, auth, failure, and invariant/edge tests.
5. For critical financial/state logic, evaluate whether property/fuzz tests are warranted.
6. Delegate a read-only pass to `contract_reviewer` for meaningful contract changes.
7. Report exact failures. Do not mark verified while required checks fail.
