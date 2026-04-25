"use client";

/**
 * Private buy card - shield USDC, swap privately to a target token (xStock,
 * jitoSOL, etc.) via Cloak's swapWithChange.
 *
 * UX: token picker → amount → live Jupiter quote → buy. Three Phantom
 * prompts: ALT, shield, ATA-create (if first-time for that token, otherwise
 * skipped). The swap itself is relay-submitted, no user signature.
 *
 * Important: the bought token lands in YOUR wallet, NOT a vault. Cloak's
 * relay rejects PDA recipients (it validates on-curve), so the vault
 * deposit step is a separate flow you run after - `vault/.../deposit` →
 * "Per asset" tab. The privacy story is: "the link from where your USDC
 * came from to the asset purchase is broken at the pool boundary"; once
 * the asset is in your wallet, you can do whatever you want with it.
 */

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useEffect, useState } from "react";

import { explorerTxUrl } from "@/lib/cluster";
import {
  fetchJupiterQuote,
  runPrivateBuy,
  type PrivateBuyProgress,
} from "@/lib/cloak/private-buy";
import { ALL_TOKENS, USDC, type Token } from "@/lib/tokens";

import { Button } from "./ui/button";
import { Input } from "./ui/input";

const STAGE_LABELS: Record<PrivateBuyProgress["stage"], string> = {
  idle: "Ready",
  preparing: "Preparing…",
  shielding: "Shielding USDC into pool…",
  proving: "Generating zero-knowledge proof…",
  swapping: "Routing swap through Orca…",
  done: "Done.",
  error: "Failed.",
};

// Buy targets - anything that isn't USDC itself. xStocks first, then KZTE/jitoSOL.
const TARGETS: Token[] = ALL_TOKENS.filter((t) => t.symbol !== "USDC");

