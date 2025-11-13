use cumulus_primitives_core::ParaId;
use parachain_template_runtime as runtime;
use runtime::{AccountId, AuraId, Signature, EXISTENTIAL_DEPOSIT, ReputationConfig, BlockNumber, Balance,};
use sc_chain_spec::{ChainSpecExtension, ChainSpecGroup};
use sc_service::ChainType;
use serde::{Deserialize, Serialize};
use sp_core::{sr25519, Pair, Public};
use sp_runtime::traits::{IdentifyAccount, Verify};
use sp_runtime::Permill;

/// Specialized `ChainSpec` for the normal parachain runtime.
pub type ChainSpec = sc_service::GenericChainSpec<Extensions>;

/// The default XCM version to set in genesis config.
const SAFE_XCM_VERSION: u32 = xcm::prelude::XCM_VERSION;

/// Helper function to generate a crypto pair from seed
pub fn get_from_seed<TPublic: Public>(seed: &str) -> <TPublic::Pair as Pair>::Public {
    TPublic::Pair::from_string(&format!("//{}", seed), None)
        .expect("static values are valid; qed")
        .public()
}

/// The extensions for the [`ChainSpec`].
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ChainSpecGroup, ChainSpecExtension)]
pub struct Extensions {
    /// The relay chain of the Parachain.
    #[serde(alias = "relayChain", alias = "RelayChain")]
    pub relay_chain: String,
    /// The id of the Parachain.
    #[serde(alias = "paraId", alias = "ParaId")]
    pub para_id: u32,
}

impl Extensions {
    /// Try to get the extension from the given `ChainSpec`.
    pub fn try_get(chain_spec: &dyn sc_service::ChainSpec) -> Option<&Self> {
        sc_chain_spec::get_extension(chain_spec.extensions())
    }
}

type AccountPublic = <Signature as Verify>::Signer;

/// Generate collator keys from seed.
///
/// This function's return type must always match the session keys of the chain in tuple format.
pub fn get_collator_keys_from_seed(seed: &str) -> AuraId {
    get_from_seed::<AuraId>(seed)
}

/// Helper function to generate an account ID from seed
pub fn get_account_id_from_seed<TPublic: Public>(seed: &str) -> AccountId
where
    AccountPublic: From<<TPublic::Pair as Pair>::Public>,
{
    AccountPublic::from(get_from_seed::<TPublic>(seed)).into_account()
}

/// Generate the session keys from individual elements.
///
/// The input must be a tuple of individual keys (a single arg for now since we have just one key).
pub fn template_session_keys(keys: AuraId) -> runtime::SessionKeys {
    runtime::SessionKeys { aura: keys }
}

pub fn development_config() -> ChainSpec {
    // Give your base currency a unit name and decimal places
    let mut properties = sc_chain_spec::Properties::new();
    properties.insert("tokenSymbol".into(), "TSK".into());
    properties.insert("tokenDecimals".into(), 12.into());
    properties.insert("ss58Format".into(), 42.into());
    properties.insert("basedOn".into(), "r0gue-io/base-parachain".into());

    ChainSpec::builder(
        runtime::WASM_BINARY.expect("WASM binary was not built, please build it!"),
        Extensions {
            relay_chain: "paseo-local".into(),
            // You MUST set this to the correct network!
            para_id: 2000,
        },
    )
    .with_name("Development")
    .with_id("dev")
    .with_chain_type(ChainType::Development)
    .with_genesis_config_patch(testnet_genesis(
        // initial collators.
        vec![
            (
                get_account_id_from_seed::<sr25519::Public>("Alice"),
                get_collator_keys_from_seed("Alice"),
            ),
            (
                get_account_id_from_seed::<sr25519::Public>("Bob"),
                get_collator_keys_from_seed("Bob"),
            ),
        ],
        vec![
            get_account_id_from_seed::<sr25519::Public>("Alice"),
            get_account_id_from_seed::<sr25519::Public>("Bob"),
            get_account_id_from_seed::<sr25519::Public>("Charlie"),
            get_account_id_from_seed::<sr25519::Public>("Dave"),
            get_account_id_from_seed::<sr25519::Public>("Eve"),
            get_account_id_from_seed::<sr25519::Public>("Ferdie"),
            get_account_id_from_seed::<sr25519::Public>("Alice//stash"),
            get_account_id_from_seed::<sr25519::Public>("Bob//stash"),
            get_account_id_from_seed::<sr25519::Public>("Charlie//stash"),
            get_account_id_from_seed::<sr25519::Public>("Dave//stash"),
            get_account_id_from_seed::<sr25519::Public>("Eve//stash"),
            get_account_id_from_seed::<sr25519::Public>("Ferdie//stash"),
        ],
        get_account_id_from_seed::<sr25519::Public>("Alice"),
        2000.into(),
    ))
    .with_properties(properties)
    .build()
}

