#![cfg_attr(not(feature = "std"), no_std)]

pub use pallet::*;

#[cfg(test)]
mod mock;

#[cfg(test)]
mod tests;

use frame_support::{ BoundedVec,
    dispatch::DispatchResult,
    traits::{Get},
};
use sp_runtime::DispatchError;
use sp_runtime::traits::ConstU32;

// Define the Arbitrable trait that the arbitration pallet will use to interact with projects
pub type EvidenceUri = BoundedVec<u8, ConstU32<256>>;
pub trait Arbitrable<ProjectId, Balance, AccountId, BlockNumber> {
    fn on_ruling(project_id: ProjectId, ruling: Ruling) -> DispatchResult; // Using local Ruling enum
    fn get_project_budget(project_id: ProjectId) -> Result<Balance, DispatchError>;
    fn get_project_parties(project_id: ProjectId) -> Result<(AccountId, AccountId), DispatchError>;
    fn set_project_status_in_dispute(project_id: ProjectId) -> DispatchResult;
    fn get_project_status(project_id: ProjectId) -> Result<ProjectStatus, DispatchError>;
	/// Fetches the core evidence for a dispute: the client's requirements URI
    /// and the freelancer's submission URI.
    fn get_evidence_uris(project_id: ProjectId) -> Result<(EvidenceUri, EvidenceUri), DispatchError>;
}

#[frame_support::pallet]
pub mod pallet {
    use super::*;
    use frame_support::pallet_prelude::*;
    use frame_system::pallet_prelude::*;
    use frame_support::{BoundedVec,PalletId, 
        traits::{Currency, LockableCurrency, ExistenceRequirement, WithdrawReasons}
    };
    use pallet_reputation::ReputationInterface;
    use scale_info::TypeInfo;
    use codec::{MaxEncodedLen};
    use scale_info::prelude::ops::Add;
    use sp_runtime::{
		traits::{ One, AccountIdConversion, Saturating}
};

    type BalanceOf<T> = <<T as Config>::Currency as Currency<<T as frame_system::Config>::AccountId>>::Balance;

    #[pallet::pallet]
    pub struct Pallet<T>(_);


    #[derive(Clone, Encode, Decode, PartialEq, Debug,MaxEncodedLen, TypeInfo, Eq, Copy)]
	#[cfg_attr(feature = "std", derive(serde::Serialize, serde::Deserialize))]
	pub enum ProjectStatus {
        Created,      // Project is proposed, awaiting a freelancer
        InProgress,   // Freelancer assigned and working
        InReview,     // Freelancer submitted work, awaiting client approval
        Rejected,     // Work rejected by client
        InDispute,    // Freelancer initiated dispute
        Completed,    // Client accepted work, payment released
        Cancelled,    // Project cancelled
    }

    #[derive(Encode, Decode, Clone, PartialEq, Eq, MaxEncodedLen, TypeInfo, Debug)]
    #[scale_info(skip_type_params(T))]
    pub struct WorkSubmission<T:Config> {
        pub content_hash: [u8; 32],  // Hash of the work content (e.g., SHA256)
        pub uri: BoundedVec<u8, ConstU32<256>>,  // IPFS/Arweave URI where the work is stored
        pub submission_block: BlockNumberFor<T>,  // When the work was submitted
        pub metadata: BoundedVec<u8, ConstU32<1024>>,  // Additional metadata about the submission
    }

    #[derive(Encode, Decode, Clone, PartialEq, Eq, MaxEncodedLen, TypeInfo, Debug)]
    #[scale_info(skip_type_params(T))]
    pub struct DisputeInfo<T:Config> {
        pub reason_uri: BoundedVec<u8, ConstU32<256>>,  // URI containing detailed rejection reason
        pub rejection_block: BlockNumberFor<T>,          // When the work was rejected
        pub previous_submissions: u32,                   // Number of previous rejection cycles
    }

    #[derive(Encode, Decode, Clone, PartialEq, Eq, MaxEncodedLen, TypeInfo, Debug)]
    #[scale_info(skip_type_params(T))]
    pub struct Project<T: Config> {
        pub client: T::AccountId,
        pub freelancer: Option<T::AccountId>,
        pub uri: BoundedVec<u8, ConstU32<256>>,  // URI describing the project details
        pub budget: BalanceOf<T>,
        pub status: ProjectStatus,
        pub duration: BlockNumberFor<T>,
        pub submission_block: Option<BlockNumberFor<T>>, // Deadline for submission
        pub work_submission: Option<WorkSubmission<T>>,     // The actual work submission
        pub dispute_info: Option<DisputeInfo<T>>,          // Information about rejections and disputes
    }

