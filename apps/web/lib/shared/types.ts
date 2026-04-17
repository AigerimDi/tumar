/**
 * Shared domain types for Tumar.
 *
 * These mirror the Anchor account layouts from `programs/tumar/src/state.rs`
 * but in a UI-friendly shape (numbers as `number`/`bigint`, pubkeys as
 * base58 strings, no `BN`). Both apps/web and apps/family consume these.
 */

/** A single allocation slot - mint + basis points (1/100 %). Sums to 10_000. */
export type Allocation = {
  mint: string; // base58
  bps: number; // 0..10_000
};

/** UI-shaped Vault account. Derived from the Anchor `Vault` struct. */
export type Vault = {
  /** Vault PDA address (base58). */
  address: string;
  /** Creator wallet pubkey (base58). */
  creator: string;
  name: string;
  allocation: Allocation[];
  /** USDC deposited lifetime, in human units (NOT micros). */
  usdcDeposited: number;
  memberCount: number;
  /** Unix seconds. */
  createdAt: number;
};

/** Member account: one per (vault, owner) pair. */
export type Member = {
  vault: string; // vault PDA, base58
  owner: string; // member wallet, base58
  joinedAt: number; // unix seconds
  contributedLifetime: number; // human-unit USDC
};

/** Contribution account: one per record_contribution call. */
export type Contribution = {
  /** Tx signature that recorded the contribution. */
  signature: string;
  vault: string; // base58
  contributor: string; // base58
  /** Human-unit USDC. */
  amount: number;
  /** Unix seconds. */
  timestamp: number;
  memo?: string;
};

/**
 * The mock VaultState shape consumed by apps/family.
 * Structurally compatible with `Vault` + an array of `Contribution`s, plus
 * a precomputed `totalValueUsd` so the LLM doesn't have to re-derive it.
 */
export type VaultState = Vault & {
  totalValueUsd: number;
  recentContributions: Contribution[];
};
