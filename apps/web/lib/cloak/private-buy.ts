/**
 * Private buy flow - shield USDC, then privately swap to a target token
 * (xStock, jitoSOL, KZTE, etc.) via Cloak's Orca-routed swapWithChange.
 *
 * Privacy story (honest version): the on-chain link from the *original
 * source* of your USDC (a CEX paycheck, a DEX trade, an inheritance) to
 * the target-token purchase is broken inside Cloak's pool. Cloak's relay
 * submits the swap, so the swap-execution tx itself is unsigned by the
 * user's main wallet. The output token still lands in the user's ATA
 * (Cloak's relay validates on-curve recipients - PDAs are rejected, which
 * is why this isn't part of the vault deposit flow).
 *
 * Robustness - every fix we hard-won during the deposit flow applies here
 * too:
 *   - `purgeCloakLocalState` at the start of every run wipes pending state
 *     so a half-completed prior run can't poison fresh state.
 *   - Pre-built ALT covers the static accounts (pool PDAs, ATAs, sysvars,
 *     program IDs) so SPL transactions don't blow the 1232-byte legacy
 *     limit. Without it: silent failure → stale on-chain state → 0x1020
 *     DoubleSpend on the next run.
 *   - `useUniqueNullifiers: true` - timestamp-salted padding nullifiers,
 *     remedy for the documented 0x1020 DoubleSpend across runs.
 *   - `enforceViewingKeyRegistration: false` - skip the viewing-key
 *     challenge dance; we don't need scanner compliance for a one-shot buy.
 *   - The shielded note ref we feed to swapWithChange is
 *     `shieldResult.outputUtxos[0]` (SDK-enriched with index AND
 *     siblingCommitment) - manually setting only `.index` left
 *     siblingCommitment undefined and corrupted the merkle proof.
 *   - We pass `cachedMerkleTree: shieldResult.merkleTree` so the swap
 *     proves against the same root the shield landed on (no relay race).
 */

