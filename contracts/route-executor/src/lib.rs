#![no_std]

use soroban_sdk::{
    contract, contractevent, contractimpl, contracttype, token::TokenClient, Address, BytesN, Env,
    IntoVal, MuxedAddress, String, Symbol, Val,
};

const PROOF_AMOUNT: i128 = 1_000_000;
const LEDGERS_PER_DAY: u32 = 17_280;
const BUMP_THRESHOLD: u32 = 30 * LEDGERS_PER_DAY;
const BUMP_TO: u32 = 120 * LEDGERS_PER_DAY;

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Registry,
    Settlement,
    ProofAsset,
    ProofDestination,
}

#[contractevent]
pub struct RouteExecuted {
    #[topic]
    pub route_id: BytesN<32>,
    #[topic]
    pub user: Address,
    pub receipt_id: BytesN<32>,
    pub proof_destination: Address,
    pub proof_amount: i128,
}

#[contract]
pub struct RouteExecutor;

#[contractimpl]
impl RouteExecutor {
    pub fn __constructor(
        env: Env,
        registry: Address,
        settlement: Address,
        proof_asset: Address,
        proof_destination: Address,
    ) {
        env.storage().instance().set(&DataKey::Registry, &registry);
        env.storage()
            .instance()
            .set(&DataKey::Settlement, &settlement);
        env.storage()
            .instance()
            .set(&DataKey::ProofAsset, &proof_asset);
        env.storage()
            .instance()
            .set(&DataKey::ProofDestination, &proof_destination);
    }

    #[allow(clippy::too_many_arguments)]
    pub fn execute_route(
        env: Env,
        route_id: BytesN<32>,
        receipt_id: BytesN<32>,
        user: Address,
        anchor_id: String,
        source_asset: String,
        source_amount: i128,
        destination_currency: String,
        destination_amount: i128,
        fee: i128,
        quote_hash: BytesN<32>,
    ) {
        // Re-authorize at the orchestration boundary. Simulation includes the
        // registry, token, and settlement sub-invocations in this same tree.
        user.require_auth();

        let registry: Address = env.storage().instance().get(&DataKey::Registry).unwrap();
        let settlement: Address = env.storage().instance().get(&DataKey::Settlement).unwrap();
        let proof_asset: Address = env.storage().instance().get(&DataKey::ProofAsset).unwrap();
        let proof_destination: Address = env
            .storage()
            .instance()
            .get(&DataKey::ProofDestination)
            .unwrap();

        let _: Val = env.invoke_contract(
            &registry,
            &Symbol::new(&env, "create_route"),
            (
                route_id.clone(),
                user.clone(),
                anchor_id,
                source_asset,
                source_amount,
                destination_currency,
                destination_amount,
                fee,
                quote_hash,
            )
                .into_val(&env),
        );

        let proof_to = MuxedAddress::from(proof_destination.clone());
        TokenClient::new(&env, &proof_asset).transfer(&user, &proof_to, &PROOF_AMOUNT);

        // The legacy receipt ABI requires a transaction-hash field. Zero is a
        // deliberate sentinel for this atomic execution: the canonical outer
        // transaction hash is obtained from RPC events/submission, because a
        // contract cannot know its own transaction hash while it is running.
        let atomic_sentinel = BytesN::from_array(&env, &[0; 32]);
        let _: Val = env.invoke_contract(
            &settlement,
            &Symbol::new(&env, "record_outcome"),
            (
                receipt_id.clone(),
                route_id.clone(),
                user.clone(),
                atomic_sentinel,
                1u32,
            )
                .into_val(&env),
        );

        env.storage().instance().extend_ttl(BUMP_THRESHOLD, BUMP_TO);
        RouteExecuted {
            route_id,
            user,
            receipt_id,
            proof_destination,
            proof_amount: PROOF_AMOUNT,
        }
        .publish(&env);
    }

    pub fn proof_configuration(env: Env) -> (Address, Address, i128) {
        let proof_asset = env.storage().instance().get(&DataKey::ProofAsset).unwrap();
        let proof_destination = env
            .storage()
            .instance()
            .get(&DataKey::ProofDestination)
            .unwrap();
        (proof_asset, proof_destination, PROOF_AMOUNT)
    }

    pub fn configuration(env: Env) -> (Address, Address, Address, Address, i128) {
        let registry = env.storage().instance().get(&DataKey::Registry).unwrap();
        let settlement = env.storage().instance().get(&DataKey::Settlement).unwrap();
        let proof_asset = env.storage().instance().get(&DataKey::ProofAsset).unwrap();
        let proof_destination = env
            .storage()
            .instance()
            .get(&DataKey::ProofDestination)
            .unwrap();
        (
            registry,
            settlement,
            proof_asset,
            proof_destination,
            PROOF_AMOUNT,
        )
    }
}

#[cfg(test)]
mod test;
