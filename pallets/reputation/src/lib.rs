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

    fn on_project_created(
        client: &AccountId,
        budget: Balance,
    ) -> DispatchResult;

    fn on_project_cancelled(
        client: &AccountId,
    ) -> DispatchResult;

    fn on_work_accepted(
        client: &AccountId,
        project_id: ProjectId,
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

    fn slash_juror(
        juror: &AccountId
    ) -> DispatchResult;
}

#[frame_support::pallet]

pub mod pallet {
    use super::*;
    use frame_support::pallet_prelude::*;
    use frame_system::pallet_prelude::*;
    use frame_support::{BoundedVec, traits::{Currency, ReservableCurrency, LockableCurrency, EnsureOrigin}};
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
        type Currency: Currency<Self::AccountId>
            + ReservableCurrency<Self::AccountId>
            + LockableCurrency<Self::AccountId>;
        /// The type used to identify projects
        type ProjectId: Member + Parameter + MaxEncodedLen + Copy + Default + sp_runtime::traits::One 
            + sp_runtime::traits::Zero + Add<Output = Self::ProjectId> 
            + From<u32> + Into<u32>;
        
        #[pallet::constant]
        type MaxMetadata: Get<u32>;

        #[pallet::constant]
        type MaxJurors: Get<u32>;

        #[pallet::constant]
        type MaxGoldJurors: Get<u32>;

        #[pallet::constant]
        type MaxSilverJurors: Get<u32>;

        #[pallet::constant]
        type MaxBronzeJurors: Get<u32>;

        #[pallet::constant]
        /// The percentage of a juror's stake to be slashed for misbehavior.
        type SlashRatio: Get<Permill>;
            
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

    #[pallet::storage]
    #[pallet::getter(fn juror_opted_in)]
    /// Tracks accounts that have explicitly registered to be a juror.
    /// A simple boolean is enough if we don't add staking.
    pub type JurorRegistry<T: Config> = StorageMap<_, Blake2_128Concat, T::AccountId, bool, ValueQuery>;

    #[pallet::storage]
    #[pallet::getter(fn gold_jurors)]
    /// The active, opted-in pool of Gold tier jurors.
    pub type GoldJurors<T: Config> = StorageValue<_, BoundedVec<T::AccountId, T::MaxGoldJurors>, ValueQuery>;

    #[pallet::storage]
    #[pallet::getter(fn silver_jurors)]
    /// The active, opted-in pool of Silver tier jurors.
    pub type SilverJurors<T: Config> = StorageValue<_, BoundedVec<T::AccountId, T::MaxSilverJurors>, ValueQuery>;

    #[pallet::storage]
    #[pallet::getter(fn bronze_jurors)]
    /// The active, opted-in pool of Bronze tier jurors.
    pub type BronzeJurors<T: Config> = StorageValue<_, BoundedVec<T::AccountId, T::MaxBronzeJurors>, ValueQuery>;

    #[pallet::storage]
    #[pallet::getter(fn next_juror_index)]
    pub type NextJurorIndex<T: Config> = StorageMap<_, Blake2_128Concat, JurorTier, u32, ValueQuery>;

    // ---------------------- staking ----------------------
    /// Amount reserved when joining the jury.
    #[pallet::storage]
    #[pallet::getter(fn juror_stake)]
    pub type JurorStake<T: Config> = StorageValue<_, BalanceOf<T>, ValueQuery>;

    /// Reserved stake of an active juror.
    #[pallet::storage]
    #[pallet::getter(fn stake_of)]
    pub type StakeOf<T: Config> =
        StorageMap<_, Blake2_128Concat, T::AccountId, BalanceOf<T>, OptionQuery>;