pub fn local_testnet_config() -> ChainSpec {
    // Give your base currency a unit name and decimal places
    let mut properties = sc_chain_spec::Properties::new();
    properties.insert("tokenSymbol".into(), "TSK".into());
    properties.insert("tokenDecimals".into(), 12.into());
    properties.insert("ss58Format".into(), 42.into());
    properties.insert("basedOn".into(), "r0gue-io/base-parachain".into());

    #[allow(deprecated)]
    ChainSpec::builder(
        runtime::WASM_BINARY.expect("WASM binary was not built, please build it!"),
        Extensions {
            relay_chain: "paseo-local".into(),
            // You MUST set this to the correct network!
            para_id: 2000,
        },
    )
    .with_name("Local Testnet")
    .with_id("local_testnet")
    .with_chain_type(ChainType::Local)
    .with_genesis_config_patch(testnet_genesis(
        // initial collators.
        vec![
            (
                get_account_id_from_seed::<sr25519::Public>("Alice"),
                get_collator_keys_from_seed("Alice"),
            ),
            (
                get_account_id_from_seed::<sr25519::Public>("Bob"),
                get_collator_keys_from_seed("Bob"),
            ),
        ],
        vec![
            get_account_id_from_seed::<sr25519::Public>("Alice"),
            get_account_id_from_seed::<sr25519::Public>("Bob"),
            get_account_id_from_seed::<sr25519::Public>("Charlie"),
            get_account_id_from_seed::<sr25519::Public>("Dave"),
            get_account_id_from_seed::<sr25519::Public>("Eve"),
            get_account_id_from_seed::<sr25519::Public>("Ferdie"),
            get_account_id_from_seed::<sr25519::Public>("Alice//stash"),
            get_account_id_from_seed::<sr25519::Public>("Bob//stash"),
            get_account_id_from_seed::<sr25519::Public>("Charlie//stash"),
            get_account_id_from_seed::<sr25519::Public>("Dave//stash"),
            get_account_id_from_seed::<sr25519::Public>("Eve//stash"),
            get_account_id_from_seed::<sr25519::Public>("Ferdie//stash"),
        ],
        get_account_id_from_seed::<sr25519::Public>("Alice"),
        2000.into(),
    ))
    .with_protocol_id("template-local")
    .with_properties(properties)
    .build()
}

