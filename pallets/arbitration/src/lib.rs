#![cfg_attr(not(feature = "std"), no_std)]

pub use pallet::*;

#[cfg(test)]
mod mock;

#[cfg(test)]
mod tests;

#[frame_support::pallet]
pub mod pallet {
    use super::*;
    use scale_info::prelude::ops::Add;
    use frame_support::pallet_prelude::*;
    use frame_system::pallet_prelude::*;
    use frame_support::{BoundedVec,PalletId, 
        traits::{Currency, ReservableCurrency}
    };

    use sp_runtime::{
		traits::{ Saturating}
    };
    use codec::{Encode, Decode, MaxEncodedLen};
    use scale_info::TypeInfo;
    use frame_support::dispatch::{DispatchResult};
    use frame_support::BoundedBTreeMap;

    use pallet_projects::Arbitrable;
    use pallet_reputation::ReputationInterface;
    use pallet_reputation::JurorTier;
    type BalanceOf<T> = <<T as Config>::Currency as Currency<<T as frame_system::Config>::AccountId>>::Balance;

    #[pallet::pallet]
    pub struct Pallet<T>(_);

    #[derive(Clone, Encode, Decode, PartialEq, Debug,MaxEncodedLen, TypeInfo, Eq, Copy)]
	#[cfg_attr(feature = "std", derive(serde::Serialize, serde::Deserialize))]
	pub enum DisputeStatus {
        AiProcessing,
        Appealable,
        Voting,
        Finalized,
        Resolved,
    }

    #[derive(Clone, Encode, Decode, PartialEq, MaxEncodedLen, TypeInfo, Eq, Copy, RuntimeDebug, DecodeWithMemTracking)]
	#[cfg_attr(feature = "std", derive(serde::Serialize, serde::Deserialize))]
    pub enum Ruling {
        ClientWins,
        FreelancerWins,
    }

    #[derive(Clone, Encode, Decode, PartialEq, MaxEncodedLen, TypeInfo, Eq, Copy, RuntimeDebug, DecodeWithMemTracking)]
	#[cfg_attr(feature = "std", derive(serde::Serialize, serde::Deserialize))]
    pub enum Vote {
        ForClient,
        ForFreelancer,
    }

    #[derive(Encode, Decode, Clone, PartialEq, Eq, MaxEncodedLen, TypeInfo, Debug)]
    #[scale_info(skip_type_params(T))]
    pub struct DisputeInfo<T: Config> {
        pub status: DisputeStatus,
        pub evidence_uri: BoundedVec<u8, T::MaxEvidenceMeta>,
        pub start_block: BlockNumberFor<T>,
        pub ruling: Option<Ruling>,
        pub round: u32,
        pub jurors: BoundedVec<(T::AccountId, bool), T::MaxJurors>,
        pub votes: BoundedBTreeMap<T::AccountId, Vote, T::MaxJurors>,
    }

    #[pallet::config]
    pub trait Config: frame_system::Config {
        /// The overarching runtime event type.
        type RuntimeEvent: From<Event<Self>> + IsType<<Self as frame_system::Config>::RuntimeEvent>;
        /// A type representing the weights required by the dispatchables of this pallet.
        type WeightInfo;
        /// The currency type that will be used to place deposits and pay freelancers
        type Currency: Currency<Self::AccountId> + ReservableCurrency<Self::AccountId>;

        type AiOracleOrigin: EnsureOrigin<Self::RuntimeOrigin>;

        type PalletId: Get<PalletId>;
        /// The type used to identify projects
        type ProjectId: Member + Parameter + MaxEncodedLen + Copy + Default + sp_runtime::traits::One 
            + sp_runtime::traits::Zero + Add<Output = Self::ProjectId> 
            + From<u32> + Into<u32>;

        type Arbitrable: pallet_projects::Arbitrable<
            Self::ProjectId,
            <Self::Currency as Currency<Self::AccountId>>::Balance, 
            Self::AccountId,
            BlockNumberFor<Self>
        >;

        type Reputation: pallet_reputation::ReputationInterface<
            Self::AccountId,
            <Self::Currency as Currency<Self::AccountId>>::Balance,
            Self::ProjectId,
            BlockNumberFor<Self>,
            Self::MaxJurors
        >;

