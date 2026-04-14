use anchor_lang::prelude::*;

use crate::{errors::TumarError, state::*};

#[derive(Accounts)]
pub struct UpdateAllocation<'info> {
    pub creator: Signer<'info>,

    #[account(
        mut,
        has_one = creator @ TumarError::Unauthorized,
    )]
    pub vault: Account<'info, Vault>,
}

pub fn handler(
    ctx: Context<UpdateAllocation>,
    allocation: Vec<AssetAllocation>,
) -> Result<()> {
    require!(
        !allocation.is_empty() && allocation.len() <= MAX_ALLOCATION_SLOTS,
        TumarError::InvalidAllocationCount
    );

    let sum: u32 = allocation.iter().map(|a| a.bps as u32).sum();
    require!(sum == BPS_TOTAL as u32, TumarError::AllocationNotBalanced);

    ctx.accounts.vault.allocation = allocation;
    Ok(())
}
