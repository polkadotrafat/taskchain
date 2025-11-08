
use std::cell::RefCell;
use crate as pallet_arbitration;
use frame_support::{
    parameter_types,
    traits::{ConstU32, ConstU64},
    weights::constants::RocksDbWeight,
    PalletId,
};
use sp_core::H256;
use sp_runtime::{
    traits::{BlakeTwo256, IdentityLookup},
    BuildStorage, AccountId32,
};
use pallet_reputation::{ReputationInterface, JurorTier};
use frame_support::dispatch::{DispatchResult};
use sp_runtime::DispatchError;
use frame_support::BoundedVec;
use pallet_projects::{Arbitrable, ProjectStatus, Ruling};
use sp_runtime::Permill;

type Block = frame_system::mocking::MockBlock<Test>;
pub type Balance = u64;
pub type BlockNumber = u64;
pub const UNIT: Balance = 1_000_000_000_000;

frame_support::construct_runtime!(
    pub enum Test
    {
        System: frame_system,
        Balances: pallet_balances,
        Projects: pallet_projects,
        Reputation: pallet_reputation,
        Arbitration: pallet_arbitration,
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
    type AccountData = pallet_balances::AccountData<Balance>;
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
    pub const ExistentialDeposit: Balance = 1;
    pub const ProjectsPalletId: PalletId = PalletId(*b"tsk/proj");
    pub const ArbitrationPalletId: PalletId = PalletId(*b"tsk/arbt");
    pub const MaxApplicantsLength: u32 = 100;
    pub const ReviewPeriod: BlockNumber = 10000;
}

impl pallet_balances::Config for Test {
    type MaxLocks = ConstU32<50>;
    type MaxReserves = ConstU32<50>;
    type ReserveIdentifier = [u8; 8];
    type Balance = Balance;
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

thread_local! {
    pub static JURORS: RefCell<BoundedVec<AccountId32, MaxApplicantsLength>> = RefCell::new(BoundedVec::new());
}

impl MockReputation {
    pub fn set_jurors(jurors: Vec<AccountId32>) {
        JURORS.with(|j| {
            *j.borrow_mut() = BoundedVec::try_from(jurors).unwrap();
        });
    }
}

impl ReputationInterface<AccountId32, Balance, u32, BlockNumber, MaxApplicantsLength> for MockReputation {
    fn on_project_completed(_freelancer: &AccountId32, _project_value: Balance, _client_rating: u32, _project_id: u32) -> DispatchResult { Ok(()) }
    fn on_dispute_outcome(_winner: &AccountId32, _loser: &AccountId32, _project_id: u32, _project_value: Balance) -> DispatchResult { Ok(()) }
    fn on_project_created(_client: &AccountId32, _budget: Balance) -> DispatchResult { Ok(()) }
    fn on_project_cancelled(_client: &AccountId32) -> DispatchResult { Ok(()) }
    fn on_work_accepted(_client: &AccountId32, _project_id: u32) -> DispatchResult { Ok(()) }
    fn get_eligible_jurors(_min_tier: JurorTier, _exclude: &[AccountId32], _count: u32) -> BoundedVec<AccountId32, MaxApplicantsLength> {
        JURORS.with(|j| j.borrow().clone())
    }
    fn on_jury_vote(_juror: &AccountId32, _voted_with_majority: bool) -> DispatchResult { Ok(()) }
    fn slash_juror(_juror: &AccountId32) -> DispatchResult {
        Ok(())
    }
}

pub struct MockArbitrable;
type ProjectId = u32;

fn account(id: &str) -> AccountId32 {
    let mut padded_id = [0u8; 32];
    let id_bytes = id.as_bytes();
    padded_id[..id_bytes.len()].copy_from_slice(id_bytes);
    AccountId32::from(sp_core::sr25519::Public::from_raw(padded_id))
}


impl Arbitrable<ProjectId, Balance, AccountId32, BlockNumber> for MockArbitrable {
    fn on_ruling(_project_id: ProjectId, _ruling: Ruling) -> DispatchResult { Ok(()) }
    fn get_project_budget(_project_id: ProjectId) -> Result<Balance, DispatchError> { Ok(1000) }
    fn get_project_parties(_project_id: ProjectId) -> Result<(AccountId32, AccountId32), DispatchError> { Ok((account("alice"), account("bob"))) }
    fn set_project_status_in_dispute(_project_id: ProjectId) -> DispatchResult { Ok(()) }
    fn get_project_status(_project_id: ProjectId) -> Result<ProjectStatus, DispatchError> { Ok(ProjectStatus::Created) }
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
    type MaxJurors = MaxApplicantsLength;
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

impl pallet_arbitration::Config for Test {
    type RuntimeEvent = RuntimeEvent;
    type Currency = Balances;
    type ProjectId = u32;
    type WeightInfo = ();
    type AiOracleOrigin = frame_system::EnsureRoot<AccountId32>;
    type Arbitrable = MockArbitrable;
    type Reputation = MockReputation;
    type MaxEvidenceMeta = ConstU32<256>;
    type MaxJurors = MaxApplicantsLength;
    type PalletId = ArbitrationPalletId;
    type MinJurors = ConstU32<3>;
    type AiProcessingPeriod = ConstU64<100>;
    type VotingPeriod = ConstU64<200>;
    type AppealPeriod = ConstU64<100>;
    type MinimumAiBond = ConstU64<{UNIT / 2}>;
    type MinimumFirstAppealBond = ConstU64<{2 * UNIT}>;
    type MinimumFinalAppealBond = ConstU64<{5 * UNIT}>;
}

pub fn new_test_ext() -> sp_io::TestExternalities {
    let mut t = frame_system::GenesisConfig::<Test>::default().build_storage().unwrap();
    pallet_balances::GenesisConfig::<Test> {
        balances: vec![],
        dev_accounts: Default::default(),
    }.assimilate_storage(&mut t).unwrap();
    t.into()
}
