/**
 * Attach Metaplex Token Metadata to our devnet mock USDC mint.
 *
 * Without this, wallets (Phantom, Solflare, Backpack) show the bare mint
 * pubkey - "ZMHTDBBAB…" - in their sign dialogs, which is scary and ugly.
 * With it, they show "dUSD" + "Tumar Test USDC" + a nice icon slot.
 *
 * Creates a `CreateMetadataAccountV3` instruction by hand so we don't have to
 * pull the full @metaplex-foundation/umi stack into the repo for a one-shot.
 * The instruction layout is stable and documented:
 *   https://developers.metaplex.com/token-metadata/instructions#create-metadata-account-v3
 *
 * Run once:
 *   npx tsx apps/web/scripts/set-usdc-metadata.ts
 *
 * Re-runnable: skips if the metadata account already exists.
 */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import bs58 from "bs58";

const RPC = process.env.SOLANA_RPC_UPSTREAM ?? "https://api.devnet.solana.com";

// Same on devnet and mainnet - Metaplex deploys to a canonical address.
const TOKEN_METADATA_PROGRAM_ID = new PublicKey(
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s",
);

// What we want wallets to show.
const NAME = "Tumar Test USDC";
const SYMBOL = "dUSD";
// Optional off-chain JSON. Empty is fine - wallets fall back to on-chain
// name + symbol. If we ever host a token-list entry, point at it here.
const URI = "";
const SELLER_FEE_BPS = 0;
const IS_MUTABLE = true; // so we can update copy later without redeploying the mint

function loadPayer(): Keypair {
  const flagIdx = process.argv.indexOf("--payer");
  if (flagIdx !== -1 && process.argv[flagIdx + 1]) {
    try {
      return Keypair.fromSecretKey(bs58.decode(process.argv[flagIdx + 1]));
    } catch {
      return Keypair.fromSecretKey(
        Uint8Array.from(JSON.parse(process.argv[flagIdx + 1])),
      );
    }
  }
  const cliPath = process.env.SOLANA_KEYPAIR ?? join(homedir(), ".config", "solana", "id.json");
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(cliPath, "utf8"))));
}

function loadAuthority(): Keypair {
  const secret = process.env.USDC_MINT_AUTHORITY_SECRET_KEY;
  if (!secret) {
    // Fallback: read from apps/web/.env.local (dev convenience).
    try {
      const env = readFileSync(join(process.cwd(), "apps/web/.env.local"), "utf8");
      const m = env.match(/USDC_MINT_AUTHORITY_SECRET_KEY="?([^"\n]+)"?/);
      if (m) return Keypair.fromSecretKey(bs58.decode(m[1]));
    } catch {
      /* fall through */
    }
    throw new Error(
      "USDC_MINT_AUTHORITY_SECRET_KEY not found (env or apps/web/.env.local)",
    );
  }
  return Keypair.fromSecretKey(bs58.decode(secret));
}

function mintFromEnv(): PublicKey {
  let m = process.env.NEXT_PUBLIC_USDC_MINT;
  if (!m) {
    try {
      const env = readFileSync(join(process.cwd(), "apps/web/.env.local"), "utf8");
      const match = env.match(/NEXT_PUBLIC_USDC_MINT="?([^"\n]+)"?/);
      if (match) m = match[1];
    } catch {
      /* fall through */
    }
  }
  if (!m) throw new Error("NEXT_PUBLIC_USDC_MINT not set");
  return new PublicKey(m);
}

// Borsh-ish encoding for the instruction args. Metaplex uses a specific layout
// for `CreateMetadataAccountV3` (variant tag = 33):
//
//   u8 variant
//   DataV2 {
//     string name, string symbol, string uri
//     u16 seller_fee_basis_points
//     option<Vec<Creator>> creators
//     option<Collection> collection
//     option<Uses> uses
//   }
//   bool is_mutable
//   option<CollectionDetails> collection_details
//
// We set all optionals to None (0x00) which is universally accepted.
function encodeString(s: string): Buffer {
  const bytes = Buffer.from(s, "utf8");
  const len = Buffer.alloc(4);
  len.writeUInt32LE(bytes.length);
  return Buffer.concat([len, bytes]);
}

