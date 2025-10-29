#![cfg_attr(not(feature = "std"), no_std)]

pub use pallet::*;

#[cfg(test)]
mod mock;

#[cfg(test)]
mod tests;

use frame_support::{
    dispatch::DispatchResult,
    traits::{Currency, Get},
    BoundedVec,
};
use sp_runtime::Permill;


pub trait ReputationInterface<AccountId, Balance, ProjectId, BlockNumber, MaxJurors: Get<u32>> {
    fn on_project_completed(
        freelancer: &AccountId,
        project_value: Balance,
        client_rating: u32,
        project_id: ProjectId,
    ) -> DispatchResult;
        
    fn on_dispute_outcome(
        winner: &AccountId,
        loser: &AccountId,
        project_id: ProjectId,
        project_value: Balance,
    ) -> DispatchResult;
        
    fn get_eligible_jurors(
        min_tier: JurorTier, 
        exclude: &[AccountId],
        count: u32,
    ) -> BoundedVec<AccountId, MaxJurors>;

    fn on_jury_vote(
        juror: &AccountId,
        voted_with_majority: bool,
    ) -> DispatchResult;
}

#[frame_support::pallet]

pub mod pallet {
    use super::*;
    use frame_support::pallet_prelude::*;
    use frame_system::pallet_prelude::*;
    use frame_support::{BoundedVec};
    use frame_system::WeightInfo;
    use scale_info::TypeInfo;
    use codec::{Encode, Decode, MaxEncodedLen};
    use scale_info::prelude::ops::Add;
    use sp_runtime::{
		traits::{ Saturating}
    };

    pub type BalanceOf<T> = <<T as Config>::Currency as Currency<<T as frame_system::Config>::AccountId>>::Balance;


    #[pallet::pallet]
    pub struct Pallet<T>(_);

    #[derive(Encode, Decode, Default, Clone, PartialEq, Eq, RuntimeDebug, TypeInfo, MaxEncodedLen)]
    #[scale_info(skip_type_params(Balance, BlockNumber))]
    pub struct ReputationData<Balance, BlockNumber> {
        pub registration_block: BlockNumber,
        pub last_activity_block: BlockNumber,

        // --- Freelancer-Specific Metrics ---
        pub projects_completed: u32,
        pub projects_failed: u32,
        pub total_earned: Balance,

        // --- Client-Specific Metrics ---
        pub projects_posted: u32,
        pub total_spent: Balance,
        pub hire_rate: Permill,
        pub acceptance_rate: Permill,
        
        // --- Dispute Metrics (Universal) ---
        pub disputes_initiated: u32,
        pub disputes_won: u32,
        pub disputes_lost: u32,
        
        // --- Rating Metrics (Universal) ---
        pub avg_rating_received: u32, // 0-5000 scale
        pub total_ratings_received: u32,
        
        // --- Juror Metrics (Universal) ---
        pub jury_participation: u32,
        pub jury_accuracy: Permill, // Voted with majority %
    }

    #[derive(Encode, Decode, Clone, PartialEq, Eq, RuntimeDebug, TypeInfo, MaxEncodedLen)]
    #[scale_info(skip_type_params(T))]
    pub struct Attestation<T: Config> {
        pub attestor: AttestorType,
        pub project_id: T::ProjectId,  // Uses the same type
        pub outcome: AttestationOutcome,
        pub value: BalanceOf<T>,
        pub timestamp: BlockNumberFor<T>,
        pub metadata: BoundedVec<u8, T::MaxMetadata>,
    }

    #[derive(Encode, Decode, Clone, PartialEq, Eq, RuntimeDebug, TypeInfo, MaxEncodedLen)]
    pub enum AttestorType {
        ClientApproval,
        ArbitrationWin,
        ArbitrationLoss,
        JuryParticipation,
    }

    #[derive(Encode, Decode, Clone, PartialEq, Eq, RuntimeDebug, TypeInfo, MaxEncodedLen)]
    pub enum AttestationOutcome {
        Positive,
        Negative,
        Neutral,
    }



    #[derive(Encode, Decode, Clone, PartialEq, Eq, RuntimeDebug, TypeInfo, MaxEncodedLen, Default)]
    pub struct WeightConfig {
        pub completion_weight: u32,
        pub dispute_penalty: u32,
        pub arbitration_bonus: u32,
        pub jury_weight: u32,
        pub time_decay_rate: Permill,
        pub activity_bonus: u32,
    }

    #[derive(Encode, Decode, Clone, PartialEq, Eq, RuntimeDebug, TypeInfo, Default, MaxEncodedLen)] 
    pub struct GlobalReputationStats {
        pub total_users: u32,
        pub average_score: u32,
        pub median_score: u32,
        pub max_score: u32,
        pub min_score: u32,
    }

