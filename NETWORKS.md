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
- Testnet proof payment destination: `GDW2INHQPIWK6JYMVDPCT3JZHMBSYPDEWB56PCRC2JSXADAF22VF253M`
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

- Native XLM is the executable Testnet proof asset.
- `Test USDC` comparisons can be recorded with the separate 0.1 XLM route proof. The automated validator additionally acquires official Circle Testnet USDC (`GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5`) through a live Stellar path payment. This is not a transfer of the quoted amount to an external provider.
- Coins.ph `XLMPHP`/`USDCPHP` values are production market references fetched server-side; no production asset is transferred and no quote is accepted.
- MoneyGram capability is read from its public Stellar Testnet SEP-1/SEP-24 endpoints. Its hosted cash route does not provide PHP bank/GCash settlement, so that external fiat step is simulated and clearly labeled.
- No production USDC, PHP settlement, bank payout, GCash payout, KYC session, or provider liquidity is executed.

Testnet is reset periodically. Re-run `scripts/deploy-testnet.ps1` and update this file if these entries are no longer available.

## Automated simulation — 2026-08-26

One real run used the same application provider and transaction builders with durable **local PGlite** persistence. This does not claim a hosted Postgres/cron deployment. No contract code was changed or redeployed.

- Run: `409f2e6d-9387-4160-b110-55e85a2218e7`
- New Testnet wallet: [`GC4C5N…RWJ2`](https://stellar.expert/explorer/testnet/account/GC4C5NTURX4QOLAT3JQZYWXAL6A3IC3SM5ER4NNCJZOIBUC2PXXZRWJ2)
- Random amount: **1,685 official Circle Testnet USDC**, acquired by an actual strict-receive XLM→USDC swap to the same wallet; balance verified exactly.
- Selected provider: `coins-ph-market`, returned from the live comparison; stored PHP gross reference `103846.55`. Fees/ETA remain unspecified, not fabricated. No fiat payout occurred.
- Route ID: `5f2b83f7c29bd367895ceeeeaf1e98a8ef386939501a357891090599916355cb`
- Receipt ID: `94c036c5f38c9d4895ee464b882a2c137b842ebbacb42a2ea3b093259b17f09a`

| Confirmed step | Transaction hash |
| --- | --- |
| Friendbot funding | [`7ecd3b3d69457460a7564383cced0564061b469cf2e9b66dfff8b8572689d98b`](https://stellar.expert/explorer/testnet/tx/7ecd3b3d69457460a7564383cced0564061b469cf2e9b66dfff8b8572689d98b) |
| USDC trustline | [`a09ce06176e01cfda60516767533e6d171b36461ef25e9af74fa3beff6a8206f`](https://stellar.expert/explorer/testnet/tx/a09ce06176e01cfda60516767533e6d171b36461ef25e9af74fa3beff6a8206f) |
| Acquire 1,685 USDC | [`0bab2ddf693b94f931946e96426096a5587d72ed6ad697336bb180d32bc2fb7b`](https://stellar.expert/explorer/testnet/tx/0bab2ddf693b94f931946e96426096a5587d72ed6ad697336bb180d32bc2fb7b) |
| Route selection | [`5cf9015e39e54ed66c64d85d35d98317f0db53c0c6ef9c33a7269a407de077f1`](https://stellar.expert/explorer/testnet/tx/5cf9015e39e54ed66c64d85d35d98317f0db53c0c6ef9c33a7269a407de077f1) |
| Separate 0.1 XLM proof | [`21a212e31255c2ddaaf967545c75183329c159d7cf03a47559abb65577da9d0e`](https://stellar.expert/explorer/testnet/tx/21a212e31255c2ddaaf967545c75183329c159d7cf03a47559abb65577da9d0e) |
| Receipt + atomic finalization | [`a8c4730ff035c84f9dae5d81741cdf5928968ddbf2585b6f67ce9a8549d2ebf1`](https://stellar.expert/explorer/testnet/tx/a8c4730ff035c84f9dae5d81741cdf5928968ddbf2585b6f67ce9a8549d2ebf1) |

All eight durable states were recorded, ending `FORM_SUBMITTED` / `CONFIRMED` at `2026-08-26T09:01:07.821Z`. Google returned its explicit response-recorded confirmation for one reserved profile, rating 4, exact wallet and supplied feedback. Profile values are intentionally omitted here. The app's history API independently returned `COMPLETED` with the matching route/receipt/proof hashes.

A fresh validator process returned `interval_not_due`, with the persisted next start `2026-08-26T09:36:16.846Z` (exactly 37 minutes after creation); no second wallet/profile/form was created. Private `.simulation/validation-export.json` preserves the consumed profile reservation and is imported automatically by `simulation:setup`.

Local verification: lint, TypeScript, **208 tests across 20 files**, production build, browser route comparison/selection/disclosures, and unauthenticated endpoint rejection passed. Specialist app review found no remaining must-fix issues. Managed Postgres credentials, Vercel deployment access, and cron-job.org configuration remain human-controlled deployment gates.

## Mainnet status

Status: **disabled**

No Mainnet deployment or transaction was performed or authorized.
