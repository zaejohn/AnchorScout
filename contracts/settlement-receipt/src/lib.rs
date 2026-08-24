#![no_std]

use soroban_sdk::{
    contract, contractclient, contracterror, contractevent, contractimpl, contracttype,
    panic_with_error, Address, BytesN, Env,
};

const LEDGERS_PER_DAY: u32 = 17_280;
const BUMP_THRESHOLD: u32 = 30 * LEDGERS_PER_DAY;
const BUMP_TO: u32 = 120 * LEDGERS_PER_DAY;

#[contractclient(name = "RegistryClient")]
pub trait RegistryInterface {
    fn get_route_user(env: Env, route_id: BytesN<32>) -> Address;
    fn finalize_route(
        env: Env,
        route_id: BytesN<32>,
        user: Address,
        status_code: u32,
        transaction_hash: BytesN<32>,
    );
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum SettlementStatus {
    Completed,
    Failed,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SettlementReceiptRecord {
    pub receipt_id: BytesN<32>,
    pub route_id: BytesN<32>,
    pub user: Address,
    pub transaction_hash: BytesN<32>,
    pub status: SettlementStatus,
    pub completed_at: u64,
}

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Registry,
    Receipt(BytesN<32>),
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum SettlementError {
    InvalidStatus = 1,
    DuplicateReceipt = 2,
    RouteUserMismatch = 3,
    ReceiptNotFound = 4,
}

#[contractevent]
pub struct SettlementRecorded {
    #[topic]
    pub route_id: BytesN<32>,
    #[topic]
    pub user: Address,
    pub receipt_id: BytesN<32>,
    pub transaction_hash: BytesN<32>,
    pub status: SettlementStatus,
    pub completed_at: u64,
}

#[contract]
pub struct SettlementReceipt;

#[contractimpl]
impl SettlementReceipt {
    pub fn __constructor(env: Env, registry: Address) {
        env.storage().instance().set(&DataKey::Registry, &registry);
    }

    pub fn record_outcome(
        env: Env,
        receipt_id: BytesN<32>,
        route_id: BytesN<32>,
        user: Address,
        transaction_hash: BytesN<32>,
        status_code: u32,
    ) -> SettlementReceiptRecord {
        user.require_auth();
        let status = match status_code {
            1 => SettlementStatus::Completed,
            2 => SettlementStatus::Failed,
            _ => panic_with_error!(&env, SettlementError::InvalidStatus),
        };
        let receipt_key = DataKey::Receipt(route_id.clone());
        if env.storage().persistent().has(&receipt_key) {
            panic_with_error!(&env, SettlementError::DuplicateReceipt);
        }

        let registry: Address = env
            .storage()
            .instance()
            .get(&DataKey::Registry)
            .expect("registry must exist");
        let registry_client = RegistryClient::new(&env, &registry);
        if registry_client.get_route_user(&route_id) != user {
            panic_with_error!(&env, SettlementError::RouteUserMismatch);
        }

        let record = SettlementReceiptRecord {
            receipt_id: receipt_id.clone(),
            route_id: route_id.clone(),
            user: user.clone(),
            transaction_hash: transaction_hash.clone(),
            status: status.clone(),
            completed_at: env.ledger().timestamp(),
        };
        env.storage().persistent().set(&receipt_key, &record);
        bump_persistent(&env, &receipt_key);
        bump_instance(&env);

        registry_client.finalize_route(&route_id, &user, &status_code, &transaction_hash);

        SettlementRecorded {
            route_id,
            user,
            receipt_id,
            transaction_hash,
            status,
            completed_at: record.completed_at,
        }
        .publish(&env);
        record
    }

    pub fn get_receipt(env: Env, route_id: BytesN<32>) -> SettlementReceiptRecord {
        let key = DataKey::Receipt(route_id);
        env.storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, SettlementError::ReceiptNotFound))
    }
}

fn bump_instance(env: &Env) {
    env.storage().instance().extend_ttl(BUMP_THRESHOLD, BUMP_TO);
}

fn bump_persistent(env: &Env, key: &DataKey) {
    env.storage()
        .persistent()
        .extend_ttl(key, BUMP_THRESHOLD, BUMP_TO);
}

#[cfg(test)]
mod test;
