/**
 * Protocol-level stats for the terminal header.
 *
 * Why server-side: we want `Vaults / TVL` to come from the chain, not the
 * wallet. The terminal is unauthenticated - no connected Phantom - so we
 * can't use wallet-adapter's Connection. We hit the same mainnet RPC
 * upstream the /api/rpc proxy uses, so there's one source of truth.
 *
 * We bypass Anchor entirely and decode the Vault account by hand. The layout
 * we care about is:
 *   [0..8]   = account discriminator
 *   [8..40]  = creator pubkey (unused here)
 *   [40..44] = name len (u32 LE)
 *   [44..44+nl] = name bytes (unused here)
 *   [44+nl..48+nl] = allocation len (u32 LE)
 *   (each AssetAllocation = 34 bytes: pubkey(32) + bps(u16))
 *   [48+nl + 34*al .. 56+nl + 34*al] = usdc_deposited (u64 LE)   ← what we want
 *
 * Cached 30s edge-side so the terminal doesn't thunder the RPC when visitors
 * land on it.
 */

import { Connection, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";

export const runtime = "nodejs";
export const revalidate = 30;

const PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_PROGRAM_ID ??
    "HfCmnXggSF2tVQkCrEdPNjUTBYvvC8tgbebXES2sp24Y",
);

// anchor-generated Vault discriminator (see apps/web/lib/anchor/idl.ts)
const VAULT_DISCRIM = Uint8Array.from([211, 8, 232, 43, 2, 152, 117, 119]);

const UPSTREAM =
  process.env.SOLANA_RPC_UPSTREAM ??
  process.env.NEXT_PUBLIC_RPC_URL ??
  "https://api.mainnet-beta.solana.com";

// USDC on mainnet has 6 decimals; Backed xStocks use 8. We expose `usdcDeposited`
// in micro-USDC (1e-6), so dividing by 1e6 gives dollars.
const USDC_DECIMALS = 6;

function parseUsdcDeposited(data: Buffer): bigint | null {
  try {
    // sanity: discriminator must match (RPC filter should guarantee this, but
    // we're parsing untrusted bytes)
    for (let i = 0; i < 8; i++) {
      if (data[i] !== VAULT_DISCRIM[i]) return null;
    }
    // skip discrim(8) + creator(32) = 40
    const nameLen = data.readUInt32LE(40);
    const allocStart = 44 + nameLen;
    const allocLen = data.readUInt32LE(allocStart);
    const usdcOffset = allocStart + 4 + allocLen * 34;
    if (data.length < usdcOffset + 8) return null;
    return data.readBigUInt64LE(usdcOffset);
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const connection = new Connection(UPSTREAM, { commitment: "confirmed" });
    const accounts = await connection.getProgramAccounts(PROGRAM_ID, {
      commitment: "confirmed",
      filters: [
        {
          memcmp: {
            offset: 0,
            bytes: bs58.encode(VAULT_DISCRIM),
          },
        },
      ],
    });

    let tvlMicros = 0n;
    for (const { account } of accounts) {
      const v = parseUsdcDeposited(account.data);
      if (v !== null) tvlMicros += v;
    }

    const tvlUsd = Number(tvlMicros) / 10 ** USDC_DECIMALS;

    return new Response(
      JSON.stringify({
        ok: true,
        vaults: accounts.length,
        tvlUsd,
        tvlMicros: tvlMicros.toString(),
        updatedAt: new Date().toISOString(),
        cluster: /devnet/i.test(UPSTREAM) ? "devnet" : "mainnet-beta",
      }),
      {
        headers: {
          "content-type": "application/json",
          // Let Vercel's edge cache serve stale-while-revalidate; clients get
          // fresh-ish data without hammering Helius.
          "cache-control": "s-maxage=30, stale-while-revalidate=120",
        },
      },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      }),
      {
        status: 502,
        headers: {
          "content-type": "application/json",
          "cache-control": "no-store",
        },
      },
    );
  }
}
