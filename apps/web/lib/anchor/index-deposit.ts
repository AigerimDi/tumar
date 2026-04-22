/**
 * Index-fund deposit - atomic per-slot.
 *
 * The vault stores a target allocation in basis points. The naive deposit
 * just transfers USDC into the vault's USDC ATA, which is wrong: the vault
 * is supposed to hold a *basket*, not a pile of USDC waiting for someone
 * to manually rebalance. This flow does the rebalancing AT DEPOSIT TIME by
 * splitting the user's USDC across N Jupiter swaps, each landing the slot's
 * share directly in the vault's per-token ATA.
 *
 * Sequence:
 *   1. PRE - one user-signed tx that creates every vault target ATA
 *      (idempotent: cheap if it exists, harmless if it does). Required
 *      because Jupiter's `/swap` endpoint expects `destinationTokenAccount`
 *      to already exist; if it doesn't, the swap fails on chain.
 *   2. SWAP × N - for each non-USDC slot, fetch a Jupiter swap tx with
 *      `destinationTokenAccount` set to the vault's per-token ATA. User
 *      signs and sends each. The slot's USDC share leaves the user's
 *      wallet, the slot's target token lands in the vault's ATA. No vault
 *      signature needed (we're sending TO the vault, not FROM it).
 *   3. POST - USDC keep transfer (for the slots that hold USDC) +
 *      `record_contribution` so the family feed sees the deposit.
 *
 * UX cost: N+2 Phantom prompts for an N-slot allocation. For the default
 * 6-slot basket (5 non-USDC + 1 USDC), that's 7 prompts. Each one shows
 * exactly which token is being swapped, so it's transparent - no opaque
 * "approve all" abuse.
 *
 * Failure modes:
 *   - A slot has no Jupiter route (e.g., KZTE placeholder mint) → that
 *     slot's bps gets routed to USDC keep instead. Quoted up front so the
 *     user sees the actual allocation before signing anything.
 *   - User aborts mid-flight → vault has the slots that landed, no
 *     contribution recorded, retry burns more USDC. Acceptable for a
 *     hackathon demo; production would want a "resume" mechanism.
 */

