use crate::{mock::*, Error, Event, ProjectStatus};
use frame_support::{assert_noop, assert_ok, BoundedVec};
use frame_support::traits::{fungible::Mutate, ConstU32};
use frame_system::RawOrigin;
use sp_runtime::AccountId32;

// Helper function to convert a string to a bounded vec
fn str_to_bounded(s: &str) -> BoundedVec<u8, ConstU32<256>> {
    BoundedVec::try_from(s.as_bytes().to_vec()).unwrap()
}

// Helper function to create an account ID
fn account(s: &str) -> AccountId32 {
    AccountId32::new([s.as_bytes(), &[0; 32][s.as_bytes().len()..]].concat().try_into().unwrap())
}

#[test]
fn create_project_works() {
    new_test_ext().execute_with(|| {
        System::set_block_number(1);
        // Create accounts
        let client = account("alice");
        let budget = 1000;
        let uri = str_to_bounded("ipfs://project_details");
        let duration = 1000;

        // Ensure client has enough balance
        let _ = <Balances as Mutate<_>>::set_balance(&client, budget * 2);

        // Create project
        assert_ok!(Projects::create_project(
            RawOrigin::Signed(client.clone()).into(),
            budget,
            uri.clone(),
            duration
        ));

        // Check event was emitted
        System::assert_last_event(Event::ProjectCreated { 
            project_id: 0, 
            client: client.clone(), 
            budget 
        }.into());

        // Check project exists with correct data
        let project = Projects::projects(0).unwrap();
        assert_eq!(project.client, client);
        assert_eq!(project.budget, budget);
        assert_eq!(project.status, ProjectStatus::Created);
        assert_eq!(project.uri, uri);
    });
}

#[test]
fn apply_for_project_works() {
    new_test_ext().execute_with(|| {
        System::set_block_number(1);
        // Setup
        let client = account("alice");
        let freelancer = account("bob");
        let budget = 1000;
        let uri = str_to_bounded("ipfs://project_details");
        
        // Ensure client has enough balance
        let _ = <Balances as Mutate<_>>::set_balance(&client, budget * 2);

        // Create project
        assert_ok!(Projects::create_project(
            RawOrigin::Signed(client.clone()).into(),
            budget,
            uri,
            1000
        ));

        // Apply for project
        assert_ok!(Projects::apply_for_project(
            RawOrigin::Signed(freelancer.clone()).into(),
            0
        ));

        // Check event was emitted
        System::assert_last_event(Event::ApplicationSubmitted { 
            project_id: 0, 
            applicant: freelancer.clone() 
        }.into());

        // Check applicant was added
        let applicants = Projects::project_applicants(0);
        assert!(applicants.contains(&freelancer));
    });
}

#[test]
fn start_work_works() {
    new_test_ext().execute_with(|| {
        System::set_block_number(1);
        // Setup
        let client = account("alice");
        let freelancer = account("bob");
        let budget = 1000;
        let uri = str_to_bounded("ipfs://project_details");
        
        // Ensure client has enough balance
        let _ = <Balances as Mutate<_>>::set_balance(&client, budget * 2);

        // Create project
        assert_ok!(Projects::create_project(
            RawOrigin::Signed(client.clone()).into(),
            budget,
            uri,
            1000
        ));

        // Apply for project
        assert_ok!(Projects::apply_for_project(
            RawOrigin::Signed(freelancer.clone()).into(),
            0
        ));

        // Start work
        assert_ok!(Projects::start_work(
            RawOrigin::Signed(client.clone()).into(),
            0,
            freelancer.clone()
        ));

        // Check event was emitted
        System::assert_last_event(Event::WorkStarted { 
            project_id: 0, 
            freelancer: freelancer.clone() 
        }.into());

        // Check project status and freelancer assignment
        let project = Projects::projects(0).unwrap();
        assert_eq!(project.status, ProjectStatus::InProgress);
        assert_eq!(project.freelancer, Some(freelancer));
    });
}

#[test]
fn test_error_cases() {
    new_test_ext().execute_with(|| {
        System::set_block_number(1);
        let client = account("alice");
        let freelancer = account("bob");
        let wrong_user = account("charlie");
        let budget = 1000;
        let uri = str_to_bounded("ipfs://project_details");

        // Ensure client has enough balance
        let _ = <Balances as Mutate<_>>::set_balance(&client, budget * 2);

        // Try to apply for non-existent project
        assert_noop!(
            Projects::apply_for_project(RawOrigin::Signed(freelancer.clone()).into(), 0),
            Error::<Test>::ProjectNotFound
        );

        // Create project
        assert_ok!(Projects::create_project(
            RawOrigin::Signed(client.clone()).into(),
            budget,
            uri,
            1000
        ));

        // Try to start work without applying
        assert_noop!(
            Projects::start_work(RawOrigin::Signed(client.clone()).into(), 0, freelancer.clone()),
            Error::<Test>::ApplicantNotFound
        );

        // Apply for project
        assert_ok!(Projects::apply_for_project(
            RawOrigin::Signed(freelancer.clone()).into(),
            0
        ));

        // Try to start work with wrong user
        assert_noop!(
            Projects::start_work(RawOrigin::Signed(wrong_user.clone()).into(), 0, freelancer.clone()),
            Error::<Test>::NotProjectOwner
        );
    });
}