        #[pallet::constant]
        type MinJurors: Get<u32>;


        #[pallet::constant]
        type MaxEvidenceMeta: Get<u32>;
        #[pallet::constant]
        type MaxJurors: Get<u32>;
        #[pallet::constant]
        type AiProcessingPeriod: Get<BlockNumberFor<Self>>;
        #[pallet::constant]
        type VotingPeriod: Get<BlockNumberFor<Self>>;
        #[pallet::constant]
        type AppealPeriod: Get<BlockNumberFor<Self>>;

        // --- Minimum Bond Amounts ---
        #[pallet::constant]
        type MinimumAiBond: Get<BalanceOf<Self>>; // Floor for the 5% bond.
        #[pallet::constant]
        type MinimumFirstAppealBond: Get<BalanceOf<Self>>; // Floor for the 20% bond.
        #[pallet::constant]
        type MinimumFinalAppealBond: Get<BalanceOf<Self>>; // Floor for the 50% bond.
    }

    #[pallet::storage]
    #[pallet::getter(fn disputes)]
    pub type Disputes<T: Config> = StorageMap<_, Blake2_128Concat, T::ProjectId, DisputeInfo<T>>;

    #[pallet::storage]
    pub type Bonds<T: Config> = StorageDoubleMap<
        _,
        Blake2_128Concat, T::ProjectId,
        Blake2_128Concat, T::AccountId,
        BalanceOf<T>,
        ValueQuery
    >;

    #[pallet::event]
    #[pallet::generate_deposit(pub(super) fn deposit_event)]
    pub enum Event<T: Config> {
        DisputeCreated { project_id: T::ProjectId, who: T::AccountId },
        RulingSubmitted { project_id: T::ProjectId, ruling: Ruling },
        RulingAppealed { project_id: T::ProjectId, who: T::AccountId },
        VoteCast { project_id: T::ProjectId, who: T::AccountId, vote: Vote },
        RulingExecuted { project_id: T::ProjectId, who: T::AccountId },
        AiRulingSubmitted { project_id: T::ProjectId, ruling: Ruling },
        AppealStarted { project_id: T::ProjectId, appellant: T::AccountId, bond: BalanceOf<T> },
        DisputeResolved { project_id: T::ProjectId, winner: T::AccountId },
        RoundFinalized { project_id: T::ProjectId, ruling: Ruling },
    }

    #[pallet::error]
    pub enum Error<T> {
        /// Dispute does not exist
        DisputeNotFound,
        /// Not authorized to perform this action
        NotAuthorized,
        /// Dispute already resolved
        DisputeAlreadyResolved,
        /// Invalid round number
        InvalidRound,
        /// Bond amount insufficient
        InsufficientBond,
        /// Not enough jurors for voting
        NotEnoughJurors,
        /// Vote already cast by this juror
        VoteAlreadyCast,
        /// Dispute not in voting state
        NotInVotingState,
        /// Invalid vote
        InvalidVote,
        /// Dispute not in appealable state
        NotInAppealableState,
        /// User not eligible to be a juror
        NotEligibleJuror,
        /// Project already in dispute
        ProjectAlreadyInDispute,
        /// Insufficient balance to pay bond
        InsufficientBalance,
        DisputeAlreadyExists,
        InvalidStatus,
        AppealPeriodExpired,
        NotLosingParty,
        MaxAppealsReached,
        NotJuror,
        AlreadyVoted,
        VotingPeriodNotOver,
    }

    #[pallet::call]
    impl<T: Config> Pallet<T> {

        #[pallet::call_index(0)]
        #[pallet::weight(Weight::default())]
        pub fn create_dispute(origin: OriginFor<T>, project_id: T::ProjectId, evidence_uri: BoundedVec<u8, T::MaxEvidenceMeta>) -> DispatchResult {
            let freelancer = ensure_signed(origin)?;

            ensure!(!Disputes::<T>::contains_key(project_id), Error::<T>::DisputeAlreadyExists);

            let (_client, project_freelancer) = T::Arbitrable::get_project_parties(project_id)?;
            ensure!(freelancer == project_freelancer, Error::<T>::NotAuthorized);

            let bond = Self::calculate_bond(&project_id, 1)?;
            <T as pallet::Config>::Currency::reserve(&freelancer, bond)?;

            let new_dispute = DisputeInfo {
                status: DisputeStatus::AiProcessing,
                evidence_uri,
                start_block: <frame_system::Pallet<T>>::block_number(),
                ruling: None,
                round: 1,
                jurors: Default::default(),
                votes: Default::default(),
            };

            Disputes::<T>::insert(project_id, new_dispute);

            T::Arbitrable::set_project_status_in_dispute(project_id)?;


            // Emit an event for the dispute creation
            Self::deposit_event(Event::DisputeCreated { project_id, who: freelancer });

            Ok(())
        }

