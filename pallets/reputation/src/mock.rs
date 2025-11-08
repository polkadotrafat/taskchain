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

use frame_system::EnsureRoot;
use crate as pallet_reputation;
use sp_runtime::Permill;

// Configure a mock runtime to test the pallet.
type Block = frame_system::mocking::MockBlock<Test>;

// Configure a mock runtime to test the pallet.
frame_support::construct_runtime!(
    pub enum Test
    {
        System: frame_system,
        Balances: pallet_balances,
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
parameter_types! {
    pub const SlashRatio: Permill = Permill::from_percent(10);
}

impl pallet_reputation::Config for Test {
    type RuntimeEvent = RuntimeEvent;
    type Currency = Balances;
    type ProjectId = u32;
    type GovernanceOrigin = EnsureRoot<Self::AccountId>;
    type MaxMetadata = ConstU32<256>;
    type WeightInfo = ();
    type MaxJurors = ConstU32<500>;
    type MaxGoldJurors = ConstU32<100>;
    type MaxSilverJurors = ConstU32<200>;
    type MaxBronzeJurors = ConstU32<200>;
    type SlashRatio = SlashRatio;
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


