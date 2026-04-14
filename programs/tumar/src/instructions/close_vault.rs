use anchor_lang::prelude::*;
use anchor_spl::token::{self, CloseAccount, Mint, Token, TokenAccount};

use crate::{errors::TumarError, state::*};

/// Close a vault and reclaim rent.
///
/// Callable only by the creator. Does two things:
///   1. Closes the vault's USDC associated token account via an SPL
///      `CloseAccount` CPI (PDA-signed). Rent goes to the creator.
///   2. Closes the Vault PDA itself via Anchor's `close = creator` attribute.
///      Rent goes to the creator.
///
/// ### Preconditions
///
/// The vault's token account must be empty - SPL `CloseAccount` errors on a
/// non-zero balance, and we additionally enforce it via `constraint` so the
/// failure surfaces as a readable `VaultNotEmpty` rather than raw `0x11`.
/// Callers should run `withdraw` first to drain any holdings.
///
/// ### What about Member / Contribution PDAs?
///
/// Members reclaim their own rent via `leave_vault`, which derives the Member
/// PDA from (closed vault, member) and doesn't require the Vault account to
/// still be live. Contribution PDAs are not closeable in v0.1 - their rent
/// (~$0.21 each at $150/SOL) remains locked. Adding a `close_contribution`
/// ix is easy if ever requested.
///
/// ### ATA existence requirement
///
/// We require the vault's ATA exists (typed as `Account<TokenAccount>`, not
/// `UncheckedAccount`). If a creator spins up a vault and never deposits
/// anything, the ATA was never created, and this ix can't close it - they'd
/// need to seed a $0.01 deposit first. Edge case; acceptable cost to keep the
/// handler free of `UncheckedAccount` parsing + manual ownership checks.
#[derive(Accounts)]
pub struct CloseVault<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        mut,
        close = creator,
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
        constraint = vault_token_account.amount == 0 @ TumarError::VaultNotEmpty,
    )]
    pub vault_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<CloseVault>) -> Result<()> {
    // Snapshot seed material before any mutable borrow. Same pattern as
    // withdraw.rs - the seeds array holds immutable refs to vault fields,
    // and we're about to drop the Vault account.
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

    // Close the ATA - refunds ~0.002 SOL to creator.
    token::close_account(CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        CloseAccount {
            account: ctx.accounts.vault_token_account.to_account_info(),
            destination: ctx.accounts.creator.to_account_info(),
            authority: ctx.accounts.vault.to_account_info(),
        },
        signer_seeds,
    ))?;

    // The `close = creator` attribute on `vault` handles the Vault PDA
    // closure + rent refund automatically. Anchor wipes the data and
    // transfers lamports at end-of-ix.
    Ok(())
}
