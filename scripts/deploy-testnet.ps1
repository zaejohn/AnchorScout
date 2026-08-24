param(
  [string]$Identity = "anchorscout-deployer"
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$WasmDirectory = Join-Path $ProjectRoot "contracts\wasm"
$RouteWasm = Join-Path $WasmDirectory "route_registry.wasm"
$SettlementWasm = Join-Path $WasmDirectory "settlement_receipt.wasm"

Push-Location $ProjectRoot
try {
  cargo test --manifest-path contracts/Cargo.toml --locked
  stellar contract build --manifest-path contracts/Cargo.toml --out-dir contracts/wasm --locked

  $identities = @(stellar keys ls)
  if ($identities -notcontains $Identity) {
    stellar keys generate $Identity --secure-store --network testnet --fund
  } else {
    stellar keys fund $Identity --network testnet
  }
  $Admin = (stellar keys public-key $Identity).Trim()

  $RouteId = (stellar contract deploy `
    --wasm $RouteWasm `
    --source-account $Identity `
    --network testnet `
    --alias anchorscout-route-registry-testnet `
    -- `
    --admin $Admin).Trim()

  $SettlementId = (stellar contract deploy `
    --wasm $SettlementWasm `
    --source-account $Identity `
    --network testnet `
    --alias anchorscout-settlement-receipt-testnet `
    -- `
    --registry $RouteId).Trim()

  stellar contract invoke `
    --id $RouteId `
    --source-account $Identity `
    --network testnet `
    -- `
    configure_settlement `
    --settlement_contract $SettlementId

  stellar contract invoke `
    --id $RouteId `
    --source-account $Identity `
    --network testnet `
    --send no `
    -- `
    get_user_route_count `
    --user $Admin

  stellar contract bindings typescript --network testnet `
    --contract-id $RouteId `
    --output-dir web/src/lib/stellar/generated/route-registry `
    --overwrite
  stellar contract bindings typescript --network testnet `
    --contract-id $SettlementId `
    --output-dir web/src/lib/stellar/generated/settlement-receipt `
    --overwrite

  Write-Host "Testnet deployment completed. Public values:"
  Write-Host "Deployer: $Admin"
  Write-Host "Route Registry: $RouteId"
  Write-Host "Settlement Receipt: $SettlementId"
  Write-Host "NEXT_PUBLIC_PROOF_PAYMENT_DESTINATION=$Admin"
} finally {
  Pop-Location
}