    #[derive(Clone, Encode, Decode, PartialEq, Debug,MaxEncodedLen, TypeInfo, Eq, Copy)]
	#[cfg_attr(feature = "std", derive(serde::Serialize, serde::Deserialize))]
    pub enum Ruling {
        ClientWins,
        FreelancerWins,
    }


    #[pallet::config]
    pub trait Config: frame_system::Config {
        /// The overarching runtime event type.
        type RuntimeEvent: From<Event<Self>> + IsType<<Self as frame_system::Config>::RuntimeEvent>;
        /// A type representing the weights required by the dispatchables of this pallet.
        type WeightInfo;
        /// The currency type that will be used to place deposits and pay freelancers
        type Currency: Currency<Self::AccountId> + LockableCurrency<Self::AccountId>;
        /// The pallet id, used for deriving its sovereign account ID.
        type PalletId: Get<PalletId>;
        /// The type used to identify projects
        type ProjectId: Member + Parameter + MaxEncodedLen + Copy + Default + sp_runtime::traits::One 
            + sp_runtime::traits::Zero + Add<Output = Self::ProjectId> 
            + From<u32> + Into<u32>;

        /// The reputation interface
        type Reputation: ReputationInterface<Self::AccountId, BalanceOf<Self>, Self::ProjectId, BlockNumberFor<Self>, Self::MaxApplicants>;

        #[pallet::constant]
        /// The period within which a client must review submitted work
        type ReviewPeriod: Get<BlockNumberFor<Self>>;

        #[pallet::constant]
        /// The maximum number of applicants that can apply for a project
        type MaxApplicants: Get<u32>;
    }

    #[pallet::storage]
    #[pallet::getter(fn projects)]
    pub type Projects<T: Config> = StorageMap<_, Blake2_128Concat, T::ProjectId, Project<T>>;

    #[pallet::storage]
    #[pallet::getter(fn next_project_id)]
    pub type NextProjectId<T: Config> = StorageValue<_, T::ProjectId, ValueQuery>;

    #[pallet::storage]
    #[pallet::getter(fn project_applicants)]
    pub type ProjectApplicants<T: Config> = StorageMap<
        _,
        Blake2_128Concat,
        T::ProjectId,
        BoundedVec<T::AccountId, T::MaxApplicants>,
        ValueQuery
    >;

    #[pallet::event]
    #[pallet::generate_deposit(pub(super) fn deposit_event)]
    pub enum Event<T: Config> {
        ProjectCreated { project_id: T::ProjectId, client: T::AccountId, budget: BalanceOf<T> },
        WorkSubmitted { project_id: T::ProjectId, freelancer: T::AccountId },
        WorkAccepted { project_id: T::ProjectId, freelancer: T::AccountId, payment: BalanceOf<T> },
        WorkRejected { project_id: T::ProjectId, freelancer: T::AccountId, reason_uri: BoundedVec<u8, ConstU32<256>> },
        ApplicationSubmitted { project_id: T::ProjectId, applicant: T::AccountId },
        WorkStarted { project_id: T::ProjectId, freelancer: T::AccountId },
        ProjectCancelled { project_id: T::ProjectId, client: T::AccountId },
    }

    // --- Errors ---
    #[pallet::error]
    pub enum Error<T> {
        ProjectNotFound,
        NotProjectOwner,
        NotFreelancer,
        InvalidStatus,
        FreelancerAlreadyAssigned,
        TooManyApplicants,
        AlreadyApplied,
        ApplicantNotFound,
        WorkAlreadySubmitted,
        InvalidHash,
        InvalidUri,
        InvalidMetadata,
        SubmissionDeadlinePassed,
        NoWorkSubmitted,
        PaymentFailed,
        UnlockFailed,
    }

    #[pallet::call]
    impl<T: Config> Pallet<T> {
        #[pallet::call_index(0)]
        #[pallet::weight(Weight::default())]
        pub fn create_project(origin: OriginFor<T>, budget: BalanceOf<T>, uri: BoundedVec<u8, ConstU32<256>>, duration: BlockNumberFor<T>) -> DispatchResult {
            let client = ensure_signed(origin)?;
            let project_id = Self::next_project_id();

            // Create a unique lock ID for this project
            let lock_id = Self::generate_lock_id(project_id);
            
            // Lock the client's funds for escrow
            T::Currency::set_lock(
                lock_id,
                &client,
                budget,
                WithdrawReasons::all(),
            );

            let new_project = Project {
                client: client.clone(),
                freelancer: None,
                uri: uri,
                budget,
                status: ProjectStatus::Created,
                duration: duration,
                submission_block: None,
                work_submission: None,
                dispute_info: None,
            };

            Projects::<T>::insert(project_id, new_project);
            NextProjectId::<T>::put(project_id + T::ProjectId::one()); // Increment using One trait

            T::Reputation::on_project_created(&client, budget)?;

            Self::deposit_event(Event::ProjectCreated { project_id, client, budget });
            Ok(())
        }

