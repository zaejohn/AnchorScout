extern crate std;

use super::*;
use route_registry::{RouteRegistry, RouteRegistryClient, RouteStatus};
use settlement_receipt::{SettlementReceipt, SettlementReceiptClient, SettlementStatus};
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    token::{StellarAssetClient, TokenClient},
    Address, BytesN, Env, String,
};

fn id(env: &Env, byte: u8) -> BytesN<32> {
    BytesN::from_array(env, &[byte; 32])
}

struct Fixture {
    env: Env,
    user: Address,
    destination: Address,
    route: RouteRegistryClient<'static>,
    settlement: SettlementReceiptClient<'static>,
    executor: RouteExecutorClient<'static>,
    token: TokenClient<'static>,
}

fn setup(mock_auth: bool, user_balance: i128) -> Fixture {
    let env = Env::default();
    if mock_auth {
        env.mock_all_auths_allowing_non_root_auth();
    }
    env.ledger().set_timestamp(1_700_000_000);
    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let destination = Address::generate(&env);
    let asset = env.register_stellar_asset_contract_v2(admin.clone());
    let asset_id = asset.address();
    if user_balance > 0 {
        env.mock_all_auths_allowing_non_root_auth();
        StellarAssetClient::new(&env, &asset_id).mint(&user, &user_balance);
        if !mock_auth {
            env.set_auths(&[]);
        }
    }

    let route_id = env.register(RouteRegistry, (admin,));
    let settlement_id = env.register(SettlementReceipt, (route_id.clone(),));
    let route = RouteRegistryClient::new(&env, &route_id);
    let settlement = SettlementReceiptClient::new(&env, &settlement_id);
    if mock_auth {
        route.configure_settlement(&settlement_id);
    } else {
        env.mock_all_auths();
        route.configure_settlement(&settlement_id);
        env.set_auths(&[]);
    }
    let executor_id = env.register(
        RouteExecutor,
        (
            route_id,
            settlement_id,
            asset_id.clone(),
            destination.clone(),
        ),
    );

    Fixture {
        env: env.clone(),
        user,
        destination,
        route,
        settlement,
        executor: RouteExecutorClient::new(&env, &executor_id),
        token: TokenClient::new(&env, &asset_id),
    }
}

fn execute(fixture: &Fixture, route_byte: u8, receipt_byte: u8) {
    fixture.executor.execute_route(
        &id(&fixture.env, route_byte),
        &id(&fixture.env, receipt_byte),
        &fixture.user,
        &String::from_str(&fixture.env, "coins-ph-market"),
        &String::from_str(&fixture.env, "XLM"),
        &1_000_000_000,
        &String::from_str(&fixture.env, "PHP"),
        &5_700_000_000,
        &0,
        &id(&fixture.env, 99),
    );
}

#[test]
fn executes_route_payment_receipt_and_finalization_atomically() {
    let fixture = setup(true, 5_000_000);
    execute(&fixture, 1, 2);

    assert_eq!(fixture.token.balance(&fixture.user), 4_000_000);
    assert_eq!(fixture.token.balance(&fixture.destination), 1_000_000);
    assert_eq!(
        fixture.route.get_route(&id(&fixture.env, 1)).status,
        RouteStatus::Completed
    );
    let receipt = fixture.settlement.get_receipt(&id(&fixture.env, 1));
    assert_eq!(receipt.status, SettlementStatus::Completed);
    assert_eq!(receipt.receipt_id, id(&fixture.env, 2));
    assert_eq!(receipt.transaction_hash, BytesN::from_array(&fixture.env, &[0; 32]));
}

#[test]
fn rolls_back_route_and_receipt_when_payment_fails() {
    let fixture = setup(true, 500_000);
    assert!(fixture.executor.try_execute_route(
        &id(&fixture.env, 3),
        &id(&fixture.env, 4),
        &fixture.user,
        &String::from_str(&fixture.env, "coins-ph-market"),
        &String::from_str(&fixture.env, "XLM"),
        &1_000_000_000,
        &String::from_str(&fixture.env, "PHP"),
        &5_700_000_000,
        &0,
        &id(&fixture.env, 98),
    ).is_err());
    assert!(fixture.route.try_get_route(&id(&fixture.env, 3)).is_err());
    assert!(fixture.settlement.try_get_receipt(&id(&fixture.env, 3)).is_err());
}

#[test]
fn rolls_back_payment_and_route_when_settlement_fails_after_transfer() {
    let fixture = setup(true, 5_000_000);
    execute(&fixture, 7, 8);
    let user_balance = fixture.token.balance(&fixture.user);
    let destination_balance = fixture.token.balance(&fixture.destination);

    assert!(fixture.executor.try_execute_route(
        &id(&fixture.env, 9),
        &id(&fixture.env, 8),
        &fixture.user,
        &String::from_str(&fixture.env, "coins-ph-market"),
        &String::from_str(&fixture.env, "XLM"),
        &1_000_000_000,
        &String::from_str(&fixture.env, "PHP"),
        &5_700_000_000,
        &0,
        &id(&fixture.env, 96),
    ).is_err());

    assert_eq!(fixture.token.balance(&fixture.user), user_balance);
    assert_eq!(fixture.token.balance(&fixture.destination), destination_balance);
    assert!(fixture.route.try_get_route(&id(&fixture.env, 9)).is_err());
    assert!(fixture.settlement.try_get_receipt(&id(&fixture.env, 9)).is_err());
}

#[test]
fn execution_requires_user_authorization() {
    let fixture = setup(false, 5_000_000);
    assert!(fixture.executor.try_execute_route(
        &id(&fixture.env, 5),
        &id(&fixture.env, 6),
        &fixture.user,
        &String::from_str(&fixture.env, "coins-ph-market"),
        &String::from_str(&fixture.env, "XLM"),
        &1_000_000_000,
        &String::from_str(&fixture.env, "PHP"),
        &5_700_000_000,
        &0,
        &id(&fixture.env, 97),
    ).is_err());
}

#[test]
fn proof_configuration_is_immutable_and_visible() {
    let fixture = setup(true, 0);
    let (asset, destination, amount) = fixture.executor.proof_configuration();
    assert_eq!(asset, fixture.token.address);
    assert_eq!(destination, fixture.destination);
    assert_eq!(amount, 1_000_000);
}

#[test]
fn full_configuration_is_visible_for_client_integrity_checks() {
    let fixture = setup(true, 0);
    assert_eq!(
        fixture.executor.configuration(),
        (
            fixture.route.address,
            fixture.settlement.address,
            fixture.token.address,
            fixture.destination,
            PROOF_AMOUNT,
        )
    );
}
