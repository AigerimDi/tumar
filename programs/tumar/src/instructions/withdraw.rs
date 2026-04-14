use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Mint, Token, TokenAccount, TransferChecked},
};

use crate::{errors::TumarError, state::*};

/// Withdraw tokens from the vault to the creator's wallet.
///
/// ### Security model (v0.1)
///
/// Only the creator may withdraw. The `has_one = creator` constraint plus the
/// seeds re-derivation enforce this at the program boundary - any attempt to
/// pass a mismatched `creator` signer fails with `Unauthorized`.
///
/// This means `Member::contributed_lifetime` and `Vault::usdc_deposited` are
/// **cosmetic counters**, not withdraw-authorizing state. Which is load-bearing
/// for safety, because `record_contribution` does not verify that the
/// accompanying SPL transfer actually happened - anyone could inflate those
/// counters without moving a lamport. If withdraws were pro-rata against
/// `contributed_lifetime`, that would be a theft vector. Creator-only sidesteps
/// it entirely: inflating the counter grants no access to funds.
///
/// A future version with pro-rata member withdrawals must either (a) CPI the
/// SPL transfer inside `record_contribution` so `amount` is verified on-chain,
/// or (b) snapshot vault ATA balance delta. That's out of scope for v0.1.
///
/// ### Generic over mint
///
/// The instruction takes `mint` as an account, so the same ix drains USDC
/// today and any other SPL token the vault might hold tomorrow (jitoSOL,
/// xStocks, etc. - if we later add swap CPIs). The vault PDA signs the
/// TransferChecked CPI.
///
/// ### Creator ATA creation
///
/// `init_if_needed` on `creator_token_account`: if the creator never had an
/// ATA for this mint, create one inline. Rent paid by the creator. This is
/// the "I can always get my money out" guarantee - no prerequisite setup.
#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    // has_one + seeds-re-derivation: both must agree. has_one asserts
    // vault.creator == creator.key(); seeds assert the PDA was derived from
    // that creator + that name. Can't be faked by passing a different
    // creator_account.
    #[account(
        mut,
        has_one = creator @ TumarError::Unauthorized,
        seeds = [b"vault", vault.creator.as_ref(), vault.name.as_bytes()],
        bump = vault.bump,
    )]
    pub vault: Account<'info, Vault>,

    pub mint: Account<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = vault,
    )]
    pub vault_token_account: Account<'info, TokenAccount>,

    // init_if_needed: the creator might not have an ATA for this mint yet
    // (e.g. withdrawing jitoSOL when they've never held jitoSOL). Make one
    // on the fly so the drain call never fails on prerequisite state.
    #[account(
        init_if_needed,
        payer = creator,
        associated_token::mint = mint,
        associated_token::authority = creator,
    )]
    pub creator_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
    require!(amount > 0, TumarError::ZeroAmount);

    // Snapshot the fields we need for PDA signer seeds BEFORE any mutable
    // borrow of `vault`. The seeds borrow the vault account immutably, and
    // we mutate usdc_deposited below - stash copies to avoid the conflict.
    let decimals = ctx.accounts.mint.decimals;
    let vault_creator = ctx.accounts.vault.creator;
    let vault_name_bytes: Vec<u8> = ctx.accounts.vault.name.as_bytes().to_vec();
    let vault_bump = ctx.accounts.vault.bump;

    let seeds: &[&[u8]] = &[
        b"vault",
        vault_creator.as_ref(),
        &vault_name_bytes,
        &[vault_bump],
    ];
    let signer_seeds: &[&[&[u8]]] = &[seeds];

    token::transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.vault_token_account.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.creator_token_account.to_account_info(),
                authority: ctx.accounts.vault.to_account_info(),
            },
            signer_seeds,
        ),
        amount,
        decimals,
    )?;

    // Decrement the USDC counter only when we're withdrawing USDC itself.
    // USDC is 6 decimals; other mints in our registry (xStocks: 8, jitoSOL:
    // 9) have different decimals, so a decimals mismatch is a sufficient
    // proxy for "not USDC" here without hardcoding a specific mint address
    // (which would diverge between devnet and mainnet anyway).
    //
    // saturating_sub: if the counter was already 0 (e.g. withdrawing funds
    // that landed via a direct SPL transfer that never called record_
    // contribution), don't underflow.
    if decimals == 6 {
        let vault = &mut ctx.accounts.vault;
        vault.usdc_deposited = vault.usdc_deposited.saturating_sub(amount);
    }

    Ok(())
}
