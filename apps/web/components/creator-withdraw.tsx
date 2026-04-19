"use client";

/**
 * Creator-only USDC withdraw + close.
 *
 * Two actions in one card:
 *   1. Withdraw - moves USDC from the vault ATA to the creator's ATA. Uses
 *      the program's `withdraw` instruction, which PDA-signs the SPL
 *      TransferChecked CPI. `has_one = creator` on the Vault is the sole
 *      auth check - non-creators get `Unauthorized` without any on-chain work.
 *   2. Close vault - reclaims ~0.005 SOL in rent (vault ATA + Vault PDA).
 *      Only available once the vault's USDC balance is zero. The program
 *      enforces this via a `VaultNotEmpty` constraint too.
 *
 * Only rendered when `publicKey === vault.creator`. Handlers re-check to
 * defend against stale-state bugs on the page.
 */

import { BN } from "@coral-xyz/anchor";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  ComputeBudgetProgram,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { useCallback, useEffect, useState } from "react";

import { confirmViaHttp } from "@/lib/anchor/confirm";
import { explainTxError } from "@/lib/anchor/explain";
import { useTumarProgram } from "@/lib/anchor/program";
import { signAndSend } from "@/lib/anchor/send";
import { explorerTxUrl } from "@/lib/cluster";
import { USDC } from "@/lib/tokens";
import { formatUsd } from "@/lib/utils";

import { Button } from "./ui/button";
import { Input } from "./ui/input";

type Props = {
  /** The Vault PDA address (base58). */
  vault: string;
  /** Creator pubkey (base58), matches `vault.creator` on-chain. */
  creator: string;
  /** Called after a successful close_vault so the page can navigate away. */
  onClosed?: () => void;
};