    #[derive(Encode, Decode, Clone, PartialEq, PartialOrd, Eq, MaxEncodedLen, TypeInfo, Debug, Copy)]
    pub enum JurorTier {
        Ineligible, // Not qualified or staked
        Bronze,     // Can judge small disputes
        Silver,     // Can judge medium disputes
        Gold,       // Can judge the most critical disputes
    }

    impl Default for JurorTier {
        fn default() -> Self {
            JurorTier::Ineligible
        }
    }

    #[pallet::config]
    pub trait Config: frame_system::Config {
        type RuntimeEvent: From<Event<Self>> + IsType<<Self as frame_system::Config>::RuntimeEvent>;
        type WeightInfo: WeightInfo;
        type GovernanceOrigin: EnsureOrigin<Self::RuntimeOrigin>;
        /// Currency
        type Currency: Currency<Self::AccountId>;
        /// The type used to identify projects
        type ProjectId: Member + Parameter + MaxEncodedLen + Copy + Default + sp_runtime::traits::One 
            + sp_runtime::traits::Zero + Add<Output = Self::ProjectId> 
            + From<u32> + Into<u32>;
        
        #[pallet::constant]
        type MaxMetadata: Get<u32>;

        #[pallet::constant]
        type MaxJurors: Get<u32>;
        
    }


    #[pallet::storage]
    #[pallet::getter(fn reputation_stats)]
    /// Detailed reputation statistics for each account
    pub type ReputationStats<T: Config> = 
        StorageMap<_, Blake2_128Concat, T::AccountId, ReputationData<BalanceOf<T>, BlockNumberFor<T>>, ValueQuery>;


    #[pallet::storage]
    #[pallet::getter(fn attestations)]
    /// On-chain attestations from projects/arbitrations
    pub type Attestations<T: Config> = 
        StorageDoubleMap<
            _, 
            Blake2_128Concat, T::AccountId,    // User
            Blake2_128Concat, T::ProjectId,         // Attestation ID
            Attestation<T>
        >;

    #[pallet::storage]
    #[pallet::getter(fn reputation_weights)]
    /// Configurable weights for different reputation factors
    pub type ReputationWeights<T: Config> = 
        StorageValue<_, WeightConfig, ValueQuery>;

    #[pallet::storage]
    #[pallet::getter(fn global_stats)]
    /// Global statistics for normalization
    pub type GlobalStats<T: Config> = 
        StorageValue<_, GlobalReputationStats, ValueQuery>;

    #[pallet::storage]
    #[pallet::getter(fn juror_tier)]
    /// The cached and on-chain verified tier of a user for juror selection.
    pub type JurorTiers<T: Config> = StorageMap<_, Blake2_128Concat, T::AccountId, JurorTier, ValueQuery>;

    #[pallet::event]
    #[pallet::generate_deposit(pub(super) fn deposit_event)]
    pub enum Event<T: Config> {
        UserRegistered { 
            account: T::AccountId
        },
        ProjectCompleted { 
            freelancer: T::AccountId, 
            project_id: T::ProjectId 
        },
        DisputeResolved { 
            winner: T::AccountId, 
            loser: T::AccountId, 
            project_id: T::ProjectId 
        },
        WeightsUpdated,
        GlobalStatsUpdated,
        JurorTierUpdated { account: T::AccountId},
    }

    #[pallet::error]
    pub enum Error<T> {
        AlreadyRegistered,
        UserNotRegistered,
        NoNFTFound,
        InvalidScore,
        ArithmeticOverflow,
        TooManySkills,
    }

    #[pallet::call]
    impl<T: Config> Pallet<T> {
        #[pallet::call_index(0)]
        #[pallet::weight(Weight::default())]
        pub fn register_user(
            origin: OriginFor<T>
        ) -> DispatchResult {
            let who = ensure_signed(origin)?;
            
            // Check if already registered
            ensure!(!ReputationStats::<T>::contains_key(&who), Error::<T>::AlreadyRegistered);
            
            
            // Initialize reputation data
            let initial_data = ReputationData {
                registration_block: <frame_system::Pallet<T>>::block_number(),
                last_activity_block: <frame_system::Pallet<T>>::block_number(),
                projects_completed: 0,
                projects_failed: 0,
                total_earned: BalanceOf::<T>::zero(),
                projects_posted: 0,
                total_spent: BalanceOf::<T>::zero(),
                hire_rate: Permill::from_parts(0),
                acceptance_rate: Permill::from_parts(0),
                disputes_initiated: 0,
                disputes_won: 0,
                disputes_lost: 0,
                avg_rating_received: 0,
                total_ratings_received: 0,
                jury_participation: 0,
                jury_accuracy: Permill::zero(),
            };
            
            ReputationStats::<T>::insert(&who, initial_data);

            Self::deposit_event(Event::UserRegistered { account: who });
            Ok(())
        }

