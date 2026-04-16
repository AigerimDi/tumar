"use client";

import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import type { Adapter } from "@solana/wallet-adapter-base";
import { useMemo, type ReactNode } from "react";

import { ClientErrorBoundary } from "@/components/client-error-boundary";

import "@solana/wallet-adapter-react-ui/styles.css";

export function Providers({ children }: { children: ReactNode }) {
  // RPC resolution: any explicit NEXT_PUBLIC_RPC_URL wins (set it to a Helius
  // or QuickNode URL in Vercel env for production). Otherwise we route through
  // the same-origin /api/rpc proxy - public mainnet-beta.solana.com blocks
  // browser traffic with 403, and a proxy keeps CORS + rate-limiting off the
  // critical path. The wallet-adapter `Connection` needs an absolute URL, so
  // we resolve it against the current origin on the client.
  const endpoint = useMemo(() => {
    const envUrl = process.env.NEXT_PUBLIC_RPC_URL;
    if (envUrl && envUrl.length > 0) return envUrl;
    if (typeof window !== "undefined") return `${window.location.origin}/api/rpc`;
    // SSR placeholder - never dereferenced, Connection is client-only inside
    // ConnectionProvider but React needs a stable string for the first render.
    return "http://localhost/api/rpc";
  }, []);

  // Phantom, Solflare, Backpack, and everything else we care about register
  // themselves via the Solana Wallet Standard (post-@solana/wallet-adapter-base
  // 0.26). Passing the legacy PhantomWalletAdapter / SolflareWalletAdapter here
  // produces "already registered as a Standard Wallet" console spam and, on
  // some browsers, double-init issues. Keeping this empty lets Wallet Standard
  // auto-discover everything.
  const wallets = useMemo<Adapter[]>(() => [], []);

  // @solana/web3.js's Connection auto-derives a WebSocket URL by swapping
  // http(s)→ws(s). Against our /api/rpc proxy (HTTP POSTs only) that resolves
  // to wss://<our origin>/api/rpc which doesn't speak the upgrade and the
  // subscription client reconnects forever, spamming the console. Worse -
  // the Cloak SDK does subscribe to confirmations during shield/withdraw,
  // so without a working WS its proof step waits and times out.
  //
  // Fix: point wsEndpoint straight at Helius. NEXT_PUBLIC_RPC_WS_URL is
  // public - it does expose the Helius key to the browser bundle, which we
  // accept for a hackathon demo. For production, you'd want a same-origin
  // WS proxy (Vercel Edge or a separate node service) that upgrades.
  const wsEndpoint = useMemo(() => {
    const explicit = process.env.NEXT_PUBLIC_RPC_WS_URL;
    if (explicit && explicit.length > 0) return explicit;
    return undefined;
  }, []);
  const connectionConfig = useMemo(
    () => ({
      commitment: "confirmed" as const,
      disableRetryOnRateLimit: false,
      wsEndpoint,
    }),
    [wsEndpoint],
  );

  return (
    <ClientErrorBoundary>
      <ConnectionProvider endpoint={endpoint} config={connectionConfig}>
        <WalletProvider wallets={wallets} autoConnect>
          <WalletModalProvider>{children}</WalletModalProvider>
        </WalletProvider>
      </ConnectionProvider>
    </ClientErrorBoundary>
  );
}
