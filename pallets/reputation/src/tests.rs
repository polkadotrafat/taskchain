use crate::{mock::*, Error, Event, JurorTier, ReputationStats, ReputationInterface};
use frame_support::{assert_noop, assert_ok};
use frame_system::RawOrigin;
use sp_runtime::{AccountId32, Permill};

// Helper function to create an account ID, consistent with your other tests.
fn account(s: &str) -> AccountId32 {
    AccountId32::new([s.as_bytes(), &[0; 32][s.as_bytes().len()..]].concat().try_into().unwrap())
}

#[test]
fn register_user_works() {
    new_test_ext().execute_with(|| {
        System::set_block_number(1);
        let alice = account("alice");

        // Act: Register a new user
        assert_ok!(Reputation::register_user(RawOrigin::Signed(alice.clone()).into()));

        // Assert: Event was emitted
        System::assert_last_event(Event::UserRegistered { account: alice.clone() }.into());

        // Assert: Reputation data was created with correct defaults
        let stats = Reputation::reputation_stats(&alice);
        assert_eq!(stats.registration_block, 1);
        assert_eq!(stats.projects_completed, 0);
        assert_eq!(stats.total_earned, 0);
        assert_eq!(stats.disputes_lost, 0);
        assert_eq!(stats.jury_accuracy, Permill::zero());
    });
}

#[test]
fn register_user_fails_if_already_registered() {
    new_test_ext().execute_with(|| {
        System::set_block_number(1);
        let alice = account("alice");

        // Arrange: Register the user once
        assert_ok!(Reputation::register_user(RawOrigin::Signed(alice.clone()).into()));

        // Act & Assert: Try to register again, should fail
        assert_noop!(
            Reputation::register_user(RawOrigin::Signed(alice.clone()).into()),
            Error::<Test>::AlreadyRegistered
        );
    });
}

#[test]
fn update_juror_tier_works_for_eligible_user() {
    new_test_ext().execute_with(|| {
        System::set_block_number(100);
        let alice = account("alice");

        // Arrange: Register user and manually set their stats to meet Bronze tier criteria
        assert_ok!(Reputation::register_user(RawOrigin::Signed(alice.clone()).into()));
        ReputationStats::<Test>::mutate(&alice, |stats| {
            stats.projects_completed = 5;
            stats.total_earned = 1001; // Just over the 1000 threshold
            stats.disputes_lost = 0;
        });

        // Act: User updates their tier
        assert_ok!(Reputation::update_juror_tier(RawOrigin::Signed(alice.clone()).into()));

        // Assert: Event was emitted with the correct new tier
        System::assert_last_event(Event::JurorTierUpdated {
            account: alice.clone()
        }.into());

        // Assert: The tier is correctly stored on-chain
        assert_eq!(Reputation::juror_tier(&alice), JurorTier::Bronze);
    });
}

#[test]
fn update_juror_tier_sets_ineligible_if_disputes_lost() {
    new_test_ext().execute_with(|| {
        System::set_block_number(100);
        let alice = account("alice");

        // Arrange: Register user and set stats to meet Gold tier, but with one lost dispute
        assert_ok!(Reputation::register_user(RawOrigin::Signed(alice.clone()).into()));
        ReputationStats::<Test>::mutate(&alice, |stats| {
            stats.projects_completed = 50;
            stats.total_earned = 50001;
            stats.disputes_lost = 1; // The disqualifying factor
        });

        // Act: User updates their tier
        assert_ok!(Reputation::update_juror_tier(RawOrigin::Signed(alice.clone()).into()));

        // Assert: Tier is updated to Ineligible
        System::assert_last_event(Event::JurorTierUpdated {
            account: alice.clone()
        }.into());
        assert_eq!(Reputation::juror_tier(&alice), JurorTier::Ineligible);
    });
}

#[test]
fn update_juror_tier_fails_for_unregistered_user() {
    new_test_ext().execute_with(|| {
        let bob = account("bob"); // Bob is not registered

        // Act & Assert: Should fail because the user has no reputation data
        assert_noop!(
            Reputation::update_juror_tier(RawOrigin::Signed(bob.clone()).into()),
            Error::<Test>::UserNotRegistered
        );
    });
}

// --- Trait Implementation Tests ---
// These tests call the trait functions directly to check the internal logic.

