/**
 * Devnet USDC faucet.
 *
 * POST /api/faucet/usdc  { account: <base58 pubkey> }
 *   → { signature, amount: "1000.000000", ata: <pubkey> }
 *
 * Mints 1000 test USDC to the requester's associated token account, creating
 * the ATA if needed. Uses the mint authority we generated in
 * `scripts/setup-devnet-usdc.ts` - that keypair lives in
 * USDC_MINT_AUTHORITY_SECRET_KEY (server-only, never shipped to the client).
 *
 * This only works if NEXT_PUBLIC_USDC_MINT is set to our mock mint. If it
 * points at Circle's real mainnet USDC (or is unset), we refuse - the real
 * mint's authority lives with Circle, not us.
 *
 * Rate limit: one call per IP per 5s in-memory. Good enough to stop a browser
 * loop; not meant to stop a script farm, which shouldn't matter on a test
 * endpoint we'll throw away at mainnet launch.
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import bs58 from "bs58";

import { USDC } from "@/lib/tokens";

const RPC =
  process.env.SOLANA_RPC_UPSTREAM ??
  process.env.NEXT_PUBLIC_RPC_URL ??
  "https://api.devnet.solana.com";

const FAUCET_AMOUNT_UI = 1000; // 1000 test USDC per claim
const CIRCLE_MAINNET_USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

// 5s per-IP cooldown. Module-scoped Map survives warm invocations; cold starts
// reset it, which is fine - a single mint is cheap and the whole endpoint is
// devnet-only.
const lastCall = new Map<string, number>();
const COOLDOWN_MS = 5_000;

function loadAuthority(): Keypair {
  const secret = process.env.USDC_MINT_AUTHORITY_SECRET_KEY;
  if (!secret) {
    throw new Error(
      "USDC_MINT_AUTHORITY_SECRET_KEY not set - run scripts/setup-devnet-usdc.ts first.",
    );
  }
  // Support both bs58 and JSON array formats.
  try {
    return Keypair.fromSecretKey(bs58.decode(secret));
  } catch {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(secret)));
  }
}

export async function POST(req: Request) {
  // Guardrail: never let someone point this at the real USDC mint and think
  // it'd somehow work.
  if (USDC.mint === CIRCLE_MAINNET_USDC) {
    return Response.json(
      {
        error:
          "USDC mint is Circle's mainnet address. Set NEXT_PUBLIC_USDC_MINT to a devnet mock mint first (run scripts/setup-devnet-usdc.ts).",
      },
      { status: 500 },
    );
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";
  const now = Date.now();
  const prev = lastCall.get(ip);
  if (prev && now - prev < COOLDOWN_MS) {
    return Response.json(
      { error: "Slow down - one claim every 5 seconds." },
      { status: 429 },
    );
  }
  lastCall.set(ip, now);

  const body = await req.json().catch(() => null);
  const account = (body as { account?: string } | null)?.account;
  if (!account) {
    return Response.json({ error: "Missing account pubkey" }, { status: 400 });
  }

  let recipient: PublicKey;
  try {
    recipient = new PublicKey(account);
  } catch {
    return Response.json({ error: "Invalid pubkey" }, { status: 400 });
  }

  let authority: Keypair;
  try {
    authority = loadAuthority();
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Authority not loaded" },
      { status: 500 },
    );
  }

  const mint = new PublicKey(USDC.mint);
  const connection = new Connection(RPC, "confirmed");

  const ata = getAssociatedTokenAddressSync(mint, recipient);
  const amount = BigInt(FAUCET_AMOUNT_UI * 10 ** USDC.decimals);

  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");

  const tx = new Transaction({
    feePayer: authority.publicKey,
    blockhash,
    lastValidBlockHeight,
  }).add(
    // Idempotent so a second claim doesn't blow up on an existing ATA.
    createAssociatedTokenAccountIdempotentInstruction(
      authority.publicKey, // payer (authority covers rent)
      ata,
      recipient,
      mint,
    ),
    createMintToInstruction(mint, ata, authority.publicKey, amount),
  );
  tx.sign(authority);

  let signature: string;
  try {
    signature = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
    });
  } catch (e) {
    // If the authority is out of SOL for fees, surface that clearly so we
    // know to top it up. Don't leak the secret in the error path.
    const msg = e instanceof Error ? e.message : String(e);
    const hint = /insufficient (funds|lamports)/i.test(msg)
      ? " (faucet authority needs devnet SOL - top up the keypair printed by setup-devnet-usdc.ts)"
      : "";
    return Response.json({ error: `Faucet failed: ${msg}${hint}` }, { status: 500 });
  }

  // Wait for confirmation so the user's next deposit attempt sees the
  // balance. Use HTTP polling to stay off WebSockets (see
  // apps/web/lib/anchor/confirm.ts for the full rationale). Inlined here to
  // keep this route independent of the client helpers.
  const start = Date.now();
  while (Date.now() - start < 30_000) {
    const { value } = await connection.getSignatureStatuses([signature]);
    const s = value[0];
    if (s) {
      if (s.err) {
        return Response.json(
          { error: `Faucet tx failed: ${JSON.stringify(s.err)}` },
          { status: 500 },
        );
      }
      if (
        s.confirmationStatus === "confirmed" ||
        s.confirmationStatus === "finalized"
      ) {
        break;
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  return Response.json({
    signature,
    amount: `${FAUCET_AMOUNT_UI}.${"0".repeat(USDC.decimals)}`,
    ata: ata.toBase58(),
    explorer: `https://explorer.solana.com/tx/${signature}?cluster=devnet`,
  });
}
