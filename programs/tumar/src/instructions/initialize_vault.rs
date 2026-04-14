use anchor_lang::prelude::*;

use crate::{errors::TumarError, state::*};

#[derive(Accounts)]
#[instruction(name: String)]
pub struct InitializeVault<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        init,
        payer = creator,
        space = Vault::SIZE,
        seeds = [b"vault", creator.key().as_ref(), name.as_bytes()],
        bump,
    )]
    pub vault: Account<'info, Vault>,

    #[account(
        init,
        payer = creator,
        space = Member::SIZE,
        seeds = [b"member", vault.key().as_ref(), creator.key().as_ref()],
        bump,
    )]
    pub creator_member: Account<'info, Member>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<InitializeVault>,
    name: String,
    allocation: Vec<AssetAllocation>,
) -> Result<()> {
    require!(
        !name.is_empty() && name.len() <= MAX_NAME_LEN,
        TumarError::InvalidName
    );
    require!(
        !allocation.is_empty() && allocation.len() <= MAX_ALLOCATION_SLOTS,
        TumarError::InvalidAllocationCount
    );

    let sum: u32 = allocation.iter().map(|a| a.bps as u32).sum();
    require!(sum == BPS_TOTAL as u32, TumarError::AllocationNotBalanced);

    let now = Clock::get()?.unix_timestamp;

    let vault = &mut ctx.accounts.vault;
    vault.creator = ctx.accounts.creator.key();
    vault.name = name;
    vault.allocation = allocation;
    vault.usdc_deposited = 0;
    vault.member_count = 1;
    vault.created_at = now;
    vault.bump = ctx.bumps.vault;

    let member = &mut ctx.accounts.creator_member;
    member.vault = vault.key();
    member.owner = ctx.accounts.creator.key();
    member.joined_at = now;
    member.contributed_lifetime = 0;
    member.bump = ctx.bumps.creator_member;

    Ok(())
}
