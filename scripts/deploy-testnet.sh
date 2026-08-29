#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
identity="${1:-anchorscout-deployer}"
proof_destination="${2:-}"
cd "$project_root"

cargo test --manifest-path contracts/Cargo.toml --locked
stellar contract build --manifest-path contracts/Cargo.toml --out-dir contracts/wasm --locked

if ! stellar keys ls | grep -Fxq "$identity"; then
  stellar keys generate "$identity" --secure-store --network testnet --fund
else
  stellar keys fund "$identity" --network testnet
fi
admin="$(stellar keys public-key "$identity")"
proof_destination="${proof_destination:-$admin}"
native_sac="$(stellar contract id asset --asset native --network testnet)"

route_id="$(stellar contract deploy --wasm contracts/wasm/route_registry.wasm --source-account "$identity" --network testnet --alias anchorscout-route-registry-testnet -- --admin "$admin")"
settlement_id="$(stellar contract deploy --wasm contracts/wasm/settlement_receipt.wasm --source-account "$identity" --network testnet --alias anchorscout-settlement-receipt-testnet -- --registry "$route_id")"

stellar contract invoke --id "$route_id" --source-account "$identity" --network testnet -- configure_settlement --settlement_contract "$settlement_id"
executor_id="$(stellar contract deploy --wasm contracts/wasm/route_executor.wasm --source-account "$identity" --network testnet --alias anchorscout-route-executor-testnet -- --registry "$route_id" --settlement "$settlement_id" --proof_asset "$native_sac" --proof_destination "$proof_destination")"
stellar contract invoke --id "$route_id" --source-account "$identity" --network testnet --send no -- get_user_route_count --user "$admin"

stellar contract bindings typescript --network testnet --contract-id "$route_id" --output-dir web/src/lib/stellar/generated/route-registry --overwrite
stellar contract bindings typescript --network testnet --contract-id "$settlement_id" --output-dir web/src/lib/stellar/generated/settlement-receipt --overwrite
stellar contract bindings typescript --network testnet --contract-id "$executor_id" --output-dir web/src/lib/stellar/generated/route-executor --overwrite

printf 'Testnet deployment completed. Public values:\nDeployer: %s\nRoute Registry: %s\nSettlement Receipt: %s\nRoute Executor: %s\nNEXT_PUBLIC_ROUTE_EXECUTOR_CONTRACT_ID=%s\nNEXT_PUBLIC_PROOF_PAYMENT_DESTINATION=%s\n' "$admin" "$route_id" "$settlement_id" "$executor_id" "$executor_id" "$proof_destination"