function encodeCreateMetadataV3(): Buffer {
  const parts: Buffer[] = [];
  parts.push(Buffer.from([33])); // CreateMetadataAccountV3 discriminator
  parts.push(encodeString(NAME));
  parts.push(encodeString(SYMBOL));
  parts.push(encodeString(URI));
  const sfee = Buffer.alloc(2);
  sfee.writeUInt16LE(SELLER_FEE_BPS);
  parts.push(sfee);
  parts.push(Buffer.from([0])); // creators: None
  parts.push(Buffer.from([0])); // collection: None
  parts.push(Buffer.from([0])); // uses: None
  parts.push(Buffer.from([IS_MUTABLE ? 1 : 0]));
  parts.push(Buffer.from([0])); // collection_details: None
  return Buffer.concat(parts);
}

async function main() {
  const connection = new Connection(RPC, "confirmed");
  const payer = loadPayer();
  const mintAuthority = loadAuthority();
  const mint = mintFromEnv();

  console.log(`Payer:           ${payer.publicKey.toBase58()}`);
  console.log(`Mint authority:  ${mintAuthority.publicKey.toBase58()}`);
  console.log(`Mint:            ${mint.toBase58()}`);
  console.log(`Symbol → wallet: ${SYMBOL}`);

  const [metadata] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("metadata"),
      TOKEN_METADATA_PROGRAM_ID.toBuffer(),
      mint.toBuffer(),
    ],
    TOKEN_METADATA_PROGRAM_ID,
  );
  console.log(`Metadata PDA:    ${metadata.toBase58()}`);

  const existing = await connection.getAccountInfo(metadata);
  if (existing) {
    console.log("✓ Metadata account already exists - skipping create.");
    console.log(
      `  https://explorer.solana.com/address/${metadata.toBase58()}?cluster=devnet`,
    );
    return;
  }

  const payerBalance = await connection.getBalance(payer.publicKey);
  console.log(`Payer balance:   ${(payerBalance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
  if (payerBalance < 0.01 * LAMPORTS_PER_SOL) {
    throw new Error("Payer needs ~0.01 SOL for metadata rent - airdrop some.");
  }

  // Account order is fixed by the Metaplex program.
  const ix = new TransactionInstruction({
    programId: TOKEN_METADATA_PROGRAM_ID,
    keys: [
      { pubkey: metadata, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: mintAuthority.publicKey, isSigner: true, isWritable: false },
      { pubkey: payer.publicKey, isSigner: true, isWritable: true },
      { pubkey: mintAuthority.publicKey, isSigner: true, isWritable: false }, // update authority
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      // rent sysvar is optional on modern programs but harmless to omit.
    ],
    data: encodeCreateMetadataV3(),
  });

  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");
  const tx = new Transaction({ feePayer: payer.publicKey, blockhash, lastValidBlockHeight }).add(ix);
  tx.sign(payer, mintAuthority);

  const sig = await connection.sendRawTransaction(tx.serialize());
  console.log(`Submitted: ${sig}`);

  // Poll for confirm
  const start = Date.now();
  while (Date.now() - start < 30_000) {
    const { value } = await connection.getSignatureStatuses([sig]);
    const s = value[0];
    if (s?.err) throw new Error(`Tx failed: ${JSON.stringify(s.err)}`);
    if (s?.confirmationStatus === "confirmed" || s?.confirmationStatus === "finalized") {
      console.log("✓ Metadata attached.");
      console.log(`  https://explorer.solana.com/tx/${sig}?cluster=devnet`);
      return;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("Confirmation timed out");
}

main().catch((err) => {
  console.error("✗ Metadata setup failed:", err);
  process.exit(1);
});
