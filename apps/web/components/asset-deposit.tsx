"use client";

/**
 * Per-asset deposit - pick a target token (NVDAx, SPYx, jitoSOL, …), enter
 * a USDC amount, see the live Jupiter quote, click → swap and route into
 * the vault. Vault holds the actual asset on chain instead of idle USDC.
 *
 * Two sequential user-signed txs:
 *   1. Jupiter `/swap` - USDC → target, output to user's ATA
 *   2. Transfer to vault ATA + record_contribution
 *
 * The split (instead of cramming everything into one v0 tx) is what makes
 * this work for Token-2022 xStocks with Backed Finance compliance hooks.
 * See `lib/anchor/asset-deposit.ts` for the full reasoning.
 */

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { useEffect, useState } from "react";

import { useTumarProgram } from "@/lib/anchor/program";
import { explainTxError } from "@/lib/anchor/explain";
import { explorerTxUrl } from "@/lib/cluster";
import {
  previewAssetDeposit,
  runAssetDeposit,
  type AssetDepositPreview,
  type AssetDepositProgress,
} from "@/lib/anchor/asset-deposit";
import { ALL_TOKENS, USDC, type Token } from "@/lib/tokens";

import { Button } from "./ui/button";
import { Input } from "./ui/input";

const STAGE_LABELS: Record<AssetDepositProgress["stage"], string> = {
  idle: "Ready",
  quoting: "Fetching Jupiter quote…",
  preparing: "Building swap instructions…",
  signing: "Awaiting signature…",
  confirming: "Confirming on chain…",
  done: "Done.",
  error: "Failed.",
};

// KZTE is on a placeholder mint until the launch - Jupiter has no route
// and there's no on-chain ATA to transfer to, so it can't be deposited as
// an asset. Hide it from the per-asset picker; it still shows on the
// homepage allocation grid as a roadmap pillar.
const TARGETS: Token[] = ALL_TOKENS.filter(
  (t) => t.symbol !== "USDC" && t.symbol !== "KZTE",
);

