#![no_std]

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, panic_with_error, Address,
    BytesN, Env, String, Vec,
};

const LEDGERS_PER_DAY: u32 = 17_280;
const BUMP_THRESHOLD: u32 = 30 * LEDGERS_PER_DAY;
const BUMP_TO: u32 = 120 * LEDGERS_PER_DAY;
const MAX_PAGE_SIZE: u32 = 20;

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum RouteStatus {
    Pending,
    Completed,
    Failed,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RouteRecord {
    pub route_id: BytesN<32>,
    pub user: Address,
    pub anchor_id: String,
    pub source_asset: String,
    pub source_amount: i128,
    pub destination_currency: String,
    pub destination_amount: i128,
    pub fee: i128,
    pub quote_hash: BytesN<32>,
    pub selected_at: u64,
    pub status: RouteStatus,
    pub transaction_hash: Option<BytesN<32>>,
}

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Admin,
    SettlementContract,
    Route(BytesN<32>),
    UserRouteCount(Address),
    UserRoute(Address, u32),
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum RouteError {
    InvalidAmount = 1,
    InvalidText = 2,
    DuplicateRoute = 3,
    RouteNotFound = 4,
    InvalidTransition = 5,
    SettlementNotConfigured = 6,
    UserMismatch = 7,
    InvalidPage = 8,
}

#[contractevent]
pub struct RouteSelected {
    #[topic]
    pub route_id: BytesN<32>,
    #[topic]
    pub user: Address,
    pub anchor_id: String,
    pub source_amount: i128,
    pub selected_at: u64,
}

#[contractevent]
pub struct RouteStatusChanged {
    #[topic]
    pub route_id: BytesN<32>,
    #[topic]
    pub user: Address,
    pub status: RouteStatus,
    pub transaction_hash: BytesN<32>,
}

#[contractevent]
pub struct SettlementContractConfigured {
    #[topic]
    pub settlement_contract: Address,
}

#[contract]
pub struct RouteRegistry;

#[contractimpl]
impl RouteRegistry {
    pub fn __constructor(env: Env, admin: Address) {
        env.storage().instance().set(&DataKey::Admin, &admin);
    }

    pub fn configure_settlement(env: Env, settlement_contract: Address) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("admin must exist");
        admin.require_auth();
        env.storage()
            .instance()
            .set(&DataKey::SettlementContract, &settlement_contract);
        bump_instance(&env);
        SettlementContractConfigured {
            settlement_contract,
        }
        .publish(&env);
    }

    #[allow(clippy::too_many_arguments)]
    pub fn create_route(
        env: Env,
        route_id: BytesN<32>,
        user: Address,
        anchor_id: String,
        source_asset: String,
        source_amount: i128,
        destination_currency: String,
        destination_amount: i128,
        fee: i128,
        quote_hash: BytesN<32>,
    ) -> RouteRecord {
        user.require_auth();
        validate_text(&env, &anchor_id);
        validate_text(&env, &source_asset);
        validate_text(&env, &destination_currency);
        if source_amount <= 0 || destination_amount <= 0 || fee < 0 {
            panic_with_error!(&env, RouteError::InvalidAmount);
        }

        let route_key = DataKey::Route(route_id.clone());
        if env.storage().persistent().has(&route_key) {
            panic_with_error!(&env, RouteError::DuplicateRoute);
        }

        let selected_at = env.ledger().timestamp();
        let route = RouteRecord {
            route_id: route_id.clone(),
            user: user.clone(),
            anchor_id: anchor_id.clone(),
            source_asset,
            source_amount,
            destination_currency,
            destination_amount,
            fee,
            quote_hash,
            selected_at,
            status: RouteStatus::Pending,
            transaction_hash: None,
        };

        let count_key = DataKey::UserRouteCount(user.clone());
        let count: u32 = env.storage().persistent().get(&count_key).unwrap_or(0);
        let index_key = DataKey::UserRoute(user.clone(), count);
        env.storage().persistent().set(&route_key, &route);
        env.storage().persistent().set(&index_key, &route_id);
        env.storage().persistent().set(&count_key, &(count + 1));
        bump_persistent(&env, &route_key);
        bump_persistent(&env, &index_key);
        bump_persistent(&env, &count_key);
        bump_instance(&env);

        RouteSelected {
            route_id,
            user,
            anchor_id,
            source_amount,
            selected_at,
        }
        .publish(&env);
        route
    }

    pub fn finalize_route(
        env: Env,
        route_id: BytesN<32>,
        user: Address,
        status_code: u32,
        transaction_hash: BytesN<32>,
    ) {
        let settlement: Address = env
            .storage()
            .instance()
            .get(&DataKey::SettlementContract)
            .unwrap_or_else(|| panic_with_error!(&env, RouteError::SettlementNotConfigured));
        settlement.require_auth();

        let key = DataKey::Route(route_id.clone());
        let mut route: RouteRecord = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, RouteError::RouteNotFound));
        if route.user != user {
            panic_with_error!(&env, RouteError::UserMismatch);
        }
        if route.status != RouteStatus::Pending {
            panic_with_error!(&env, RouteError::InvalidTransition);
        }

        route.status = match status_code {
            1 => RouteStatus::Completed,
            2 => RouteStatus::Failed,
            _ => panic_with_error!(&env, RouteError::InvalidTransition),
        };
        route.transaction_hash = Some(transaction_hash.clone());
        env.storage().persistent().set(&key, &route);
        bump_persistent(&env, &key);
        bump_instance(&env);

        RouteStatusChanged {
            route_id,
            user,
            status: route.status.clone(),
            transaction_hash,
        }
        .publish(&env);
    }

    pub fn get_route(env: Env, route_id: BytesN<32>) -> RouteRecord {
        let key = DataKey::Route(route_id);
        env.storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, RouteError::RouteNotFound))
    }

    pub fn get_route_user(env: Env, route_id: BytesN<32>) -> Address {
        Self::get_route(env, route_id).user
    }

    pub fn get_user_route_count(env: Env, user: Address) -> u32 {
        let key = DataKey::UserRouteCount(user);
        env.storage().persistent().get(&key).unwrap_or(0)
    }

    pub fn get_user_routes(env: Env, user: Address, cursor: u32, limit: u32) -> Vec<RouteRecord> {
        if limit == 0 || limit > MAX_PAGE_SIZE {
            panic_with_error!(&env, RouteError::InvalidPage);
        }
        let count = Self::get_user_route_count(env.clone(), user.clone());
        let mut routes = Vec::new(&env);
        if cursor >= count {
            return routes;
        }
        let end = cursor.saturating_add(limit).min(count);
        let mut index = cursor;
        while index < end {
            let index_key = DataKey::UserRoute(user.clone(), index);
            let route_id: BytesN<32> = env
                .storage()
                .persistent()
                .get(&index_key)
                .expect("route index must reference a route");
            let route_key = DataKey::Route(route_id);
            let route: RouteRecord = env
                .storage()
                .persistent()
                .get(&route_key)
                .expect("indexed route must exist");
            routes.push_back(route);
            index += 1;
        }
        routes
    }
}

fn validate_text(env: &Env, value: &String) {
    if value.len() == 0 || value.len() > 64 {
        panic_with_error!(env, RouteError::InvalidText);
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
