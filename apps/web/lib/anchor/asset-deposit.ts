/**
 * Per-asset deposit - let a contributor say "I want $100 of NVDAx in the
 * vault" instead of dropping plain USDC. The vault ends up holding the
 * actual asset on chain, useful before the on-chain `rebalance_swap`
 * Anchor instruction lands.
 *
 * ### Why two user-signed transactions, not one
 *
 * The original implementation crammed everything into a single v0 tx via
 * Jupiter's `/swap-instructions` endpoint:
 *   `compute-budget + jupiter-setup + ata-create + jupiter-swap + record_contribution`
 *
 * That worked for jitoSOL but consistently timed out for xStocks (Backed
 * Finance Token-2022 with compliance transfer hooks). Two reasons:
 *
 *   1. **Tx size**. A 3-hop AAPLx route has ~50+ accounts; the static tail
 *      plus our ATA-create + record_contribution pushed past 1232 bytes.
 *
 *   2. **Transfer-hook extras**. Token-2022 transfer hooks require extra
 *      account metas resolved at swap time. `/swap-instructions` doesn't
 *      always include them; the full `/swap` endpoint does.
 *
 * So we split the work, sequentially:
 *   - **TX A (Jupiter swap)**: full `/swap` payload, output to the user's
 *     own ATA (Jupiter auto-creates it + handles hooks). One signature.
 *   - **TX B (deposit + record)**: idempotent vault-ATA-create +
 *     transferCheckedWithTransferHook (user ATA → vault ATA, amount = the
 *     ACTUAL post-swap delta) + `record_contribution`. Always small.
 *
 * Two wallet popups. We deliberately don't batch via `signAllTransactions`
 * because some wallets' batch flow silently mis-handles mixed v0+legacy
 * txs and the user ends up with a tx in limbo. Two sequential popups is
 * boring but boring is the goal.
 *
 * ### Direct-transfer fallback
 *
 * USD-pegged tokens with no Jupiter route (PUSD until Palm seeds AMM
 * liquidity) are handled by `runDirectTransferDeposit`: same UX, no swap,
 * vault gets the actual PUSD via a single legacy-tx transferChecked.
 */