import { BN } from "@coral-xyz/anchor";
import type { Program } from "@coral-xyz/anchor";
import {
  ComputeBudgetProgram,
  type Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import type { WalletContextState } from "@solana/wallet-adapter-react";

import { contributionPda, memberPda } from "@/lib/anchor/pdas";
import { confirmViaHttp } from "@/lib/anchor/confirm";
import { signAndSend } from "@/lib/anchor/send";
import { getQuote, getSwapTransaction, type QuoteResponse } from "@/lib/jupiter";
import { USDC, findToken, type Token } from "@/lib/tokens";

/** Resolve the SPL token program that owns this mint. xStocks are on
 * Token-2022 (transfer hooks for compliance); USDC and jitoSOL are on
 * legacy. Passing the wrong one to createAssociatedTokenAccountIdempotent
 * trips a `IncorrectProgramId` panic deep inside the ATA program. */
function tokenProgramFor(t: Token | undefined): PublicKey {
  return t?.tokenProgram === "2022" ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
}

export type IndexDepositStage =
  | "idle"
  | "quoting"
  | "preparing"
  | "allocating"
  | "recording"
  | "done"
  | "error";

export type IndexDepositProgress = {
  stage: IndexDepositStage;
  /** 1-indexed current swap (only set during `allocating`). */
  current?: number;
  /** total non-USDC slots being swapped. */
  total?: number;
  detail?: string;
};

export type IndexDepositSlot = {
  mint: string;
  bps: number;
};

export type IndexDepositParams = {
  program: Program;
  connection: Connection;
  wallet: WalletContextState;
  vault: PublicKey;
  amountUsdc: number;
  allocation: IndexDepositSlot[];
  memo?: string;
  onProgress: (p: IndexDepositProgress) => void;
};

export type IndexDepositPlan = {
  /** Per-slot resolved plan, including any fallbacks (e.g., un-quotable
   * mints that get rerouted into USDC keep). */
  swapSlots: Array<{ mint: string; bps: number; micros: bigint; quote: QuoteResponse; symbol: string }>;
  /** Total USDC that stays as USDC in the vault (sum of explicit USDC slots
   * plus any failed-to-quote slots that fell back to USDC). */
  usdcKeepMicros: bigint;
  /** Slots whose Jupiter quote failed; bps redirected to USDC keep. */
  unquotableSlots: Array<{ mint: string; bps: number; reason: string }>;
};

/** Build the per-slot plan: quote each non-USDC slot, fold un-quotable
 * slots into USDC keep. Pure read-only - no transactions yet. Useful for
 * the UI to preview the allocation and let the user confirm before
 * signing anything. */
export async function planIndexDeposit(
  amountUsdc: number,
  allocation: IndexDepositSlot[],
  slippageBps = 100,
): Promise<IndexDepositPlan> {
  const totalMicros = BigInt(Math.round(amountUsdc * 1_000_000));
  const swapSlots: IndexDepositPlan["swapSlots"] = [];
  const unquotableSlots: IndexDepositPlan["unquotableSlots"] = [];
  let usdcKeepMicros = 0n;

  for (const slot of allocation) {
    const slotMicros = (totalMicros * BigInt(slot.bps)) / 10_000n;
    if (slotMicros === 0n) continue;
    if (slot.mint === USDC.mint) {
      usdcKeepMicros += slotMicros;
      continue;
    }
    try {
      const q = await getQuote({
        inputMint: USDC.mint,
        outputMint: slot.mint,
        amount: slotMicros,
        slippageBps,
      });
      const symbol = findToken(slot.mint)?.symbol ?? slot.mint.slice(0, 4);
      swapSlots.push({ ...slot, micros: slotMicros, quote: q, symbol });
    } catch (e) {
      unquotableSlots.push({
        mint: slot.mint,
        bps: slot.bps,
        reason: e instanceof Error ? e.message : String(e),
      });
      // Fall back: route this bps into USDC keep so deposit isn't lost.
      usdcKeepMicros += slotMicros;
    }
  }

  return { swapSlots, usdcKeepMicros, unquotableSlots };
}

/** Execute the full index-fund deposit. */
export async function runIndexDeposit(
  params: IndexDepositParams,
): Promise<{ swapSignatures: string[]; depositSignature: string; plan: IndexDepositPlan }> {
  const {
    program,
    connection,
    wallet,
    vault,
    amountUsdc,
    allocation,
    memo = "",
    onProgress,
  } = params;
  const { publicKey, signTransaction } = wallet;
  if (!publicKey || !signTransaction) {
    throw new Error("Connect a wallet that supports signTransaction.");
  }

  // Step 0: quote everything up front. The plan tells the UI exactly what
  // will happen before the user signs the first tx.
  onProgress({ stage: "quoting", detail: "Fetching Jupiter quotes…" });
  const plan = await planIndexDeposit(amountUsdc, allocation);
  if (plan.swapSlots.length === 0 && plan.usdcKeepMicros === 0n) {
    throw new Error("Allocation produced no executable slots.");
  }

  const usdcMint = new PublicKey(USDC.mint);
  const usdcProg = tokenProgramFor(USDC);
  const userUsdcAta = getAssociatedTokenAddressSync(usdcMint, publicKey, false, usdcProg);
  const vaultUsdcAta = getAssociatedTokenAddressSync(usdcMint, vault, true, usdcProg);
  const totalMicros = BigInt(Math.round(amountUsdc * 1_000_000));

  // Step 1: pre-create every vault target ATA in one user-signed tx.
  // Jupiter's swap-endpoint expects destinationTokenAccount to exist;
  // pre-creating idempotently is cheaper than rebuilding each Jupiter tx
  // to add a setup instruction.
  //
  // Crucial: pass the matching token program per mint. xStocks are on
  // Token-2022; ATA-create with the legacy token program ID hits an
  // `IncorrectProgramId` inside the ATA program because GetAccountDataSize
  // routes to the wrong place.
  onProgress({ stage: "preparing", detail: "Creating vault token accounts…" });
  const ataIxs = [
    // Vault USDC ATA - needed for the keep transfer in step 3.
    createAssociatedTokenAccountIdempotentInstruction(
      publicKey,
      vaultUsdcAta,
      vault,
      usdcMint,
      usdcProg,
    ),
    // Vault per-target ATA for each non-USDC swap slot.
    ...plan.swapSlots.map((s) => {
      const targetMint = new PublicKey(s.mint);
      const tok = findToken(s.mint);
      const prog = tokenProgramFor(tok);
      const ata = getAssociatedTokenAddressSync(targetMint, vault, true, prog);
      return createAssociatedTokenAccountIdempotentInstruction(
        publicKey,
        ata,
        vault,
        targetMint,
        prog,
      );
    }),
  ];

  {
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
    const ataTx = new Transaction({
      feePayer: publicKey,
      blockhash,
      lastValidBlockHeight,
    }).add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 }), ...ataIxs);
    const sig = await signAndSend(wallet, connection, ataTx);
    await confirmViaHttp(connection, sig, lastValidBlockHeight);
  }

  // Step 2: per-slot Jupiter swap. Each tx pulls USDC from the user and
  // delivers the target token to the vault's per-target ATA - no vault
  // signature needed because we're sending TO the vault.
  const swapSignatures: string[] = [];
  for (let i = 0; i < plan.swapSlots.length; i++) {
    const slot = plan.swapSlots[i];
    onProgress({
      stage: "allocating",
      current: i + 1,
      total: plan.swapSlots.length,
      detail: `Swapping to ${slot.symbol}…`,
    });

    const targetMint = new PublicKey(slot.mint);
    const tok = findToken(slot.mint);
    const vaultTargetAta = getAssociatedTokenAddressSync(
      targetMint,
      vault,
      true,
      tokenProgramFor(tok),
    );

    const { swapTransaction, lastValidBlockHeight } = await getSwapTransaction({
      quoteResponse: slot.quote,
      userPublicKey: publicKey.toBase58(),
      // The whole point of index-deposit: deliver swap output straight to
      // the vault's per-token ATA. No follow-up user → vault transfer needed.
      destinationTokenAccount: vaultTargetAta.toBase58(),
      // USDC → token, no SOL at the boundary, so wrap-unwrap is a no-op.
      wrapAndUnwrapSol: false,
      prioritizationFeeLamports: "auto",
      dynamicComputeUnitLimit: true,
    });

    const txBuf = Uint8Array.from(atob(swapTransaction), (c) => c.charCodeAt(0));
    const versioned = VersionedTransaction.deserialize(txBuf);

    const sig = await signAndSend(wallet, connection, versioned);
    await confirmViaHttp(connection, sig, lastValidBlockHeight);
    swapSignatures.push(sig);
  }

  // Step 3: USDC keep transfer (if any) + record_contribution.
  onProgress({ stage: "recording", detail: "Recording contribution…" });
  const [member] = memberPda(vault, publicKey);
  const nonceBytes = new Uint8Array(8);
  crypto.getRandomValues(nonceBytes);
  nonceBytes[0] &= 0x7f; // u63, avoids the i64 range-check overflow we hit elsewhere
  const nonceHex = Array.from(nonceBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const nonceBn = new BN(nonceHex, 16);
  const nonceBig = BigInt("0x" + nonceHex);
  const [contribution] = contributionPda(vault, publicKey, nonceBig);

  const recordIx = await program.methods
    .recordContribution(new BN(totalMicros.toString()), memo.trim().slice(0, 140), nonceBn)
    .accounts({
      contributor: publicKey,
      vault,
      member,
      contribution,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  const finalIxs = [
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 }),
  ];
  if (plan.usdcKeepMicros > 0n) {
    finalIxs.push(
      createTransferCheckedInstruction(
        userUsdcAta,
        usdcMint,
        vaultUsdcAta,
        publicKey,
        plan.usdcKeepMicros,
        USDC.decimals,
        [],
        usdcProg,
      ),
    );
  }
  finalIxs.push(recordIx);

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  const finalTx = new Transaction({
    feePayer: publicKey,
    blockhash,
    lastValidBlockHeight,
  }).add(...finalIxs);
  const depositSignature = await signAndSend(wallet, connection, finalTx);
  await confirmViaHttp(connection, depositSignature, lastValidBlockHeight);

  onProgress({ stage: "done", detail: "Deposit allocated to basket." });
  return { swapSignatures, depositSignature, plan };
}
