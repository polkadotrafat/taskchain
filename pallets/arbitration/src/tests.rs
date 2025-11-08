
use crate::{mock::*, DisputeStatus, Event, Ruling, Vote};
use frame_support::{assert_ok, BoundedVec, traits::{Currency, ConstU32, Get}};
use sp_runtime::AccountId32;

// Helper function to convert a string to a bounded vec
fn str_to_bounded(s: &str) -> BoundedVec<u8, ConstU32<256>> {
    BoundedVec::try_from(s.as_bytes().to_vec()).unwrap()
}

// Helper function to create an account ID
fn account(s: &str) -> AccountId32 {
    let mut padded_id = [0u8; 32];
    let id_bytes = s.as_bytes();
    padded_id[..id_bytes.len()].copy_from_slice(id_bytes);
    AccountId32::from(sp_core::sr25519::Public::from_raw(padded_id))
}

#[test]
fn initiate_ai_dispute_works() {
    new_test_ext().execute_with(|| {
        // --- ARRANGE ---
        let project_id = 0u32;
        let client = account("alice");
        let freelancer = account("bob");
        let budget = 100_000;
        let bond = UNIT / 2;

        // Fund the client so they can create the project
        let _ = Balances::deposit_creating(&client, budget);

        // Create project
        assert_ok!(Projects::create_project(
            RuntimeOrigin::signed(client.clone()),
            budget,
            str_to_bounded("Test Project"),
            1000 // duration
        ));

        // Fund the freelancer so they can apply for the project
        let _ = Balances::deposit_creating(&freelancer, 600_000_000_000);

        // Freelancer applies for the project
        assert_ok!(Projects::apply_for_project(
            RuntimeOrigin::signed(freelancer.clone()),
            project_id
        ));

        // Client accepts the freelancer's application
        assert_ok!(Projects::start_work(
            RuntimeOrigin::signed(client.clone()),
            project_id,
            freelancer.clone()
        ));

        System::set_block_number(1);

        // --- ACT ---
        assert_ok!(Arbitration::create_dispute(
            RuntimeOrigin::signed(freelancer.clone()),
            project_id,
            BoundedVec::default() // Empty evidence URI for now
        ));

        // --- ASSERT ---

        // 1. Check that the dispute was created in storage with the correct state
        let dispute = Arbitration::disputes(project_id).expect("Dispute should exist");
        assert_eq!(dispute.round, 1);
        assert_eq!(dispute.status, DisputeStatus::AiProcessing);
        assert!(dispute.jurors.is_empty());

        // 2. Check that the bond was reserved from the freelancer
        assert_eq!(Balances::reserved_balance(&freelancer), bond);

        // 3. Check that the correct event was emitted
        System::assert_last_event(RuntimeEvent::Arbitration(Event::DisputeCreated {
            project_id,
            who: freelancer,
        }));
    });
}

#[test]
fn submit_ai_ruling_works() {
    new_test_ext().execute_with(|| {
        // --- ARRANGE ---
        let project_id = 0u32;
        let client = account("alice");
        let freelancer = account("bob");
        let budget = 100_000;

        // Fund the client so they can create the project
        let _ = Balances::deposit_creating(&client, budget);

        // Create project
        assert_ok!(Projects::create_project(
            RuntimeOrigin::signed(client.clone()),
            budget,
            str_to_bounded("Test Project"),
            1000 // duration
        ));

        // Fund the freelancer so they can apply for the project
        let _ = Balances::deposit_creating(&freelancer, 600_000_000_000);

        // Freelancer applies for the project
        assert_ok!(Projects::apply_for_project(
            RuntimeOrigin::signed(freelancer.clone()),
            project_id
        ));

        // Client accepts the freelancer's application
        assert_ok!(Projects::start_work(
            RuntimeOrigin::signed(client.clone()),
            project_id,
            freelancer.clone()
        ));

        System::set_block_number(1);

        assert_ok!(Arbitration::create_dispute(
            RuntimeOrigin::signed(freelancer.clone()),
            project_id,
            BoundedVec::default()
        ));

        let ruling = Ruling::ClientWins;
        System::set_block_number(2);

        // --- ACT ---
        assert_ok!(Arbitration::submit_ruling(
            RuntimeOrigin::root(),
            project_id,
            ruling
        ));

        // --- ASSERT ---
        let dispute = Arbitration::disputes(project_id).expect("Dispute should exist");
        assert_eq!(dispute.status, DisputeStatus::Appealable);
        assert_eq!(dispute.ruling, Some(ruling));
        assert_eq!(dispute.start_block, System::block_number());

        System::assert_last_event(RuntimeEvent::Arbitration(Event::AiRulingSubmitted {
            project_id,
            ruling,
        }));
    });
}

