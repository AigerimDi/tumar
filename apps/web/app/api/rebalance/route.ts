/**
 * Rebalance planner.
 *
 * Given a vault's current USDC balance and its target allocation, returns the
 * list of Jupiter swaps (+ quote) that will move it toward the plan. The
 * client assembles the VersionedTransactions and asks the vault authority to
 * sign them sequentially.
 *
 * Split into its own route so we can add a cron crank later (Solana cron via
 * Clockwork, or a plain Vercel cron) without changing the client.
 */

import { Connection, PublicKey } from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  getAccount,
} from "@solana/spl-token";
import { getQuote, planRebalance } from "@/lib/jupiter";
import { USDC } from "@/lib/tokens";

const RPC = process.env.NEXT_PUBLIC_RPC_URL ?? "https://api.mainnet-beta.solana.com";

export async function POST(req: Request) {
  const body = (await req.json()) as {
    vault: string;
    allocation: { mint: string; bps: number }[];
  };

  const connection = new Connection(RPC, "confirmed");
  const vault = new PublicKey(body.vault);
  const usdcMint = new PublicKey(USDC.mint);
  const vaultUsdc = getAssociatedTokenAddressSync(usdcMint, vault, true);

  let balance = 0n;
  try {
    const acct = await getAccount(connection, vaultUsdc);
    balance = acct.amount;
  } catch {
    return Response.json({ plan: [], quotes: [] });
  }

  const plan = planRebalance({
    usdcLamports: balance,
    usdcMint: USDC.mint,
    allocation: body.allocation,
  });

  const quotes = await Promise.all(
    plan.map((p) =>
      getQuote({
        inputMint: USDC.mint,
        outputMint: p.outputMint,
        amount: p.amountLamports,
        slippageBps: 75,
      }).catch(() => null),
    ),
  );

  return Response.json({
    balanceUsdc: Number(balance) / 1_000_000,
    plan: plan.map((p) => ({ outputMint: p.outputMint, amount: p.amountLamports.toString() })),
    quotes,
  });
}
