use anchor_lang::prelude::*;

use crate::{errors::TumarError, state::*};

#[derive(Accounts)]
#[instruction(amount: u64, memo: String, nonce: u64)]
pub struct RecordContribution<'info> {
    #[account(mut)]
    pub contributor: Signer<'info>,

    #[account(mut)]
    pub vault: Account<'info, Vault>,

    #[account(
        mut,
        seeds = [b"member", vault.key().as_ref(), contributor.key().as_ref()],
        bump = member.bump,
    )]
    pub member: Account<'info, Member>,

    // Seed uses a caller-supplied `nonce` instead of `Clock::get()`. A Clock
    // seed forces the client to guess what the validator's unix_timestamp
    // will be at handler time, which races the 2–10 second signing window
    // and reliably fails with ConstraintSeeds (2006). The client now picks
    // a random u64 per deposit - collision across two deposits from the
    // same (vault, contributor) pair is 1/2^64.
    #[account(
        init,
        payer = contributor,
        space = Contribution::SIZE,
        seeds = [
            b"contrib",
            vault.key().as_ref(),
            contributor.key().as_ref(),
            &nonce.to_le_bytes(),
        ],
        bump,
    )]
    pub contribution: Account<'info, Contribution>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<RecordContribution>,
    amount: u64,
    memo: String,
    _nonce: u64,
) -> Result<()> {
    require!(amount > 0, TumarError::ZeroAmount);
    require!(memo.len() <= MAX_MEMO_LEN, TumarError::MemoTooLong);

    let now = Clock::get()?.unix_timestamp;

    let contribution = &mut ctx.accounts.contribution;
    contribution.vault = ctx.accounts.vault.key();
    contribution.contributor = ctx.accounts.contributor.key();
    contribution.amount = amount;
    contribution.timestamp = now;
    contribution.memo = memo;
    contribution.bump = ctx.bumps.contribution;

    let member = &mut ctx.accounts.member;
    member.contributed_lifetime = member.contributed_lifetime.saturating_add(amount);

    let vault = &mut ctx.accounts.vault;
    vault.usdc_deposited = vault.usdc_deposited.saturating_add(amount);

    Ok(())
}
