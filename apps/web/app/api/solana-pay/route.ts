/**
 * Solana Pay transaction-request endpoint. Used only by the QR-code deposit
 * flow - connected-wallet deposits go through `components/direct-deposit.tsx`
 * and never touch this route.
 *
 * GET  → { label, icon }                   (metadata for the wallet UI)
 * POST → { transaction: base64, message }  (unsigned tx the wallet signs)
 *
 * The returned transaction:
 *   1. Ensures the vault's USDC ATA exists (idempotent).
 *   2. Transfers USDC from the payer → vault's USDC ATA.
 *   3. Invokes Tumar's `record_contribution` to append the deposit to the
 *      vault's on-chain history. The `nonce` arg seeds the Contribution PDA,
 *      eliminating the old Clock::get() timestamp race.
 *
 * Spec: https://docs.solanapay.com/spec#transaction-request
 */

import {
  ComputeBudgetProgram,
  Connection,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";

import { contributionPda, memberPda } from "@/lib/anchor/pdas";
import { IDL } from "@/lib/anchor/idl";
import { USDC } from "@/lib/tokens";

const RPC =
  process.env.SOLANA_RPC_UPSTREAM ??
  process.env.NEXT_PUBLIC_RPC_URL ??
  "https://api.mainnet-beta.solana.com";
const LABEL = process.env.NEXT_PUBLIC_MERCHANT_LABEL ?? "Tumar Family Vault";

const RECORD_DISCRIM = Uint8Array.from(
  IDL.instructions.find((ix) => ix.name === "recordContribution")!.discriminator,
);

function encodeString(s: string): Buffer {
  const bytes = Buffer.from(s, "utf8");
  const len = Buffer.alloc(4);
  len.writeUInt32LE(bytes.length);
  return Buffer.concat([len, bytes]);
}

function encodeRecordContributionData(
  amount: bigint,
  memo: string,
  nonce: bigint,
): Buffer {
  const amt = Buffer.alloc(8);
  amt.writeBigUInt64LE(amount);
  const non = Buffer.alloc(8);
  non.writeBigUInt64LE(nonce);
  return Buffer.concat([Buffer.from(RECORD_DISCRIM), amt, encodeString(memo), non]);
}

// Pick a random, never-zero u63 (high bit cleared). Used as the seed for
// the Contribution PDA. We mask the top bit because the on-chain field is
// `u64` but the JS serializer chain (@coral-xyz/anchor / @solana/spl-token)
// range-checks against i64 in places - values >= 2^63 throw "value out of
// range, must be < 2^63". 63 bits of entropy is still astronomical for a
// per-(vault, contributor) PDA seed.
function randomNonce(): bigint {
  const bytes = new Uint8Array(8);
  // Node's webcrypto is available in Edge and Node server runtimes.
  crypto.getRandomValues(bytes);
  bytes[0] &= 0x7f; // force high bit off so value < 2^63
  let n = 0n;
  for (let i = 0; i < 8; i++) n = (n << 8n) | BigInt(bytes[i]);
  return n === 0n ? 1n : n;
}

export async function GET() {
  return Response.json({
    label: LABEL,
    icon: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/icon.svg`,
  });
}

export async function POST(req: Request) {
  const { searchParams } = new URL(req.url);
  const vaultParam = searchParams.get("vault");
  const amountParam = searchParams.get("amount");
  const memo = (searchParams.get("memo") ?? "").slice(0, 140);

  if (!vaultParam) return Response.json({ error: "Missing vault" }, { status: 400 });
  if (!amountParam) return Response.json({ error: "Missing amount" }, { status: 400 });

  const body = await req.json().catch(() => null);
  const account = (body as { account?: string } | null)?.account;
  if (!account) return Response.json({ error: "Missing account" }, { status: 400 });

  let payer: PublicKey;
  let vault: PublicKey;
  try {
    payer = new PublicKey(account);
    vault = new PublicKey(vaultParam);
  } catch {
    return Response.json({ error: "Invalid pubkey" }, { status: 400 });
  }

  const numAmount = Number(amountParam);
  if (!Number.isFinite(numAmount) || numAmount <= 0) {
    return Response.json({ error: "Invalid amount" }, { status: 400 });
  }

  const usdcMint = new PublicKey(USDC.mint);
  const amountMicros = BigInt(Math.round(numAmount * 1_000_000));

  const connection = new Connection(RPC, "confirmed");

  // The Contribution PDA is seeded with a random u64 nonce supplied by the
  // caller (since the program upgrade that retired the Clock::get() seed).
  // Generating it server-side keeps the client dumb and avoids handing a
  // manipulatable seed to end-users.
  const nonce = randomNonce();

  const { blockhash } = await connection.getLatestBlockhash();

  const payerUsdcAta = getAssociatedTokenAddressSync(usdcMint, payer);
  const vaultUsdcAta = getAssociatedTokenAddressSync(usdcMint, vault, true);

  const [member] = memberPda(vault, payer);
  const [contribution] = contributionPda(vault, payer, nonce);

  // Pre-flight the state before we build a tx that will definitely fail at
  // simulation. The RPC returns bare "AccountNotFound" (no program logs) when
  // any referenced account is missing - useless for the user, so we translate
  // the three common shapes into actionable messages first.
  //
  //   1. Vault account missing         → vault addr typo'd
  //   2. Payer lamports == 0           → wallet needs SOL for fees
  //   3. Member PDA missing            → signer hasn't joined this vault yet
  //   4. Payer USDC ATA missing/empty  → wallet needs USDC
  //
  // Single parallel round-trip - cheap and stops the "Unexpected error"
  // surface area in the wallet.
  const [vaultInfo, payerLamports, memberInfo, payerAtaInfo] = await Promise.all([
    connection.getAccountInfo(vault),
    connection.getBalance(payer),
    connection.getAccountInfo(member),
    connection.getAccountInfo(payerUsdcAta),
  ]);

  if (!vaultInfo) {
    return Response.json(
      { error: "This vault doesn't exist on-chain. Double-check the URL or open the invite link again." },
      { status: 400 },
    );
  }
  // Fee + the tiny rent bump for the contribution PDA (~0.002 SOL). 10k
  // lamports is the tx fee floor; anything under that can't land at all.
  if (payerLamports < 10_000) {
    return Response.json(
      { error: "Your wallet needs a small amount of SOL for transaction fees (< $0.01). Top up the connected wallet and retry." },
      { status: 400 },
    );
  }
  if (!memberInfo) {
    return Response.json(
      { error: "You haven't joined this vault with this wallet yet. Either switch to the wallet that created the vault, or open the invite link and tap Join first." },
      { status: 400 },
    );
  }
  if (!payerAtaInfo) {
    return Response.json(
      { error: "Your wallet has no USDC token account yet. Send any USDC to this wallet (even $1) to create the account, then retry." },
      { status: 400 },
    );
  }
  // SPL Token account layout: amount is u64 LE at offset 64. If the ATA
  // exists but is drained, we still want the friendly "claim more" message
  // instead of letting transferChecked fail with custom 0x1.
  if (payerAtaInfo.data.length >= 72) {
    const balance = payerAtaInfo.data.readBigUInt64LE(64);
    if (balance < amountMicros) {
      const haveUsdc = Number(balance) / 1_000_000;
      return Response.json(
        { error: `Not enough USDC: you have ${haveUsdc.toFixed(2)}, trying to send ${numAmount}. Top up your wallet and retry.` },
        { status: 400 },
      );
    }
  }

  const data = encodeRecordContributionData(amountMicros, memo, nonce);

  const SYSTEM_PROGRAM = new PublicKey("11111111111111111111111111111111");
  const PROGRAM_ID = new PublicKey(IDL.address);

  const recordIx = {
    programId: PROGRAM_ID,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: member, isSigner: false, isWritable: true },
      { pubkey: contribution, isSigner: false, isWritable: true },
      { pubkey: SYSTEM_PROGRAM, isSigner: false, isWritable: false },
    ],
    data,
  };

  const ixs = [
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 20_000 }),
    createAssociatedTokenAccountIdempotentInstruction(
      payer,
      vaultUsdcAta,
      vault,
      usdcMint,
    ),
    createTransferCheckedInstruction(
      payerUsdcAta,
      usdcMint,
      vaultUsdcAta,
      payer,
      amountMicros,
      USDC.decimals,
    ),
    recordIx,
  ];

  const msg = new TransactionMessage({
    payerKey: payer,
    recentBlockhash: blockhash,
    instructions: ixs,
  }).compileToV0Message();

  const tx = new VersionedTransaction(msg);
  const serialized = Buffer.from(tx.serialize()).toString("base64");

  return Response.json({
    transaction: serialized,
    message: `Contribute $${amountParam} USDC to ${LABEL}`,
  });
}