export function PrivateBuy() {
  const wallet = useWallet();
  const { publicKey } = wallet;
  const { connection } = useConnection();

  const [target, setTarget] = useState<Token>(
    TARGETS.find((t) => t.symbol === "NVDAx") ?? TARGETS[0],
  );
  const [amount, setAmount] = useState<string>("100");
  const [progress, setProgress] = useState<PrivateBuyProgress>({ stage: "idle" });
  const [signatures, setSignatures] = useState<{
    shield: string;
    swap: string;
    outAmount: bigint;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Live quote - refresh on amount/target change with a small debounce.
  const [quote, setQuote] = useState<{
    outAmount: bigint;
    minOutputAmount: bigint;
  } | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteErr, setQuoteErr] = useState<string | null>(null);

  useEffect(() => {
    const num = Number(amount);
    if (!Number.isFinite(num) || num <= 0) {
      setQuote(null);
      setQuoteErr(null);
      return;
    }
    let cancelled = false;
    setQuoting(true);
    setQuoteErr(null);
    const t = setTimeout(async () => {
      try {
        const q = await fetchJupiterQuote(
          USDC.mint,
          target.mint,
          BigInt(Math.round(num * 1_000_000)),
          100,
        );
        if (cancelled) return;
        setQuote(q);
      } catch (e) {
        if (cancelled) return;
        setQuoteErr(e instanceof Error ? e.message : String(e));
        setQuote(null);
      } finally {
        if (!cancelled) setQuoting(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [amount, target.mint]);

  const submitting =
    progress.stage !== "idle" && progress.stage !== "error" && progress.stage !== "done";

  async function buy() {
    if (!publicKey) {
      setError("Connect your wallet first.");
      return;
    }
    const num = Number(amount);
    if (!Number.isFinite(num) || num <= 0) {
      setError("Enter a valid USDC amount.");
      return;
    }
    setError(null);
    setSignatures(null);
    setProgress({ stage: "preparing", detail: "Preparing…" });

    try {
      const result = await runPrivateBuy({
        connection,
        wallet,
        outputToken: target,
        amountUsdc: num,
        onProgress: setProgress,
      });
      setSignatures({
        shield: result.shieldSignature,
        swap: result.swapSignature,
        outAmount: result.outAmount,
      });
    } catch (e) {
      console.error("[private-buy] failed:", e);
      setError(explainCloakError(e));
      setProgress({ stage: "error" });
    }
  }

  /** Manual recovery: wipe every Cloak-prefixed localStorage key + reload.
   * The "Leaf index X is beyond next_index Y" error means the SDK or relay
   * thinks our shielded note sits at a tree position the chain hasn't
   * actually committed. Local purge + reload forces every layer (SDK
   * in-memory cache, our purge() helper, the page itself) to start clean.
   */
  function resetCloakState() {
    try {
      const toDelete: string[] = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (k && (k.startsWith("cloak_") || k.startsWith("cloak."))) toDelete.push(k);
      }
      for (const k of toDelete) window.localStorage.removeItem(k);
    } catch {
      /* localStorage can throw in private mode - not fatal */
    }
    window.location.reload();
  }

  if (signatures) {
    return (
      <div className="space-y-4 rounded-xl border border-[color:var(--color-up)]/30 bg-[color:var(--color-up)]/5 px-5 py-6">
        <div className="text-sm text-[color:var(--color-up)]">
          ✓ Private buy submitted
        </div>
        <p className="text-xs text-ink-300">
          ~{formatTokenAmount(signatures.outAmount, target.decimals)} {target.symbol} routed
          through Cloak&apos;s pool to your wallet. The on-chain link to the
          source of your USDC is broken at the pool boundary.
        </p>
        <div className="space-y-1 text-xs">
          <SigLink label="Shield" sig={signatures.shield} />
          <SigLink label="Swap (relay)" sig={signatures.swap} />
        </div>
        <div className="rounded-md border border-gold-400/20 bg-gold-400/[0.04] px-3 py-2 text-[11px] text-gold-200">
          Now in your wallet. To park this in a Family Vault, open the vault&apos;s{" "}
          <span className="text-gold-100">Deposit</span> page and pick the{" "}
          <span className="text-gold-100">Per asset</span> tab - it&apos;ll
          transfer the {target.symbol} into the vault&apos;s ATA + record the
          contribution in one signature.
        </div>
      </div>
    );
  }

  const num = Number(amount);
  const amountValid = Number.isFinite(num) && num > 0;

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-gold-400/20 bg-gold-400/[0.04] px-4 py-3 text-[11px] text-gold-200">
        <span className="uppercase tracking-[0.16em] text-gold-300">Experimental.</span>{" "}
        Shield USDC into Cloak&apos;s pool, then swap privately through Orca.
        Two or three Phantom prompts (lookup table, shield, +first-time ATA
        for this token). The swap itself is relay-submitted - no signature.
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-[11px] text-ink-300">
        <span className="uppercase tracking-[0.16em] text-ink-400">Where this goes →</span>{" "}
        Your wallet, not a vault. Cloak&apos;s relay rejects PDA recipients,
        so vault deposits can&apos;t use this path directly. After the buy
        lands, head to a vault&apos;s <span className="text-ink-100">Deposit</span>{" "}
        page → <span className="text-ink-100">Per asset</span> tab to move
        what you bought into a vault on a separate signature.
      </div>

      {/* Token picker */}
      <div>
        <label className="mb-2 block text-[11px] uppercase tracking-[0.16em] text-ink-300">
          Buy
        </label>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {TARGETS.slice(0, 8).map((t) => (
            <button
              key={t.mint}
              type="button"
              disabled={submitting}
              onClick={() => setTarget(t)}
              className={
                "rounded-md border px-2 py-2 text-left text-xs transition-colors " +
                (t.mint === target.mint
                  ? "border-gold-400/60 bg-gold-400/[0.06] text-ink-100"
                  : "border-white/10 bg-white/[0.02] text-ink-300 hover:border-gold-400/30 hover:text-ink-100")
              }
            >
              <div className="num-tab text-[11px] font-semibold">{t.symbol}</div>
              <div className="mt-0.5 text-[10px] text-ink-400">{t.name}</div>
            </button>
          ))}
        </div>
        {/* Full dropdown for the long tail */}
        <select
          disabled={submitting}
          value={target.mint}
          onChange={(e) => {
            const next = TARGETS.find((t) => t.mint === e.target.value);
            if (next) setTarget(next);
          }}
          className="mt-2 w-full rounded-md border border-white/10 bg-white/[0.02] px-3 py-1.5 text-xs text-ink-200 focus:border-gold-400/40 focus:outline-none"
        >
          {TARGETS.map((t) => (
            <option key={t.mint} value={t.mint}>
              {t.symbol} - {t.name}
            </option>
          ))}
        </select>
      </div>

      {/* Amount */}
      <div>
        <label className="mb-2 block text-[11px] uppercase tracking-[0.16em] text-ink-300">
          Pay (USDC)
        </label>
        <Input
          type="number"
          inputMode="decimal"
          min="1"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="100"
          className="num text-xl"
          disabled={submitting}
        />
        <div className="mt-2 flex gap-2">
          {[25, 100, 500, 1000].map((v) => (
            <button
              key={v}
              onClick={() => setAmount(String(v))}
              type="button"
              disabled={submitting}
              className="rounded-full border border-white/10 bg-white/[0.02] px-3 py-1 text-xs text-ink-300 transition-colors hover:border-gold-400/40 hover:text-ink-100 disabled:opacity-40"
            >
              ${v}
            </button>
          ))}
        </div>
      </div>

      {/* Quote display */}
      <div className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-xs">
        <div className="flex items-baseline justify-between">
          <span className="uppercase tracking-[0.16em] text-ink-400">
            You receive (estimate)
          </span>
          <span
            className="num-tab text-base text-ink-100"
            style={{ color: target.color }}
          >
            {quote
              ? `${formatTokenAmount(quote.outAmount, target.decimals)} ${target.symbol}`
              : quoting
              ? "…"
              : amountValid
              ? quoteErr
                ? "-"
                : "…"
              : "0"}
          </span>
        </div>
        <div className="mt-1 flex items-baseline justify-between text-[10px] text-ink-500">
          <span>Min. after 1% slippage</span>
          <span className="num-tab">
            {quote
              ? `${formatTokenAmount(quote.minOutputAmount, target.decimals)} ${target.symbol}`
              : "-"}
          </span>
        </div>
        {quoteErr && (
          <div className="mt-2 text-[10px] text-[color:var(--color-down)]">
            Quote unavailable: {quoteErr}
          </div>
        )}
      </div>

      {/* Progress */}
      <div className="space-y-3 rounded-xl border border-gold-400/15 bg-gold-400/[0.04] px-4 py-3">
        <div className="flex items-baseline justify-between">
          <span className="text-[11px] uppercase tracking-[0.16em] text-gold-300">
            Cloak - pool privacy
          </span>
          <span className="num-tab text-[10px] uppercase tracking-[0.14em] text-ink-400">
            mainnet
          </span>
        </div>
        <ProgressRow progress={progress} />
      </div>

      {error && (
        <div className="space-y-3 rounded-xl border border-[color:var(--color-down)]/30 bg-[color:var(--color-down)]/10 px-4 py-3 text-sm text-[color:var(--color-down)]">
          <div>{error}</div>
          {/* Reset is the universal recovery for Cloak's stale-state class
              of errors (leaf-beyond, already-spent, stale-browser). The
              SDK doesn't expose its in-memory caches and our purge helper
              runs *before* loadCloak() - a hard reload is the cleanest
              way to invalidate every layer at once. */}
          {/(stale|out of sync|leaf index|already on chain)/i.test(error) && (
            <button
              type="button"
              onClick={resetCloakState}
              className="rounded-md border border-[color:var(--color-down)]/40 bg-[color:var(--color-down)]/10 px-3 py-1.5 text-xs text-[color:var(--color-down)] transition-colors hover:border-[color:var(--color-down)]/70 hover:bg-[color:var(--color-down)]/20"
            >
              Reset Cloak state &amp; reload
            </button>
          )}
        </div>
      )}

      <Button
        className="w-full"
        size="lg"
        onClick={buy}
        disabled={submitting || !publicKey || !quote || !amountValid}
      >
        {submitting
          ? STAGE_LABELS[progress.stage]
          : !publicKey
          ? "Connect wallet to buy"
          : !amountValid
          ? "Enter an amount"
          : !quote
          ? "Loading quote…"
          : `Buy $${amount} of ${target.symbol} privately`}
      </Button>
      <div className="text-center text-[11px] text-ink-500">
        Total ~10–20 seconds. The {target.symbol} lands in your wallet; the
        on-chain link to where your USDC came from is broken at the pool.
      </div>
    </div>
  );
}

function ProgressRow({ progress }: { progress: PrivateBuyProgress }) {
  if (progress.stage === "idle") {
    return (
      <div className="text-[11px] text-ink-300">
        Pick a token, set an amount, then{" "}
        <span className="text-ink-100">Buy privately</span>.
      </div>
    );
  }

  const isProving = progress.stage === "proving";
  const percent = progress.proofPercent ?? null;

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] text-ink-200">{STAGE_LABELS[progress.stage]}</span>
        {isProving && percent != null && (
          <span className="num-tab text-[11px] text-gold-300">{percent.toFixed(0)}%</span>
        )}
      </div>
      {isProving && (
        <div className="h-[2px] overflow-hidden rounded-full bg-white/5">
          <div
            className="h-full bg-gold-400 transition-all duration-300"
            style={{ width: `${percent ?? 0}%` }}
          />
        </div>
      )}
      {progress.detail && <div className="text-[10px] text-ink-500">{progress.detail}</div>}
    </div>
  );
}

function SigLink({ label, sig }: { label: string; sig: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-ink-400">{label}</span>
      <a
        href={explorerTxUrl(sig)}
        target="_blank"
        rel="noreferrer"
        className="num-tab truncate text-gold-300 hover:text-gold-200"
      >
        {sig.slice(0, 12)}…{sig.slice(-6)} ↗
      </a>
    </div>
  );
}

/** Translate Cloak SDK errors into human-readable hints. The two we see
 * most often:
 *
 *  - "Leaf index 486 is beyond next_index 318" - the SDK or relay's view
 *    of the merkle tree advanced past what's confirmed on chain (often
 *    leftover state from a prior Cloak run). The fix is to reset state
 *    and retry, which the UI surfaces as a button next to the error.
 *  - "stale browser state" wrapped errors from our own pre-flight nullifier
 *    check inside private-buy.ts.
 *  - "UtxoAlreadySpentError" - already handled inside private-buy.ts, but
 *    if it surfaces here we hint at the same fix.
 */
function explainCloakError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  // Cloak relay's `/range-quote` backend calls Helius from its own
  // server. When their key is revoked / rotated / rate-limited, we see
  // "Risk quote request failed" or the on-chain rejection of a tx
  // missing the Ed25519 sanctions ix. Both are Cloak-infra outages -
  // not something the user can fix. Tell them so directly.
  if (/Risk quote request failed|range[_-]?quote|Ed25519 sanctions/i.test(msg)) {
    return (
      "Cloak's sanctions-oracle backend is currently unavailable (their relay's " +
      "Helius key returns 401, which makes the on-chain program reject the swap). " +
      "This is on Cloak's infrastructure - nothing you can do client-side. " +
      "Try the regular per-asset deposit (Vault → Deposit → Per asset) as a " +
      "workaround; it skips the Cloak path entirely and still gets you the " +
      "asset into the vault. Private buy will work again once Cloak fixes their relay."
    );
  }
  if (/leaf index\s+\d+\s+is beyond next_index/i.test(msg)) {
    return (
      "Cloak's pool view is out of sync with the chain - usually leftover " +
      "state from a previous attempt. Click \"Reset Cloak state\" below and try again."
    );
  }
  if (/may be stale/i.test(msg) || /already spent/i.test(msg) || /already on chain - stale/i.test(msg)) {
    return (
      "Cached private notes are stale. Click \"Reset Cloak state\" below to " +
      "wipe local Cloak state and start fresh."
    );
  }
  if (/Chain didn't catch up/i.test(msg)) {
    return msg; // already a clear hint from runPrivateBuy
  }
  if (/Failed to fetch|NetworkError|relay/i.test(msg)) {
    return `Cloak relay didn't respond. Try again in a few seconds. (${msg})`;
  }
  if (/User rejected|was rejected/i.test(msg)) {
    return "Transaction rejected in wallet.";
  }
  return msg;
}

function formatTokenAmount(raw: bigint, decimals: number): string {
  const divisor = 10n ** BigInt(decimals);
  const whole = raw / divisor;
  const frac = raw % divisor;
  if (frac === 0n) return whole.toString();
  // Up to 4 decimal places for legibility.
  const display = Number(raw) / 10 ** decimals;
  if (display >= 1000) return display.toFixed(2);
  if (display >= 1) return display.toFixed(3);
  return display.toFixed(4);
}