fn testnet_genesis(
    invulnerables: Vec<(AccountId, AuraId)>,
    endowed_accounts: Vec<AccountId>,
    root: AccountId,
    id: ParaId,
) -> serde_json::Value {
    let alice = get_account_id_from_seed::<sr25519::Public>("Alice");
    let bob = get_account_id_from_seed::<sr25519::Public>("Bob");
    let charlie = get_account_id_from_seed::<sr25519::Public>("Charlie");
    let dave = get_account_id_from_seed::<sr25519::Public>("Dave");
    let eve = get_account_id_from_seed::<sr25519::Public>("Eve");
    // Alice as Client - has posted projects and spent money
    let alice_reputation = runtime::pallet_reputation::ReputationData {
        registration_block: 1u32,
        last_activity_block: 1u32,
        projects_completed: 0,
        projects_failed: 0,
        total_earned: 0u128,
        projects_posted: 10, // Client activity
        total_spent: 50000u128, // Significant spending
        disputes_initiated: 0,
        disputes_won: 0,
        disputes_lost: 0,
        avg_rating_received: 4500, // Good rating (0-5000 scale)
        total_ratings_received: 8,
        jury_participation: 0,
        jury_accuracy: Permill::zero(),
    };
    // Bob as Freelancer - has completed projects and earned money
    let bob_reputation = runtime::pallet_reputation::ReputationData {
        registration_block: 1u32,
        last_activity_block: 1u32,
        projects_completed: 15, // Experienced freelancer
        projects_failed: 1,
        total_earned: 25000u128, // Good earnings
        projects_posted: 0,
        total_spent: 0u128,
        disputes_initiated: 0,
        disputes_won: 1,
        disputes_lost: 0,
        avg_rating_received: 4200,
        total_ratings_received: 12,
        jury_participation: 0,
        jury_accuracy: Permill::zero(),
    };
    // Charlie as Bronze Juror - meets minimum requirements
    let charlie_reputation = runtime::pallet_reputation::ReputationData {
        registration_block: 1u32,
        last_activity_block: 1u32,
        projects_completed: 5, // Minimum for Bronze
        projects_failed: 0,
        total_earned: 1500u128, // Above Bronze threshold
        projects_posted: 0,
        total_spent: 0u128,
        disputes_initiated: 0,
        disputes_won: 0,
        disputes_lost: 0, // No disputes lost
        avg_rating_received: 4000,
        total_ratings_received: 5,
        jury_participation: 0,
        jury_accuracy: Permill::zero(),
    };
    // Dave as Silver Juror - higher tier requirements
    let dave_reputation = runtime::pallet_reputation::ReputationData {
        registration_block: 1u32,
        last_activity_block: 1u32,
        projects_completed: 25, // Above Silver threshold
        projects_failed: 1,
        total_earned: 15000u128, // Above Silver threshold
        projects_posted: 0,
        total_spent: 0u128,
        disputes_initiated: 0,
        disputes_won: 2,
        disputes_lost: 0,
        avg_rating_received: 4300,
        total_ratings_received: 20,
        jury_participation: 0,
        jury_accuracy: Permill::zero(),
    };
    // Eve as Gold Juror - highest tier requirements
    let eve_reputation = runtime::pallet_reputation::ReputationData {
        registration_block: 1u32,
        last_activity_block: 1u32,
        projects_completed: 60, // Above Gold threshold
        projects_failed: 2,
        total_earned: 75000u128, // Above Gold threshold
        projects_posted: 0,
        total_spent: 0u128,
        disputes_initiated: 0,
        disputes_won: 5,
        disputes_lost: 0,
        avg_rating_received: 4600,
        total_ratings_received: 50,
        jury_participation: 0,
        jury_accuracy: Permill::zero(),
    };
    serde_json::json!({
        "balances": {
            "balances": endowed_accounts.iter().cloned().map(|k| (k, 1u64 << 60)).collect::<Vec<_>>(),
        },
        "parachainInfo": {
            "parachainId": id,
        },
        "collatorSelection": {
            "invulnerables": invulnerables.iter().cloned().map(|(acc, _)| acc).collect::<Vec<_>>(),
            "candidacyBond": EXISTENTIAL_DEPOSIT * 16,
        },
        "session": {
            "keys": invulnerables
                .into_iter()
                .map(|(acc, aura)| {
                    (
                        acc.clone(),                 // account id
                        acc,                         // validator id
                        template_session_keys(aura), // session keys
                    )
                })
            .collect::<Vec<_>>(),
        },
        "polkadotXcm": {
            "safeXcmVersion": Some(SAFE_XCM_VERSION),
        },
        "reputation": {
            "initialUsers": vec![
                (alice.clone(), alice_reputation),
                (bob.clone(), bob_reputation),
                (charlie.clone(), charlie_reputation),
                (dave.clone(), dave_reputation),
                (eve.clone(), eve_reputation),
            ],
            "initialJurors": vec![charlie, dave, eve], // Charlie, Dave, and Eve as jurors
            "jurorStake": 1000000000000u128, // 1 unit with 12 decimals
        },
        "sudo": { "key": Some(root) }
    })
}