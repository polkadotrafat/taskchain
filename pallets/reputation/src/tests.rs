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
fn register_as_juror_places_user_in_correct_tier_list() {
    new_test_ext().execute_with(|| {
        System::set_block_number(1);
        let alice = account("alice");
        assert_ok!(Reputation::register_user(RawOrigin::Signed(alice.clone()).into()));

        // Arrange: Give Alice stats that qualify for Silver tier
        ReputationStats::<Test>::mutate(&alice, |stats| {
            stats.projects_completed = 25;
            stats.total_earned = 15000;
            stats.disputes_lost = 0;
        });

        // Act: Alice registers as a juror
        assert_ok!(Reputation::register_as_juror(RawOrigin::Signed(alice.clone()).into()));

        // Assert: Alice is in the SilverJurors pool and her tier is cached correctly
        let silver_jurors = Reputation::silver_jurors();
        assert!(silver_jurors.contains(&alice));
        assert!(!Reputation::gold_jurors().contains(&alice)); // Should not be in other pools
        assert_eq!(Reputation::juror_tier(&alice), JurorTier::Silver);

        // Assert: Event was emitted
        System::assert_last_event(Event::JurorRegistered { account: alice }.into());
    });
}

#[test]
fn juror_tier_updates_automatically_on_promotion() {
    new_test_ext().execute_with(|| {
        System::set_block_number(1);
        let bob = account("bob");
        assert_ok!(Reputation::register_user(RawOrigin::Signed(bob.clone()).into()));

        // Arrange: Give Bob stats JUST BELOW Gold tier and register him as a juror
        ReputationStats::<Test>::mutate(&bob, |stats| {
            stats.projects_completed = 49;
            stats.total_earned = 49000;
            stats.disputes_lost = 0;
        });
        assert_ok!(Reputation::register_as_juror(RawOrigin::Signed(bob.clone()).into()));
        
        // Assert pre-condition: He is a Silver juror
        assert!(Reputation::silver_jurors().contains(&bob));
        assert!(!Reputation::gold_jurors().contains(&bob));

        // Act: A project completion pushes him over the Gold threshold
        System::set_block_number(2);
        assert_ok!(Reputation::on_project_completed(&bob, 1001, 5000, 1));

        // Assert: He was automatically moved from Silver to Gold
        assert!(!Reputation::silver_jurors().contains(&bob));
        assert!(Reputation::gold_jurors().contains(&bob));
        assert_eq!(Reputation::juror_tier(&bob), JurorTier::Gold);

        // Check for the tier update event
        System::assert_has_event(Event::JurorTierUpdated {
            account: bob.clone()
        }.into());
    });
}

#[test]
fn juror_tier_demotes_and_deregisters_on_dispute_loss() {
    new_test_ext().execute_with(|| {
        System::set_block_number(1);
        let alice = account("alice");
        let bob = account("bob");
        assert_ok!(Reputation::register_user(RawOrigin::Signed(alice.clone()).into()));
        assert_ok!(Reputation::register_user(RawOrigin::Signed(bob.clone()).into()));

        // Arrange: Give Alice Gold tier stats and register her as a juror
        ReputationStats::<Test>::mutate(&alice, |stats| {
            stats.projects_completed = 50;
            stats.total_earned = 50000;
            stats.disputes_lost = 0;
        });
        assert_ok!(Reputation::register_as_juror(RawOrigin::Signed(alice.clone()).into()));
        assert!(Reputation::gold_jurors().contains(&alice)); // Pre-condition check

        // Act: Alice loses a dispute to Bob
        System::set_block_number(2);
        assert_ok!(Reputation::on_dispute_outcome(&bob, &alice, 1, 1000));
        
        // Assert: Alice is now Ineligible and has been completely removed from all juror pools
        // and the registry because she lost a dispute.
        assert_eq!(Reputation::juror_tier(&alice), JurorTier::Ineligible);
        assert!(!Reputation::gold_jurors().contains(&alice));
        assert!(!Reputation::juror_opted_in(&alice));

        // Check for the automatic deregistration event
        System::assert_has_event(Event::JurorAutomaticallyDeregistered {
            account: alice.clone()
        }.into());
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

            assert_ok!(Reputation::register_as_juror(RawOrigin::Signed(alice.clone()).into()));
            assert_ok!(Reputation::register_as_juror(RawOrigin::Signed(bob.clone()).into()));
            assert_ok!(Reputation::register_as_juror(RawOrigin::Signed(dave.clone()).into()));

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