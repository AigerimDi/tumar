import type { Connection } from "@solana/web3.js";

/**
 * Poll-based confirmation that avoids WebSocket subscriptions.
 *
 * Why: our client Connection is pointed at the same-origin `/api/rpc` proxy
 * so we don't leak the Helius API key. That proxy handles HTTP POSTs only -
 * no WebSocket upgrades. But @solana/web3.js's `Connection.confirmTransaction`
 * (and anything that wraps it, like Anchor's `.rpc()`) opens an `onSignature`
 * subscription under the hood, and if the `wsEndpoint` fails, the subscription
 * client retries *forever*. That's the reconnect-loop users were seeing on
 * /create and /join before this helper existed.
 *
 * `getSignatureStatuses` is purely HTTP. We poll it every 600ms until the
 * signature is confirmed (or the last-valid blockhash expires), then return.
 *
 * @throws if the tx doesn't confirm before the blockhash expires, or the
 *         cluster reports an err on the signature.
 */
export async function confirmViaHttp(
  connection: Connection,
  signature: string,
  lastValidBlockHeight: number,
  opts: { intervalMs?: number; timeoutMs?: number } = {},
): Promise<void> {
  const interval = opts.intervalMs ?? 600;
  const hardTimeout = opts.timeoutMs ?? 90_000;
  const start = Date.now();

  while (true) {
    if (Date.now() - start > hardTimeout) {
      throw new Error("Transaction confirmation timed out");
    }

    const { value } = await connection.getSignatureStatuses([signature], {
      searchTransactionHistory: false,
    });
    const status = value[0];

    if (status) {
      if (status.err) {
        throw new Error(
          `Transaction failed: ${JSON.stringify(status.err)} (${signature})`,
        );
      }
      if (
        status.confirmationStatus === "confirmed" ||
        status.confirmationStatus === "finalized"
      ) {
        return;
      }
    }

    // Give up early if the blockhash has definitely expired - the tx can't
    // land anymore, and polling won't help.
    try {
      const tip = await connection.getBlockHeight("confirmed");
      if (tip > lastValidBlockHeight + 5) {
        throw new Error(
          `Transaction expired before confirmation (${signature})`,
        );
      }
    } catch {
      /* transient rpc blip - keep polling */
    }

    await new Promise((r) => setTimeout(r, interval));
  }
}
