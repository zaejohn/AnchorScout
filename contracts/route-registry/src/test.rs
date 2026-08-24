extern crate std;

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Events as _, Ledger},
    Address, BytesN, Env, Error, String,
};

fn id(env: &Env, byte: u8) -> BytesN<32> {
    BytesN::from_array(env, &[byte; 32])
}

fn setup() -> (Env, Address, Address, Address, RouteRegistryClient<'static>) {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(1_700_000_000);
    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let settlement = Address::generate(&env);
    let contract_id = env.register(RouteRegistry, (admin.clone(),));
    let client = RouteRegistryClient::new(&env, &contract_id);
    client.configure_settlement(&settlement);
    (env, admin, user, settlement, client)
}

fn create(client: &RouteRegistryClient<'_>, env: &Env, user: &Address, byte: u8) -> RouteRecord {
    client.create_route(
        &id(env, byte),
        user,
        &String::from_str(env, "bayani-demo"),
        &String::from_str(env, "XLM"),
        &1_000_000i128,
        &String::from_str(env, "PHP"),
        &5_700_000_000i128,
        &10_000i128,
        &id(env, byte + 10),
    )
}

#[test]
fn creates_and_reads_route_with_auth() {
    let (env, _admin, user, _settlement, client) = setup();
    let route = create(&client, &env, &user, 1);
    assert_eq!(route.status, RouteStatus::Pending);
    assert_eq!(client.get_route(&id(&env, 1)), route);
    assert_eq!(client.get_user_route_count(&user), 1);
    assert_eq!(client.get_user_routes(&user, &0, &20).len(), 1);
}

#[test]
fn rejects_duplicate_and_invalid_amounts() {
    let (env, _admin, user, _settlement, client) = setup();
    create(&client, &env, &user, 2);
    assert_eq!(
        client.try_create_route(
            &id(&env, 2),
            &user,
            &String::from_str(&env, "bayani-demo"),
            &String::from_str(&env, "XLM"),
            &1,
            &String::from_str(&env, "PHP"),
            &1,
            &0,
            &id(&env, 12),
        ),
        Err(Ok(Error::from_contract_error(
            RouteError::DuplicateRoute as u32
        )))
    );
    assert_eq!(
        client.try_create_route(
            &id(&env, 3),
            &user,
            &String::from_str(&env, "bayani-demo"),
            &String::from_str(&env, "XLM"),
            &0,
            &String::from_str(&env, "PHP"),
            &1,
            &0,
            &id(&env, 13),
        ),
        Err(Ok(Error::from_contract_error(
            RouteError::InvalidAmount as u32
        )))
    );
}

#[test]
fn only_allows_one_final_transition() {
    let (env, _admin, user, _settlement, client) = setup();
    create(&client, &env, &user, 4);
    client.finalize_route(&id(&env, 4), &user, &1, &id(&env, 24));
    let final_route = client.get_route(&id(&env, 4));
    assert_eq!(final_route.status, RouteStatus::Completed);
    assert_eq!(
        client.try_finalize_route(&id(&env, 4), &user, &2, &id(&env, 25)),
        Err(Ok(Error::from_contract_error(
            RouteError::InvalidTransition as u32
        )))
    );
}

#[test]
fn rejects_wrong_user_and_unbounded_pages() {
    let (env, _admin, user, _settlement, client) = setup();
    let other = Address::generate(&env);
    create(&client, &env, &user, 5);
    assert_eq!(
        client.try_finalize_route(&id(&env, 5), &other, &1, &id(&env, 26)),
        Err(Ok(Error::from_contract_error(
            RouteError::UserMismatch as u32
        )))
    );
    assert_eq!(
        client.try_get_user_routes(&user, &0, &21),
        Err(Ok(Error::from_contract_error(
            RouteError::InvalidPage as u32
        )))
    );
}

#[test]
fn route_creation_requires_the_user_and_emits_an_event() {
    let (env, _admin, user, _settlement, client) = setup();
    create(&client, &env, &user, 6);
    let auths = env.auths();
    assert_eq!(auths.len(), 1);
    assert_eq!(auths[0].0, user);
    assert_eq!(env.events().all().events().len(), 1);
}

#[test]
fn route_creation_fails_without_user_authorization() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let contract_id = env.register(RouteRegistry, (admin,));
    let client = RouteRegistryClient::new(&env, &contract_id);
    assert!(client
        .try_create_route(
            &id(&env, 7),
            &user,
            &String::from_str(&env, "bayani-demo"),
            &String::from_str(&env, "XLM"),
            &1,
            &String::from_str(&env, "PHP"),
            &1,
            &0,
            &id(&env, 17),
        )
        .is_err());
}