        #[pallet::call_index(1)]
        #[pallet::weight(Weight::default())]
        pub fn submit_ruling(origin: OriginFor<T>, project_id: T::ProjectId, ruling: Ruling) -> DispatchResult {
            T::AiOracleOrigin::ensure_origin(origin)?;

            Disputes::<T>::try_mutate(project_id, |maybe_dispute| -> DispatchResult {
                let dispute = maybe_dispute.as_mut().ok_or(Error::<T>::DisputeNotFound)?;

                // 2. Verify the dispute is in the correct state for this action.
                ensure!(dispute.status == DisputeStatus::AiProcessing, Error::<T>::InvalidStatus);

                // 3. Update the dispute state to reflect the AI's ruling.
                dispute.ruling = Some(ruling);
                dispute.status = DisputeStatus::Appealable; // The ruling can now be appealed.
                dispute.start_block = <frame_system::Pallet<T>>::block_number(); // Start the appeal timer.

                // 4. Emit an event.
                Self::deposit_event(Event::AiRulingSubmitted { project_id, ruling });
                Ok(())
            })
        }

        #[pallet::call_index(2)]
        #[pallet::weight(Weight::default())]
        pub fn appeal_ruling(
            origin: OriginFor<T>,
            project_id: T::ProjectId,
            evidence_uri: BoundedVec<u8, T::MaxEvidenceMeta>
        ) -> DispatchResult {
            let appellant = ensure_signed(origin)?;

            let mut dispute = Disputes::<T>::get(project_id).ok_or(Error::<T>::DisputeNotFound)?;

            // --- PRE-CONDITION CHECKS ---

            // 1. Ensure the dispute is in a state where it can be appealed.
            ensure!(dispute.status == DisputeStatus::Appealable, Error::<T>::InvalidStatus);

            // 2. Ensure the appeal period has not expired.
            let current_block = <frame_system::Pallet<T>>::block_number();
            ensure!(
                current_block < dispute.start_block.saturating_add(T::AppealPeriod::get()),
                Error::<T>::AppealPeriodExpired
            );

            // 3. Identify the losing party and ensure the appellant is that person.
            let (client, freelancer) = T::Arbitrable::get_project_parties(project_id)?;
            let loser = match dispute.ruling {
                Some(Ruling::ClientWins) => freelancer.clone(),
                Some(Ruling::FreelancerWins) => client.clone(),
                None => return Err(Error::<T>::InvalidStatus.into()), // Should not happen in Appealable state
            };
            ensure!(appellant == loser, Error::<T>::NotLosingParty);

            // 4. Determine the next round and check if the maximum number of appeals has been reached.
            let next_round = dispute.round.saturating_add(1);
            ensure!(next_round <= 3, Error::<T>::MaxAppealsReached);

            // --- "PAYABLE" LOGIC ---

            // 5. Calculate and reserve the bond for the upcoming round.
            let bond = Self::calculate_bond(&project_id, next_round)?;
            <T as pallet::Config>::Currency::reserve(&appellant, bond)?;

            // --- JURY SELECTION ---

            // 6. Select the jury based on the rules for the next round.
            let (required_tier, jury_size) = match next_round {
                2 => (JurorTier::Bronze, T::MinJurors::get()),
                3 => (JurorTier::Silver, T::MaxJurors::get()),
                _ => return Err(Error::<T>::InvalidRound.into()), // Should be caught by MaxAppealsReached
            };

            let jurors_vec = <T as pallet::Config>::Reputation::get_eligible_jurors(required_tier, &[client, freelancer], jury_size);
            let mut jurors_with_vote_status = BoundedVec::<(T::AccountId, bool), T::MaxJurors>::new();
            for juror_account in jurors_vec {
                jurors_with_vote_status.try_push((juror_account, false)).unwrap();
            }
            ensure!(jurors_with_vote_status.len() >= jury_size as usize, Error::<T>::NotEnoughJurors);

            // --- STATE TRANSITION ---

            // 7. Reset the dispute state for the new voting round.
            dispute.round = next_round;
            dispute.status = DisputeStatus::Voting;
            // Map the selected jurors into the required format (AccountId, HasVoted=false)
            dispute.jurors = jurors_with_vote_status;
            dispute.votes.clear();
            dispute.ruling = None;
            dispute.start_block = current_block;
            dispute.evidence_uri = evidence_uri;
            
            Disputes::<T>::insert(project_id, dispute);
            
            // --- FINALIZATION ---
            Self::deposit_event(Event::AppealStarted { project_id, appellant, bond });

            Ok(())
        }

