/**
 * Jupiter v6 client.
 *
 * Docs: https://station.jup.ag/docs/apis/swap-api
 *   GET  /v6/quote   → route & expected outAmount
 *   POST /v6/swap    → serialized VersionedTransaction to sign
 *
 * We call these directly (no SDK) to keep the bundle small.
 */

// Jupiter retired the old quote-api host; lite-api is the free public
// successor. Paid traffic uses api.jup.ag with an API key.
const JUPITER = "https://lite-api.jup.ag/swap/v1";

export type QuoteResponse = {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: "ExactIn" | "ExactOut";
  slippageBps: number;
  priceImpactPct: string;
  routePlan: unknown[];
  contextSlot?: number;
  timeTaken?: number;
};

export async function getQuote(params: {
  inputMint: string;
  outputMint: string;
  amount: bigint | number;
  slippageBps?: number;
  onlyDirectRoutes?: boolean;
}): Promise<QuoteResponse> {
  const url = new URL(`${JUPITER}/quote`);
  url.searchParams.set("inputMint", params.inputMint);
  url.searchParams.set("outputMint", params.outputMint);
  url.searchParams.set("amount", params.amount.toString());
  url.searchParams.set("slippageBps", String(params.slippageBps ?? 50));
  if (params.onlyDirectRoutes) url.searchParams.set("onlyDirectRoutes", "true");

  const res = await fetch(url, { next: { revalidate: 10 } });
  if (!res.ok) throw new Error(`Jupiter quote failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export type JupiterIx = {
  programId: string;
  accounts: { pubkey: string; isSigner: boolean; isWritable: boolean }[];
  data: string; // base64
};

export type SwapInstructionsResponse = {
  tokenLedgerInstruction?: JupiterIx | null;
  computeBudgetInstructions: JupiterIx[];
  setupInstructions: JupiterIx[];
  swapInstruction: JupiterIx;
  cleanupInstruction?: JupiterIx | null;
  addressLookupTableAddresses: string[];
};

/** Fetch Jupiter's raw swap instructions, so we can splice in our own
 * `record_contribution` instruction and still send a single user-signed
 * v0 tx. The full `/swap` endpoint returns a ready-to-sign tx that can't
 * be appended to. */
export async function getSwapInstructions(params: {
  quoteResponse: QuoteResponse;
  userPublicKey: string;
  destinationTokenAccount?: string;
  wrapAndUnwrapSol?: boolean;
  prioritizationFeeLamports?: number | "auto";
  dynamicComputeUnitLimit?: boolean;
}): Promise<SwapInstructionsResponse> {
  const res = await fetch(`${JUPITER}/swap-instructions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      quoteResponse: params.quoteResponse,
      userPublicKey: params.userPublicKey,
      destinationTokenAccount: params.destinationTokenAccount,
      wrapAndUnwrapSol: params.wrapAndUnwrapSol ?? true,
      prioritizationFeeLamports: params.prioritizationFeeLamports ?? "auto",
      dynamicComputeUnitLimit: params.dynamicComputeUnitLimit ?? true,
    }),
  });
  if (!res.ok) throw new Error(`Jupiter swap-instructions failed: ${res.status} ${await res.text()}`);
  return res.json();
}

/** Jupiter v6 priority fee config - accepts a flat lamport amount, the
 * legacy "auto" string, or the newer `priorityLevelWithMaxLamports`
 * object that lets Jupiter set the fee at a specified percentile and
 * cap it. We default to `veryHigh` with 5M-lamport ceiling because
 * `auto` consistently leaves swap txs unincluded during congested
 * mainnet windows (we've seen 60s+ confirmation timeouts where the tx
 * never makes it onto a leader). 5M lamports = 0.005 SOL ≈ 1¢ per swap. */
export type JupiterPrioritizationFeeLamports =
  | number
  | "auto"
  | {
      priorityLevelWithMaxLamports: {
        priorityLevel: "low" | "medium" | "high" | "veryHigh";
        maxLamports: number;
      };
    }
  | { jitoTipLamports: number };

const DEFAULT_PRIORITY_FEE: JupiterPrioritizationFeeLamports = {
  priorityLevelWithMaxLamports: {
    priorityLevel: "veryHigh",
    maxLamports: 5_000_000,
  },
};

export async function getSwapTransaction(params: {
  quoteResponse: QuoteResponse;
  userPublicKey: string;
  /** Override the swap output destination. When set, the swapped tokens
   * land in this token account instead of the user's ATA. Required for
   * vault-routed deposits where the destination is the vault's per-token
   * ATA (owned by the vault PDA, not the user). */
  destinationTokenAccount?: string;
  wrapAndUnwrapSol?: boolean;
  prioritizationFeeLamports?: JupiterPrioritizationFeeLamports;
  dynamicComputeUnitLimit?: boolean;
}): Promise<{ swapTransaction: string; lastValidBlockHeight: number }> {
  const res = await fetch(`${JUPITER}/swap`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      quoteResponse: params.quoteResponse,
      userPublicKey: params.userPublicKey,
      destinationTokenAccount: params.destinationTokenAccount,
      wrapAndUnwrapSol: params.wrapAndUnwrapSol ?? true,
      prioritizationFeeLamports: params.prioritizationFeeLamports ?? DEFAULT_PRIORITY_FEE,
      dynamicComputeUnitLimit: params.dynamicComputeUnitLimit ?? true,
    }),
  });
  if (!res.ok) throw new Error(`Jupiter swap failed: ${res.status} ${await res.text()}`);
  return res.json();
}

/**
 * Plan a rebalance: given a USDC balance and a target allocation (bps),
 * return the list of swaps that need to happen.
 */
export function planRebalance(input: {
  usdcLamports: bigint;
  usdcMint: string;
  allocation: { mint: string; bps: number }[];
}): { outputMint: string; amountLamports: bigint }[] {
  const plan: { outputMint: string; amountLamports: bigint }[] = [];
  for (const slot of input.allocation) {
    if (slot.mint === input.usdcMint) continue; // keep as USDC
    const amount = (input.usdcLamports * BigInt(slot.bps)) / 10_000n;
    if (amount > 0n) plan.push({ outputMint: slot.mint, amountLamports: amount });
  }
  return plan;
}