        #[pallet::call_index(1)]
        #[pallet::weight(Weight::default())]
        pub fn update_weights(
            origin: OriginFor<T>,
            completion_weight: u32,
            dispute_penalty: u32,
            arbitration_bonus: u32,
            jury_weight: u32,
            time_decay_rate: Permill,
            activity_bonus: u32,
        ) -> DispatchResult {
            T::GovernanceOrigin::ensure_origin(origin)?;// Not optimal
            let new_weights = WeightConfig {
                completion_weight,
                dispute_penalty,
                arbitration_bonus,
                jury_weight,
                time_decay_rate,
                activity_bonus,
            };
            ReputationWeights::<T>::put(new_weights);
            Self::deposit_event(Event::WeightsUpdated);
            Ok(())
        }

        #[pallet::call_index(2)]
        #[pallet::weight(Weight::default())]
        pub fn update_juror_tier(origin: OriginFor<T>) -> DispatchResult {
            let who = ensure_signed(origin)?;

            // 1. Fetch the user's raw, on-chain reputation data.
            let stats = Self::reputation_stats(&who); // This now returns ReputationData directly

            // --- NEW CHECK FOR REGISTRATION ---
            ensure!(stats.registration_block > BlockNumberFor::<T>::zero(), Error::<T>::UserNotRegistered);

            // 2. Run a *simplified, on-chain* calculation to determine the tier.
            //    This calculation MUST be cheap. It uses integer math and the raw stats.
            let on_chain_calculated_tier = Self::calculate_tier_from_stats::<BalanceOf<T>, BlockNumberFor<T>>(&stats);

            // 3. Update the storage with the newly verified tier.
            JurorTiers::<T>::insert(&who, on_chain_calculated_tier);

            Self::deposit_event(Event::JurorTierUpdated {
                account: who
            });

            Ok(())
        }
    }

    impl<T: Config> Pallet<T> {
        pub(crate) fn internal_project_completed(
            freelancer: &T::AccountId,
            project_value: BalanceOf<T>, // ← Uses type alias
            client_rating: u32,
            project_id: T::ProjectId,
        ) -> DispatchResult {
            ReputationStats::<T>::try_mutate(freelancer, |stats| -> DispatchResult {
                ensure!(stats.registration_block > BlockNumberFor::<T>::zero(), Error::<T>::UserNotRegistered);
                stats.projects_completed = stats.projects_completed.saturating_add(1);
                stats.total_earned = stats.total_earned.saturating_add(project_value);
                stats.last_activity_block = <frame_system::Pallet<T>>::block_number();
                
                let total = stats.total_ratings_received;
                stats.avg_rating_received = (stats.avg_rating_received
                    .saturating_mul(total)
                    .saturating_add(client_rating)) 
                    / (total.saturating_add(1));
                stats.total_ratings_received = total.saturating_add(1);
                
                Ok(())
            })?;
            
            Self::deposit_event(Event::ProjectCompleted { 
                freelancer: freelancer.clone(), 
                project_id 
            });
            
            Ok(())
        }

        pub(crate) fn internal_dispute_outcome(
            winner: &T::AccountId,
            loser: &T::AccountId,
            project_id: T::ProjectId,
            project_value: BalanceOf<T>,
        ) -> DispatchResult {
            ReputationStats::<T>::try_mutate(winner, |stats| -> DispatchResult {
                ensure!(stats.registration_block > BlockNumberFor::<T>::zero(), Error::<T>::UserNotRegistered);
                stats.disputes_won = stats.disputes_won.saturating_add(1);
                //stats.projects_completed = stats.projects_completed.saturating_add(1);
                stats.last_activity_block = <frame_system::Pallet<T>>::block_number();
                Ok(())
            })?;
            
            ReputationStats::<T>::try_mutate(loser, |stats| -> DispatchResult {
                ensure!(stats.registration_block > BlockNumberFor::<T>::zero(), Error::<T>::UserNotRegistered);
                stats.disputes_lost = stats.disputes_lost.saturating_add(1);
                stats.projects_failed = stats.projects_failed.saturating_add(1);
                stats.last_activity_block = <frame_system::Pallet<T>>::block_number();
                Ok(())
            })?;
            
            Self::deposit_event(Event::DisputeResolved { 
                winner: winner.clone(), 
                loser: loser.clone(), 
                project_id 
            });
            
            Ok(())
        }

