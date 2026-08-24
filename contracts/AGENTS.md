# Soroban Contract Rules

These instructions add to the repository root `AGENTS.md`.

Before version-sensitive contract work, use the official Stellar smart-contract skill and Raven.

## Contract expectations
- Target modern Soroban Rust; prefer `stellar contract build` rather than hand-configuring the Wasm target.
- Do not assume `std` is available in deployed contract code.
- Authorization must be explicit and tested where required.
- Define important state invariants before implementing state transitions.
- Choose Instance/Persistent/Temporary storage intentionally; do not make everything persistent by default.
- Consider TTL/lifetime behavior for stored data.
- Keep asset handling and arithmetic explicit.
- Emit meaningful events for externally important state transitions when appropriate.
- Avoid custom crypto/access-control/token primitives when maintained Stellar/OpenZeppelin primitives fit.

## Required tests for important state changes
- happy path
- authorization/access-control behavior
- failure/invalid-input path
- state invariant / edge case

For money, inventory, escrow, claims, rewards, or other critical logic, consider property/fuzz testing.

## Before completion
Run `cargo test` and `stellar contract build`. Report failures instead of hiding them.