export function CreatorWithdraw({ vault: vaultAddr, creator, onClosed }: Props) {
  const wallet = useWallet();
  const { publicKey } = wallet;
  const { connection } = useConnection();
  const program = useTumarProgram();

  const [available, setAvailable] = useState<number | null>(null);
  const [amount, setAmount] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [closeSig, setCloseSig] = useState<string | null>(null);

  const loadBalance = useCallback(async () => {
    try {
      const vaultPk = new PublicKey(vaultAddr);
      const usdcMint = new PublicKey(USDC.mint);
      const vaultAta = getAssociatedTokenAddressSync(usdcMint, vaultPk, true);
      const info = await connection.getAccountInfo(vaultAta);
      if (!info || info.data.length < 72) {
        setAvailable(0);
        return;
      }
      // SPL Token account layout: amount is u64 LE at byte offset 64.
      const bal = info.data.readBigUInt64LE(64);
      setAvailable(Number(bal) / 1_000_000);
    } catch {
      setAvailable(null);
    }
  }, [connection, vaultAddr]);

  useEffect(() => {
    loadBalance();
  }, [loadBalance]);

  async function withdraw() {
    if (!publicKey || !program) {
      setError("Connect your wallet first.");
      return;
    }
    // Belt-and-suspenders auth check; the program enforces this too.
    if (publicKey.toBase58() !== creator) {
      setError("Only the vault creator can withdraw.");
      return;
    }

    const num = Number(amount);
    if (!Number.isFinite(num) || num <= 0) {
      setError("Enter a valid amount.");
      return;
    }
    if (available != null && num > available + 0.000001) {
      setError(
        `That exceeds the vault's USDC balance (${formatUsd(available)}).`,
      );
      return;
    }

    setSubmitting(true);
    setError(null);
    setSignature(null);

    try {
      const vaultPk = new PublicKey(vaultAddr);
      const usdcMint = new PublicKey(USDC.mint);
      const amountMicros = BigInt(Math.round(num * 1_000_000));

      const vaultAta = getAssociatedTokenAddressSync(usdcMint, vaultPk, true);
      const creatorAta = getAssociatedTokenAddressSync(usdcMint, publicKey);

      const ix = await program.methods
        .withdraw(new BN(amountMicros.toString()))
        .accounts({
          creator: publicKey,
          vault: vaultPk,
          mint: usdcMint,
          vaultTokenAccount: vaultAta,
          creatorTokenAccount: creatorAta,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .instruction();

      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash("confirmed");
      const tx = new Transaction({
        feePayer: publicKey,
        blockhash,
        lastValidBlockHeight,
      }).add(
        // Match the deposit flow's priority-fee bump - ~$0.0005, buys us out
        // of the no-tip bucket during mainnet congestion.
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 20_000 }),
        ix,
      );

      const sig = await signAndSend(wallet, connection, tx);
      await confirmViaHttp(connection, sig, lastValidBlockHeight);
      setSignature(sig);
      // Refresh available after a short delay so the on-chain balance
      // reflects the withdraw.
      setTimeout(loadBalance, 1_500);
    } catch (e) {
      console.error("[withdraw] failed:", e);
      setError(explainTxError(e));
    } finally {
      setSubmitting(false);
    }
  }

  async function closeVault() {
    if (!publicKey || !program) {
      setError("Connect your wallet first.");
      return;
    }
    if (publicKey.toBase58() !== creator) {
      setError("Only the vault creator can close the vault.");
      return;
    }
    if (available != null && available > 0.000001) {
      setError("Withdraw the remaining USDC first, then close.");
      return;
    }

    setClosing(true);
    setError(null);
    setCloseSig(null);

    try {
      const vaultPk = new PublicKey(vaultAddr);
      const usdcMint = new PublicKey(USDC.mint);
      const vaultAta = getAssociatedTokenAddressSync(usdcMint, vaultPk, true);

      const ix = await program.methods
        .closeVault()
        .accounts({
          creator: publicKey,
          vault: vaultPk,
          mint: usdcMint,
          vaultTokenAccount: vaultAta,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .instruction();

      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash("confirmed");
      const tx = new Transaction({
        feePayer: publicKey,
        blockhash,
        lastValidBlockHeight,
      }).add(
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 20_000 }),
        ix,
      );

      const sig = await signAndSend(wallet, connection, tx);
      await confirmViaHttp(connection, sig, lastValidBlockHeight);
      setCloseSig(sig);
      // Give the caller a chance to navigate away; the vault account won't
      // resolve anymore, so staying on this page would show a NotFound.
      setTimeout(() => onClosed?.(), 1_500);
    } catch (e) {
      console.error("[close-vault] failed:", e);
      setError(explainTxError(e));
    } finally {
      setClosing(false);
    }
  }

  if (closeSig) {
    return (
      <div className="space-y-3 rounded-xl border border-[color:var(--color-up)]/30 bg-[color:var(--color-up)]/5 px-5 py-4">
        <div className="text-sm text-[color:var(--color-up)]">
          ✓ Vault closed. Rent refunded to your wallet.
        </div>
        <p className="text-xs text-ink-300">
          The on-chain Vault account and its USDC token account have been
          closed. Redirecting…
        </p>
        <a
          href={explorerTxUrl(closeSig)}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-gold-300 hover:text-gold-200"
        >
          View on Explorer ↗
        </a>
      </div>
    );
  }

  if (signature) {
    return (
      <div className="space-y-3 rounded-xl border border-[color:var(--color-up)]/30 bg-[color:var(--color-up)]/5 px-5 py-4">
        <div className="text-sm text-[color:var(--color-up)]">
          ✓ Withdrawn to your wallet
        </div>
        <p className="text-xs text-ink-300">
          USDC has been transferred from the vault to your connected wallet.
        </p>
        <div className="flex items-center gap-3 text-xs">
          <a
            href={explorerTxUrl(signature)}
            target="_blank"
            rel="noreferrer"
            className="text-gold-300 hover:text-gold-200"
          >
            View on Explorer ↗
          </a>
          <button
            type="button"
            onClick={() => {
              setSignature(null);
              setAmount("");
            }}
            className="text-ink-400 hover:text-ink-100"
          >
            Withdraw more
          </button>
        </div>
      </div>
    );
  }

  const maxButtons = (() => {
    if (available == null || available <= 0) return [];
    return [
      { label: "25%", value: (available * 0.25).toFixed(2) },
      { label: "50%", value: (available * 0.5).toFixed(2) },
      { label: "Max", value: available.toFixed(2) },
    ];
  })();

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] uppercase tracking-[0.16em] text-ink-300">
          Vault USDC balance
        </span>
        <span className="num text-lg text-ink-100">
          {available == null ? "-" : formatUsd(available)}
        </span>
      </div>

      <div>
        <label className="mb-2 block text-[11px] uppercase tracking-[0.16em] text-ink-300">
          Amount to withdraw (USDC)
        </label>
        <Input
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          className="num text-lg"
          disabled={!available || available <= 0}
        />
        {maxButtons.length > 0 && (
          <div className="mt-2 flex gap-2">
            {maxButtons.map((b) => (
              <button
                key={b.label}
                type="button"
                onClick={() => setAmount(b.value)}
                className="rounded-full border border-white/10 bg-white/[0.02] px-3 py-1 text-xs text-ink-300 transition-colors hover:border-gold-400/40 hover:text-ink-100"
              >
                {b.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-[color:var(--color-down)]/30 bg-[color:var(--color-down)]/10 px-4 py-3 text-sm text-[color:var(--color-down)]">
          {error}
        </div>
      )}

      <Button
        variant="secondary"
        className="w-full"
        onClick={withdraw}
        disabled={
          submitting ||
          !publicKey ||
          !available ||
          available <= 0 ||
          !amount ||
          Number(amount) <= 0
        }
      >
        {submitting
          ? "Signing…"
          : !available || available <= 0
          ? "No USDC in vault"
          : `Withdraw ${amount ? formatUsd(Number(amount)) : "USDC"} to your wallet`}
      </Button>
      <div className="text-center text-[11px] text-ink-500">
        Only you (the vault creator) can sign this. Funds land in the wallet you&apos;re connected with.
      </div>

      <div className="mt-6 border-t border-white/5 pt-6">
        <div className="flex items-baseline justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-[0.16em] text-ink-300">
              Close vault
            </div>
            <div className="mt-1 text-sm text-ink-200">
              Reclaim ~0.005 SOL in rent. Requires a zero balance.
            </div>
          </div>
        </div>
        <Button
          variant="ghost"
          className="mt-3 w-full text-[color:var(--color-down)] hover:text-[color:var(--color-down)]"
          onClick={closeVault}
          disabled={
            closing ||
            !publicKey ||
            available == null ||
            available > 0.000001
          }
        >
          {closing
            ? "Closing…"
            : available == null
            ? "Loading balance…"
            : available > 0.000001
            ? `Withdraw ${formatUsd(available)} first`
            : "Close vault permanently"}
        </Button>
        <div className="mt-2 text-center text-[11px] text-ink-500">
          Members can reclaim their own rent later with <em>leave vault</em> - their addresses keep working.
        </div>
      </div>
    </div>
  );
}
