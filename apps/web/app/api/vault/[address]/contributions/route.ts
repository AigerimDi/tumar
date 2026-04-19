/**
 * Contribution history for a single vault.
 *
 * Same trick as /api/stats: we bypass Anchor and decode Contribution PDAs
 * by hand. Anchor's `.all(filters)` would work, but it requires a wallet
 * provider on the server for no reason.
 *
 * Contribution layout (from IDL):
 *   [0..8]   = discriminator [182, 187, 14, 111, 72, 167, 242, 212]
 *   [8..40]  = vault pubkey        ← we memcmp-filter on this
 *   [40..72] = contributor pubkey
 *   [72..80] = amount u64 LE (micro-USDC)
 *   [80..88] = timestamp i64 LE
 *   [88..92] = memo len (u32 LE)
 *   [92..92+ml] = memo bytes
 *   [92+ml]  = bump (unused)
 *
 * The signature isn't stored on the account itself - it's the tx that
 * *created* the account. We resolve it via `getSignaturesForAddress` on
 * each PDA. For a demo-scale vault (< 100 contribs) that's fine; at
 * scale we'd maintain a Helius webhook index instead.
 */

import { Connection, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";

export const runtime = "nodejs";
export const revalidate = 10;

const PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_PROGRAM_ID ??
    "HfCmnXggSF2tVQkCrEdPNjUTBYvvC8tgbebXES2sp24Y",
);

const CONTRIB_DISCRIM = Uint8Array.from([182, 187, 14, 111, 72, 167, 242, 212]);

const UPSTREAM =
  process.env.SOLANA_RPC_UPSTREAM ??
  process.env.NEXT_PUBLIC_RPC_URL ??
  "https://api.mainnet-beta.solana.com";

const USDC_DECIMALS = 6;

type ParsedContribution = {
  pda: string;
  contributor: string;
  amount: number;
  timestamp: number;
  memo: string;
};

function parseContribution(pda: PublicKey, data: Buffer): ParsedContribution | null {
  try {
    for (let i = 0; i < 8; i++) {
      if (data[i] !== CONTRIB_DISCRIM[i]) return null;
    }
    const contributor = new PublicKey(data.subarray(40, 72));
    const amountMicros = data.readBigUInt64LE(72);
    const timestamp = Number(data.readBigInt64LE(80));
    const memoLen = data.readUInt32LE(88);
    if (data.length < 92 + memoLen) return null;
    const memo = data.subarray(92, 92 + memoLen).toString("utf8");

    return {
      pda: pda.toBase58(),
      contributor: contributor.toBase58(),
      amount: Number(amountMicros) / 10 ** USDC_DECIMALS,
      timestamp,
      memo,
    };
  } catch {
    return null;
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ address: string }> },
) {
  const { address } = await params;

  let vaultKey: PublicKey;
  try {
    vaultKey = new PublicKey(address);
  } catch {
    return Response.json({ ok: false, error: "Invalid vault address" }, { status: 400 });
  }

  try {
    const connection = new Connection(UPSTREAM, { commitment: "confirmed" });

    const accounts = await connection.getProgramAccounts(PROGRAM_ID, {
      commitment: "confirmed",
      filters: [
        { memcmp: { offset: 0, bytes: bs58.encode(CONTRIB_DISCRIM) } },
        { memcmp: { offset: 8, bytes: vaultKey.toBase58() } },
      ],
    });

    const parsed: ParsedContribution[] = [];
    for (const { pubkey, account } of accounts) {
      const c = parseContribution(pubkey, account.data);
      if (c) parsed.push(c);
    }

    // Resolve the creation signature for each PDA. One call per account - fine
    // for demo scale. The signature is what users click through to Explorer.
    const withSig = await Promise.all(
      parsed.map(async (c) => {
        try {
          const sigs = await connection.getSignaturesForAddress(
            new PublicKey(c.pda),
            { limit: 1 },
          );
          return { ...c, signature: sigs[0]?.signature ?? c.pda };
        } catch {
          return { ...c, signature: c.pda };
        }
      }),
    );

    // Newest first.
    withSig.sort((a, b) => b.timestamp - a.timestamp);

    return new Response(
      JSON.stringify({
        ok: true,
        count: withSig.length,
        contributions: withSig,
      }),
      {
        headers: {
          "content-type": "application/json",
          "cache-control": "s-maxage=10, stale-while-revalidate=60",
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