export function AssetDeposit({ vault: vaultAddr }: { vault: string }) {
  const wallet = useWallet();
  const { publicKey } = wallet;
  const { connection } = useConnection();
  const program = useTumarProgram();

  const [target, setTarget] = useState<Token>(
    TARGETS.find((t) => t.symbol === "NVDAx") ?? TARGETS[0],
  );
  const [amount, setAmount] = useState<string>("100");
  const [memo, setMemo] = useState("");
  const [progress, setProgress] = useState<AssetDepositProgress>({ stage: "idle" });
  const [signature, setSignature] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [quote, setQuote] = useState<AssetDepositPreview | null>(null);
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
        const q = await previewAssetDeposit(num, target);
        if (!cancelled) setQuote(q);
      } catch (e) {
        if (!cancelled) {
          setQuoteErr(e instanceof Error ? e.message : String(e));
          setQuote(null);
        }
      } finally {
        if (!cancelled) setQuoting(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [amount, target]);

  const submitting =
    progress.stage !== "idle" && progress.stage !== "error" && progress.stage !== "done";

  async function deposit() {
    if (!publicKey || !program) {
      setError("Connect your wallet first.");
      return;
    }
    const num = Number(amount);
    if (!Number.isFinite(num) || num <= 0) {
      setError("Enter a valid amount.");
      return;
    }
    setError(null);
    setSignature(null);
    setProgress({ stage: "quoting", detail: "Starting…" });
    try {
      const result = await runAssetDeposit({
        program,
        connection,
        wallet,
        vault: new PublicKey(vaultAddr),
        amountUsdc: num,
        target,
        memo: memo.trim(),
        onProgress: setProgress,
      });
      setSignature(result.signature);
    } catch (e) {
      console.error("[asset-deposit] failed:", e);
      setError(explainTxError(e));
      setProgress({ stage: "error" });
    }
  }

  if (signature) {
    return (
      <div className="space-y-4 rounded-xl border border-[color:var(--color-up)]/30 bg-[color:var(--color-up)]/5 px-5 py-6">
        <div className="text-sm text-[color:var(--color-up)]">
          ✓ Deposited as {target.symbol}
        </div>
        <p className="text-xs text-ink-300">
          ${amount} swapped via Jupiter → {target.symbol} routed into the
          vault, contribution recorded on chain.
        </p>
        <a
          href={explorerTxUrl(signature)}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-gold-300 hover:text-gold-200"
        >
          View deposit tx on Explorer ↗
        </a>
      </div>
    );
  }

  const num = Number(amount);
  const amountValid = Number.isFinite(num) && num > 0;

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-gold-400/15 bg-gold-400/[0.04] px-4 py-3 text-[11px] text-ink-300">
        Pick an asset to fund the vault as. Two signatures: Jupiter swap
        (USDC → asset), then transfer to the vault&apos;s ATA + {" "}
        <code className="rounded bg-white/5 px-1 py-0.5 text-[10px]">record_contribution</code>.
        The vault holds the actual stock - no manual rebalance needed.
      </div>

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

      <div>
        <label className="mb-2 block text-[11px] uppercase tracking-[0.16em] text-ink-300">
          Memo (optional)
        </label>
        <Input
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          placeholder="For Aidana's tuition"
          maxLength={140}
          disabled={submitting}
        />
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-xs">
        <div className="flex items-baseline justify-between">
          <span className="uppercase tracking-[0.16em] text-ink-400">
            {quote?.mode === "direct" ? "Direct transfer" : "Vault receives (estimate)"}
          </span>
          <span
            className="num-tab text-base text-ink-100"
            style={{ color: target.color }}
          >
            {quote
              ? `${formatTokenAmount(quote.mode === "swap" ? quote.outAmount : quote.transferAmount, target.decimals)} ${target.symbol}`
              : quoting
              ? "…"
              : amountValid
              ? quoteErr
                ? "-"
                : "…"
              : "0"}
          </span>
        </div>
        {quote?.mode === "swap" && (
          <div className="mt-1 flex items-baseline justify-between text-[10px] text-ink-500">
            <span>Min. after 1% slippage</span>
            <span className="num-tab">
              {`${formatTokenAmount(quote.minOutputAmount, target.decimals)} ${target.symbol}`}
            </span>
          </div>
        )}
        {quote?.mode === "direct" && (
          <div className="mt-1 text-[10px] text-ink-400">
            {target.symbol} has no Jupiter route - contributing your existing
            {" "}{target.symbol} balance directly. {target.symbol === "PUSD" ? (
              <a
                href="https://palmusd.com"
                target="_blank"
                rel="noreferrer"
                className="text-gold-300 hover:text-gold-200"
              >
                Get PUSD ↗
              </a>
            ) : null}
          </div>
        )}
        {quoteErr && (
          <div className="mt-2 text-[10px] text-[color:var(--color-down)]">
            {quoteErr}
          </div>
        )}
      </div>

      {submitting && (
        <div className="space-y-2 rounded-xl border border-gold-400/15 bg-gold-400/[0.04] px-4 py-3">
          <div className="text-[11px] text-ink-200">{STAGE_LABELS[progress.stage]}</div>
          {progress.detail && <div className="text-[10px] text-ink-500">{progress.detail}</div>}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-[color:var(--color-down)]/30 bg-[color:var(--color-down)]/10 px-4 py-3 text-sm text-[color:var(--color-down)]">
          {error}
        </div>
      )}

      <Button
        className="w-full"
        size="lg"
        onClick={deposit}
        disabled={submitting || !publicKey || !quote || !amountValid}
      >
        {submitting
          ? STAGE_LABELS[progress.stage]
          : !publicKey
          ? "Connect wallet to deposit"
          : !amountValid
          ? "Enter an amount"
          : !quote
          ? "Loading quote…"
          : `Deposit $${amount} as ${target.symbol}`}
      </Button>
      <div className="text-center text-[11px] text-ink-500">
        {quote?.mode === "direct"
          ? `One signature. Vault ends up holding ${target.symbol}, not USDC.`
          : `Two signatures, one after the other. Vault ends up holding ${target.symbol}, not USDC.`}
      </div>
    </div>
  );
}

function formatTokenAmount(raw: bigint, decimals: number): string {
  const v = Number(raw) / 10 ** decimals;
  if (v >= 1000) return v.toFixed(2);
  if (v >= 1) return v.toFixed(3);
  if (v >= 0.001) return v.toFixed(4);
  return v.toExponential(2);
}
