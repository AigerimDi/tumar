/**
 * Sign in the wallet, broadcast via our connection - robust against wallets
 * that broadcast during `signTransaction`.
 *
 * ### Why not wallet-adapter's `sendTransaction`?
 *
 * It calls the Wallet Standard `signAndSendTransaction` feature, which asks
 * the wallet extension to both sign *and* broadcast. Two problems:
 *
 *   1. The wallet picks the cluster from `connection.rpcEndpoint`. Ours is
 *      `/api/rpc` (same-origin proxy). Wallet-adapter can't classify that
 *      URL reliably and may route to a different cluster than we intend.
 *   2. Any RPC failure inside the wallet surfaces with no `.logs`, no
 *      `.cause` - just "Unexpected error". Impossible to debug.
 *
 * ### Why we still can't just call `signTransaction` + `sendRawTransaction`
 *
 * Phantom (and most Wallet Standard wallets) implement the "pure sign"
 * `signTransaction` feature as an alias for `signAndSendTransaction` under
 * the hood - they broadcast during the sign flow, even though the adapter
 * API says it's pure signing. When that happens, our own
 * `sendRawTransaction` call races the wallet's; the loser hits the cluster
 * dedup layer and gets back "This transaction has already been processed"
 * with an empty logs array. That's not a real error, but it looks like one.
 *
 * ### What we do instead
 *
 * 1. Sign the tx.
 * 2. Extract the signature up front - it's deterministic from the signed
 *    bytes, so we have it whether or not the wallet or the cluster has seen
 *    it yet.
 * 3. Broadcast with `skipPreflight: true`. The wallet already simulated
 *    during its confirm dialog; preflight here mostly surfaces the race.
 * 4. If `sendRawTransaction` fails, return the extracted signature anyway.
 *    The caller will run `confirmViaHttp`, which is the ground truth: if
 *    the tx actually landed (via the wallet's broadcast), polling finds it;
 *    if it didn't, polling times out with a real error.
 */

import bs58 from "bs58";
import {
  type Connection,
  type SendOptions,
  Transaction,
  type VersionedTransaction,
} from "@solana/web3.js";
import type { WalletContextState } from "@solana/wallet-adapter-react";

function primarySignature(
  tx: Transaction | VersionedTransaction,
): string | null {
  // Legacy Transaction: signatures are { signature: Buffer|null, publicKey }[].
  if (tx instanceof Transaction) {
    const sig = tx.signatures[0]?.signature;
    return sig ? bs58.encode(sig) : null;
  }
  // VersionedTransaction: signatures is Uint8Array[], 64-zero-bytes = unsigned.
  const sig = tx.signatures[0];
  if (!sig || sig.every((b) => b === 0)) return null;
  return bs58.encode(sig);
}

export async function signAndSend<T extends Transaction | VersionedTransaction>(
  wallet: Pick<WalletContextState, "signTransaction" | "publicKey">,
  connection: Connection,
  tx: T,
  sendOptions: SendOptions = {},
): Promise<string> {
  if (!wallet.signTransaction) {
    throw new Error(
      "This wallet doesn't expose signTransaction. Reconnect with Phantom, Solflare, or Backpack.",
    );
  }
  if (!wallet.publicKey) {
    throw new Error("Wallet isn't connected.");
  }

  const signed = await wallet.signTransaction(tx);
  const sigFromTx = primarySignature(signed);
  const raw = signed.serialize();

  try {
    const sig = await connection.sendRawTransaction(raw, {
      // See header: skipPreflight avoids the wallet-broadcast race. Ground
      // truth is `confirmViaHttp`, which polls signature status and surfaces
      // real program errors via `status.err`.
      skipPreflight: true,
      maxRetries: 3,
      ...sendOptions,
    });
    // Keep the tx warm in mempool - re-broadcast every 2 seconds for 30s.
    // Mainnet leaders drop low-priority txs aggressively during congestion;
    // a single send + confirmTransaction is enough on a quiet chain but
    // routinely vanishes during demo windows. Re-broadcast doesn't hurt
    // (cluster dedup; the same signed bytes hash to the same sig) and is
    // the difference between "tx never lands" and "tx lands in 8 seconds".
    keepTxAlive(connection, raw, sig).catch(() => {});
    return sig;
  } catch (e) {
    // If we have a signature from the signed bytes, the tx is out there -
    // the wallet may have broadcast it, or our send partially succeeded
    // before the RPC errored. Let the caller confirm via polling. If it
    // never landed, confirmViaHttp will time out with a real error.
    if (sigFromTx) {
      keepTxAlive(connection, raw, sigFromTx).catch(() => {});
      return sigFromTx;
    }
    throw e;
  }
}

/** Background re-broadcast loop. Runs for ~30 seconds, re-sending the
 * signed tx every 2 seconds until it confirms or we give up. The cluster
 * dedups by signature so re-sending is cheap; we just need ONE leader to
 * actually pick it up. */
async function keepTxAlive(
  connection: Connection,
  raw: Uint8Array,
  sig: string,
): Promise<void> {
  const start = Date.now();
  const MAX_MS = 30_000;
  const INTERVAL_MS = 2_000;
  while (Date.now() - start < MAX_MS) {
    await new Promise((r) => setTimeout(r, INTERVAL_MS));
    try {
      const { value } = await connection.getSignatureStatuses([sig]);
      const status = value[0];
      if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") {
        return; // landed, stop re-broadcasting
      }
      if (status?.err) {
        return; // failed on chain, no point re-sending
      }
    } catch {
      /* transient RPC blip - keep trying */
    }
    try {
      await connection.sendRawTransaction(raw, { skipPreflight: true, maxRetries: 0 });
    } catch {
      /* dedup / RPC error - irrelevant, we just need the cluster to see it */
    }
  }
}
