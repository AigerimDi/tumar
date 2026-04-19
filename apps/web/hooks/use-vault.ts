"use client";

import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { useEffect, useState } from "react";

import { useTumarProgram } from "@/lib/anchor/program";

/**
 * Client-side reader for a Vault account. Returns null while loading, or
 * a shaped object that mirrors the Anchor account layout.
 */
export type VaultView = {
  address: string;
  creator: string;
  name: string;
  allocation: { mint: string; bps: number }[];
  usdcDeposited: number;
  memberCount: number;
  createdAt: number;
};

export function useVault(addressBase58: string | undefined) {
  const program = useTumarProgram();
  const { connection } = useConnection();
  const [data, setData] = useState<VaultView | null | undefined>(undefined);

  useEffect(() => {
    if (!program || !addressBase58) return;
    let cancelled = false;
    (async () => {
      try {
        const addr = new PublicKey(addressBase58);
        const acct: any = await (program.account as any).vault.fetch(addr);
        if (cancelled) return;
        setData({
          address: addr.toBase58(),
          creator: acct.creator.toBase58(),
          name: acct.name as string,
          allocation: (acct.allocation as any[]).map((a) => ({
            mint: a.mint.toBase58(),
            bps: a.bps as number,
          })),
          usdcDeposited: Number(acct.usdcDeposited) / 1_000_000,
          memberCount: acct.memberCount as number,
          createdAt: Number(acct.createdAt),
        });
      } catch {
        if (!cancelled) setData(null);
      }
    })();
    return () => { cancelled = true; };
  }, [program, addressBase58, connection]);

  return data;
}
