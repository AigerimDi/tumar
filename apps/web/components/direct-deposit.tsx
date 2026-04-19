"use client";

/**
 * Direct deposit - single-signature USDC contribution.
 *
 * One tx: ATA-create-idempotent for the vault USDC ATA, USDC transfer
 * from user → vault, `record_contribution`. The vault holds USDC; the
 * target allocation is recorded on-chain but not auto-rebalanced (the
 * on-chain swap instruction is roadmap - that's the only honest way to
 * keep this single-tx).
 *
 * The earlier index-fund flow split deposits into N Jupiter swaps for
 * "vault holds the basket on-chain" semantics, but that cost ~7 wallet
 * prompts per deposit. The library code lives at lib/anchor/index-deposit.ts
 * for when we wire it back up via a custom Anchor instruction (one CPI
 * per slot, single user signature).
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
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { useState } from "react";

import { contributionPda, memberPda } from "@/lib/anchor/pdas";
import { useTumarProgram } from "@/lib/anchor/program";
import { confirmViaHttp } from "@/lib/anchor/confirm";
import { explainTxError } from "@/lib/anchor/explain";
import { signAndSend } from "@/lib/anchor/send";
import { explorerTxUrl } from "@/lib/cluster";
import { IS_DEVNET_USDC, USDC } from "@/lib/tokens";

import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { UsdcFaucetButton } from "./usdc-faucet-button";

/** Random u63 nonce for the Contribution PDA seed. We mask the high bit
 * because some path in the JS serializer chain range-checks against i64;
 * a value with bit 63 set throws "out of range, must be < 2^63" before
 * the tx even reaches the cluster. */
function randomNonce(): { bn: BN; big: bigint } {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  bytes[0] &= 0x7f;
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return { bn: new BN(hex, 16), big: BigInt("0x" + hex) };
}