        pub(crate) fn internal_jury_vote(
            juror: &T::AccountId,
            voted_with_majority: bool,
        ) -> DispatchResult {
            ReputationStats::<T>::try_mutate(juror, |stats| -> DispatchResult {
                ensure!(stats.registration_block > BlockNumberFor::<T>::zero(), Error::<T>::UserNotRegistered);
                
                stats.jury_participation = stats.jury_participation.saturating_add(1);
                
                let total_votes = stats.jury_participation;
                if total_votes == 0 {
                    return Ok(());
                }
                let current_accuracy = stats.jury_accuracy.deconstruct();
                let vote_value = if voted_with_majority { 1_000_000u32 } else { 0u32 };
                let new_accuracy = (current_accuracy
                    .saturating_mul(total_votes.saturating_sub(1))
                    .saturating_add(vote_value)) 
                    / total_votes;
                stats.jury_accuracy = Permill::from_parts(new_accuracy);
                
                stats.last_activity_block = <frame_system::Pallet<T>>::block_number();
                
                Ok(())
            })?;
            
            Ok(())
        }

        pub(crate) fn internal_get_eligible_jurors(
            min_tier: JurorTier, // e.g., We need at least Silver jurors
            exclude: &[T::AccountId],
            _count: u32,
        ) -> BoundedVec<T::AccountId, T::MaxJurors> {
            let mut eligible_jurors = BoundedVec::<T::AccountId, T::MaxJurors>::new();
            for (account, tier) in JurorTiers::<T>::iter() {
                if tier >= min_tier && !exclude.contains(&account) {
                    if eligible_jurors.try_push(account).is_err() {
                        // We have reached the maximum number of jurors.
                        break;
                    }
                }
            }
            eligible_jurors
        }

        pub fn calculate_tier_from_stats<Balance, BlockNumber>(
            stats: &ReputationData<BalanceOf<T>, BlockNumberFor<T>>,
        ) -> JurorTier
        {
            // Define the tier thresholds. These can be governed constants.
            const GOLD_PROJECTS: u32 = 50;
            const GOLD_EARNED: u128 = 50000; // Assuming 50k in the smallest unit
            const SILVER_PROJECTS: u32 = 20;
            const SILVER_EARNED: u128 = 10000;
            const BRONZE_PROJECTS: u32 = 5;
            const BRONZE_EARNED: u128 = 1000;

            // A user must not have lost disputes to qualify for higher tiers.
            if stats.disputes_lost > 0 {
                return JurorTier::Ineligible;
            }

            let earned_as_u128: u128 = stats.total_earned.try_into().unwrap_or(0);

            if stats.projects_completed >= GOLD_PROJECTS && earned_as_u128 >= GOLD_EARNED {
                JurorTier::Gold
            } else if stats.projects_completed >= SILVER_PROJECTS && earned_as_u128 >= SILVER_EARNED {
                JurorTier::Silver
            } else if stats.projects_completed >= BRONZE_PROJECTS && earned_as_u128 >= BRONZE_EARNED {
                JurorTier::Bronze
            } else {
                JurorTier::Ineligible
            }
        }
    
    }
    
}

impl<T: pallet::Config> ReputationInterface<
    T::AccountId,
    pallet::BalanceOf<T>, 
    T::ProjectId,
    frame_system::pallet_prelude::BlockNumberFor<T>,
    T::MaxJurors,
> for Pallet<T> {
    fn on_project_completed(
        freelancer: &T::AccountId,
        project_value: pallet::BalanceOf<T>, 
        client_rating: u32,
        project_id: T::ProjectId,
    ) -> DispatchResult {
        Self::internal_project_completed(freelancer, project_value, client_rating, project_id)
    }
    
    fn on_dispute_outcome(
        winner: &T::AccountId,
        loser: &T::AccountId,
        project_id: T::ProjectId,
        project_value: pallet::BalanceOf<T>,
    ) -> DispatchResult {
        Self::internal_dispute_outcome(winner, loser, project_id, project_value)
    }
    
    fn on_jury_vote(
        juror: &T::AccountId,
        voted_with_majority: bool,
    ) -> DispatchResult {
        Self::internal_jury_vote(juror, voted_with_majority)
    }
    
    fn get_eligible_jurors(
        min_tier: JurorTier, 
        exclude: &[T::AccountId],
        count: u32,
    ) -> BoundedVec<T::AccountId, T::MaxJurors> {
        Self::internal_get_eligible_jurors(min_tier, exclude, count)
    }
}