        #[pallet::call_index(3)]
        #[pallet::weight(Weight::default())]
        pub fn cast_vote(origin: OriginFor<T>, project_id: T::ProjectId, vote: Vote) -> DispatchResult {
            let juror = ensure_signed(origin)?;

            Disputes::<T>::try_mutate(project_id, |maybe_dispute| -> DispatchResult {
                let dispute = maybe_dispute.as_mut().ok_or(Error::<T>::DisputeNotFound)?;

                // --- PRE-CONDITION CHECKS ---
                ensure!(dispute.status == DisputeStatus::Voting, Error::<T>::InvalidStatus);

                // 1. Find the juror in the jury list.
                let juror_entry = dispute.jurors.iter_mut()
                    .find(|(j, _)| *j == juror)
                    .ok_or(Error::<T>::NotJuror)?;

                // 2. Check if this juror has already voted.
                ensure!(juror_entry.1 == false, Error::<T>::AlreadyVoted);

                // --- STATE TRANSITION ---
                
                // 3. Record the vote in the BTreeMap for efficient tallying.
                dispute.votes.try_insert(juror.clone(), vote)
                    .map_err(|_| Error::<T>::NotEnoughJurors)?; // BTreeMap will error if full
                
                // 4. Mark the juror as having voted.
                juror_entry.1 = true;
                
                // --- FINALIZATION ---
                Self::deposit_event(Event::VoteCast { project_id, who: juror, vote });

                Ok(())
            })
        }

        #[pallet::call_index(4)]
        #[pallet::weight(Weight::default())]
        pub fn enforce_final_ruling(origin: OriginFor<T>, project_id: T::ProjectId) -> DispatchResult {
            // Anyone can trigger this, so we just need a signed origin.
            ensure_signed(origin)?;

            let mut dispute = Disputes::<T>::get(project_id).ok_or(Error::<T>::DisputeNotFound)?;

            // --- PRE-CONDITION CHECKS ---
            ensure!(dispute.status == DisputeStatus::Appealable, Error::<T>::InvalidStatus);
            let current_block = <frame_system::Pallet<T>>::block_number();
            ensure!(
                current_block >= dispute.start_block.saturating_add(T::AppealPeriod::get()),
                Error::<T>::AppealPeriodExpired
            );

            let (client, freelancer) = T::Arbitrable::get_project_parties(project_id)?;
            let final_ruling = dispute.ruling.ok_or(Error::<T>::InvalidStatus)?;

            let (winner, loser) = match final_ruling {
                Ruling::ClientWins => (client.clone(), freelancer.clone()),
                Ruling::FreelancerWins => (freelancer.clone(), client.clone()),
            };

            // --- EXECUTION LOGIC ---
            
            // 1. Execute the project payment via the Arbitrable trait.
            T::Arbitrable::on_ruling(project_id, Self::convert_to_project_ruling(final_ruling))?;

            // 2. Distribute the bonds.
            // This is a simplified model: unreserve winner's bonds, slash loser's.
            // A more complex implementation would distribute the slashed funds to jurors/treasury.
            // For now, slashing means the funds are lost to the system treasury.
            <T as pallet::Config>::Currency::unreserve(&winner, <T as pallet::Config>::Currency::reserved_balance(&winner)); // Simplistic: unreserves all, not just for this dispute
            <T as pallet::Config>::Currency::slash_reserved(&loser, <T as pallet::Config>::Currency::reserved_balance(&loser)); // Simplistic: slashes all

            // 3. Update the reputation of the winner and loser.
            <T as pallet::Config>::Reputation::on_dispute_outcome(&winner, &loser, project_id, BalanceOf::<T>::from(0u32))?;

            // --- STATE TRANSITION ---
            dispute.status = DisputeStatus::Finalized;
            Disputes::<T>::insert(project_id, dispute);
            // Alternatively, you could remove the dispute from storage to save space:
            // Disputes::<T>::remove(project_id);

            // --- FINALIZATION ---
            Self::deposit_event(Event::DisputeResolved { project_id, winner });

            Ok(())
        }

