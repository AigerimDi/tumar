use anchor_lang::prelude::*;

#[error_code]
pub enum TumarError {
    #[msg("Vault name must be 1..=48 characters")]
    InvalidName,
    #[msg("Allocation must contain 1..=8 non-zero slots")]
    InvalidAllocationCount,
    #[msg("Allocation basis points must sum to 10_000")]
    AllocationNotBalanced,
    #[msg("Memo exceeds 140 characters")]
    MemoTooLong,
    #[msg("Only the vault creator may perform this action")]
    Unauthorized,
    #[msg("Contribution amount must be greater than zero")]
    ZeroAmount,
    #[msg("Vault token account is not empty - withdraw all tokens before closing")]
    VaultNotEmpty,
}
