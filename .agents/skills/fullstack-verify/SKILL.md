---
name: fullstack-verify
description: Verify a complete full-stack Stellar feature after implementation. Use for user-facing flows spanning app/backend/wallet/contract state, especially before calling a feature done.
---

1. Run contract tests/build when contracts changed.
2. Run all available app lint, typecheck, test, and production-build scripts.
3. Verify generated bindings match the current contract interface.
4. Exercise the real user flow locally when possible, including wallet rejection, wrong-network, failed transaction, and success states that matter to the feature.
5. Confirm submitted transactions are not treated as final before confirmation.
6. Delegate noisy checks to `test_runner` and meaningful review to `app_reviewer` / `contract_reviewer`.
7. Mark complete only when the intended user-visible outcome and on-chain outcome agree.