        #[pallet::call_index(5)]
        #[pallet::weight(Weight::default())]
        pub fn finalize_round(
            origin: OriginFor<T>,
            project_id: T::ProjectId
        ) -> DispatchResult {
            // 1. Anyone can trigger this, so we just need a signed origin.
            ensure_signed(origin)?;

            Disputes::<T>::try_mutate(project_id, |maybe_dispute| -> DispatchResult {
                let dispute = maybe_dispute.as_mut().ok_or(Error::<T>::DisputeNotFound)?;

                // --- PRE-CONDITION CHECKS ---
                ensure!(dispute.status == DisputeStatus::Voting, Error::<T>::InvalidStatus);
                let current_block = <frame_system::Pallet<T>>::block_number();
                ensure!(
                    current_block >= dispute.start_block.saturating_add(T::VotingPeriod::get()),
                    Error::<T>::VotingPeriodNotOver
                );

                // --- VOTE TALLYING LOGIC ---
                let mut client_votes = 0;
                let mut freelancer_votes = 0;
                for (_, vote) in dispute.votes.iter() {
                    match vote {
                        Vote::ForClient => client_votes += 1,
                        Vote::ForFreelancer => freelancer_votes += 1,
                    }
                }

                // Determine the ruling. In case of a tie, rule in favor of the freelancer.
                // This is a safe default as it rewards the person who did the work.
                let round_ruling = if freelancer_votes >= client_votes {
                    Ruling::FreelancerWins
                } else {
                    Ruling::ClientWins
                };

                // --- JUROR REPUTATION UPDATE ---
                for (juror, vote) in dispute.votes.iter() {
                    let voted_with_majority = match (round_ruling, vote) {
                        (Ruling::FreelancerWins, Vote::ForFreelancer) => true,
                        (Ruling::ClientWins, Vote::ForClient) => true,
                        _ => false,
                    };
                    // Call the reputation pallet to update stats. We can ignore potential
                    // errors here as a failure to update one juror's rep should not
                    // halt the entire dispute finalization.
                    let _ = <T as pallet::Config>::Reputation::on_jury_vote(juror, voted_with_majority);
                }

                // --- STATE TRANSITION ---
                dispute.ruling = Some(round_ruling);
                dispute.status = DisputeStatus::Appealable;
                dispute.start_block = current_block; // Start the new appeal period timer.

                Self::deposit_event(Event::RoundFinalized { project_id, ruling: round_ruling });

                Ok(())
            })
        }
    }

    impl<T: Config> Pallet<T> {
        pub fn calculate_bond(project_id: &T::ProjectId, round: u32) -> Result<BalanceOf<T>, DispatchError> {
            let project_budget = T::Arbitrable::get_project_budget(*project_id)?;

            let (bond_percentage, minimum_bond) = match round {
                1 => (5u32, T::MinimumAiBond::get()),
                2 => (20u32, T::MinimumFirstAppealBond::get()),
                3 => (50u32, T::MinimumFinalAppealBond::get()),
                _ => return Err(Error::<T>::InvalidRound.into()),
            };

            // Calculate the percentage-based bond
            let calculated_bond = project_budget.saturating_mul(bond_percentage.into()) / (100u32.into());

            // Return the higher of the calculated bond or the configured minimum
            Ok(calculated_bond.max(minimum_bond))
        }
        
        fn convert_to_project_ruling(ruling: Ruling) -> pallet_projects::Ruling {
            match ruling {
                Ruling::ClientWins => pallet_projects::Ruling::ClientWins,
                Ruling::FreelancerWins => pallet_projects::Ruling::FreelancerWins,
            }
        }
    }
}