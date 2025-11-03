#![cfg_attr(not(feature = "std"), no_std)]

pub use pallet::*;

#[cfg(test)]
mod mock;

#[cfg(test)]
mod tests;

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
	pub enum Dispute {
        AiArbitration,
        Appealable,
        VotingUnderway,
        Resolved,
    }

    #[derive(Clone, Encode, Decode, PartialEq, Debug,MaxEncodedLen, TypeInfo, Eq, Copy)]
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
        pub votes: BoundedVec<(T::AccountId, Vote), T::MaxJurors>,
    }

    #[pallet::config]
    pub trait Config: frame_system::Config {
        /// The overarching runtime event type.
        type RuntimeEvent: From<Event<Self>> + IsType<<Self as frame_system::Config>::RuntimeEvent>;
        /// A type representing the weights required by the dispatchables of this pallet.
        type WeightInfo;
        /// The currency type that will be used to place deposits and pay freelancers
        type Currency: Currency<Self::AccountId> + LockableCurrency<Self::AccountId>;

        type AiOracleOrigin: EnsureOrigin<Self::RuntimeOrigin>;

        type ProjectId: Member + Parameter + MaxEncodedLen + Copy + Default + sp_runtime::traits::One 
            + sp_runtime::traits::Zero + Add<Output = Self::ProjectId> 
            + From<u32> + Into<u32>;
        
        type Reputation: ReputationInterface<
            Self::AccountId, BalanceOf<Self>, Self::ProjectId, BlockNumberFor<Self>, Self::MaxJurors
        >;
        type Arbitrable: Arbitrable<Self::ProjectId, BalanceOf<Self>, Self::AccountId>;

        #[pallet::constant]
        type VotingPeriod: Get<BlockNumberFor<Self>>;
        #[pallet::constant]
        type AppealPeriod: Get<BlockNumberFor<Self>>;

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

    #[pallet::event]
    #[pallet::generate_deposit(pub(super) fn deposit_event)]
    pub enum Event<T: Config> {
        DisputeCreated { project_id: T::ProjectId, who: T::AccountId },
        RulingSubmitted { project_id: T::ProjectId, ruling: Ruling },
        RulingAppealed { project_id: T::ProjectId, who: T::AccountId },
        VoteCast { project_id: T::ProjectId, who: T::AccountId, vote: Vote },
        RulingExecuted { project_id: T::ProjectId, who: T::AccountId },
    }

    #[pallet::error]
    pub enum Error<T> {

    }

    #[pallet::call]
    impl<T: Config> Pallet<T> {
        #[pallet::call_index(0)]
        #[pallet::weight(Weight::default())]
        pub fn create_dispute(origin: OriginFor<T>, project_id: T::ProjectId) -> DispatchResult {
            let who = ensure_signed(origin)?;

            // Emit an event for the dispute creation
            Self::deposit_event(Event::DisputeCreated { project_id, who });

            Ok(())
        }

        #[pallet::call_index(1)]
        #[pallet::weight(Weight::default())]
        pub fn submit_ruling(origin: OriginFor<T>, project_id: T::ProjectId, ruling: Ruling) -> DispatchResult {
            T::AiOracleOrigin::ensure_origin(origin)?;

            // Emit an event for the ruling submission
            Self::deposit_event(Event::RulingSubmitted { project_id, ruling });

            Ok(())
        }

        #[pallet::call_index(2)]
        #[pallet::weight(Weight::default())]
        pub fn appeal_ruling(origin: OriginFor<T>, project_id: T::ProjectId, evidence_uri: BoundedVec<u8, T::MaxEvidenceMeta>) -> DispatchResult {
            let who = ensure_signed(origin)?;   

            // Emit an event for the appeal
            Self::deposit_event(Event::RulingAppealed { project_id, who });

            Ok(())
        }

        #pallet::call_index(3)]
        #[pallet::weight(Weight::default())]
        pub fn cast_vote(origin: OriginFor<T>, project_id: T::ProjectId, vote: Vote) -> DispatchResult {
            let who = ensure_signed(origin)?;  
            // Emit an event for the vote
            Self::deposit_event(Event::VoteCast { project_id, who, vote });     
            Ok(())
        }

        #[pallet::call_index(4)]
        #[pallet::weight(Weight::default())]
        pub fn execute_ruling(origin: OriginFor<T>, project_id: T::ProjectId) -> DispatchResult {
            let who = ensure_signed(origin)?;

            // Emit an event for the ruling execution
            Self::deposit_event(Event::RulingExecuted { project_id, who }); 

            Ok(())
        }
    }

    impl<T: Config> Pallet<T> {
        /// Calculates the required bond for a specific dispute round.
        
        fn calculate_bond(project_id: &T::ProjectId, round: u32) -> Result<BalanceOf<T>, DispatchError> {
            let project_budget = T::Arbitrable::get_project_budget(*project_id)?;

            let (bond_percentage, minimum_bond) = match round {
                1 => (5u32, T::MinimumAiBond::get()),
                2 => (20u32, T::MinimumFirstAppealBond::get()),
                3 => (50u32, T::MinimumFinalAppealBond::get()),
                _ => return Err(Error::<T>::InvalidRound.into()),
            };

            // Calculate the percentage-based bond
            let calculated_bond = project_budget
                .saturating_mul(bond_percentage.into())
                .saturating_div(100u32.into());

            // Return the higher of the calculated bond or the configured minimum
            Ok(calculated_bond.max(minimum_bond))
        }
    }

}
