"use client";

/**
 * Claim devnet test USDC.
 *
 * Only renders when IS_DEVNET_USDC is true - i.e. we've pointed NEXT_PUBLIC_USDC_MINT
 * at a mock mint whose authority the server holds. On mainnet this is a no-op.
 *
 * Hits POST /api/faucet/usdc with the connected wallet's pubkey; the server
 * mints 1000 USDC to the wallet's ATA (creating it if needed) and confirms
 * before responding. ~12s end-to-end on devnet.
 */

import { useWallet } from "@solana/wallet-adapter-react";
import { useState } from "react";

import { IS_DEVNET_USDC } from "@/lib/tokens";

import { Button } from "./ui/button";

type Props = {
  /** Called after a successful claim - parent can refresh balances, clear errors, etc. */
  onClaimed?: () => void;
  /** Show a subtler "secondary" style inline in an error panel vs. primary standalone. */
  variant?: "primary" | "secondary";
};

export function UsdcFaucetButton({ onClaimed, variant = "primary" }: Props) {
  const { publicKey } = useWallet();
  const [claiming, setClaiming] = useState(false);
  const [claimed, setClaimed] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!IS_DEVNET_USDC) return null;
  if (!publicKey) return null;

  async function claim() {
    if (!publicKey) return;
    setClaiming(true);
    setError(null);
    try {
      const resp = await fetch("/api/faucet/usdc", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ account: publicKey.toBase58() }),
      });
      const body = await resp.json();
      if (!resp.ok) throw new Error(body?.error ?? "Faucet failed");
      setClaimed(body.signature);
      onClaimed?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Faucet failed");
    } finally {
      setClaiming(false);
    }
  }

  if (claimed) {
    return (
      <div className="flex flex-wrap items-center gap-3 text-xs text-[color:var(--color-up)]">
        <span>✓ 1,000 test USDC minted to your wallet.</span>
        <a
          href={`https://explorer.solana.com/tx/${claimed}?cluster=devnet`}
          target="_blank"
          rel="noreferrer"
          className="text-gold-300 hover:text-gold-200"
        >
          View on Explorer ↗
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Button
        onClick={claim}
        disabled={claiming}
        variant={variant === "secondary" ? "secondary" : undefined}
        size={variant === "secondary" ? "sm" : undefined}
      >
        {claiming ? "Minting…" : "Claim 1,000 test USDC"}
      </Button>
      {error && (
        <div className="text-xs text-[color:var(--color-down)]">{error}</div>
      )}
    </div>
  );
}
