use anchor_lang::prelude::*;

use crate::{errors::TumarError, state::*};

/// A member reclaims the rent from their own Member PDA.
///
/// Works whether the Vault account is still live or already closed - the
/// Member PDA's seeds derive from the *address* of the vault (a 32-byte
/// pubkey) and the member's owner, not the Vault account's contents. Passing
/// a closed-or-missing Vault as an `UncheckedAccount` is fine; we only use
/// `vault.key()` in the seeds and never dereference its data.
///
/// Authorization is `has_one = owner`: the signer must be the Member.owner.
/// Anyone else trying to close somebody else's Member fails with
/// `Unauthorized`. (Even the creator can't reach into a member's rent.)
///
/// Note: there's no equivalent close for Contribution PDAs in v0.1. Each
/// Contribution holds ~$0.21 of rent; callers who care can leave them as-is
/// (the history stays queryable) or we add `close_contribution` later.
#[derive(Accounts)]
pub struct LeaveVault<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    /// CHECK: used only as a seed for the Member PDA derivation below.
    /// We never dereference the account's data, so whether it still exists
    /// (vault is live) or is a system-owned zero-lamport address (vault was
    /// closed) doesn't matter. The Member PDA's own `has_one = owner` check
    /// below is what enforces auth.
    pub vault: UncheckedAccount<'info>,

    #[account(
        mut,
        close = owner,
        has_one = owner @ TumarError::Unauthorized,
        seeds = [b"member", vault.key().as_ref(), owner.key().as_ref()],
        bump = member.bump,
    )]
    pub member: Account<'info, Member>,
}

pub fn handler(_ctx: Context<LeaveVault>) -> Result<()> {
    // `close = owner` does the work: wipes Member, refunds rent to owner.
    Ok(())
}