#[test]
fn appeal_ruling_works() {
    new_test_ext().execute_with(|| {
        // --- ARRANGE ---
        let project_id = 0u32;
        let client = account("alice");
        let freelancer = account("bob");
        let budget = 100_000;

        // Fund the client so they can create the project
        let _ = Balances::deposit_creating(&client, budget);

        // Create project
        assert_ok!(Projects::create_project(
            RuntimeOrigin::signed(client.clone()),
            budget,
            str_to_bounded("Test Project"),
            1000 // duration
        ));

        // Fund the freelancer so they can apply for the project
        let _ = Balances::deposit_creating(&freelancer, 3 * UNIT);

        // Freelancer applies for the project
        assert_ok!(Projects::apply_for_project(
            RuntimeOrigin::signed(freelancer.clone()),
            project_id
        ));

        // Client accepts the freelancer's application
        assert_ok!(Projects::start_work(
            RuntimeOrigin::signed(client.clone()),
            project_id,
            freelancer.clone()
        ));

        System::set_block_number(1);

        assert_ok!(Arbitration::create_dispute(
            RuntimeOrigin::signed(freelancer.clone()),
            project_id,
            BoundedVec::default()
        ));

        let ruling = Ruling::ClientWins;
        System::set_block_number(2);

        assert_ok!(Arbitration::submit_ruling(
            RuntimeOrigin::root(),
            project_id,
            ruling
        ));

        let jurors = vec![account("juror1"), account("juror2"), account("juror3")];
        MockReputation::set_jurors(jurors.clone());

        // --- ACT ---
        assert_ok!(Arbitration::appeal_ruling(
            RuntimeOrigin::signed(freelancer.clone()),
            project_id,
            BoundedVec::default()
        ));

        // --- ASSERT ---
        let dispute = Arbitration::disputes(project_id).expect("Dispute should exist");
        assert_eq!(dispute.status, DisputeStatus::Voting);
        assert_eq!(dispute.round, 2);
        assert_eq!(dispute.jurors.iter().map(|(j, _)| j.clone()).collect::<Vec<_>>(), jurors);

        let bond = (UNIT / 2) + (2 * UNIT);
        assert_eq!(Balances::reserved_balance(&freelancer), bond);

        System::assert_last_event(RuntimeEvent::Arbitration(Event::AppealStarted {
            project_id,
            appellant: freelancer,
            bond: 2 * UNIT,
        }));
    });
}

