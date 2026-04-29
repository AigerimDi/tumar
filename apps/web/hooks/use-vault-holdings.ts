"use client";

import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { useEffect, useMemo, useState } from "react";

import { findToken, type Token } from "@/lib/tokens";
import { fetchPrices } from "@/lib/prices";

/**
 * Read the vault's actual on-chain holdings, combine with live prices, and
 * return a USD-denominated breakdown.
 *
 * The vault page used to show `target_pct × usdc_deposited` for each row -
 * a "what the vault would hold if rebalanced perfectly" view. That hides
 * what's actually on chain: a vault funded by per-asset deposits ends up
 * holding NVDAx in its NVDAx ATA, not phantom equal slices of every target
 * asset. This hook reads the truth.
 *
 * Strategy:
 *   1. `getTokenAccountsByOwner(vault, …)` for both Token program IDs in
 *      parallel. Returns every token account the vault owns - including
 *      USDC (regular deposits), per-asset deposits, and anything left over
 *      after a future rebalance. Avoids the "I only see target-allocation
 *      tokens" trap.
 *   2. Parse account data: 32-byte mint at offset 0, 8-byte u64 amount at
 *      offset 64. Token-2022 extensions sit AFTER the legacy 165-byte base,
 *      so the same offsets work for both programs.
 *   3. One Jupiter Price v3 call (proxied via `/api/prices`) for USD
 *      conversion. Pegged stables fall back to $1 if the feed has no entry.
 *   4. Re-poll every 15 s so a fresh deposit shows up without a refresh.
 */

export type VaultHolding = {
  token: Token;
  /** Raw token-units (× 10^decimals). */
  rawBalance: bigint;
  /** Human-readable token amount. */
  amount: number;
  /** Spot USD price (NaN if no price feed for this mint). */
  priceUsd: number;
  /** USD value at spot. NaN if price unavailable. */
  valueUsd: number;
};

function readU64LE(data: Uint8Array, offset: number): bigint {
  if (data.length < offset + 8) return 0n;
  return Buffer.from(data.buffer, data.byteOffset, data.byteLength).readBigUInt64LE(offset);
}

function readMint(data: Uint8Array): string {
  if (data.length < 32) return "";
  return new PublicKey(data.subarray(0, 32)).toBase58();
}

export function useVaultHoldings(vaultAddress: string | undefined) {
  const { connection } = useConnection();
  const [holdings, setHoldings] = useState<VaultHolding[] | null>(null);
  const [loading, setLoading] = useState(false);

  // Stable identity for the polling loop - we only care that the address
  // hasn't changed, not whether the vault object got re-fetched.
  const addr = vaultAddress;

  useEffect(() => {
    if (!addr) {
      setHoldings(null);
      return;
    }

    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        const vault = new PublicKey(addr);

        // Both Token programs - xStocks + PUSD live on Token-2022, USDC +
        // jitoSOL on legacy. Fetching both in parallel covers everything.
        const [legacy, t22] = await Promise.all([
          connection.getTokenAccountsByOwner(
            vault,
            { programId: TOKEN_PROGRAM_ID },
            "confirmed",
          ),
          connection.getTokenAccountsByOwner(
            vault,
            { programId: TOKEN_2022_PROGRAM_ID },
            "confirmed",
          ),
        ]);

        const allAccounts = [...legacy.value, ...t22.value];

        // Parse every account into { mint, amount }, drop unknowns + zeros.
        const parsed: { token: Token; rawBalance: bigint }[] = [];
        for (const a of allAccounts) {
          const data = a.account.data as Uint8Array;
          const mint = readMint(data);
          const amount = readU64LE(data, 64);
          if (amount === 0n) continue;
          const token = findToken(mint);
          if (!token) continue; // unknown mint - vault registry doesn't know it
          parsed.push({ token, rawBalance: amount });
        }

        if (parsed.length === 0) {
          if (!cancelled) setHoldings([]);
          return;
        }

        // One price call for everything we found.
        const priceMap = await fetchPrices(parsed.map((p) => p.token.mint));

        const result: VaultHolding[] = parsed.map(({ token, rawBalance }) => {
          const amount = Number(rawBalance) / 10 ** token.decimals;
          // Pegged stables fall back to $1 - Jupiter Price doesn't always
          // have a feed for fresh stablecoin mints (PUSD, KZTE placeholder).
          const priceFromFeed = priceMap[token.mint]?.usd;
          const priceUsd = Number.isFinite(priceFromFeed)
            ? priceFromFeed
            : token.pegged
            ? 1
            : NaN;
          const valueUsd = Number.isFinite(priceUsd) ? amount * priceUsd : NaN;
          return { token, rawBalance, amount, priceUsd, valueUsd };
        });

        if (!cancelled) setHoldings(result);
      } catch {
        // Keep last-known list on transient errors so the UI doesn't flicker.
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    const id = setInterval(load, 15_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [addr, connection]);

  return useMemo(() => ({ holdings, loading }), [holdings, loading]);
}