export function DirectDeposit({ vault: vaultAddr }: { vault: string }) {
  const wallet = useWallet();
  const { publicKey } = wallet;
  const { connection } = useConnection();
  const program = useTumarProgram();

  const [amount, setAmount] = useState<string>("100");
  const [memo, setMemo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);

  async function deposit() {
    if (!publicKey || !program) {
      setError("Connect your wallet first.");
      return;
    }
    const num = Number(amount);
    if (!Number.isFinite(num) || num <= 0) {
      setError("Enter a valid amount.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setSignature(null);

    try {
      const vault = new PublicKey(vaultAddr);
      const usdcMint = new PublicKey(USDC.mint);
      const amountMicros = BigInt(Math.round(num * 1_000_000));

      const payerAta = getAssociatedTokenAddressSync(usdcMint, publicKey);
      // allowOwnerOffCurve=true - the vault key is a PDA, off-curve.
      const vaultAta = getAssociatedTokenAddressSync(usdcMint, vault, true);
      const [member] = memberPda(vault, publicKey);
      const { bn: nonceBn, big: nonceBig } = randomNonce();
      const [contribution] = contributionPda(vault, publicKey, nonceBig);

      // Client-side prechecks - catch the common cases before signing so
      // the error names the specific fix instead of a program log.
      const [payerLamports, memberInfo, payerAtaInfo] = await Promise.all([
        connection.getBalance(publicKey),
        connection.getAccountInfo(member),
        connection.getAccountInfo(payerAta),
      ]);

      if (payerLamports < 10_000) {
        throw new Error(
          "Your wallet needs a small amount of SOL for transaction fees (< $0.01). Top up the connected wallet and retry.",
        );
      }
      if (!memberInfo) {
        throw new Error(
          "You haven't joined this vault with this wallet yet. Open the invite link and tap Join first.",
        );
      }
      if (!payerAtaInfo) {
        throw new Error(
          "Your wallet has no USDC token account yet. Send any USDC to this wallet (even $1) to create the account, then retry.",
        );
      }
      if (payerAtaInfo.data.length >= 72) {
        const bal = payerAtaInfo.data.readBigUInt64LE(64);
        if (bal < amountMicros) {
          const have = Number(bal) / 1_000_000;
          throw new Error(
            `Not enough USDC: you have ${have.toFixed(2)}, trying to send ${num}. Top up your wallet and retry.`,
          );
        }
      }

      const recordIx = await program.methods
        .recordContribution(
          new BN(amountMicros.toString()),
          memo.trim().slice(0, 140),
          nonceBn,
        )
        .accounts({
          contributor: publicKey,
          vault,
          member,
          contribution,
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
        // 100k µlamports × ~200k CU ≈ 20k lamports (~$0.003). Buys real
        // inclusion margin on a congested mainnet.
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100_000 }),
        // Idempotent - cheap if the vault already has a USDC ATA.
        createAssociatedTokenAccountIdempotentInstruction(
          publicKey,
          vaultAta,
          vault,
          usdcMint,
        ),
        createTransferCheckedInstruction(
          payerAta,
          usdcMint,
          vaultAta,
          publicKey,
          amountMicros,
          USDC.decimals,
        ),
        recordIx,
      );

      const sig = await signAndSend(wallet, connection, tx);
      try {
        await confirmViaHttp(connection, sig, lastValidBlockHeight);
      } catch (confirmErr) {
        // If confirmViaHttp times out, the tx may still have landed. Poll
        // the contribution PDA - if it appears, the deposit confirmed.
        const msg = confirmErr instanceof Error ? confirmErr.message : String(confirmErr);
        if (!/confirmation timed out|already been processed/i.test(msg)) throw confirmErr;
        let landed: unknown = null;
        for (let i = 0; i < 15 && !landed; i++) {
          await new Promise((r) => setTimeout(r, 2000));
          landed = await connection.getAccountInfo(contribution);
        }
        if (!landed) throw confirmErr;
      }
      setSignature(sig);
    } catch (e) {
      console.error("[direct-deposit] failed:", e);
      setError(explainTxError(e));
    } finally {
      setSubmitting(false);
    }
  }

  if (signature) {
    return (
      <div className="space-y-4 rounded-xl border border-[color:var(--color-up)]/30 bg-[color:var(--color-up)]/5 px-5 py-6">
        <div className="text-sm text-[color:var(--color-up)]">
          ✓ Deposit submitted
        </div>
        <p className="text-xs text-ink-300">
          Your contribution will appear in the feed automatically.
        </p>
        <a
          href={explorerTxUrl(signature)}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-gold-300 hover:text-gold-200"
        >
          View on Explorer ↗
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <label className="mb-2 block text-[11px] uppercase tracking-[0.16em] text-ink-300">
          Amount (USDC)
        </label>
        <Input
          type="number"
          inputMode="decimal"
          min="1"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="100"
          className="num text-xl"
          disabled={submitting}
        />
        <div className="mt-2 flex gap-2">
          {[25, 100, 500, 1000].map((v) => (
            <button
              key={v}
              onClick={() => setAmount(String(v))}
              type="button"
              disabled={submitting}
              className="rounded-full border border-white/10 bg-white/[0.02] px-3 py-1 text-xs text-ink-300 transition-colors hover:border-gold-400/40 hover:text-ink-100 disabled:opacity-40"
            >
              ${v}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-2 block text-[11px] uppercase tracking-[0.16em] text-ink-300">
          Memo (optional)
        </label>
        <Input
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          placeholder="For Aidana's tuition"
          maxLength={140}
          disabled={submitting}
        />
      </div>

      {error && (
        <div className="space-y-3 rounded-xl border border-[color:var(--color-down)]/30 bg-[color:var(--color-down)]/10 px-4 py-3 text-sm text-[color:var(--color-down)]">
          <div>{error}</div>
          {IS_DEVNET_USDC && /USDC|token account/i.test(error) && (
            <div>
              <UsdcFaucetButton
                variant="secondary"
                onClaimed={() => setError(null)}
              />
            </div>
          )}
        </div>
      )}

      <Button
        className="w-full"
        size="lg"
        onClick={deposit}
        disabled={submitting || !publicKey}
      >
        {submitting
          ? "Signing…"
          : publicKey
          ? `Send $${amount || "0"} USDC`
          : "Connect wallet to deposit"}
      </Button>
      <div className="text-center text-[11px] text-ink-500">
        One signature. Lands on Solana mainnet in ~10s. Vault holds USDC;
        the target allocation is recorded on-chain - auto-rebalance into the
        basket is roadmap (one Anchor CPI per slot, still one user sig).
      </div>
    </div>
  );
}