#[test]
fn cast_vote_and_finalize_round_works() {
    new_test_ext().execute_with(|| {
        // --- ARRANGE ---
        let project_id = 0u32;
        let client = account("alice");
        let freelancer = account("bob");
        let budget = 100_000;

        // Fund the client so they can create the project
        let _ = Balances::deposit_creating(&client, budget);

        // Create project
        assert_ok!(Projects::create_project(
            RuntimeOrigin::signed(client.clone()),
            budget,
            str_to_bounded("Test Project"),
            1000 // duration
        ));

        // Fund the freelancer so they can apply for the project
        let _ = Balances::deposit_creating(&freelancer, 3 * UNIT);

        // Freelancer applies for the project
        assert_ok!(Projects::apply_for_project(
            RuntimeOrigin::signed(freelancer.clone()),
            project_id
        ));

        // Client accepts the freelancer's application
        assert_ok!(Projects::start_work(
            RuntimeOrigin::signed(client.clone()),
            project_id,
            freelancer.clone()
        ));

        System::set_block_number(1);

        assert_ok!(Arbitration::create_dispute(
            RuntimeOrigin::signed(freelancer.clone()),
            project_id,
            BoundedVec::default()
        ));

        let ruling = Ruling::ClientWins;
        System::set_block_number(2);

        assert_ok!(Arbitration::submit_ruling(
            RuntimeOrigin::root(),
            project_id,
            ruling
        ));

        let juror1 = account("juror1");
        let juror2 = account("juror2");
        let juror3 = account("juror3");
        let jurors = vec![juror1.clone(), juror2.clone(), juror3.clone()];
        MockReputation::set_jurors(jurors.clone());

        assert_ok!(Arbitration::appeal_ruling(
            RuntimeOrigin::signed(freelancer.clone()),
            project_id,
            BoundedVec::default()
        ));

        // --- ACT ---
        assert_ok!(Arbitration::cast_vote(RuntimeOrigin::signed(juror1.clone()), project_id, Vote::ForFreelancer));
        assert_ok!(Arbitration::cast_vote(RuntimeOrigin::signed(juror2.clone()), project_id, Vote::ForFreelancer));
        assert_ok!(Arbitration::cast_vote(RuntimeOrigin::signed(juror3.clone()), project_id, Vote::ForClient));

        System::set_block_number(System::block_number() + 200 + 1);

        assert_ok!(Arbitration::finalize_round(RuntimeOrigin::signed(account("anyone")), project_id));

        // --- ASSERT ---
        let dispute = Arbitration::disputes(project_id).expect("Dispute should exist");
        assert_eq!(dispute.ruling, Some(Ruling::FreelancerWins));
        assert_eq!(dispute.status, DisputeStatus::Appealable);
    });
}

// ------- staking & slashing integration -------

#[test]
fn finalize_round_slashes_jurors_who_voted_against_majority() {
    new_test_ext().execute_with(|| {
        let (project_id, client, freelancer) = create_project_and_dispute_to_round2();

        let juror1 = account("juror1");
        let juror2 = account("juror2");
        let juror3 = account("juror3");
        MockReputation::set_jurors(vec![juror1.clone(), juror2.clone(), juror3.clone()]);

        assert_ok!(Arbitration::appeal_ruling(
            RuntimeOrigin::signed(freelancer.clone()),
            project_id,
            BoundedVec::default()
        ));

        // majority = freelancer wins
        assert_ok!(Arbitration::cast_vote(RuntimeOrigin::signed(juror1.clone()), project_id, Vote::ForFreelancer));
        assert_ok!(Arbitration::cast_vote(RuntimeOrigin::signed(juror2.clone()), project_id, Vote::ForFreelancer));
        // juror3 votes against majority -> will be slashed
        assert_ok!(Arbitration::cast_vote(RuntimeOrigin::signed(juror3.clone()), project_id, Vote::ForClient));

        let before = Balances::reserved_balance(&juror3);

        System::set_block_number(System::block_number() + 200 + 1);
        assert_ok!(Arbitration::finalize_round(RuntimeOrigin::signed(account("any")), project_id));

        let slash = <Test as pallet_reputation::Config>::SlashRatio::get() * before;
        assert_eq!(Balances::reserved_balance(&juror3), before - slash);
    });
}