    /// Simple flag: true if juror is currently selected in an active dispute.
    #[pallet::storage]
    #[pallet::getter(fn juror_busy)]
    pub type JurorBusy<T: Config> = StorageMap<_, Blake2_128Concat, T::AccountId, bool, ValueQuery>;

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
        JurorTierUpdated { account: T::AccountId },
        JurorRegistered { account: T::AccountId },
        JurorDeregistered { account: T::AccountId },
        JurorAutomaticallyDeregistered { account: T::AccountId },
        JurorSlashed { account: T::AccountId, amount: BalanceOf<T> },
    }

    #[pallet::error]
    pub enum Error<T> {
        AlreadyRegistered,
        UserNotRegistered,
        NoNFTFound,
        InvalidScore,
        ArithmeticOverflow,
        TooManySkills,
        AlreadyRegisteredAsJuror,
        NotRegisteredAsJuror,
        InsufficientTier,
        JurorPoolFull,
        StakeTooLow,
        Busy,
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
        pub fn register_as_juror(origin: OriginFor<T>) -> DispatchResult {
            let who = ensure_signed(origin)?;

            // 1. Check if they are already registered
            ensure!(!Self::juror_opted_in(&who), Error::<T>::AlreadyRegisteredAsJuror);

            // 2. Check if they meet the minimum tier requirement (e.g., Bronze)
            let tier = Self::calculate_tier_from_stats(&Self::reputation_stats(&who));
            ensure!(tier >= JurorTier::Bronze, Error::<T>::InsufficientTier);

            let stake = JurorStake::<T>::get();
            T::Currency::reserve(&who, stake)?;
            StakeOf::<T>::insert(&who, stake);

            // 4. Add them to the registry and the correct tier list
            JurorRegistry::<T>::insert(&who, true);
            JurorTiers::<T>::insert(&who, tier);
            Self::add_juror_to_tier_list(&who, tier)?;

            Self::deposit_event(Event::JurorRegistered { account: who });
            Ok(())
        }

        #[pallet::call_index(3)]
        #[pallet::weight(Weight::default())]
        pub fn deregister_as_juror(origin: OriginFor<T>) -> DispatchResult {
            let who = ensure_signed(origin)?;
            ensure!(Self::juror_opted_in(&who), Error::<T>::NotRegisteredAsJuror);
            ensure!(!Self::juror_busy(&who), Error::<T>::Busy);
            let stake = StakeOf::<T>::take(&who).ok_or(Error::<T>::NotRegisteredAsJuror)?;
            T::Currency::unreserve(&who, stake);
            let tier = Self::juror_tier(&who);
            Self::remove_juror_from_tier_list(&who, tier)?;
            JurorRegistry::<T>::remove(&who);
            JurorTiers::<T>::remove(&who);
            Self::deposit_event(Event::JurorDeregistered { account: who });
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
            ensure!(client_rating <= 5000, Error::<T>::InvalidScore);

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

            Self::update_juror_tier(freelancer)?;
            
            Self::create_attestation(
                freelancer,
                project_id,
                AttestorType::ClientApproval,
                AttestationOutcome::Positive,
                project_value,
                client_rating,
            )?;
            
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

            Self::update_juror_tier(winner)?;
            Self::update_juror_tier(loser)?;
            
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

            Self::update_juror_tier(juror)?;
            
            Ok(())
        }

        pub(crate) fn internal_get_eligible_jurors(
            min_tier: JurorTier,
            exclude: &[T::AccountId],
            count: u32,
        ) -> BoundedVec<T::AccountId, T::MaxJurors> {
            let mut selected_jurors = BoundedVec::<T::AccountId, T::MaxJurors>::new();
            let required_count = count as usize;

            // The closure now accepts `selected_jurors` as a mutable argument
            let select_from_pool = |
                selected_jurors: &mut BoundedVec<T::AccountId, T::MaxJurors>,
                tier: JurorTier,
                pool: &[T::AccountId]
            | {
                if selected_jurors.len() >= required_count || pool.is_empty() { return; }

                let mut current_index = Self::next_juror_index(tier) as usize;
                let mut attempts = 0;

                while selected_jurors.len() < required_count && attempts < pool.len() {
                    let juror_to_check = &pool[current_index % pool.len()];

                    if !exclude.contains(juror_to_check) && !selected_jurors.contains(juror_to_check) {
                        // This unwrap is safe because we check the length above.
                        selected_jurors.try_push(juror_to_check.clone()).unwrap();
                    }
                    current_index += 1;
                    attempts += 1;
                }
                NextJurorIndex::<T>::insert(tier, (current_index % pool.len()) as u32);
            };

            if min_tier <= JurorTier::Gold {
                select_from_pool(&mut selected_jurors, JurorTier::Gold, &Self::gold_jurors());
            }
            if selected_jurors.len() < required_count && min_tier <= JurorTier::Silver {
                select_from_pool(&mut selected_jurors, JurorTier::Silver, &Self::silver_jurors());
            }
            if selected_jurors.len() < required_count && min_tier <= JurorTier::Bronze {
                select_from_pool(&mut selected_jurors, JurorTier::Bronze, &Self::bronze_jurors());
            }

            selected_jurors
        }

        pub(crate) fn internal_slash_juror(juror: &T::AccountId) -> DispatchResult {
            ensure!(Self::juror_opted_in(&juror), Error::<T>::NotRegisteredAsJuror);
            let stake = StakeOf::<T>::get(&juror).ok_or(Error::<T>::NotRegisteredAsJuror)?;
            let slash = T::SlashRatio::get() * stake;
            T::Currency::slash_reserved(&juror, slash);
            let new_stake = stake.saturating_sub(slash);
            if new_stake.is_zero() {
                // auto-kick if stake depleted
                StakeOf::<T>::remove(&juror);
                Self::remove_juror_from_juror_registry(juror)?;
            } else {
                StakeOf::<T>::insert(&juror, new_stake);
            }
            Self::deposit_event(Event::JurorSlashed { account: juror.clone(), amount: slash });
            Ok(())
        }

        pub fn calculate_tier_from_stats(
            stats: &ReputationData<BalanceOf<T>, BlockNumberFor<T>>,
        ) -> JurorTier {
            const GOLD_PROJECTS: u32 = 50;
            const GOLD_EARNED: u128 = 50000;
            const SILVER_PROJECTS: u32 = 20;
            const SILVER_EARNED: u128 = 10000;
            const BRONZE_PROJECTS: u32 = 5;
            const BRONZE_EARNED: u128 = 1000;

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

        pub(crate) fn internal_on_project_created(
            client: &T::AccountId,
            budget: BalanceOf<T>,
        ) -> DispatchResult {
            ReputationStats::<T>::try_mutate(client, |stats| -> DispatchResult {
                ensure!(stats.registration_block > BlockNumberFor::<T>::zero(), Error::<T>::UserNotRegistered);
                stats.projects_posted = stats.projects_posted.saturating_add(1);
                stats.total_spent = stats.total_spent.saturating_add(budget);
                stats.last_activity_block = <frame_system::Pallet<T>>::block_number();
                Ok(())
            })?;
            Ok(())
        }

        pub(crate) fn internal_on_project_cancelled(
            client: &T::AccountId,
        ) -> DispatchResult {
            ReputationStats::<T>::try_mutate(client, |stats| -> DispatchResult {
                ensure!(stats.registration_block > BlockNumberFor::<T>::zero(), Error::<T>::UserNotRegistered);
                stats.projects_failed = stats.projects_failed.saturating_add(1);
                stats.last_activity_block = <frame_system::Pallet<T>>::block_number();
                Ok(())
            })?;
            Ok(())
        }

        pub(crate) fn internal_on_work_accepted(
            client: &T::AccountId,
            _project_id: T::ProjectId,
        ) -> DispatchResult {
            ReputationStats::<T>::try_mutate(client, |stats| -> DispatchResult {
                ensure!(stats.registration_block > BlockNumberFor::<T>::zero(), Error::<T>::UserNotRegistered);
                // Increment projects where client accepted work
                stats.projects_completed = stats.projects_completed.saturating_add(1);
                stats.last_activity_block = <frame_system::Pallet<T>>::block_number();
                Ok(())
            })?;
            Ok(())
        }

        fn create_attestation(
            account: &T::AccountId,
            project_id: T::ProjectId,
            attestor: AttestorType,
            outcome: AttestationOutcome,
            value: BalanceOf<T>,
            rating: u32,
        ) -> DispatchResult {
            let metadata = BoundedVec::try_from(rating.encode())
                .map_err(|_| Error::<T>::TooManySkills)?;
            
            let attestation = Attestation {
                attestor,
                project_id,
                outcome,
                value,
                timestamp: <frame_system::Pallet<T>>::block_number(),
                metadata,
            };
            
            Attestations::<T>::insert(account, project_id, attestation);
            Ok(())
        }

        pub fn calculate_reputation_score(account: &T::AccountId) -> Result<u32, Error<T>> {
            let stats = Self::reputation_stats(account);
            ensure!(stats.registration_block > BlockNumberFor::<T>::zero(), Error::<T>::UserNotRegistered);
            
            let weights = Self::reputation_weights();
            let current_block = <frame_system::Pallet<T>>::block_number();
            
            // Component 1: Completion Rate Score (0-2500 points)
            let completion_score = Self::calculate_completion_score(&stats, weights.completion_weight);
            
            // Component 2: Rating Score (0-2500 points)
            let rating_score = Self::calculate_rating_score(&stats);
            
            // Component 3: Volume Score (0-2000 points)
            let volume_score = Self::calculate_volume_score(&stats);
            
            // Component 4: Activity Score (0-1500 points)
            let activity_score = Self::calculate_activity_score(&stats, current_block, weights.time_decay_rate);
            
            // Component 5: Dispute Score (0-1500 points, can be negative)
            let dispute_score = Self::calculate_dispute_score(&stats, weights.dispute_penalty);
            
            // Sum all components
            let total_score = completion_score
                .saturating_add(rating_score)
                .saturating_add(volume_score)
                .saturating_add(activity_score)
                .saturating_add(dispute_score);
            
            // Cap at 10000
            Ok(total_score.min(10000))
        }

        fn calculate_completion_score(
            stats: &ReputationData<BalanceOf<T>, BlockNumberFor<T>>,
            weight: u32,
        ) -> u32 {
            let total_projects = stats.projects_completed.saturating_add(stats.projects_failed);
            
            if total_projects == 0 {
                return 0;
            }
            
            // Completion rate as percentage (0-100)
            let completion_rate = (stats.projects_completed.saturating_mul(100)) / total_projects;
            
            // Scale to 0-2500 based on weight
            (completion_rate.saturating_mul(25).saturating_mul(weight)) / 100
        }

        fn calculate_rating_score(
            stats: &ReputationData<BalanceOf<T>, BlockNumberFor<T>>,
        ) -> u32 {
            if stats.total_ratings_received == 0 {
                return 0;
            }
            
            // avg_rating_received is 0-5000 scale
            // Scale to 0-2500: (rating / 5000) * 2500 = rating / 2
            stats.avg_rating_received / 2
        }

        fn calculate_volume_score(
            stats: &ReputationData<BalanceOf<T>, BlockNumberFor<T>>,
        ) -> u32 {
            // Projects completed component (0-1000 points)
            // Logarithmic scaling: more projects = higher score, but diminishing returns
            let project_score = match stats.projects_completed {
                0 => 0,
                1..=5 => stats.projects_completed.saturating_mul(100),
                6..=20 => 500 + ((stats.projects_completed - 5).saturating_mul(20)),
                21..=50 => 800 + ((stats.projects_completed - 20).saturating_mul(5)),
                _ => 1000,
            };
            
            // Value component (0-1000 points)
            // This would need to be scaled based on your token economics
            let earned_u128: u128 = stats.total_earned.try_into().unwrap_or(0);
            let value_score = match earned_u128 {
                0 => 0,
                1..=10000 => (earned_u128 / 10) as u32,
                10001..=100000 => 1000 + ((earned_u128 - 10000) / 100) as u32,
                _ => 1000,
            };
            
            project_score.saturating_add(value_score).min(2000)
        }

        fn calculate_activity_score(
            stats: &ReputationData<BalanceOf<T>, BlockNumberFor<T>>,
            current_block: BlockNumberFor<T>,
            decay_rate: Permill,
        ) -> u32 {
            // Account age bonus (0-750 points)
            let account_age = current_block.saturating_sub(stats.registration_block);
            let age_score = match account_age.try_into().unwrap_or(0u32) {
                0..=10000 => 0,
                10001..=50000 => 250,
                50001..=100000 => 500,
                _ => 750,
            };
            
            // Recent activity bonus (0-750 points)
            let blocks_since_activity = current_block.saturating_sub(stats.last_activity_block);
            let recency: u32 = blocks_since_activity.try_into().unwrap_or(u32::MAX);
            
            let recency_score = if recency < 10000 {
                750
            } else if recency < 50000 {
                500
            } else if recency < 100000 {
                250
            } else {
                0
            };
            
            // Apply time decay
            let base_score = age_score.saturating_add(recency_score);
            let decay_factor = decay_rate.deconstruct();
            let decayed = (base_score.saturating_mul(1_000_000 - decay_factor)) / 1_000_000;
            
            decayed.min(1500)
        }

        fn calculate_dispute_score(
            stats: &ReputationData<BalanceOf<T>, BlockNumberFor<T>>,
            penalty_weight: u32,
        ) -> u32 {
            let total_disputes = stats.disputes_won.saturating_add(stats.disputes_lost);
            
            if total_disputes == 0 {
                return 1500; // Max points if no disputes
            }
            
            // Win rate percentage
            let win_rate = (stats.disputes_won.saturating_mul(100)) / total_disputes;
            
            // Base score: 0-1500 based on win rate
            let base_score = (win_rate.saturating_mul(15)).min(1500);
            
            // Apply penalty for each lost dispute
            let penalty = stats.disputes_lost.saturating_mul(penalty_weight);
            
            base_score.saturating_sub(penalty)
        }

        pub fn calculate_client_reputation(account: &T::AccountId) -> Result<u32, Error<T>> {
            let stats = Self::reputation_stats(account);
            ensure!(stats.registration_block > BlockNumberFor::<T>::zero(), Error::<T>::UserNotRegistered);
            
            // Component 1: Project posting reliability (0-3000)
            let posting_score = if stats.projects_posted > 0 {
                let completion_rate = (stats.projects_completed.saturating_mul(100)) 
                    / stats.projects_posted;
                completion_rate.saturating_mul(30)
            } else {
                0
            };
            
            // Component 2: Payment history (0-3000)
            let spent_u128: u128 = stats.total_spent.try_into().unwrap_or(0);
            let payment_score = match spent_u128 {
                0 => 0,
                1..=50000 => (spent_u128 / 20) as u32,
                _ => 3000,
            };
            
            // Component 3: Cancellation penalty (0-2000, negative impact)
            let cancel_rate = if stats.projects_posted > 0 {
                (stats.projects_failed.saturating_mul(100)) / stats.projects_posted
            } else {
                0
            };
            let cancellation_score = 2000u32.saturating_sub(cancel_rate.saturating_mul(20));
            
            // Component 4: Dispute handling (0-2000)
            let dispute_score = if stats.disputes_initiated > 0 {
                let win_rate = (stats.disputes_won.saturating_mul(100)) 
                    / stats.disputes_initiated;
                win_rate.saturating_mul(20)
            } else {
                2000 // No disputes is good for clients
            };
            
            let total = posting_score
                .saturating_add(payment_score)
                .saturating_add(cancellation_score)
                .saturating_add(dispute_score);
            
            Ok(total.min(10000))
        }

        fn add_juror_to_tier_list(account: &T::AccountId, tier: JurorTier) -> DispatchResult {
            match tier {
                JurorTier::Gold => GoldJurors::<T>::try_mutate(|jurors| jurors.try_push(account.clone()))
                    .map_err(|_| Error::<T>::JurorPoolFull)?,
                JurorTier::Silver => SilverJurors::<T>::try_mutate(|jurors| jurors.try_push(account.clone()))
                    .map_err(|_| Error::<T>::JurorPoolFull)?,
                JurorTier::Bronze => BronzeJurors::<T>::try_mutate(|jurors| jurors.try_push(account.clone()))
                    .map_err(|_| Error::<T>::JurorPoolFull)?,
                JurorTier::Ineligible => {}, // Do nothing
            }
            Ok(())
        }

        fn remove_juror_from_tier_list(account: &T::AccountId, tier: JurorTier) -> DispatchResult {
            match tier {
                JurorTier::Gold => GoldJurors::<T>::mutate(|jurors| {
                    if let Some(index) = jurors.iter().position(|j| j == account) {
                        jurors.swap_remove(index);
                    }
                }),
                JurorTier::Silver => SilverJurors::<T>::mutate(|jurors| {
                    if let Some(index) = jurors.iter().position(|j| j == account) {
                        jurors.swap_remove(index);
                    }
                }),
                JurorTier::Bronze => BronzeJurors::<T>::mutate(|jurors| {
                    if let Some(index) = jurors.iter().position(|j| j == account) {
                        jurors.swap_remove(index);
                    }
                }),
                JurorTier::Ineligible => {},
            }
            Ok(())
        }

        pub fn update_juror_tier(account: &T::AccountId) -> DispatchResult {
            if !Self::juror_opted_in(account) {
                return Ok(());
            }
            let old = Self::juror_tier(account);
            let new = Self::calculate_tier_from_stats(&Self::reputation_stats(account));
            if old != new {
                Self::remove_juror_from_tier_list(account, old)?;
                if new == JurorTier::Ineligible {
                    // auto-deregister
                    if let Some(stake) = StakeOf::<T>::take(account) {
                        T::Currency::unreserve(account, stake);
                    }
                    JurorRegistry::<T>::remove(account);
                    JurorTiers::<T>::remove(account);
                    Self::deposit_event(Event::JurorAutomaticallyDeregistered { account: account.clone() });
                } else {
                    Self::add_juror_to_tier_list(account, new)?;
                    JurorTiers::<T>::insert(account, new);
                    Self::deposit_event(Event::JurorTierUpdated { account: account.clone() });
                }
            }
            Ok(())
        }

        fn remove_juror_from_juror_registry(juror: &T::AccountId) -> DispatchResult {
            let tier = Self::juror_tier(juror);
            Self::remove_juror_from_tier_list(juror, tier)?;
            JurorRegistry::<T>::remove(juror);
            JurorTiers::<T>::remove(juror);
            Self::deposit_event(Event::JurorAutomaticallyDeregistered { account: juror.clone() });
            Ok(())
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

    fn on_project_created(
        client: &T::AccountId,
        budget: pallet::BalanceOf<T>,
    ) -> DispatchResult {
        Self::internal_on_project_created(client, budget)
    }

    fn on_project_cancelled(
        client: &T::AccountId,
    ) -> DispatchResult {
        Self::internal_on_project_cancelled(client)
    }

    fn on_work_accepted(
        client: &T::AccountId,
        project_id: T::ProjectId,
    ) -> DispatchResult {
        Self::internal_on_work_accepted(client, project_id)
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

    fn slash_juror(juror: &T::AccountId) -> DispatchResult {
        Self::internal_slash_juror(juror)
    }
}


