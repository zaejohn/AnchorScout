extern crate std;

use super::*;
use route_registry::{RouteRegistry, RouteRegistryClient, RouteStatus};
use soroban_sdk::{
    testutils::{Address as _, Events as _, Ledger},
    Address, BytesN, Env, Error, String,
};

fn id(env: &Env, byte: u8) -> BytesN<32> {
    BytesN::from_array(env, &[byte; 32])
}

struct Fixture {
    env: Env,
    user: Address,
    route: RouteRegistryClient<'static>,
    settlement: SettlementReceiptClient<'static>,
}

fn setup() -> Fixture {
    let env = Env::default();
    env.mock_all_auths_allowing_non_root_auth();
    env.ledger().set_timestamp(1_700_000_000);
    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let route_id = env.register(RouteRegistry, (admin.clone(),));
    let settlement_id = env.register(SettlementReceipt, (route_id.clone(),));
    let route = RouteRegistryClient::new(&env, &route_id);
    let settlement = SettlementReceiptClient::new(&env, &settlement_id);
    route.configure_settlement(&settlement_id);
    route.create_route(
        &id(&env, 1),
        &user,
        &String::from_str(&env, "bayani-demo"),
        &String::from_str(&env, "XLM"),
        &1_000_000,
        &String::from_str(&env, "PHP"),
        &5_700_000_000,
        &10_000,
        &id(&env, 2),
    );
    Fixture {
        env,
        user,
        route,
        settlement,
    }
}

#[test]
fn records_completed_receipt_and_finalizes_route() {
    let fixture = setup();
    let receipt = fixture.settlement.record_outcome(
        &id(&fixture.env, 3),
        &id(&fixture.env, 1),
        &fixture.user,
        &id(&fixture.env, 4),
        &1,
    );
    assert_eq!(receipt.status, SettlementStatus::Completed);
    assert_eq!(
        fixture.route.get_route(&id(&fixture.env, 1)).status,
        RouteStatus::Completed
    );
    assert_eq!(
        fixture.settlement.get_receipt(&id(&fixture.env, 1)),
        receipt
    );
}

#[test]
fn records_failed_receipt_and_finalizes_route() {
    let fixture = setup();
    fixture.settlement.record_outcome(
        &id(&fixture.env, 5),
        &id(&fixture.env, 1),
        &fixture.user,
        &id(&fixture.env, 6),
        &2,
    );
    assert_eq!(
        fixture.route.get_route(&id(&fixture.env, 1)).status,
        RouteStatus::Failed
    );
}

#[test]
fn rejects_duplicate_and_invalid_status() {
    let fixture = setup();
    assert_eq!(
        fixture.settlement.try_record_outcome(
            &id(&fixture.env, 7),
            &id(&fixture.env, 1),
            &fixture.user,
            &id(&fixture.env, 8),
            &0,
        ),
        Err(Ok(Error::from_contract_error(
            SettlementError::InvalidStatus as u32
        )))
    );
    fixture.settlement.record_outcome(
        &id(&fixture.env, 7),
        &id(&fixture.env, 1),
        &fixture.user,
        &id(&fixture.env, 8),
        &1,
    );
    assert_eq!(
        fixture.settlement.try_record_outcome(
            &id(&fixture.env, 9),
            &id(&fixture.env, 1),
            &fixture.user,
            &id(&fixture.env, 10),
            &1,
        ),
        Err(Ok(Error::from_contract_error(
            SettlementError::DuplicateReceipt as u32
        )))
    );
}

#[test]
fn rejects_route_user_mismatch() {
    let fixture = setup();
    let other = Address::generate(&fixture.env);
    assert_eq!(
        fixture.settlement.try_record_outcome(
            &id(&fixture.env, 11),
            &id(&fixture.env, 1),
            &other,
            &id(&fixture.env, 12),
            &1,
        ),
        Err(Ok(Error::from_contract_error(
            SettlementError::RouteUserMismatch as u32
        )))
    );
}

#[test]
fn settlement_requires_user_auth_and_emits_cross_contract_events() {
    let fixture = setup();
    fixture.settlement.record_outcome(
        &id(&fixture.env, 13),
        &id(&fixture.env, 1),
        &fixture.user,
        &id(&fixture.env, 14),
        &1,
    );
    assert_eq!(fixture.env.auths()[0].0, fixture.user);
    assert_eq!(fixture.env.events().all().events().len(), 2);
}

#[test]
fn receipt_ids_are_unique_across_routes() {
    let fixture = setup();
    fixture.route.create_route(
        &id(&fixture.env, 15),
        &fixture.user,
        &String::from_str(&fixture.env, "harbor-demo"),
        &String::from_str(&fixture.env, "XLM"),
        &1_000_000,
        &String::from_str(&fixture.env, "PHP"),
        &5_710_000_000,
        &10_000,
        &id(&fixture.env, 16),
    );
    let receipt_id = id(&fixture.env, 17);
    fixture.settlement.record_outcome(
        &receipt_id,
        &id(&fixture.env, 1),
        &fixture.user,
        &id(&fixture.env, 18),
        &1,
    );
    assert_eq!(
        fixture.settlement.try_record_outcome(
            &receipt_id,
            &id(&fixture.env, 15),
            &fixture.user,
            &id(&fixture.env, 19),
            &1,
        ),
        Err(Ok(Error::from_contract_error(
            SettlementError::DuplicateReceipt as u32
        )))
    );
}

#[test]
fn nested_registry_failure_rolls_back_the_receipt() {
    let fixture = setup();
    fixture.route.finalize_route(
        &id(&fixture.env, 1),
        &fixture.user,
        &1,
        &id(&fixture.env, 20),
    );
    assert!(fixture
        .settlement
        .try_record_outcome(
            &id(&fixture.env, 21),
            &id(&fixture.env, 1),
            &fixture.user,
            &id(&fixture.env, 22),
            &1,
        )
        .is_err());
    assert!(fixture
        .settlement
        .try_get_receipt(&id(&fixture.env, 1))
        .is_err());
}

#[test]
fn settlement_fails_without_route_user_authorization() {
    let fixture = setup();
    fixture.env.set_auths(&[]);
    assert!(fixture
        .settlement
        .try_record_outcome(
            &id(&fixture.env, 23),
            &id(&fixture.env, 1),
            &fixture.user,
            &id(&fixture.env, 24),
            &1,
        )
        .is_err());
}
