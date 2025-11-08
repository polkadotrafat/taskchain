use frame_support::{
    parameter_types,
    traits::{ConstU32},
    weights::constants::RocksDbWeight,
    PalletId,
};
use sp_core::H256;
use sp_runtime::{
    traits::{BlakeTwo256, IdentityLookup},
    BuildStorage, AccountId32
};
use crate as pallet_projects;
use pallet_reputation::{ReputationInterface, JurorTier};
use frame_support::dispatch::DispatchResult;
use frame_support::BoundedVec;
use sp_runtime::Permill;

// Configure a mock runtime to test the pallet.
type Block = frame_system::mocking::MockBlock<Test>;

// Configure a mock runtime to test the pallet.
frame_support::construct_runtime!(
    pub enum Test
    {
        System: frame_system,
        Balances: pallet_balances,
        Projects: pallet_projects,
        Reputation: pallet_reputation,
    }
);

parameter_types! {
    pub const BlockHashCount: u64 = 250;
    pub const SS58Prefix: u8 = 42;
}

impl frame_system::Config for Test {
    type BaseCallFilter = frame_support::traits::Everything;
    type BlockWeights = ();
    type BlockLength = ();
    type DbWeight = RocksDbWeight;
    type RuntimeOrigin = RuntimeOrigin;
    type RuntimeCall = RuntimeCall;
    type Hash = H256;
    type Hashing = BlakeTwo256;
    type AccountId = AccountId32;
    type Lookup = IdentityLookup<Self::AccountId>;
    type RuntimeEvent = RuntimeEvent;
    type BlockHashCount = BlockHashCount;
    type Version = ();
    type PalletInfo = PalletInfo;
    type AccountData = pallet_balances::AccountData<u64>;
    type OnNewAccount = ();
    type OnKilledAccount = ();
    type SystemWeightInfo = ();
    type SS58Prefix = SS58Prefix;
    type OnSetCode = ();
    type MaxConsumers = frame_support::traits::ConstU32<16>;
    type RuntimeTask = ();
    type Block = Block;
    type Nonce = u64;
    type SingleBlockMigrations = ();
    type MultiBlockMigrator = ();
    type PreInherents = ();
    type PostInherents = ();
    type PostTransactions = ();
    type ExtensionsWeightInfo = ();
}

parameter_types! {
    pub const ExistentialDeposit: u64 = 1;
    pub const ProjectsPalletId: PalletId = PalletId(*b"tsk/proj");
    pub const MaxApplicantsLength: u32 = 100;
    pub const ReviewPeriod: u64 = 10000;
}

impl pallet_balances::Config for Test {
    type MaxLocks = ConstU32<50>;
    type MaxReserves = ConstU32<50>;
    type ReserveIdentifier = [u8; 8];
    type Balance = u64;
    type RuntimeEvent = RuntimeEvent;
    type DustRemoval = ();
    type ExistentialDeposit = ExistentialDeposit;
    type AccountStore = System;
    type WeightInfo = ();
    type FreezeIdentifier = ();
    type MaxFreezes = ();
    type RuntimeHoldReason = ();
    type RuntimeFreezeReason = ();
    type DoneSlashHandler = ();
}

pub struct MockReputation;

impl ReputationInterface<AccountId32, u64, u32, u64, MaxApplicantsLength> for MockReputation {
    fn on_project_completed(_freelancer: &AccountId32, _project_value: u64, _client_rating: u32, _project_id: u32) -> DispatchResult {
        Ok(())
    }

    fn on_dispute_outcome(_winner: &AccountId32, _loser: &AccountId32, _project_id: u32, _project_value: u64) -> DispatchResult {
        Ok(())
    }

    fn on_project_created(_client: &AccountId32, _budget: u64) -> DispatchResult {
        Ok(())
    }

    fn on_project_cancelled(_client: &AccountId32) -> DispatchResult {
        Ok(())
    }

    fn on_work_accepted(_client: &AccountId32, _project_id: u32) -> DispatchResult {
        Ok(())
    }

    fn get_eligible_jurors(_min_tier: JurorTier, _exclude: &[AccountId32], _count: u32) -> BoundedVec<AccountId32, MaxApplicantsLength> {
        BoundedVec::new()
    }

    fn on_jury_vote(_juror: &AccountId32, _voted_with_majority: bool) -> DispatchResult {
        Ok(())
    }

    fn slash_juror(_juror: &AccountId32) -> DispatchResult {
        Ok(())
    }
}

parameter_types! {
    pub const SlashRatio: Permill = Permill::from_percent(10);
}

impl pallet_reputation::Config for Test {
    type RuntimeEvent = RuntimeEvent;
    type WeightInfo = ();
    type GovernanceOrigin = frame_system::EnsureRoot<AccountId32>;
    type Currency = Balances;
    type ProjectId = u32;
    type MaxMetadata = ConstU32<1024>;
    type MaxJurors = ConstU32<100>;
    type MaxGoldJurors = ConstU32<100>;
    type MaxSilverJurors = ConstU32<200>;
    type MaxBronzeJurors = ConstU32<200>;
    type SlashRatio = SlashRatio;
}

impl pallet_projects::Config for Test {
    type RuntimeEvent = RuntimeEvent;
    type Currency = Balances;
    type ProjectId = u32;
    type PalletId = ProjectsPalletId;
    type MaxApplicants = MaxApplicantsLength;
    type ReviewPeriod = ReviewPeriod;
    type WeightInfo = ();
    type Reputation = MockReputation;
}

// Build genesis storage according to the mock runtime.
pub fn new_test_ext() -> sp_io::TestExternalities {
    let mut t = frame_system::GenesisConfig::<Test>::default().build_storage().unwrap();
    pallet_balances::GenesisConfig::<Test> {
        balances: vec![],
        dev_accounts: Default::default(),
    }.assimilate_storage(&mut t).unwrap();
    t.into()
}