        #[pallet::call_index(1)]
        #[pallet::weight(Weight::default())]
        pub fn apply_for_project(origin: OriginFor<T>, project_id: T::ProjectId) -> DispatchResult {
            let applicant = ensure_signed(origin)?;
            
            // Ensure project exists and is in the right status
            let project = Projects::<T>::get(project_id).ok_or(Error::<T>::ProjectNotFound)?;
            ensure!(project.status == ProjectStatus::Created, Error::<T>::InvalidStatus);
            
            // Get current applicants and ensure the user hasn't already applied
            ProjectApplicants::<T>::try_mutate(project_id, |applicants| -> DispatchResult {
                ensure!(!applicants.contains(&applicant), Error::<T>::AlreadyApplied);
                applicants.try_push(applicant.clone()).map_err(|_| Error::<T>::TooManyApplicants)?;
                Ok(())
            })?;

            Self::deposit_event(Event::ApplicationSubmitted { 
                project_id,
                applicant: applicant.clone()
            });
            
            Ok(())
        }

        #[pallet::call_index(2)]
        #[pallet::weight(Weight::default())]
        pub fn start_work(
            origin: OriginFor<T>, 
            project_id: T::ProjectId, 
            selected_freelancer: T::AccountId
        ) -> DispatchResult {
            let client = ensure_signed(origin)?;
            
            Projects::<T>::try_mutate(project_id, |maybe_project| -> DispatchResult {
                let project = maybe_project.as_mut().ok_or(Error::<T>::ProjectNotFound)?;
                ensure!(project.client == client, Error::<T>::NotProjectOwner);
                ensure!(project.status == ProjectStatus::Created, Error::<T>::InvalidStatus);
                
                // Ensure the selected freelancer is an applicant
                let applicants = ProjectApplicants::<T>::get(project_id);
                ensure!(applicants.contains(&selected_freelancer), Error::<T>::ApplicantNotFound);
                
                project.freelancer = Some(selected_freelancer.clone());
                project.status = ProjectStatus::InProgress;
                
                // Set the submission deadline by adding duration to current block
                let current_block = <frame_system::Pallet<T>>::block_number();
                project.submission_block = Some(current_block.saturating_add(project.duration));
                
                // Clean up the applicants storage to save space
                ProjectApplicants::<T>::remove(project_id);                
                Self::deposit_event(Event::WorkStarted { 
                    project_id,
                    freelancer: selected_freelancer
                });
                
                Ok(())
            })?;

            Ok(())
        }

        #[pallet::call_index(3)]
        #[pallet::weight(Weight::default())]
        pub fn submit_work(
            origin: OriginFor<T>,
            project_id: T::ProjectId,
            content_hash: [u8; 32],
            uri: BoundedVec<u8, ConstU32<256>>,
            metadata: BoundedVec<u8, ConstU32<1024>>,
        ) -> DispatchResult {
            let freelancer = ensure_signed(origin)?;
            
            Projects::<T>::try_mutate(project_id, |maybe_project| -> DispatchResult {
                let project = maybe_project.as_mut().ok_or(Error::<T>::ProjectNotFound)?;
                
                // Verify the freelancer is assigned to this project
                ensure!(project.freelancer == Some(freelancer.clone()), Error::<T>::NotFreelancer);
                ensure!(project.status == ProjectStatus::InProgress, Error::<T>::InvalidStatus);
                ensure!(project.work_submission.is_none(), Error::<T>::WorkAlreadySubmitted);
                
                // Check if submission deadline has passed
                let current_block = <frame_system::Pallet<T>>::block_number();
                if let Some(deadline) = project.submission_block {
                    ensure!(current_block <= deadline, Error::<T>::SubmissionDeadlinePassed);
                }

                // Validate submission data
                ensure!(!uri.is_empty(), Error::<T>::InvalidUri);
                
                // Create and store the work submission
                let submission = WorkSubmission {
                    content_hash,
                    uri,
                    submission_block: current_block,
                    metadata,
                };
                
                project.work_submission = Some(submission);
                project.status = ProjectStatus::InReview;
                
                Self::deposit_event(Event::WorkSubmitted {
                    project_id,
                    freelancer: freelancer.clone(),
                });
                
                Ok(())
            })?;

            Ok(())
        }

