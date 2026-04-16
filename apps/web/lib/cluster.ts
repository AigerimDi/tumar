/**
 * Single source of truth for "what cluster are we on?" and helpers that depend
 * on it - primarily Solana Explorer URL construction.
 *
 * Why centralize: `?cluster=devnet` used to be sprinkled across half a dozen
 * components. Flipping to mainnet meant hunting them down one by one, and any
 * miss silently links the user to the wrong chain's explorer. Now everyone
 * imports `explorerTxUrl` / `explorerAddressUrl` and this file decides.
 *
 * The decision reads `NEXT_PUBLIC_RPC_URL` (client) or `SOLANA_RPC_UPSTREAM`
 * (server) and classifies by substring match. Defaults to mainnet - we only
 * drop the `?cluster=...` param on mainnet because Explorer's default cluster
 * is mainnet-beta; any other cluster needs to be explicit.
 */

type Cluster = "mainnet-beta" | "devnet" | "testnet" | "custom";

function resolveRpcUrl(): string | undefined {
  // On the client, Next inlines NEXT_PUBLIC_* env at build time. Server-side
  // we also have SOLANA_RPC_UPSTREAM from the proxy config.
  return process.env.NEXT_PUBLIC_RPC_URL ?? process.env.SOLANA_RPC_UPSTREAM;
}

function classifyCluster(url: string | undefined): Cluster {
  if (!url) return "mainnet-beta";
  if (/devnet/i.test(url)) return "devnet";
  if (/testnet/i.test(url)) return "testnet";
  // Helius and other paid RPCs embed "mainnet" in the hostname; api.mainnet-
  // beta.solana.com matches too. Anything ambiguous we treat as mainnet-beta
  // rather than custom to keep Explorer links unsuffixed.
  if (/mainnet/i.test(url)) return "mainnet-beta";
  return "custom";
}

export const CLUSTER: Cluster = classifyCluster(resolveRpcUrl());

export const IS_MAINNET = CLUSTER === "mainnet-beta";

/** Append `?cluster=foo` only when we need to override Explorer's default. */
function clusterQuery(): string {
  if (IS_MAINNET) return "";
  if (CLUSTER === "custom") return "";
  return `?cluster=${CLUSTER}`;
}

export function explorerTxUrl(signature: string): string {
  return `https://explorer.solana.com/tx/${signature}${clusterQuery()}`;
}

export function explorerAddressUrl(address: string): string {
  return `https://explorer.solana.com/address/${address}${clusterQuery()}`;
}
