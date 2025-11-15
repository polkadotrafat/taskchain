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
        traits::{Currency, ReservableCurrency, ExistenceRequirement, Imbalance},
        storage::types::{StorageNMap, Key},
        Blake2_128Concat,
    };
    use sp_runtime::traits::AccountIdConversion;
    use frame_support::pallet_prelude::NMapKey;

    use sp_runtime::{
		traits::{ Saturating}
    };
    use codec::{Encode, Decode, MaxEncodedLen};
    use scale_info::TypeInfo;
    use frame_support::dispatch::{DispatchResult};
    use frame_support::BoundedBTreeMap;
    use sp_runtime::traits::Zero;

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

    #[pallet::storage]
    #[pallet::getter(fn juror_rewards)]
    pub type JurorRewards<T: Config> = StorageDoubleMap<
        _,
        Blake2_128Concat, T::ProjectId,
        Blake2_128Concat, T::AccountId,
        BalanceOf<T>,
        ValueQuery
    >;
    #[pallet::storage]
    #[pallet::getter(fn arbitration_costs)]
    pub type ArbitrationCosts<T: Config> = StorageMap<_, Blake2_128Concat, T::ProjectId, BalanceOf<T>, ValueQuery>;
    #[pallet::storage]
    #[pallet::getter(fn appeal_bonds)]
    pub type AppealBonds<T: Config> = StorageDoubleMap<
        _,
        Blake2_128Concat, T::ProjectId,
        Blake2_128Concat, u32, // round number
        (T::AccountId, BalanceOf<T>), // (appellant, bond_amount)
    >;
    #[pallet::storage]
    #[pallet::getter(fn jury_fees_owed)]
    pub type JuryFeesOwed<T: Config> = StorageDoubleMap<
        _,
        Blake2_128Concat, (T::ProjectId, u32), // (project_id, round) as composite key
        Blake2_128Concat, T::AccountId, // juror
        (BalanceOf<T>, BalanceOf<T>), // (base_fee, performance_bonus)
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
        JurorRewarded { project_id: T::ProjectId, juror: T::AccountId, amount: BalanceOf<T> },
        ArbitrationCostReserved { project_id: T::ProjectId, amount: BalanceOf<T> },
        AppealBondReturned { project_id: T::ProjectId, appellant: T::AccountId, amount: BalanceOf<T> },
        JurorBaseFeeAwarded { project_id: T::ProjectId, juror: T::AccountId, amount: BalanceOf<T> },
        JurorPerformanceBonusAwarded { project_id: T::ProjectId, juror: T::AccountId, amount: BalanceOf<T> },
        ArbitrationCostsPaid { project_id: T::ProjectId, payer: T::AccountId, amount: BalanceOf<T> },
        PayoutCompleted { project_id: T::ProjectId },
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
        PaymentFailed,
    }

    #[pallet::call]
    impl<T: Config> Pallet<T> {

        #[pallet::call_index(0)]
        #[pallet::weight(Weight::default())]
        pub fn create_dispute(
            origin: OriginFor<T>, 
            project_id: T::ProjectId, 
            evidence_uri: BoundedVec<u8, T::MaxEvidenceMeta>
        ) -> DispatchResult {
            let freelancer = ensure_signed(origin)?;
            ensure!(!Disputes::<T>::contains_key(project_id), Error::<T>::DisputeAlreadyExists);
            let (_client, project_freelancer) = T::Arbitrable::get_project_parties(project_id)?;
            ensure!(freelancer == project_freelancer, Error::<T>::NotAuthorized);
            let bond = Self::calculate_bond(&project_id, 1)?;
            <T as pallet::Config>::Currency::reserve(&freelancer, bond)?;
            AppealBonds::<T>::insert(project_id, 1, (freelancer.clone(), bond));
            // Calculate and reserve arbitration costs for initial AI processing
            let initial_arbitration_cost = Self::calculate_arbitration_cost(&project_id, 1)?;
            ArbitrationCosts::<T>::insert(project_id, initial_arbitration_cost);
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
            Self::deposit_event(Event::DisputeCreated { project_id, who: freelancer });
            Self::deposit_event(Event::ArbitrationCostReserved { project_id, amount: initial_arbitration_cost });
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
            // ... existing pre-condition checks remain the same ...
            ensure!(dispute.status == DisputeStatus::Appealable, Error::<T>::InvalidStatus);
            let current_block = <frame_system::Pallet<T>>::block_number();
            ensure!(
                current_block < dispute.start_block.saturating_add(T::AppealPeriod::get()),
                Error::<T>::AppealPeriodExpired
            );
            let (client, freelancer) = T::Arbitrable::get_project_parties(project_id)?;
            let loser = match dispute.ruling {
                Some(Ruling::ClientWins) => freelancer.clone(),
                Some(Ruling::FreelancerWins) => client.clone(),
                None => return Err(Error::<T>::InvalidStatus.into()),
            };
            ensure!(appellant == loser, Error::<T>::NotLosingParty);
            let next_round = dispute.round.saturating_add(1);
            ensure!(next_round <= 3, Error::<T>::MaxAppealsReached);
            // Calculate and reserve appeal bond
            let appeal_bond = Self::calculate_appeal_bond(&project_id, next_round)?;
            <T as pallet::Config>::Currency::reserve(&appellant, appeal_bond)?;
            
            // Store the appeal bond info
            AppealBonds::<T>::insert(project_id, next_round, (appellant.clone(), appeal_bond));
            // Add arbitration costs for this new round
            let additional_arbitration_cost = Self::calculate_arbitration_cost(&project_id, next_round)?;
            ArbitrationCosts::<T>::mutate(project_id, |total_cost| {
                *total_cost = total_cost.saturating_add(additional_arbitration_cost);
            });
            // Jury selection logic
            let (required_tier, jury_size) = match next_round {
                2 => (JurorTier::Bronze, T::MinJurors::get()),
                3 => (JurorTier::Silver, T::MaxJurors::get()),
                _ => return Err(Error::<T>::InvalidRound.into()),
            };
            let jurors_vec = <T as pallet::Config>::Reputation::get_eligible_jurors(required_tier, &[client, freelancer], jury_size);
            let mut jurors_with_vote_status = BoundedVec::<(T::AccountId, bool), T::MaxJurors>::new();
            for juror_account in jurors_vec {
                jurors_with_vote_status.try_push((juror_account, false)).unwrap();
            }
            ensure!(jurors_with_vote_status.len() >= jury_size as usize, Error::<T>::NotEnoughJurors);
            // Pre-calculate jury fees for this round - Fixed syntax
            let (base_fee, performance_bonus) = Self::calculate_jury_fees(&project_id, next_round)?;
            for (juror, _) in &jurors_with_vote_status {
                JuryFeesOwed::<T>::insert((project_id, next_round), juror, (base_fee, performance_bonus));
            }
            // Update dispute state
            dispute.round = next_round;
            dispute.status = DisputeStatus::Voting;
            dispute.jurors = jurors_with_vote_status;
            dispute.votes.clear();
            dispute.ruling = None;
            dispute.start_block = current_block;
            dispute.evidence_uri = evidence_uri;
            
            Disputes::<T>::insert(project_id, dispute);
            
            Self::deposit_event(Event::AppealStarted { project_id, appellant, bond: appeal_bond });
            Self::deposit_event(Event::ArbitrationCostReserved { project_id, amount: additional_arbitration_cost });
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
            // 1. Execute the project payment via the Arbitrable trait
            T::Arbitrable::on_ruling(project_id, Self::convert_to_project_ruling(final_ruling))?;
            // 2. Complete all financial settlements
            Self::complete_arbitration_payouts(project_id, &winner, &loser)?;
            // 3. Update reputation
            <T as pallet::Config>::Reputation::on_dispute_outcome(&winner, &loser, project_id, BalanceOf::<T>::from(0u32))?;
            // 4. Finalize dispute
            dispute.status = DisputeStatus::Finalized;
            Disputes::<T>::insert(project_id, dispute);
            Self::deposit_event(Event::DisputeResolved { project_id, winner });
            Self::deposit_event(Event::PayoutCompleted { project_id });
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
                let mut client_votes = 0;
                let mut freelancer_votes = 0;
                for (_, vote) in dispute.votes.iter() {
                    match vote {
                        Vote::ForClient => client_votes += 1,
                        Vote::ForFreelancer => freelancer_votes += 1,
                    }
                }
                let round_ruling = if freelancer_votes >= client_votes {
                    Ruling::FreelancerWins
                } else {
                    Ruling::ClientWins
                };
                // Award jury fees based on voting behavior
                Self::award_jury_fees_for_round(project_id, dispute.round, round_ruling, &dispute.votes)?;
                // Update juror reputation
                for (juror, vote) in dispute.votes.iter() {
                    let voted_with_majority = match (round_ruling, vote) {
                        (Ruling::FreelancerWins, Vote::ForFreelancer) => true,
                        (Ruling::ClientWins, Vote::ForClient) => true,
                        _ => false,
                    };
                    let _ = <T as pallet::Config>::Reputation::on_jury_vote(juror, voted_with_majority);
                }
                dispute.ruling = Some(round_ruling);
                dispute.status = DisputeStatus::Appealable;
                dispute.start_block = current_block;
                Self::deposit_event(Event::RoundFinalized { project_id, ruling: round_ruling });
                Ok(())
            })
        }
    }

    impl<T: Config> Pallet<T> {
        /// Calculate arbitration costs for a given round (covers jury fees + platform fees)
        pub fn calculate_arbitration_cost(project_id: &T::ProjectId, round: u32) -> Result<BalanceOf<T>, DispatchError> {
            let project_budget = T::Arbitrable::get_project_budget(*project_id)?;
            
            let cost_percentage = match round {
                1 => 2u32,  // 2% for AI processing
                2 => 5u32,  // 5% for first appeal (Bronze jury)
                3 => 8u32,  // 8% for final appeal (Silver jury)
                _ => return Err(Error::<T>::InvalidRound.into()),
            };
            Ok(project_budget.saturating_mul(cost_percentage.into()) / (100u32.into()))
        }
        /// Calculate appeal bond (separate from arbitration costs)
        pub fn calculate_appeal_bond(project_id: &T::ProjectId, round: u32) -> Result<BalanceOf<T>, DispatchError> {
            let project_budget = T::Arbitrable::get_project_budget(*project_id)?;
            
            let (bond_percentage, minimum_bond) = match round {
                1 => (5u32, T::MinimumAiBond::get()),
                2 => (20u32, T::MinimumFirstAppealBond::get()),
                3 => (50u32, T::MinimumFinalAppealBond::get()),
                _ => return Err(Error::<T>::InvalidRound.into()),
            };
            Ok(project_budget.saturating_mul(bond_percentage.into()) / (100u32.into()))
        }
        /// Calculate individual jury fees (base fee + potential performance bonus)
        pub fn calculate_jury_fees(project_id: &T::ProjectId, round: u32) -> Result<(BalanceOf<T>, BalanceOf<T>), DispatchError> {
            let project_budget = T::Arbitrable::get_project_budget(*project_id)?;
            
            // Base fee per juror (guaranteed regardless of vote)
            let base_fee_percentage = match round {
                2 => 1u32,  // 1% of project budget per juror for Bronze jury
                3 => 2u32,  // 2% of project budget per juror for Silver jury
                _ => return Err(Error::<T>::InvalidRound.into()),
            };
            let base_fee = project_budget.saturating_mul(base_fee_percentage.into()) / (100u32.into());
            
            // Performance bonus for voting with majority (additional incentive for careful consideration)
            let performance_bonus = base_fee / 4u32.into(); // 25% of base fee as bonus
            Ok((base_fee, performance_bonus))
        }
        /// Award jury fees for a completed round
        pub fn award_jury_fees_for_round(
            project_id: T::ProjectId,
            round: u32,
            ruling: Ruling,
            votes: &BoundedBTreeMap<T::AccountId, Vote, T::MaxJurors>
        ) -> DispatchResult {
            // Award base fees to all jurors and performance bonuses to majority voters
            for (juror, vote) in votes.iter() {
                let (base_fee, performance_bonus) = JuryFeesOwed::<T>::get((project_id, round), juror);
                
                // All jurors get base fee for participation
                JurorRewards::<T>::mutate(project_id, juror, |total_reward| {
                    *total_reward = total_reward.saturating_add(base_fee);
                });
                
                Self::deposit_event(Event::JurorBaseFeeAwarded { 
                    project_id, 
                    juror: juror.clone(), 
                    amount: base_fee 
                });
                // Check if juror voted with majority for performance bonus
                let voted_with_majority = match (ruling, vote) {
                    (Ruling::FreelancerWins, Vote::ForFreelancer) => true,
                    (Ruling::ClientWins, Vote::ForClient) => true,
                    _ => false,
                };
                if voted_with_majority {
                    JurorRewards::<T>::mutate(project_id, juror, |total_reward| {
                        *total_reward = total_reward.saturating_add(performance_bonus);
                    });
                    
                    Self::deposit_event(Event::JurorPerformanceBonusAwarded { 
                        project_id, 
                        juror: juror.clone(), 
                        amount: performance_bonus 
                    });
                }
            }
            Ok(())
        }
        /*
        pub fn complete_arbitration_payouts(
            project_id: T::ProjectId,
            _winner: &T::AccountId,
            loser: &T::AccountId
        ) -> DispatchResult {
            // 1. Loser pays all arbitration costs
            let total_arbitration_costs = ArbitrationCosts::<T>::get(project_id);
            if !total_arbitration_costs.is_zero() {
                <T as pallet::Config>::Currency::transfer(
                    loser,
                    &Self::account_id(),
                    total_arbitration_costs,
                    ExistenceRequirement::AllowDeath,
                ).map_err(|_| Error::<T>::PaymentFailed)?;
                Self::deposit_event(Event::ArbitrationCostsPaid { 
                    project_id, 
                    payer: loser.clone(), 
                    amount: total_arbitration_costs 
                });
            }
            // 2. Return all appeal bonds to appellants
            Self::return_all_appeal_bonds(project_id)?;
            // 3. Pay all accumulated jury rewards from the arbitration costs pool
            Self::pay_all_jury_rewards(project_id)?;
            // 4. Clean up storage
            Self::cleanup_arbitration_storage(project_id);
            Ok(())
        }
            */
        pub fn complete_arbitration_payouts(
            project_id: T::ProjectId,
            winner: &T::AccountId,
            loser: &T::AccountId,
        ) -> DispatchResult {
            let pallet_account = Self::account_id();
            let mut total_slashed_funds = BalanceOf::<T>::zero();

            // --- 1. Handle Bonds ---
            // Iterate through all bonds staked for this specific project (across all rounds).
            for (_round, (appellant, bond_amount)) in AppealBonds::<T>::iter_prefix(project_id) {
                if appellant == *winner {
                    // The winner gets their specific bond(s) back.
                    T::Currency::unreserve(&appellant, bond_amount);
                    Self::deposit_event(Event::AppealBondReturned {
                        project_id,
                        appellant,
                        amount: bond_amount,
                    });
                } else {
                    // The loser's specific bond(s) are slashed. The funds are moved to the pallet's account.
                    let (imbalance, _) = T::Currency::slash_reserved(&appellant, bond_amount);
                    // Deposit the slashed funds into the pallet's account to cover costs.
                    total_slashed_funds = total_slashed_funds.saturating_add(imbalance.peek());
                    T::Currency::deposit_creating(&pallet_account, imbalance.peek());
                    drop(imbalance);
                }
            }

            // --- 2. Handle Arbitration Costs ---
            // The loser must pay the total arbitration costs. We attempt to take this from their
            // free balance. If that fails, it's implicitly covered by their slashed bonds
            // which are now in the pallet's account.
            let total_arbitration_costs = ArbitrationCosts::<T>::get(project_id);
            if total_arbitration_costs > total_slashed_funds {
                let remaining_costs = total_arbitration_costs.saturating_sub(total_slashed_funds);
                // Try to transfer the remainder from the loser's free balance.
                if T::Currency::transfer(loser, &pallet_account, remaining_costs, ExistenceRequirement::AllowDeath).is_ok() {
                    Self::deposit_event(Event::ArbitrationCostsPaid {
                    project_id,
                    payer: loser.clone(),
                    amount: remaining_costs,
                });
                }
            } else {
                // The slashed bond was enough to cover all costs. The loser paid implicitly.
                Self::deposit_event(Event::ArbitrationCostsPaid {
                    project_id,
                    payer: loser.clone(),
                    amount: total_arbitration_costs,
                });
            }


            // --- 3. Pay Jurors ---
            // Pay out all accumulated juror rewards from the pallet's account, which now holds
            // the necessary funds from either the loser's direct payment or their slashed bond.
            Self::pay_all_jury_rewards(project_id)?;

            // --- 4. Clean up all financial storage for this dispute ---
            Self::cleanup_arbitration_storage(project_id);

            Ok(())
        }
        /// Return appeal bonds to all appellants
        fn return_all_appeal_bonds(project_id: T::ProjectId) -> DispatchResult {
            // Iterate through all appeal bonds for this project
            for (_round, (appellant, bond_amount)) in AppealBonds::<T>::iter_prefix(project_id) {
                <T as pallet::Config>::Currency::unreserve(&appellant, bond_amount);
                
                Self::deposit_event(Event::AppealBondReturned { 
                    project_id, 
                    appellant, 
                    amount: bond_amount 
                });
            }
            Ok(())
        }
        /// Pay all accumulated jury rewards from the arbitration costs pool
        fn pay_all_jury_rewards(project_id: T::ProjectId) -> DispatchResult {
            let pallet_account = Self::account_id();
            
            // Pay out all accumulated jury rewards
            for (juror, total_reward) in JurorRewards::<T>::iter_prefix(project_id) {
                if !total_reward.is_zero() {
                    <T as pallet::Config>::Currency::transfer(
                        &pallet_account,
                        &juror,
                        total_reward,
                        ExistenceRequirement::KeepAlive,
                    ).map_err(|_| Error::<T>::PaymentFailed)?;
                    Self::deposit_event(Event::JurorRewarded {
                        project_id,
                        juror,
                        amount: total_reward
                    });
                }
            }
            Ok(())
        }
        /// Clean up all arbitration-related storage for completed dispute
        fn cleanup_arbitration_storage(project_id: T::ProjectId) {
            // Remove arbitration costs
            ArbitrationCosts::<T>::remove(project_id);
            
            // Remove all appeal bonds for this project (use clear_prefix instead of deprecated remove_prefix)
            let _ = AppealBonds::<T>::clear_prefix(project_id, u32::MAX, None);
            
            // Remove all jury fees owed records for this project
            // We need to iterate through all possible rounds and clear them
            for round in 1u32..=3u32 {
                let _ = JuryFeesOwed::<T>::clear_prefix((project_id, round), u32::MAX, None);
            }
            
            // Remove all bonds (old system)
            let _ = Bonds::<T>::clear_prefix(project_id, u32::MAX, None);
            
            // Remove all jury rewards (they've been paid out)
            let _ = JurorRewards::<T>::clear_prefix(project_id, u32::MAX, None);
        }
        // Update the old calculate_bond method to use the new appeal bond logic
        pub fn calculate_bond(project_id: &T::ProjectId, round: u32) -> Result<BalanceOf<T>, DispatchError> {
            // For backwards compatibility, redirect to appeal bond calculation
            Self::calculate_appeal_bond(project_id, round)
        }
        pub fn account_id() -> T::AccountId {
            T::PalletId::get().into_sub_account_truncating(())
        }
        fn convert_to_project_ruling(ruling: Ruling) -> pallet_projects::Ruling {
            match ruling {
                Ruling::ClientWins => pallet_projects::Ruling::ClientWins,
                Ruling::FreelancerWins => pallet_projects::Ruling::FreelancerWins,
            }
        }
        /// Get total arbitration costs for a project (useful for external queries)
        pub fn get_total_arbitration_costs(project_id: T::ProjectId) -> BalanceOf<T> {
            ArbitrationCosts::<T>::get(project_id)
        }
        /// Get outstanding jury rewards for a juror (useful for external queries)
        pub fn get_jury_rewards_owed(project_id: T::ProjectId, juror: &T::AccountId) -> BalanceOf<T> {
            JurorRewards::<T>::get(project_id, juror)
        }
        /// Get appeal bond info for a round (useful for external queries)
        pub fn get_appeal_bond_info(project_id: T::ProjectId, round: u32) -> Option<(T::AccountId, BalanceOf<T>)> {
            AppealBonds::<T>::get(project_id, round)
        }
    }
}