        #[pallet::call_index(4)]
        #[pallet::weight(Weight::default())]
        pub fn accept_work(
            origin: OriginFor<T>,
            project_id: T::ProjectId,
            rating: u32,
        ) -> DispatchResult {
            let client = ensure_signed(origin)?;
            ensure!(rating > 0 && rating <= 5, "Rating must be between 1 and 5");
            let scaled_rating = rating.saturating_mul(1000);
            
            Projects::<T>::try_mutate(project_id, |maybe_project| -> DispatchResult {
                let project = maybe_project.as_mut().ok_or(Error::<T>::ProjectNotFound)?;
                
                // Verify caller is the project client
                ensure!(project.client == client, Error::<T>::NotProjectOwner);
                ensure!(project.status == ProjectStatus::InReview, Error::<T>::InvalidStatus);
                ensure!(project.work_submission.is_some(), Error::<T>::NoWorkSubmitted);
                
                let freelancer = project.freelancer.as_ref().ok_or(Error::<T>::NotFreelancer)?;
                let payment = project.budget;

                // Remove the lock using the project's unique lock ID
                let lock_id = Self::generate_lock_id(project_id);
                T::Currency::remove_lock(
                    lock_id,
                    &project.client,
                );

                // Transfer the payment to the freelancer
                T::Currency::transfer(
                    &project.client,
                    freelancer,
                    payment,
                    ExistenceRequirement::KeepAlive,
                ).map_err(|_| Error::<T>::PaymentFailed)?;

                // Update freelancer and client reputation
                T::Reputation::on_project_completed(freelancer, payment, scaled_rating, project_id)?;
                T::Reputation::on_work_accepted(&client, project_id)?;
                
                project.status = ProjectStatus::Completed;
                
                Self::deposit_event(Event::WorkAccepted {
                    project_id,
                    freelancer: freelancer.clone(),
                    payment,
                });
                
                Ok(())
            })?;

            Ok(())
        }

        #[pallet::call_index(5)]
        #[pallet::weight(Weight::default())]
        pub fn reject_work(
            origin: OriginFor<T>,
            project_id: T::ProjectId,
            reason_uri: BoundedVec<u8, ConstU32<256>>,
        ) -> DispatchResult {
            let client = ensure_signed(origin)?;
            
            Projects::<T>::try_mutate(project_id, |maybe_project| -> DispatchResult {
                let project = maybe_project.as_mut().ok_or(Error::<T>::ProjectNotFound)?;
                
                // Verify caller is the project client
                ensure!(project.client == client, Error::<T>::NotProjectOwner);
                ensure!(project.status == ProjectStatus::InReview, Error::<T>::InvalidStatus);
                ensure!(project.work_submission.is_some(), Error::<T>::NoWorkSubmitted);
                ensure!(!reason_uri.is_empty(), Error::<T>::InvalidUri);
                
                let freelancer = project.freelancer.as_ref().ok_or(Error::<T>::NotFreelancer)?;

                // Update or create dispute info
                let current_block = <frame_system::Pallet<T>>::block_number();
                let previous_submissions = project.dispute_info.as_ref()
                    .map(|info| info.previous_submissions + 1)
                    .unwrap_or(0);

                project.dispute_info = Some(DisputeInfo {
                    reason_uri: reason_uri.clone(),
                    rejection_block: current_block,
                    previous_submissions,
                });

                project.status = ProjectStatus::Rejected;

                Self::deposit_event(Event::WorkRejected {
                    project_id,
                    freelancer: freelancer.clone(),
                    reason_uri,
                });
                
                Ok(())
            })?;

            Ok(())
        }

        #[pallet::call_index(6)]
        #[pallet::weight(Weight::default())]
        pub fn cancel_project(
            origin: OriginFor<T>,
            project_id: T::ProjectId,
        ) -> DispatchResult {
            let client = ensure_signed(origin)?;

            Projects::<T>::try_mutate(project_id, |maybe_project| -> DispatchResult {
                let project = maybe_project.as_mut().ok_or(Error::<T>::ProjectNotFound)?;

                ensure!(project.client == client, Error::<T>::NotProjectOwner);
                ensure!(project.status == ProjectStatus::Created || project.status == ProjectStatus::InProgress, Error::<T>::InvalidStatus);

                // Unlock the client's funds
                let lock_id = Self::generate_lock_id(project_id);
                T::Currency::remove_lock(
                    lock_id,
                    &project.client,
                );

                project.status = ProjectStatus::Cancelled;

                T::Reputation::on_project_cancelled(&client)?;

                Self::deposit_event(Event::ProjectCancelled { project_id, client });
                Ok(())
            })?;

            Ok(())
        }    }

