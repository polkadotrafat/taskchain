use crate::{
    AccountId, BalancesConfig, CollatorSelectionConfig, ParachainInfoConfig, PolkadotXcmConfig,
    RuntimeGenesisConfig, SessionConfig, SessionKeys, SudoConfig, EXISTENTIAL_DEPOSIT,
    ReputationConfig, Balance, BlockNumber,
};
use alloc::{vec, vec::Vec};
use cumulus_primitives_core::ParaId;
use frame_support::build_struct_json_patch;
use parachains_common::AuraId;
use serde_json::Value;
use sp_genesis_builder::PresetId;
use sp_keyring::Sr25519Keyring;
use sp_runtime::Permill;
use pallet_reputation::ReputationData;

/// The default XCM version to set in genesis config.
const SAFE_XCM_VERSION: u32 = xcm::prelude::XCM_VERSION;

/// Generate the session keys from individual elements.
///
/// The input must be a tuple of individual keys (a single arg for now since we have just one key).
pub fn template_session_keys(keys: AuraId) -> SessionKeys {
    SessionKeys { aura: keys }
}

fn testnet_genesis(
    invulnerables: Vec<(AccountId, AuraId)>,
    endowed_accounts: Vec<AccountId>,
    root: AccountId,
    id: ParaId,
) -> Value {
    // Define reputation data (same as above)
    let alice = Sr25519Keyring::Alice.to_account_id();
    let bob = Sr25519Keyring::Bob.to_account_id();
    let charlie = Sr25519Keyring::Charlie.to_account_id();
    let dave = Sr25519Keyring::Dave.to_account_id();
    let eve = Sr25519Keyring::Eve.to_account_id();
    // Alice as Client
    let alice_reputation = ReputationData {
        registration_block: 1u32,
        last_activity_block: 1u32,
        projects_completed: 0,
        projects_failed: 0,
        total_earned: 0u128,
        projects_posted: 10,
        total_spent: 50000u128,
        disputes_initiated: 0,
        disputes_won: 0,
        disputes_lost: 0,
        avg_rating_received: 4500,
        total_ratings_received: 8,
        jury_participation: 0,
        jury_accuracy: Permill::zero(),
    };
    // Bob as Freelancer
    let bob_reputation = ReputationData {
        registration_block: 1u32,
        last_activity_block: 1u32,
        projects_completed: 15,
        projects_failed: 1,
        total_earned: 25000u128,
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
    // Charlie as Bronze Juror
    let charlie_reputation = ReputationData {
        registration_block: 1u32,
        last_activity_block: 1u32,
        projects_completed: 5,
        projects_failed: 0,
        total_earned: 1500u128,
        projects_posted: 0,
        total_spent: 0u128,
        disputes_initiated: 0,
        disputes_won: 0,
        disputes_lost: 0,
        avg_rating_received: 4000,
        total_ratings_received: 5,
        jury_participation: 0,
        jury_accuracy: Permill::zero(),
    };
    // Dave as Silver Juror
    let dave_reputation = ReputationData {
        registration_block: 1u32,
        last_activity_block: 1u32,
        projects_completed: 25,
        projects_failed: 1,
        total_earned: 15000u128,
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
    // Eve as Gold Juror
    let eve_reputation = ReputationData {
        registration_block: 1u32,
        last_activity_block: 1u32,
        projects_completed: 60,
        projects_failed: 2,
        total_earned: 75000u128,
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
    build_struct_json_patch!(RuntimeGenesisConfig {
        balances: BalancesConfig {
            balances: endowed_accounts
                .iter()
                .cloned()
                .map(|k| (k, 1u128 << 60))
                .collect::<Vec<_>>()
        },
        parachain_info: ParachainInfoConfig { parachain_id: id },
        collator_selection: CollatorSelectionConfig {
            invulnerables: invulnerables
                .iter()
                .cloned()
                .map(|(acc, _)| acc)
                .collect::<Vec<_>>(),
            candidacy_bond: EXISTENTIAL_DEPOSIT * 16
        },
        session: SessionConfig {
            keys: invulnerables
                .into_iter()
                .map(|(acc, aura)| {
                    (
                        acc.clone(),
                        acc,
                        template_session_keys(aura),
                    )
                })
                .collect::<Vec<_>>()
        },
        polkadot_xcm: PolkadotXcmConfig {
            safe_xcm_version: Some(SAFE_XCM_VERSION)
        },
        sudo: SudoConfig { key: Some(root) },
        reputation: ReputationConfig {
            initial_users: vec![
                (alice.clone(), alice_reputation),
                (bob.clone(), bob_reputation),
                (charlie.clone(), charlie_reputation),
                (dave.clone(), dave_reputation),
                (eve.clone(), eve_reputation),
            ],
            initial_jurors: vec![charlie, dave, eve],
            juror_stake: 1000000000000u128,
        }
    })
}

fn local_testnet_genesis() -> Value {
    testnet_genesis(
        // initial collators.
        vec![
            (
                Sr25519Keyring::Alice.to_account_id(),
                Sr25519Keyring::Alice.public().into(),
            ),
            (
                Sr25519Keyring::Bob.to_account_id(),
                Sr25519Keyring::Bob.public().into(),
            ),
        ],
        Sr25519Keyring::well_known()
            .map(|k| k.to_account_id())
            .collect(),
        Sr25519Keyring::Alice.to_account_id(),
        2000.into(),
    )
}

fn development_config_genesis() -> Value {
    testnet_genesis(
        // initial collators.
        vec![
            (
                Sr25519Keyring::Alice.to_account_id(),
                Sr25519Keyring::Alice.public().into(),
            ),
            (
                Sr25519Keyring::Bob.to_account_id(),
                Sr25519Keyring::Bob.public().into(),
            ),
        ],
        Sr25519Keyring::well_known()
            .map(|k| k.to_account_id())
            .collect(),
        Sr25519Keyring::Alice.public().into(),
        2000.into(),
    )
}

/// Provides the JSON representation of predefined genesis config for given `id`.
pub fn get_preset(id: &PresetId) -> Option<vec::Vec<u8>> {
    let patch = match id.as_ref() {
        sp_genesis_builder::LOCAL_TESTNET_RUNTIME_PRESET => local_testnet_genesis(),
        sp_genesis_builder::DEV_RUNTIME_PRESET => development_config_genesis(),
        _ => return None,
    };
    Some(
        serde_json::to_string(&patch)
            .expect("serialization to json is expected to work. qed.")
            .into_bytes(),
    )
}

/// List of supported presets.
pub fn preset_names() -> Vec<PresetId> {
    vec![
        PresetId::from(sp_genesis_builder::DEV_RUNTIME_PRESET),
        PresetId::from(sp_genesis_builder::LOCAL_TESTNET_RUNTIME_PRESET),
    ]
}