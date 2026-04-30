/**
 * One-shot devnet setup: create a mock USDC mint we can freely faucet from.
 *
 * Why: Circle's real USDC mint (EPjFWdd5…DT1v) exists on devnet as an account,
 * but there's no public devnet supply - you can't airdrop USDC. To demo the
 * deposit flow end-to-end we need:
 *   1. A token with 6 decimals (so micro-amounts match real USDC math).
 *   2. A mint authority we hold server-side, so /api/faucet/usdc can mint
 *      1000 test USDC on demand without user signatures.
 *
 * This script:
 *   - Loads a payer keypair (default: ~/.config/solana/id.json - the Solana
 *     CLI default, which your devnet SOL airdrops land in).
 *   - Generates a fresh mint authority keypair.
 *   - Creates the mint with `createMint` (10M supply cap is implicit via u64).
 *   - Prints the env vars to paste into .env.local and Vercel.
 *
 * Run:
 *   npx tsx apps/web/scripts/setup-devnet-usdc.ts
 *   npx tsx apps/web/scripts/setup-devnet-usdc.ts --payer <base58 secret key>
 *
 * Cost: ~0.0015 SOL for mint rent. Payer keypair needs devnet SOL.
 */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { Connection, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { createMint } from "@solana/spl-token";
import bs58 from "bs58";

const RPC = process.env.SOLANA_RPC_UPSTREAM ?? "https://api.devnet.solana.com";

function loadPayer(): Keypair {
  const flagIdx = process.argv.indexOf("--payer");
  if (flagIdx !== -1 && process.argv[flagIdx + 1]) {
    const raw = process.argv[flagIdx + 1];
    try {
      return Keypair.fromSecretKey(bs58.decode(raw));
    } catch {
      // Maybe a JSON array
      try {
        return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
      } catch {
        throw new Error("--payer must be a base58 secret key or JSON array");
      }
    }
  }
  // Default: the Solana CLI keypair. That's where `solana airdrop` deposits.
  const cliPath = process.env.SOLANA_KEYPAIR ?? join(homedir(), ".config", "solana", "id.json");
  const raw = readFileSync(cliPath, "utf8");
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
}

async function main() {
  const connection = new Connection(RPC, "confirmed");
  const payer = loadPayer();

  const balance = await connection.getBalance(payer.publicKey);
  console.log(`Payer:   ${payer.publicKey.toBase58()}`);
  console.log(`Balance: ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
  if (balance < 0.01 * LAMPORTS_PER_SOL) {
    console.log("");
    console.log("⚠ Low balance. Airdrop some devnet SOL first:");
    console.log(`  solana airdrop 1 ${payer.publicKey.toBase58()} --url devnet`);
    process.exit(1);
  }

  // Mint authority is also the freeze authority + faucet authority. We keep
  // it server-side so /api/faucet/usdc can sign mint_to.
  const authority = Keypair.generate();
  console.log("");
  console.log(`Generating new mint authority: ${authority.publicKey.toBase58()}`);

  // 6 decimals matches real USDC - keeps our micros math identical.
  const DECIMALS = 6;
  console.log(`Creating mint with ${DECIMALS} decimals…`);
  const mint = await createMint(
    connection,
    payer,
    authority.publicKey,
    authority.publicKey,
    DECIMALS,
  );
  console.log(`✓ Mint created: ${mint.toBase58()}`);

  const authoritySecretB58 = bs58.encode(authority.secretKey);

  console.log("");
  console.log("════════════════════════════════════════════════════════════════");
  console.log("COPY THESE TO apps/web/.env.local AND Vercel (Preview+Production):");
  console.log("════════════════════════════════════════════════════════════════");
  console.log("");
  console.log(`NEXT_PUBLIC_USDC_MINT=${mint.toBase58()}`);
  console.log(`USDC_MINT_AUTHORITY_SECRET_KEY=${authoritySecretB58}`);
  console.log("");
  console.log("════════════════════════════════════════════════════════════════");
  console.log("After setting, redeploy Vercel. The faucet endpoint at");
  console.log("  POST /api/faucet/usdc  { account: <pubkey> }");
  console.log("will mint 1000 test USDC per call.");
  console.log("════════════════════════════════════════════════════════════════");

  // Sanity check: re-read the mint.
  const acct = await connection.getAccountInfo(mint);
  if (!acct) throw new Error("Mint didn't land - re-run the script.");
  console.log("");
  console.log(
    `Mint account: ${acct.lamports / LAMPORTS_PER_SOL} SOL rent, ${acct.data.length} bytes.`,
  );

  // Print explorer link for quick verification.
  console.log(
    `Explorer:     https://explorer.solana.com/address/${mint.toBase58()}?cluster=devnet`,
  );
}

main().catch((err) => {
  console.error("✗ Setup failed:", err);
  process.exit(1);
});