    impl<T:Config> Pallet<T> {
        pub fn account_id() -> T::AccountId {
			<T as pallet::Config>::PalletId::get().into_account_truncating()
		}

        /// Generate a unique lock ID for a project
        fn generate_lock_id(project_id: T::ProjectId) -> [u8; 8] {
            let mut lock_id = *b"tsk/proj";  // Start with a prefix
            let id_bytes = project_id.encode();  // Convert project ID to bytes
            let mut id_iter = id_bytes.iter();
            
            // Mix in the project ID bytes to make the lock ID unique
            // This ensures different projects have different lock IDs
            for i in 4..8 {
                if let Some(byte) = id_iter.next() {
                    lock_id[i] = *byte;
                }
            }
            
            lock_id
        }
    }
    
    // Implementation of the Arbitrable trait for use by arbitration pallet
    impl<T: Config> Arbitrable<T::ProjectId, BalanceOf<T>, T::AccountId, BlockNumberFor<T>> for Pallet<T> {
        fn on_ruling(project_id: T::ProjectId, ruling: Ruling) -> DispatchResult {
            Projects::<T>::try_mutate(project_id, |maybe_project| -> DispatchResult {
                let project = maybe_project.as_mut().ok_or(Error::<T>::ProjectNotFound)?;
                
                // Get the parties involved
                let freelancer = project.freelancer.as_ref().ok_or(Error::<T>::NotFreelancer)?;
                let client = &project.client;
                
                // Convert arbitration Ruling to local handling
                match ruling {
                    Ruling::FreelancerWins => {
                        // Release funds to freelancer
                        let lock_id = Self::generate_lock_id(project_id);
                        T::Currency::remove_lock(lock_id, client); // remove_lock doesn't return Result
                        
                        T::Currency::transfer(
                            client,
                            freelancer,
                            project.budget,
                            ExistenceRequirement::KeepAlive,
                        )?;
                        
                        // Update freelancer and client reputation
                        T::Reputation::on_project_completed(freelancer, project.budget, 3000, project_id)?; // Default 3-star rating
                    },
                    Ruling::ClientWins => {
                        // For client wins, we just update reputation for dispute resolution
                        // Funds remain with client (already in escrow)
                        T::Reputation::on_dispute_outcome(client, freelancer, project_id, project.budget)?;
                    },
                }
                
                project.status = ProjectStatus::Completed; // Dispute resolved
                
                Ok(())
            })
        }
        
        fn get_project_budget(project_id: T::ProjectId) -> Result<BalanceOf<T>, DispatchError> {
            let project = Projects::<T>::get(project_id).ok_or(Error::<T>::ProjectNotFound)?;
            Ok(project.budget)
        }
        
        fn get_project_parties(project_id: T::ProjectId) -> Result<(T::AccountId, T::AccountId), DispatchError> {
            let project = Projects::<T>::get(project_id).ok_or(Error::<T>::ProjectNotFound)?;
            let freelancer = project.freelancer.ok_or(Error::<T>::NotFreelancer)?;
            Ok((project.client.clone(), freelancer))
        }
        
        fn set_project_status_in_dispute(project_id: T::ProjectId) -> DispatchResult {
            Projects::<T>::try_mutate(project_id, |maybe_project| -> DispatchResult {
                let project = maybe_project.as_mut().ok_or(Error::<T>::ProjectNotFound)?;
                
                // Store the original status before dispute for potential restoration
                let original_status = project.status;
                
                // Only allow setting to dispute status if it's in an appropriate state
                if original_status == ProjectStatus::Rejected || original_status == ProjectStatus::InReview {
                    project.status = ProjectStatus::InDispute;
                    Ok(())
                } else {
                    Err(Error::<T>::InvalidStatus.into())
                }
            })
        }
        
        fn get_project_status(project_id: T::ProjectId) -> Result<ProjectStatus, DispatchError> {
            let project = Projects::<T>::get(project_id).ok_or(Error::<T>::ProjectNotFound)?;
            Ok(project.status)
        }

		fn get_evidence_uris(project_id: T::ProjectId) -> Result<(EvidenceUri, EvidenceUri), DispatchError> {
			let project = Projects::<T>::get(project_id).ok_or(Error::<T>::ProjectNotFound)?;
			
			let requirements_uri = project.uri;
			let submission_uri = project.work_submission
				.ok_or(Error::<T>::NoWorkSubmitted)?
				.uri;
				
			Ok((requirements_uri, submission_uri))
		}
    }
}
