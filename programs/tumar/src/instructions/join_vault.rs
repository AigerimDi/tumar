use anchor_lang::prelude::*;

use crate::state::*;

#[derive(Accounts)]
pub struct JoinVault<'info> {
    #[account(mut)]
    pub joiner: Signer<'info>,

    #[account(mut)]
    pub vault: Account<'info, Vault>,

    #[account(
        init,
        payer = joiner,
        space = Member::SIZE,
        seeds = [b"member", vault.key().as_ref(), joiner.key().as_ref()],
        bump,
    )]
    pub member: Account<'info, Member>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<JoinVault>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;

    let member = &mut ctx.accounts.member;
    member.vault = ctx.accounts.vault.key();
    member.owner = ctx.accounts.joiner.key();
    member.joined_at = now;
    member.contributed_lifetime = 0;
    member.bump = ctx.bumps.member;

    let vault = &mut ctx.accounts.vault;
    vault.member_count = vault.member_count.saturating_add(1);

    Ok(())
}