#[test]
fn on_project_completed_updates_stats_correctly() {
    new_test_ext().execute_with(|| {
        System::set_block_number(50);
        let freelancer = account("bob");
        
        // Arrange: Register the freelancer
        assert_ok!(Reputation::register_user(RawOrigin::Signed(freelancer.clone()).into()));

        // Act: Simulate a project completion via the trait interface
        assert_ok!(Reputation::on_project_completed(&freelancer, 500, 4500, 1)); // 4500 = 4.5/5 rating

        // Assert: Check that the freelancer's stats were updated
        let stats = Reputation::reputation_stats(&freelancer);
        assert_eq!(stats.projects_completed, 1);
        assert_eq!(stats.total_earned, 500);
        assert_eq!(stats.avg_rating_received, 4500);
        assert_eq!(stats.total_ratings_received, 1);
        assert_eq!(stats.last_activity_block, 50);
    });
}

#[test]
fn on_dispute_outcome_updates_stats_correctly() {
    new_test_ext().execute_with(|| {
        System::set_block_number(100);
        let winner = account("alice");
        let loser = account("bob");
        
        // Arrange: Register both users
        assert_ok!(Reputation::register_user(RawOrigin::Signed(winner.clone()).into()));
        assert_ok!(Reputation::register_user(RawOrigin::Signed(loser.clone()).into()));
        
        // Act: Simulate a dispute outcome
        assert_ok!(Reputation::on_dispute_outcome(&winner, &loser, 1, 1000));
        
        // Assert: Check winner's stats
        let winner_stats = Reputation::reputation_stats(&winner);
        assert_eq!(winner_stats.disputes_won, 1);
        assert_eq!(winner_stats.last_activity_block, 100);
        
        // Assert: Check loser's stats
        let loser_stats = Reputation::reputation_stats(&loser);
        assert_eq!(loser_stats.disputes_lost, 1);
        assert_eq!(loser_stats.projects_failed, 1);
        assert_eq!(loser_stats.last_activity_block, 100);
    });
}

#[test]
fn on_jury_vote_updates_stats_correctly() {
    new_test_ext().execute_with(|| {
        System::set_block_number(200);
        let juror = account("charlie");
        
        // Arrange: Register the juror
        assert_ok!(Reputation::register_user(RawOrigin::Signed(juror.clone()).into()));
        
        // Act: Simulate two jury votes
        assert_ok!(Reputation::on_jury_vote(&juror, true)); // Voted with majority
        assert_ok!(Reputation::on_jury_vote(&juror, false)); // Voted against majority

        // Assert: Check juror's stats
        let juror_stats = Reputation::reputation_stats(&juror);
        assert_eq!(juror_stats.jury_participation, 2);
        // After one correct and one incorrect vote, accuracy should be 50%
        assert_eq!(juror_stats.jury_accuracy, Permill::from_percent(50));
        assert_eq!(juror_stats.last_activity_block, 200);
    });
}

    #[test]
    fn get_eligible_jurors_works() {
        new_test_ext().execute_with(|| {
            System::set_block_number(1);
            // Arrange
            let alice = account("alice"); // Will be Gold
            let bob = account("bob");     // Will be Bronze
            let charlie = account("charlie"); // Will be Ineligible
            let dave = account("dave");     // Will also be Bronze

            assert_ok!(Reputation::register_user(RawOrigin::Signed(alice.clone()).into()));
            assert_ok!(Reputation::register_user(RawOrigin::Signed(bob.clone()).into()));
            assert_ok!(Reputation::register_user(RawOrigin::Signed(charlie.clone()).into()));
            assert_ok!(Reputation::register_user(RawOrigin::Signed(dave.clone()).into()));

            // Set stats and update tiers
            ReputationStats::<Test>::mutate(&alice, |s| { s.projects_completed = 50; s.total_earned = 50000; });
            ReputationStats::<Test>::mutate(&bob, |s| { s.projects_completed = 5; s.total_earned = 1000; });
            ReputationStats::<Test>::mutate(&charlie, |s| { s.projects_completed = 1; });
            ReputationStats::<Test>::mutate(&dave, |s| { s.projects_completed = 6; s.total_earned = 1500; });

            assert_ok!(Reputation::update_juror_tier(RawOrigin::Signed(alice.clone()).into()));
            assert_ok!(Reputation::update_juror_tier(RawOrigin::Signed(bob.clone()).into()));
            assert_ok!(Reputation::update_juror_tier(RawOrigin::Signed(charlie.clone()).into()));
            assert_ok!(Reputation::update_juror_tier(RawOrigin::Signed(dave.clone()).into()));

            // Act: Get jurors of at least Bronze tier, excluding Bob
            let exclude_list = vec![bob.clone()];
            let jurors = Reputation::get_eligible_jurors(JurorTier::Bronze, &exclude_list, 10);

            // Assert: Should contain Alice and Dave, but not Bob (excluded) or Charlie (ineligible)
            assert_eq!(jurors.len(), 2);
            assert!(jurors.contains(&alice));
            assert!(jurors.contains(&dave));
            assert!(!jurors.contains(&bob));
            assert!(!jurors.contains(&charlie));
        });
    }