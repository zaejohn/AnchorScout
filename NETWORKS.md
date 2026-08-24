# Networks

Never store secret keys or seed phrases here.

## Local

- Intended network: local Stellar Quickstart
- Status: contract unit and cross-contract tests pass locally; an RPC-backed Quickstart run was unavailable because Docker is not installed on this workstation.
- No local contract aliases or persistent identifiers are required.

## Testnet

- Network passphrase: `Test SDF Network ; September 2015`
- Protocol verified at deployment: 27
- RPC: `https://soroban-testnet.stellar.org`
- Horizon: `https://horizon-testnet.stellar.org`
- Deployer: `GDYALR5PTXKKGC4IWWVDWUCO6S6DRPUERJMZF2RNTK4ULCOBWZP5DXZU`
- Demo payment destination: `GDW2INHQPIWK6JYMVDPCT3JZHMBSYPDEWB56PCRC2JSXADAF22VF253M`
- Route Registry: `CBYCCXCJLFQKUIPNJDQNXXIGV26S4FSXGHRYQQBPU3EYUGE6EXRRDZ5H`
- Settlement Receipt: `CBQKALTRUEBNTDOKL7UOOSEFPJMHZRQCWV5C6VZA4T3TO4WEB2OIBDJM`

### Artifacts

| Contract | Optimized size | WASM hash |
| --- | ---: | --- |
| Route Registry | 9,004 bytes | `24b102f554ea00b9c01bd2f8d1880aa1258ba950872acffc20b981e2b96cc994` |
| Settlement Receipt | 4,367 bytes | `dcbad6f7cfd3cf3f81084780e5d30c51043235b96e30ad12ef846c4dd2756dd4` |

### Deployment evidence

| Action | Transaction |
| --- | --- |
| Upload Route Registry WASM | [`efe82720…d9fb`](https://stellar.expert/explorer/testnet/tx/efe827209bf6d13a8f5307dd6e3061bfb2b7087d30b087b17f8a52fbed49d9fb) |
| Deploy Route Registry | [`5b61dabd…ab53`](https://stellar.expert/explorer/testnet/tx/5b61dabde6bb545c90b20e8dfcd64f9afd55d73196baa9b3a27534cc88323ab53) |
| Upload Settlement Receipt WASM | [`c16721ac…ef81`](https://stellar.expert/explorer/testnet/tx/c16721ace50b9f098205277f8ef7e6f752ca40f25de36751008d90116d1feef81) |
| Deploy Settlement Receipt | [`45af7161…55fc`](https://stellar.expert/explorer/testnet/tx/45af71619f573657cdd278704ed6cb03c499cd3f77f0b15856268711a39c755fc) |
| Configure one-shot settlement authority | [`cb950f38…f45a`](https://stellar.expert/explorer/testnet/tx/cb950f38aa50b35f08e15d824d9eb1daff1ad8da82e532372577c0dd3164af45a) |

### End-to-end smoke evidence

- Route ID: `18d4777991f485d925a27aaa7dbee5ae8edf6e4650300e20c09b8c1689a41204`
- Receipt ID: `c6c29ff912cb9af2fff51c0a344b67f3711859f43a7e576ad08106d70493b612`
- Record route: [`c1875852…c1d2`](https://stellar.expert/explorer/testnet/tx/c18758523958bcb4738664364bbd401a8fe225f46f3b68efc324bbb4ad41c1d2)
- Confirmed 0.1 XLM payment: [`707e08de…b164`](https://stellar.expert/explorer/testnet/tx/707e08de52ba122c2d9ae992bf3a9c0d03b58f7d39ebd194f993ef3fe091b164)
- Record receipt and cross-contract finalization: [`eefe216d…d93a`](https://stellar.expert/explorer/testnet/tx/eefe216d59c3a7123a1a59a18e5edd660478c2ab3becb0ec06e930657467d93a)
- Final state: Route Registry `Completed`; Settlement Receipt `Completed`; both `route_status_changed` and `settlement_recorded` events were emitted.

### Assets

- Native XLM is the executable demo asset.
- `Test USDC` remains an indicative quote input only. No issuer is configured and the application does not represent it as a transferable asset.
- No production USDC, PHP settlement, bank payout, or liquidity is used.

Testnet is reset periodically. Re-run `scripts/deploy-testnet.ps1` and update this file if these entries are no longer available.

## Mainnet

Status: **disabled**

No Mainnet deployment or transaction was performed or authorized.