#[test]
fn enforce_final_ruling_unreserves_winner_bonds_slash_loser() {
    new_test_ext().execute_with(|| {
        let (project_id, client, freelancer) = create_project_and_dispute_to_round2();

        // FIX: Provide enough jurors to meet the MinJurors requirement (3)
        let juror1 = account("juror1");
        let juror2 = account("juror2");
        let juror3 = account("juror3");
        MockReputation::set_jurors(vec![juror1.clone(), juror2.clone(), juror3.clone()]);

        // Fund the parties for their bonds
        let _ = Balances::deposit_creating(&client, 5 * UNIT);
        let _ = Balances::deposit_creating(&freelancer, 5 * UNIT);

        // The freelancer already paid the first bond in the helper function.
        let freelancer_bond_round1 = Arbitration::calculate_bond(&project_id, 1).unwrap();
        
        // This appeal should now succeed.
        assert_ok!(Arbitration::appeal_ruling(
            RuntimeOrigin::signed(freelancer.clone()),
            project_id,
            BoundedVec::default()
        ));
        let freelancer_bond_round2 = Arbitration::calculate_bond(&project_id, 2).unwrap();

        // freelancer wins => client is loser
        assert_ok!(Arbitration::cast_vote(RuntimeOrigin::signed(juror1), project_id, Vote::ForFreelancer));

        let voting_period: u64 = <Test as crate::Config>::VotingPeriod::get();
        System::set_block_number(System::block_number() + voting_period + 1);
        assert_ok!(Arbitration::finalize_round(RuntimeOrigin::signed(account("any")), project_id));
        
        let client_reserved_before = Balances::reserved_balance(&client);
        let freelancer_reserved_before = Balances::reserved_balance(&freelancer);
        assert_eq!(freelancer_reserved_before, freelancer_bond_round1 + freelancer_bond_round2);

        // move past appeal period
        let appeal_period: u64 = <Test as crate::Config>::AppealPeriod::get();
        System::set_block_number(System::block_number() + appeal_period + 1);
        assert_ok!(Arbitration::enforce_final_ruling(RuntimeOrigin::signed(account("any")), project_id));

        // winner (freelancer) gets full bond back, loser (client) has no change since they didn't stake.
        assert_eq!(Balances::reserved_balance(&freelancer), 0);
        assert_eq!(Balances::reserved_balance(&client), client_reserved_before); // No change
    });
}

#[test]
fn dispute_flow_full_slash_path() {
    new_test_ext().execute_with(|| {
        let (project_id, _client, freelancer) = create_project_and_dispute_to_round2();

        let juror1 = account("juror1");
        let juror2 = account("juror2");
        let juror3 = account("juror3");
        MockReputation::set_jurors(vec![juror1.clone(), juror2.clone(), juror3.clone()]);

        assert_ok!(Arbitration::appeal_ruling(
            RuntimeOrigin::signed(freelancer.clone()),
            project_id,
            BoundedVec::default()
        ));

        // both jurors vote same way -> no slash
        assert_ok!(Arbitration::cast_vote(RuntimeOrigin::signed(juror1.clone()), project_id, Vote::ForFreelancer));
        assert_ok!(Arbitration::cast_vote(RuntimeOrigin::signed(juror2.clone()), project_id, Vote::ForFreelancer));
        assert_ok!(Arbitration::cast_vote(RuntimeOrigin::signed(juror3.clone()), project_id, Vote::ForFreelancer));

        System::set_block_number(System::block_number() + 200 + 1);
        assert_ok!(Arbitration::finalize_round(RuntimeOrigin::signed(account("any")), project_id));

        let dispute = Arbitration::disputes(project_id).expect("Dispute should exist");
        assert_eq!(dispute.ruling, Some(Ruling::FreelancerWins));
    });
}

// ---------- helper ----------
fn create_project_and_dispute_to_round2() -> (u32, AccountId32, AccountId32) {
    let project_id = 0u32;
    let client = account("alice");
    let freelancer = account("bob");
    let budget = 100_000;

    let _ = Balances::deposit_creating(&client, budget);
    assert_ok!(Projects::create_project(
        RuntimeOrigin::signed(client.clone()),
        budget,
        str_to_bounded("Test Project"),
        1000
    ));
    let _ = Balances::deposit_creating(&freelancer, 5 * UNIT);
    assert_ok!(Projects::apply_for_project(RuntimeOrigin::signed(freelancer.clone()), project_id));
    assert_ok!(Projects::start_work(RuntimeOrigin::signed(client.clone()), project_id, freelancer.clone()));

    System::set_block_number(1);
    assert_ok!(Arbitration::create_dispute(RuntimeOrigin::signed(freelancer.clone()), project_id, BoundedVec::default()));
    System::set_block_number(2);
    assert_ok!(Arbitration::submit_ruling(RuntimeOrigin::root(), project_id, Ruling::ClientWins));

    (project_id, client, freelancer)
}