import { BN } from "@coral-xyz/anchor";
import type { Program } from "@coral-xyz/anchor";
import {
  ComputeBudgetProgram,
  type Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  type TransactionInstruction,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  createTransferCheckedWithTransferHookInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import type { WalletContextState } from "@solana/wallet-adapter-react";

import { contributionPda, memberPda } from "@/lib/anchor/pdas";
import { confirmViaHttp } from "@/lib/anchor/confirm";
import { signAndSend } from "@/lib/anchor/send";
import {
  getQuote,
  getSwapTransaction,
  type QuoteResponse,
} from "@/lib/jupiter";
import { USDC, type Token } from "@/lib/tokens";

export type AssetDepositStage =
  | "idle"
  | "quoting"
  | "preparing"
  | "signing"
  | "confirming"
  | "done"
  | "error";

export type AssetDepositProgress = {
  stage: AssetDepositStage;
  detail?: string;
};

export type AssetDepositParams = {
  program: Program;
  connection: Connection;
  wallet: WalletContextState;
  vault: PublicKey;
  amountUsdc: number;
  /** Target token to acquire and deposit into the vault. */
  target: Token;
  memo?: string;
  slippageBps?: number;
  onProgress: (p: AssetDepositProgress) => void;
};

const log = (...args: unknown[]) => console.log("[asset-deposit]", ...args);
const warn = (...args: unknown[]) => console.warn("[asset-deposit]", ...args);

function tokenProgramFor(t: Token): PublicKey {
  return t.tokenProgram === "2022" ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
}

/** u63 nonce - high bit cleared so the JS serializer's i64 range check
 * doesn't reject ~50% of random values. */
function randomNonce(): { bn: BN; big: bigint } {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  bytes[0] &= 0x7f;
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return { bn: new BN(hex, 16), big: BigInt("0x" + hex) };
}

export type AssetDepositPreview =
  | { mode: "swap"; outAmount: bigint; minOutputAmount: bigint }
  | { mode: "direct"; transferAmount: bigint };

/** Tokens with no DEX route fall back to direct transfer, but only if the
 * peg makes a 1:1 USD→token mapping safe. */
function isDirectTransferable(target: Token): boolean {
  return target.kind === "stable-usd" || target.pegged === true;
}

export async function previewAssetDeposit(
  amountUsdc: number,
  target: Token,
  slippageBps = 100,
): Promise<AssetDepositPreview | null> {
  if (target.mint === USDC.mint) return null;
  const amountMicros = BigInt(Math.round(amountUsdc * 1_000_000));
  if (amountMicros === 0n) return null;
  try {
    const q = await getQuote({
      inputMint: USDC.mint,
      outputMint: target.mint,
      amount: amountMicros,
      slippageBps,
    });
    return {
      mode: "swap",
      outAmount: BigInt(q.outAmount),
      minOutputAmount: BigInt(q.otherAmountThreshold ?? q.outAmount),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/TOKEN_NOT_TRADABLE|not tradable/i.test(msg) && isDirectTransferable(target)) {
      const decimals = target.decimals;
      const transferAmount = BigInt(Math.round(amountUsdc * 10 ** decimals));
      return { mode: "direct", transferAmount };
    }
    throw e;
  }
}

/** Read user's target-token ATA balance. Returns 0 if the ATA doesn't
 * exist or has unparseable data. */
async function readUserTokenBalance(
  connection: Connection,
  user: PublicKey,
  target: Token,
): Promise<bigint> {
  const ata = getAssociatedTokenAddressSync(
    new PublicKey(target.mint),
    user,
    false,
    tokenProgramFor(target),
  );
  const info = await connection.getAccountInfo(ata, "confirmed");
  if (!info || info.data.length < 72) return 0n;
  return info.data.readBigUInt64LE(64);
}

export async function runAssetDeposit(
  params: AssetDepositParams,
): Promise<{ signature: string; outAmount: bigint }> {
  const {
    program,
    connection,
    wallet,
    vault,
    amountUsdc,
    target,
    memo = "",
    onProgress,
  } = params;
  const slippageBps = params.slippageBps ?? 100;
  const { publicKey, signTransaction } = wallet;
  if (!publicKey || !signTransaction) {
    throw new Error("Connect a wallet that supports signTransaction.");
  }
  if (target.mint === USDC.mint) {
    throw new Error("Use the regular deposit flow for USDC contributions.");
  }

  const targetMint = new PublicKey(target.mint);
  const targetProg = tokenProgramFor(target);
  const amountMicros = BigInt(Math.round(amountUsdc * 1_000_000));
  log(`start: ${amountUsdc} USDC → ${target.symbol} (${target.tokenProgram === "2022" ? "Token-2022" : "legacy SPL"})`);

  // ── Step 1 ───────────────────────────────────────────────────────────
  // Get a Jupiter quote. PUSD has no Jupiter route - its acquisition path
  // is KYC mint via Palm Treasury; if the user already holds it we fall
  // back to a direct transfer.
  onProgress({ stage: "quoting", detail: "Fetching Jupiter quote…" });
  let quote: QuoteResponse;
  try {
    quote = await getQuote({
      inputMint: USDC.mint,
      outputMint: target.mint,
      amount: amountMicros,
      slippageBps,
    });
    log("quote:", { outAmount: quote.outAmount, hops: quote.routePlan.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/TOKEN_NOT_TRADABLE|not tradable/i.test(msg) && isDirectTransferable(target)) {
      log("no Jupiter route - falling back to direct transfer for", target.symbol);
      return runDirectTransferDeposit({
        program, connection, wallet, vault, amountUsdc, target, memo, onProgress,
      });
    }
    throw e;
  }
  const outAmount = BigInt(quote.outAmount);

  // ── Step 2 ───────────────────────────────────────────────────────────
  // Snapshot the user's pre-swap target-token balance. After the swap
  // confirms we read the post-swap balance and transfer the delta - that
  // way slippage doesn't make us under- or over-transfer, and an
  // already-held position stays the user's.
  onProgress({ stage: "preparing", detail: "Reading pre-swap balance…" });
  const preSwapBalance = await readUserTokenBalance(connection, publicKey, target);
  log(`pre-swap user ${target.symbol} balance:`, preSwapBalance.toString());

  // ── Step 3 ───────────────────────────────────────────────────────────
  // Get Jupiter's complete /swap tx. Output goes to the user's own ATA
  // (Jupiter auto-creates if needed and handles Token-2022 hooks). We do
  // NOT override `destinationTokenAccount` - letting Jupiter own that
  // piece is what makes this reliable for xStocks.
  onProgress({ stage: "preparing", detail: "1/2 - Building Jupiter swap tx…" });
  const swapPayload = await getSwapTransaction({
    quoteResponse: quote,
    userPublicKey: publicKey.toBase58(),
    wrapAndUnwrapSol: true,
    prioritizationFeeLamports: "auto",
    dynamicComputeUnitLimit: true,
  });
  const swapTx = VersionedTransaction.deserialize(
    Buffer.from(swapPayload.swapTransaction, "base64"),
  );
  log("swap tx size:", swapPayload.swapTransaction.length, "bytes (base64);", swapTx.serialize().length, "bytes (raw)");
  log("swap lastValidBlockHeight:", swapPayload.lastValidBlockHeight);

  // Pre-flight simulate so we surface "this swap would fail" before
  // dragging the user through a wallet popup.
  try {
    const sim = await connection.simulateTransaction(swapTx, {
      replaceRecentBlockhash: true,
      sigVerify: false,
    });
    if (sim.value.err) {
      const logs = (sim.value.logs ?? []).slice(-12).join("\n  ");
      throw new Error(`Swap simulation failed: ${JSON.stringify(sim.value.err)}\n  ${logs}`);
    }
    log("swap sim ok, units consumed:", sim.value.unitsConsumed);
  } catch (e) {
    if (e instanceof Error && /simulation failed/i.test(e.message)) throw e;
    warn("swap simulation skipped (sim error):", e);
  }

  // ── Step 4 ───────────────────────────────────────────────────────────
  // Sign + send the swap tx. signAndSend handles the wallet-broadcast
  // race: even if Phantom broadcasts during signing and our send hits
  // "already processed", we recover the signature from the signed bytes
  // and let polling find the result.
  onProgress({ stage: "signing", detail: "1/2 - Sign Jupiter swap (popup 1 of 2)…" });
  const swapSig = await signAndSend(wallet, connection, swapTx);
  log("swap sent, sig:", swapSig);

  onProgress({ stage: "confirming", detail: "1/2 - Confirming swap on chain…" });
  try {
    await confirmViaHttp(connection, swapSig, swapPayload.lastValidBlockHeight);
    log("swap confirmed:", swapSig);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    warn("swap confirm error:", msg);
    if (!/confirmation timed out|already been processed/i.test(msg)) throw e;
    // False-timeout fallback: poll the user's ATA for balance growth.
    log("polling user ATA for swap landing…");
    let landed = false;
    for (let i = 0; i < 20 && !landed; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const bal = await readUserTokenBalance(connection, publicKey, target);
      log(`  poll ${i + 1}: balance=${bal.toString()} (need >${preSwapBalance.toString()})`);
      if (bal > preSwapBalance) { landed = true; break; }
    }
    if (!landed) {
      throw new Error(
        `Jupiter swap didn't land. Tx: ${swapSig}\n\n` +
        `Check: https://solscan.io/tx/${swapSig}\n\n` +
        `If it shows "Success" there but this page hung, the RPC is just slow - refresh and try the deposit again. If it shows an error, that's the actual failure to read.`,
      );
    }
  }

  // ── Step 5 ───────────────────────────────────────────────────────────
  // Read post-swap balance, compute the delta. This is what we transfer
  // into the vault - slippage is absorbed correctly and any existing
  // user-held balance is left alone.
  onProgress({ stage: "preparing", detail: "2/2 - Measuring swap output…" });
  const postSwapBalance = await readUserTokenBalance(connection, publicKey, target);
  const acquired = postSwapBalance - preSwapBalance;
  log(`post-swap user ${target.symbol} balance:`, postSwapBalance.toString(), `(acquired: ${acquired.toString()})`);
  if (acquired <= 0n) {
    throw new Error(
      `Swap landed but no ${target.symbol} acquired (balance unchanged at ${postSwapBalance}).\n` +
      `Tx: ${swapSig}`,
    );
  }

  // ── Step 6 ───────────────────────────────────────────────────────────
  // Build the vault-side deposit tx. Idempotent vault-ATA-create handles
  // first-deposit cases; transferCheckedWithTransferHook resolves any
  // Token-2022 hook accounts on chain (no-op for legacy tokens, real
  // hook lookup for xStocks); record_contribution writes to Tumar.
  onProgress({ stage: "preparing", detail: "2/2 - Building vault deposit + record…" });
  const userTargetAta = getAssociatedTokenAddressSync(targetMint, publicKey, false, targetProg);
  const vaultTargetAta = getAssociatedTokenAddressSync(targetMint, vault, true, targetProg);

  const transferIx: TransactionInstruction =
    target.tokenProgram === "2022"
      ? await createTransferCheckedWithTransferHookInstruction(
          connection, userTargetAta, targetMint, vaultTargetAta, publicKey,
          acquired, target.decimals, [], "confirmed", targetProg,
        )
      : createTransferCheckedInstruction(
          userTargetAta, targetMint, vaultTargetAta, publicKey,
          acquired, target.decimals, [], targetProg,
        );

  const [member] = memberPda(vault, publicKey);
  const { bn: nonceBn, big: nonceBig } = randomNonce();
  const [contribution] = contributionPda(vault, publicKey, nonceBig);
  const recordIx = await program.methods
    .recordContribution(new BN(amountMicros.toString()), memo.trim().slice(0, 140), nonceBn)
    .accounts({
      contributor: publicKey,
      vault,
      member,
      contribution,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  const depositTx = new Transaction({ feePayer: publicKey, blockhash, lastValidBlockHeight }).add(
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100_000 }),
    createAssociatedTokenAccountIdempotentInstruction(
      publicKey, vaultTargetAta, vault, targetMint, targetProg,
    ),
    transferIx,
    recordIx,
  );
  log(`deposit tx: ${depositTx.instructions.length} ixs, transferring ${acquired.toString()} ${target.symbol} to ${vaultTargetAta.toBase58()}`);

  // ── Step 7 ───────────────────────────────────────────────────────────
  // Sign + send + confirm the deposit.
  onProgress({ stage: "signing", detail: "2/2 - Sign vault deposit (popup 2 of 2)…" });
  const depositSig = await signAndSend(wallet, connection, depositTx);
  log("deposit sent, sig:", depositSig);

  onProgress({ stage: "confirming", detail: "2/2 - Confirming deposit on chain…" });
  try {
    await confirmViaHttp(connection, depositSig, lastValidBlockHeight);
    log("deposit confirmed:", depositSig);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    warn("deposit confirm error:", msg);
    if (!/confirmation timed out|already been processed/i.test(msg)) throw e;
    log("polling contribution PDA…");
    let landed: unknown = null;
    for (let i = 0; i < 20 && !landed; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      landed = await connection.getAccountInfo(contribution);
      log(`  poll ${i + 1}: contribution PDA exists=${landed != null}`);
    }
    if (!landed) {
      throw new Error(
        `Deposit tx didn't land but the swap did - your ${target.symbol} is in your wallet.\n\n` +
        `Tx: ${depositSig}\nCheck: https://solscan.io/tx/${depositSig}`,
      );
    }
  }

  onProgress({ stage: "done", detail: "Deposited as " + target.symbol });
  return { signature: depositSig, outAmount: acquired };
}

/** Direct-transfer fallback for USD-pegged tokens with no Jupiter route
 * (e.g. PUSD until the team seeds AMM liquidity). Three instructions in
 * one user-signed legacy tx. Unchanged from before. */
async function runDirectTransferDeposit(
  params: AssetDepositParams,
): Promise<{ signature: string; outAmount: bigint }> {
  const { program, connection, wallet, vault, amountUsdc, target, memo = "", onProgress } = params;
  const { publicKey, signTransaction } = wallet;
  if (!publicKey || !signTransaction) {
    throw new Error("Connect a wallet that supports signTransaction.");
  }

  const targetMint = new PublicKey(target.mint);
  const targetProg = tokenProgramFor(target);
  const usdcMicros = BigInt(Math.round(amountUsdc * 1_000_000));
  const transferAmount = BigInt(Math.round(amountUsdc * 10 ** target.decimals));

  const userTargetAta = getAssociatedTokenAddressSync(targetMint, publicKey, false, targetProg);
  const vaultTargetAta = getAssociatedTokenAddressSync(targetMint, vault, true, targetProg);

  onProgress({ stage: "preparing", detail: "Checking your " + target.symbol + " balance…" });
  const userAtaInfo = await connection.getAccountInfo(userTargetAta);
  if (!userAtaInfo) {
    throw new Error(
      `You don't hold ${target.symbol}. ${target.symbol} is mint/redeemed via the issuer (palmusd.com for PUSD), not bought on a DEX. Acquire some first, then come back.`,
    );
  }
  if (userAtaInfo.data.length >= 72) {
    const bal = userAtaInfo.data.readBigUInt64LE(64);
    if (bal < transferAmount) {
      const have = Number(bal) / 10 ** target.decimals;
      throw new Error(
        `Not enough ${target.symbol}: you hold ${have.toFixed(2)}, trying to deposit ${amountUsdc}.`,
      );
    }
  }

  const [member] = memberPda(vault, publicKey);
  const { bn: nonceBn, big: nonceBig } = randomNonce();
  const [contribution] = contributionPda(vault, publicKey, nonceBig);
  const recordIx = await program.methods
    .recordContribution(new BN(usdcMicros.toString()), memo.trim().slice(0, 140), nonceBn)
    .accounts({
      contributor: publicKey,
      vault,
      member,
      contribution,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  const transferIx: TransactionInstruction =
    target.tokenProgram === "2022"
      ? await createTransferCheckedWithTransferHookInstruction(
          connection, userTargetAta, targetMint, vaultTargetAta, publicKey,
          transferAmount, target.decimals, [], "confirmed", targetProg,
        )
      : createTransferCheckedInstruction(
          userTargetAta, targetMint, vaultTargetAta, publicKey,
          transferAmount, target.decimals, [], targetProg,
        );

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  const tx = new Transaction({ feePayer: publicKey, blockhash, lastValidBlockHeight }).add(
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100_000 }),
    createAssociatedTokenAccountIdempotentInstruction(
      publicKey, vaultTargetAta, vault, targetMint, targetProg,
    ),
    transferIx,
    recordIx,
  );

  onProgress({ stage: "signing", detail: "Awaiting signature…" });
  const sig = await signAndSend(wallet, connection, tx);

  onProgress({ stage: "confirming", detail: "Confirming on chain…" });
  try {
    await confirmViaHttp(connection, sig, lastValidBlockHeight);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!/confirmation timed out|already been processed/i.test(msg)) throw e;
    let landed: unknown = null;
    for (let i = 0; i < 15 && !landed; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      landed = await connection.getAccountInfo(contribution);
    }
    if (!landed) throw e;
  }

  onProgress({ stage: "done", detail: `Transferred ${target.symbol} directly.` });
  return { signature: sig, outAmount: transferAmount };
}
