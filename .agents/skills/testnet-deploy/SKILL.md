---
name: testnet-deploy
description: Promote a locally verified Stellar contract/application flow to Testnet and record public deployment identifiers. Use only after local tests/builds pass. Never use for Mainnet deployment.
---

1. Confirm required local verification is green.
2. Confirm the active network is Testnet, never Mainnet.
3. Build optimized deployable contract Wasm with `stellar contract build`.
4. Deploy using a non-production Testnet identity and contract alias where appropriate.
5. Invoke/smoke-test the deployed contract or complete the intended user flow.
6. Regenerate bindings from the deployed contract/alias if the application depends on them.
7. Record only public values in NETWORKS.md: contract IDs/aliases, asset IDs, transaction hashes, and explorer references.
8. Never write seed phrases or secret keys to repository files or logs.
