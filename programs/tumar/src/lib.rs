use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod state;

pub use errors::*;
pub use instructions::*;
pub use state::*;

declare_id!("HfCmnXggSF2tVQkCrEdPNjUTBYvvC8tgbebXES2sp24Y");

#[program]
pub mod tumar {
    use super::*;

    /// Create a named Family Vault with an initial allocation plan.
    /// The vault PDA becomes the authority over all asset token accounts.
    pub fn initialize_vault(
        ctx: Context<InitializeVault>,
        name: String,
        allocation: Vec<AssetAllocation>,
    ) -> Result<()> {
        instructions::initialize_vault::handler(ctx, name, allocation)
    }

    /// Join a vault via invite. Creates a Member PDA for the signer.
    pub fn join_vault(ctx: Context<JoinVault>) -> Result<()> {
        instructions::join_vault::handler(ctx)
    }

    /// Update the allocation plan. Requires >50% member signatures in a future
    /// multisig version; for v0.1 only the creator may change it.
    pub fn update_allocation(
        ctx: Context<UpdateAllocation>,
        allocation: Vec<AssetAllocation>,
    ) -> Result<()> {
        instructions::update_allocation::handler(ctx, allocation)
    }

    /// Record a USDC contribution. Called via CPI by the Solana Pay
    /// transaction-request endpoint after the transfer instruction.
    /// Mints a Contribution account for the history feed.
    ///
    /// `nonce` seeds the Contribution PDA; the caller picks any unused u64
    /// (random is fine). This replaces the older Clock::get() seed, which
    /// raced the signing window and failed with ConstraintSeeds.
    pub fn record_contribution(
        ctx: Context<RecordContribution>,
        amount: u64,
        memo: String,
        nonce: u64,
    ) -> Result<()> {
        instructions::record_contribution::handler(ctx, amount, memo, nonce)
    }

    /// Withdraw `amount` of the given mint from the vault back to the
    /// creator. Vault PDA signs the SPL TransferChecked CPI; only the
    /// creator may invoke (has_one = creator).
    ///
    /// This is the "I can get my money out" guarantee. See
    /// `instructions::withdraw` for the full security rationale.
    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        instructions::withdraw::handler(ctx, amount)
    }

    /// Close an empty vault and reclaim rent. Creator-only. Requires the
    /// vault's token account to be drained first (VaultNotEmpty otherwise).
    /// Refunds ~0.002 SOL for the ATA plus ~0.003 SOL for the Vault PDA.
    pub fn close_vault(ctx: Context<CloseVault>) -> Result<()> {
        instructions::close_vault::handler(ctx)
    }

    /// A member closes their own Member PDA and reclaims its rent
    /// (~0.00056 SOL). Works even after `close_vault` - the Member PDA's
    /// seeds derive from the vault address, which persists regardless of
    /// whether the Vault account is still live.
    pub fn leave_vault(ctx: Context<LeaveVault>) -> Result<()> {
        instructions::leave_vault::handler(ctx)
    }
}
