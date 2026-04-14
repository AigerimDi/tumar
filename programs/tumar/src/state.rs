use anchor_lang::prelude::*;

// Solana caps each PDA seed at 32 bytes. The vault PDA uses `name.as_bytes()`
// as a seed, so any name longer than 32 bytes would fail derivation with
// MaxSeedLengthExceeded at runtime. 32 matches the cap exactly (ASCII-only);
// with multi-byte UTF-8 characters the user still gets a clean validation
// error at the `InvalidName` check below instead of a cryptic seed panic
// during tx simulation.
pub const MAX_NAME_LEN: usize = 32;
pub const MAX_MEMO_LEN: usize = 140;
pub const MAX_ALLOCATION_SLOTS: usize = 8;
pub const BPS_TOTAL: u16 = 10_000;

/// A single slot in the portfolio plan. `bps` is basis points (1/100 of a
/// percent). The sum across all slots must equal 10_000.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug)]
pub struct AssetAllocation {
    pub mint: Pubkey,
    pub bps: u16,
}

#[account]
pub struct Vault {
    pub creator: Pubkey,
    pub name: String,
    pub allocation: Vec<AssetAllocation>,
    pub usdc_deposited: u64,
    pub member_count: u32,
    pub created_at: i64,
    pub bump: u8,
}

impl Vault {
    // 8 anchor disc + 32 creator + (4 + MAX_NAME_LEN) name
    //   + (4 + MAX_ALLOCATION_SLOTS * 34) allocation
    //   + 8 usdc + 4 members + 8 created_at + 1 bump
    pub const SIZE: usize = 8
        + 32
        + (4 + MAX_NAME_LEN)
        + (4 + MAX_ALLOCATION_SLOTS * (32 + 2))
        + 8
        + 4
        + 8
        + 1;
}

#[account]
pub struct Member {
    pub vault: Pubkey,
    pub owner: Pubkey,
    pub joined_at: i64,
    pub contributed_lifetime: u64,
    pub bump: u8,
}

impl Member {
    pub const SIZE: usize = 8 + 32 + 32 + 8 + 8 + 1;
}

#[account]
pub struct Contribution {
    pub vault: Pubkey,
    pub contributor: Pubkey,
    pub amount: u64,
    pub timestamp: i64,
    pub memo: String,
    pub bump: u8,
}

impl Contribution {
    pub const SIZE: usize = 8 + 32 + 32 + 8 + 8 + (4 + MAX_MEMO_LEN) + 1;
}