import {
  AddressLookupTableProgram,
  type AddressLookupTableAccount,
  ComputeBudgetProgram,
  type Connection,
  PublicKey,
  SystemProgram,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  SYSVAR_SLOT_HASHES_PUBKEY,
  Transaction,
  type VersionedTransaction,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import type { WalletContextState } from "@solana/wallet-adapter-react";

import { confirmViaHttp } from "@/lib/anchor/confirm";
import { signAndSend } from "@/lib/anchor/send";
import { USDC, type Token } from "@/lib/tokens";

/**
 * Wrap a Connection so that `confirmTransaction` calls go through our HTTP
 * polling helper instead of WebSocket subscriptions.
 *
 * The Cloak SDK's `transact()` and `swapWithChange()` paths internally
 * call `connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight })`
 * which web3.js implements as a WebSocket subscription. Our `Connection`
 * is configured to route HTTP through `/api/rpc` (server-side proxy that
 * keeps the Helius key off the browser bundle), but web3.js auto-derives
 * the WS endpoint as `wss://<our-origin>/api/rpc` - same path, no
 * upgrade support - so the subscription reconnects forever and the SDK's
 * confirm waits indefinitely. That's the "Transaction confirmation timed
 * out" you see on every private buy.
 *
 * Setting `NEXT_PUBLIC_RPC_WS_URL` to Helius would fix this but bakes
 * the API key into the JS bundle (anyone with DevTools grabs it). We
 * sidestep both problems by intercepting `confirmTransaction` at the
 * Connection layer and using our `confirmViaHttp` helper instead - pure
 * HTTP polling against the same `/api/rpc` server-proxied endpoint.
 *
 * Returns a Proxy so the SDK still sees a real `Connection` for every
 * other method (sendRawTransaction, getLatestBlockhash, simulateTx, etc).
 */
function makeHttpConfirmConnection(conn: Connection): Connection {
  return new Proxy(conn, {
    get(target, prop, receiver) {
      if (prop === "confirmTransaction") {
        return async (
          strategy:
            | string
            | { signature: string; blockhash: string; lastValidBlockHeight: number },
          _commitment?: unknown,
        ) => {
          const sig = typeof strategy === "string" ? strategy : strategy.signature;
          const lvbh =
            typeof strategy === "string"
              ? Number.MAX_SAFE_INTEGER
              : strategy.lastValidBlockHeight;
          // confirmViaHttp throws on tx-failed / expired / timeout. The
          // SDK's outer try/catch propagates those into its retry logic.
          await confirmViaHttp(target, sig, lvbh, { timeoutMs: 90_000 });
          return { context: { slot: 0 }, value: { err: null } };
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}

/** Resolve the SPL token program that owns this mint. xStocks (Backed
 * Finance) are on Token-2022 for compliance transfer hooks; USDC and
 * jitoSOL are on legacy. ATA-create with the wrong program ID trips a
 * `IncorrectProgramId` inside the ATA program. */
function tokenProgramFor(t: Token | undefined): PublicKey {
  return t?.tokenProgram === "2022" ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
}

import { CLOAK_NETWORK, CLOAK_RELAY_URL, loadCloak } from "./sdk";

export type PrivateBuyStage =
  | "idle"
  | "preparing"
  | "shielding"
  | "proving"
  | "swapping"
  | "done"
  | "error";

export type PrivateBuyProgress = {
  stage: PrivateBuyStage;
  /** Only meaningful while `stage === "proving"`. 0..100. */
  proofPercent?: number;
  /** Free-form status from the SDK. */
  detail?: string;
};

export type PrivateBuyParams = {
  connection: Connection;
  wallet: WalletContextState;
  /** Target token to buy (any SPL: xStock, jitoSOL, etc.). */
  outputToken: Token;
  /** Amount of USDC in human units (e.g. 100 for $100). */
  amountUsdc: number;
  /** Slippage tolerance in basis points (default 100 = 1%). */
  slippageBps?: number;
  /** Progress callback - called many times during the flow. */
  onProgress: (p: PrivateBuyProgress) => void;
};

/** Wipe every key the Cloak SDK or our local-notes module write to. */
function purgeCloakLocalState(walletBase58: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem("cloak_pending_deposits");
    window.localStorage.removeItem("cloak_pending_withdrawals");
    window.localStorage.removeItem(`cloak.notes.${walletBase58}`);
    const toDelete: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (!k) continue;
      if (k === "cloak_pending_deposits" || k === "cloak_pending_withdrawals") continue;
      if (k.startsWith("cloak_") || k.startsWith("cloak.")) toDelete.push(k);
    }
    for (const k of toDelete) window.localStorage.removeItem(k);
  } catch {
    /* localStorage can throw in private mode / quota - not fatal */
  }
}

/** Build an ALT covering all static accounts the shield + swap touches.
 *
 * For the swap leg, we additionally pack the output token mint and the
 * recipient's output-mint ATA so the v0 tx fits in the 1232-byte ceiling. */
async function buildAlt(
  connection: Connection,
  wallet: WalletContextState,
  payer: PublicKey,
  cloakProgramId: PublicKey,
  inputMint: PublicKey,
  outputMint: PublicKey,
  inputTokenProg: PublicKey,
  outputTokenProg: PublicKey,
  poolPdas: { pool: PublicKey; merkleTree: PublicKey; vaultAuthority: PublicKey; treasury: PublicKey },
): Promise<AddressLookupTableAccount> {
  const userInputAta = getAssociatedTokenAddressSync(inputMint, payer, false, inputTokenProg);
  const userOutputAta = getAssociatedTokenAddressSync(outputMint, payer, false, outputTokenProg);
  const poolVaultInputAta = getAssociatedTokenAddressSync(
    inputMint,
    poolPdas.vaultAuthority,
    true,
    inputTokenProg,
  );

  const altAddresses: PublicKey[] = [
    SystemProgram.programId,
    SYSVAR_SLOT_HASHES_PUBKEY,
    SYSVAR_INSTRUCTIONS_PUBKEY,
    ComputeBudgetProgram.programId,
    cloakProgramId,
    poolPdas.pool,
    poolPdas.merkleTree,
    poolPdas.vaultAuthority,
    poolPdas.treasury,
    poolVaultInputAta,
    userInputAta,
    userOutputAta,
    inputTokenProg,
    outputTokenProg,
    inputMint,
    outputMint,
  ];

  const MAX_ATTEMPTS = 3;
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const recentSlot = await connection.getSlot("finalized");
      const [createIx, altAddress] = AddressLookupTableProgram.createLookupTable({
        authority: payer,
        payer,
        recentSlot,
      });
      const extendIx = AddressLookupTableProgram.extendLookupTable({
        payer,
        authority: payer,
        lookupTable: altAddress,
        addresses: altAddresses,
      });

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
      const tx = new Transaction({
        feePayer: payer,
        blockhash,
        lastValidBlockHeight,
      }).add(
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 }),
        createIx,
        extendIx,
      );
      const sig = await signAndSend(wallet, connection, tx);
      await confirmViaHttp(connection, sig, lastValidBlockHeight);

      for (let i = 0; i < 30; i++) {
        const result = await connection.getAddressLookupTable(altAddress, { commitment: "confirmed" });
        const v = result.value;
        if (v && v.isActive()) return v;
        await new Promise((r) => setTimeout(r, 500));
      }
      throw new Error("ALT was created but never activated within 15s.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      lastErr = e;
      if (/not a recent slot|recent.*slot/i.test(msg) && attempt < MAX_ATTEMPTS - 1) {
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      throw e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("ALT creation failed.");
}

/** Fetch a Jupiter quote for input → output. We use Jupiter for the quote
 * so the user sees a realistic outAmount before signing; Cloak's relay
 * will execute via Orca (different routing) so the actual outAmount may
 * vary - the slippageBps cushion catches that.
 *
 * Endpoint: `lite-api.jup.ag/swap/v1/quote` is Jupiter's free public quote
 * service (the older `quote-api.jup.ag` is retired - DNS doesn't resolve).
 * For paid SLA you'd swap to `api.jup.ag` with an API key. */
const JUPITER_QUOTE_URL = "https://lite-api.jup.ag/swap/v1/quote";

export async function fetchJupiterQuote(
  inputMint: string,
  outputMint: string,
  amountInBase: bigint,
  slippageBps: number,
): Promise<{ outAmount: bigint; minOutputAmount: bigint }> {
  const url = new URL(JUPITER_QUOTE_URL);
  url.searchParams.set("inputMint", inputMint);
  url.searchParams.set("outputMint", outputMint);
  url.searchParams.set("amount", amountInBase.toString());
  url.searchParams.set("slippageBps", slippageBps.toString());

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`Jupiter quote failed: ${res.status} ${await res.text()}`);
  }
  const j = (await res.json()) as {
    outAmount?: string;
    otherAmountThreshold?: string;
    error?: string;
    errorMessage?: string;
  };
  if (j.error || j.errorMessage) {
    throw new Error(j.errorMessage || j.error || "Jupiter quote returned an error.");
  }
  if (!j.outAmount) throw new Error("Jupiter quote missing outAmount.");
  const outAmount = BigInt(j.outAmount);
  // Jupiter's `otherAmountThreshold` is the slippage-adjusted floor for
  // ExactIn. Use it directly when present; otherwise compute from outAmount.
  const minOutputAmount = j.otherAmountThreshold
    ? BigInt(j.otherAmountThreshold)
    : (outAmount * BigInt(10_000 - slippageBps)) / 10_000n;
  return { outAmount, minOutputAmount };
}

export async function runPrivateBuy(
  params: PrivateBuyParams,
): Promise<{ shieldSignature: string; swapSignature: string; outAmount: bigint }> {
  const { connection, wallet, outputToken, amountUsdc, onProgress } = params;
  const slippageBps = params.slippageBps ?? 100;
  const { publicKey, signTransaction, signMessage } = wallet;
  if (!publicKey || !signTransaction) {
    throw new Error("Connect a wallet that supports signTransaction.");
  }

  const cloak = await loadCloak();
  purgeCloakLocalState(publicKey.toBase58());

  const usdcMint = new PublicKey(USDC.mint);
  const targetMint = new PublicKey(outputToken.mint);
  const targetProg = tokenProgramFor(outputToken);
  const amountMicros = BigInt(Math.round(amountUsdc * 1_000_000));
  const recipientAta = getAssociatedTokenAddressSync(targetMint, publicKey, false, targetProg);

  // Quote first - gives us minOutputAmount and lets the UI display what
  // the user will receive before they commit.
  onProgress({ stage: "preparing", detail: "Quoting via Jupiter…" });
  const quote = await fetchJupiterQuote(USDC.mint, outputToken.mint, amountMicros, slippageBps);

  // Pre-build ALT covering the shield + swap accounts.
  onProgress({ stage: "preparing", detail: "Building lookup table…" });
  const poolPdas = cloak.getShieldPoolPDAs(cloak.CLOAK_PROGRAM_ID, usdcMint);
  const usdcProg = tokenProgramFor(USDC);
  const alt = await buildAlt(
    connection,
    wallet,
    publicKey,
    cloak.CLOAK_PROGRAM_ID,
    usdcMint,
    targetMint,
    usdcProg,
    targetProg,
    poolPdas,
  );

  // The SDK's defaults - `priorityFee: 10_000` micro-lamports and
  // `computeUnits: 40_000` - are calibrated for an uncongested chain and
  // a tiny ix. Cloak shield is large (full Groth16 verifier on chain) and
  // current mainnet routinely drops 10k-priority txs during demo hours.
  // We bump both, set `skipPreflight: true` to dodge the wallet-broadcast
  // race we've fought elsewhere in this codebase, and cap loaded accounts
  // data so block schedulers prioritize us. These four fields together
  // are the difference between "tx confirmation timed out" and a clean
  // ~5-second land.
  // Wrap the connection so the SDK's internal confirmTransaction calls
  // resolve via HTTP polling instead of hanging on a doomed WS subscription.
  const httpConfirmConnection = makeHttpConfirmConnection(connection);

  // We deliberately let the SDK auto-derive `riskQuoteUrl` from `relayUrl`
  // (i.e. `${CLOAK_RELAY_URL}/range-quote`). Bypassing it via `riskQuoteUrl: ""`
  // is tempting when the relay backend 401s - but the on-chain Cloak
  // program REQUIRES the Ed25519 sanctions-quote ix to precede the
  // transact ix, and that signature has to come from a Range oracle key
  // whitelisted in their program. We don't hold that key. Skipping the
  // fetch just moves the failure from API-level ("Risk quote request
  // failed") to on-chain ("Transaction reached the on-chain program
  // without the required Ed25519 sanctions quote"). Better to fail at
  // the API and surface a clear "Cloak relay infrastructure issue" hint
  // than silently submit a doomed tx.
  const sharedOptions = {
    connection: httpConfirmConnection,
    programId: cloak.CLOAK_PROGRAM_ID,
    relayUrl: CLOAK_RELAY_URL,
    signTransaction: signTransaction as TransactOptionsSignTx,
    signMessage: signMessage as TransactOptionsSignMessage | undefined,
    walletPublicKey: publicKey,
    depositorPublicKey: publicKey,
    enforceViewingKeyRegistration: false,
    useUniqueNullifiers: true,
    addressLookupTableAccounts: [alt],
    priorityFee: 200_000, // µlamports - 20× the SDK default
    computeUnits: 250_000, // shield + verifier needs more than the 40k default
    skipPreflight: true, // wallet may broadcast during sign; preflight here just races us
    loadedAccountsDataSizeLimit: 256 * 1024, // shield pool program is ~104 KB; 256 KB has margin
    onProgress: (status: string) => onProgress({ stage: "shielding", detail: status }),
    onProofProgress: (percent: number) => onProgress({ stage: "proving", proofPercent: percent }),
  };

  // Step 1: shield USDC into Cloak's pool.
  onProgress({ stage: "shielding", detail: "Building shield deposit…" });
  const utxoKeypair = await cloak.generateUtxoKeypair();
  const shieldOutput = await cloak.createUtxo(amountMicros, utxoKeypair, usdcMint);
  const shieldZero = await cloak.createZeroUtxo(usdcMint);

  let shieldResult: Awaited<ReturnType<typeof cloak.transact>>;
  try {
    shieldResult = await cloak.transact(
      {
        inputUtxos: [],
        outputUtxos: [shieldOutput, shieldZero],
        externalAmount: amountMicros,
        depositor: publicKey,
      },
      sharedOptions,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/confirmation timed out|timeout|expired/i.test(msg)) {
      // The wallet signed and the tx may have actually landed - we can
      // detect that by polling the chain merkle tree for the new note's
      // commitment. If it shows up within ~30s the shield is good and we
      // can carry on; otherwise re-throw with a clearer message.
      console.warn("[private-buy] shield confirm timeout, polling merkle tree…");
      onProgress({
        stage: "shielding",
        detail: "Confirm timeout - checking chain for the shield…",
      });
      const expectedCommitment = (shieldOutput as { commitment?: string }).commitment;
      let landed: typeof shieldResult | null = null;
      for (let i = 0; i < 15 && !landed; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        try {
          const verify = await cloak.verifyUtxos(
            [shieldOutput],
            connection,
            cloak.CLOAK_PROGRAM_ID,
          );
          // verifyUtxos reports `unspent` for notes that exist but haven't
          // been nullified - that's exactly what we want for a fresh shield.
          if (verify.unspent.length > 0) {
            console.log("[private-buy] shield landed (commitment found):", expectedCommitment);
            // Reconstruct a usable shieldResult shape from what we know.
            // signature is unknown (we don't have it from the timed-out call),
            // so leave it empty - the swap below uses cachedMerkleTree which
            // we'll refetch via the SDK's chain mode.
            landed = {
              signature: "",
              outputUtxos: [shieldOutput, shieldZero],
              merkleTree: undefined,
            } as unknown as typeof shieldResult;
          }
        } catch (verifyErr) {
          console.warn("[private-buy] verify poll failed:", verifyErr);
        }
      }
      if (!landed) {
        throw new Error(
          "Cloak shield timed out and we couldn't find the note on chain. " +
            "Mainnet may be congested - wait 30 seconds and try again. " +
            "If it persists, click \"Reset Cloak state\" below.",
        );
      }
      shieldResult = landed;
    } else {
      throw e;
    }
  }

  // Use the SDK-enriched ref (has index + siblingCommitment).
  const shielded = shieldResult.outputUtxos[0];

  // Pre-flight: even though we just minted shielded with a fresh keypair,
  // ask the chain whether its nullifier is already registered. Burns 0.5s
  // but saves the user from a 5-second proof run if state is stuck.
  onProgress({ stage: "swapping", detail: "Verifying shielded note…" });
  const verify = await cloak.verifyUtxos([shielded], connection, cloak.CLOAK_PROGRAM_ID);
  if (verify.spent.length > 0) {
    throw new Error(
      "The freshly-shielded note's nullifier is already on chain - stale browser state. " +
        "Refresh the page; if it persists, clear localStorage keys starting with `cloak`.",
    );
  }

  // Step 2: pre-create user's output ATA in a separate user-signed tx.
  // The relay-submitted swap can't carry an ATA-create instruction, and
  // if the recipient ATA doesn't exist when the swap lands, the relay's
  // transfer to it will fail. This is one extra Phantom prompt but it's
  // a one-time cost per (wallet, output token) pair - once the ATA exists
  // future buys of the same token skip this.
  onProgress({ stage: "swapping", detail: "Preparing destination account…" });
  const ataInfo = await connection.getAccountInfo(recipientAta);
  if (!ataInfo) {
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
    const ataTx = new Transaction({ feePayer: publicKey, blockhash, lastValidBlockHeight }).add(
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 }),
      createAssociatedTokenAccountIdempotentInstruction(
        publicKey,
        recipientAta,
        publicKey,
        targetMint,
        targetProg,
      ),
    );
    const ataSig = await signAndSend(wallet, connection, ataTx);
    await confirmViaHttp(connection, ataSig, lastValidBlockHeight);
  }

  // Step 3a: wait for chain merkle tree to catch up to our shielded note.
  // This is the fix for "leaf index X is beyond next_index Y": the relay
  // and the SDK's cached tree know about our shield immediately, but the
  // chain merkle tree only commits the new leaf once the shield tx
  // finalizes - typically 5–15 seconds. If we run swapWithChange before
  // chain catches up, the proof references leaf position X while chain
  // still shows nextIndex < X+1 and the program rejects.
  //
  // We poll the merkle-tree PDA's `nextIndex` (8-byte u64 LE at offset 32
  // of the account data) until it strictly exceeds our note's index.
  // 60-second budget; if we hit it, the relay is genuinely ahead of
  // chain and the user needs to wait it out + retry.
  onProgress({ stage: "swapping", detail: "Waiting for chain to confirm the shield…" });
  const shieldedIndex = (shielded as { index?: number }).index ?? 0;
  const merkleTreePDA = poolPdas.merkleTree;
  let chainCaughtUp = false;
  for (let i = 0; i < 30 && !chainCaughtUp; i++) {
    try {
      const acct = await connection.getAccountInfo(merkleTreePDA, "confirmed");
      if (acct && acct.data.length >= 40) {
        const nextIndex = Number(
          Buffer.from(acct.data.buffer, acct.data.byteOffset, acct.data.byteLength).readBigUInt64LE(32),
        );
        if (i % 3 === 0) {
          console.log(`[private-buy] chain nextIndex=${nextIndex}, our shielded.index=${shieldedIndex}`);
        }
        if (nextIndex > shieldedIndex) {
          chainCaughtUp = true;
          break;
        }
      }
    } catch (e) {
      console.warn("[private-buy] merkle tree read failed:", e);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  if (!chainCaughtUp) {
    throw new Error(
      "Chain didn't catch up to the shielded note within 60 seconds. " +
        "The Cloak relay is ahead of mainnet right now - wait a minute and click \"Reset Cloak state\" below.",
    );
  }

  // Step 3b: swapWithChange - relay-submits the pool→Orca→user-ATA route.
  // We deliberately DON'T pass cachedMerkleTree (which would force the
  // SDK to use the relay's possibly-ahead tree state) and instead set
  // useChainForMerkle: true so the proof is built from on-chain state.
  // The chain tree is now guaranteed to include our note (we just polled
  // and confirmed nextIndex > shieldedIndex above), so this avoids the
  // "leaf beyond next_index" race entirely.
  onProgress({ stage: "swapping", detail: "Routing swap through Orca via relay…" });
  let swapResult;
  try {
    swapResult = await cloak.swapWithChange(
      [shielded],
      amountMicros,
      targetMint,
      recipientAta,
      quote.minOutputAmount,
      { ...sharedOptions, useChainForMerkle: true },
      publicKey,
    );
  } catch (e) {
    const name = (e as { name?: string })?.name ?? "";
    if (name === "UtxoAlreadySpentError") {
      purgeCloakLocalState(publicKey.toBase58());
      throw new Error(
        "Cloak says this shielded note is already spent on chain. " +
          "Local state has been reset - tap Buy privately again and it should go through.",
      );
    }
    throw e;
  }

  onProgress({ stage: "done", detail: "Private buy complete." });
  return {
    shieldSignature: shieldResult.signature,
    swapSignature: swapResult.signature,
    outAmount: quote.outAmount,
  };
}

type TransactOptionsSignTx = <T extends Transaction | VersionedTransaction>(
  t: T,
) => Promise<T>;
type TransactOptionsSignMessage = (m: Uint8Array) => Promise<Uint8Array>;

export { CLOAK_NETWORK };
