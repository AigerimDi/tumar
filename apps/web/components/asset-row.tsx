import type { Token } from "@/lib/tokens";
import { formatPct, formatUsd } from "@/lib/utils";
import { cn } from "@/lib/utils";

export type AssetRowData = {
  token: Token;
  targetBps: number;
  currentValueUsd: number;
  /** Per-asset cost basis. Pass `null` when unknown (e.g. when the vault
   * was funded by per-asset deposits - we know the dollar inflow but not
   * which asset each dollar bought) and the row will hide PnL. */
  costBasisUsd: number | null;
};

export function AssetRow({ row, total }: { row: AssetRowData; total: number }) {
  const { token, targetBps, currentValueUsd, costBasisUsd } = row;
  const knowCost = costBasisUsd != null && costBasisUsd > 0;
  const pnl = knowCost ? currentValueUsd - costBasisUsd : 0;
  const pnlPct = knowCost ? (pnl / costBasisUsd) * 100 : 0;
  // Drift is only meaningful once there's a portfolio to measure against.
  // Showing "-10.0pp" on every slot of an empty vault is a bug, not a signal.
  const hasPortfolio = total > 0;
  const actualBps = hasPortfolio ? Math.round((currentValueUsd / total) * 10_000) : targetBps;
  const drift = actualBps - targetBps;

  return (
    <div className="grid grid-cols-[auto_1fr_auto_auto_auto] items-center gap-4 border-b border-white/5 px-2 py-4 last:border-b-0 hover:bg-white/[0.02] transition-colors">
      <div
        className="flex h-10 w-10 items-center justify-center rounded-full text-[13px] font-semibold"
        style={{
          background: `${token.color}22`,
          color: token.color,
          boxShadow: `inset 0 0 0 1px ${token.color}33`,
        }}
      >
        {token.symbol.slice(0, 2)}
      </div>

      <div className="min-w-0">
        <div className="truncate text-sm text-ink-100">{token.symbol}</div>
        <div className="truncate text-xs text-ink-400">{token.name}</div>
      </div>

      <div className="text-right tabular-nums">
        <div className="text-xs text-ink-400">Target</div>
        <div className="num text-sm text-ink-100">{(targetBps / 100).toFixed(1)}%</div>
        {hasPortfolio ? (
          <div
            className={cn(
              "text-[11px]",
              Math.abs(drift) < 100 ? "text-ink-400"
                : drift > 0 ? "text-[color:var(--color-up)]"
                : "text-[color:var(--color-down)]",
            )}
          >
            {drift >= 0 ? "+" : ""}{(drift / 100).toFixed(1)}pp
          </div>
        ) : (
          <div className="text-[11px] text-ink-500">-</div>
        )}
      </div>

      <div className="text-right">
        <div className="text-xs text-ink-400">Value</div>
        <div className="num text-sm text-ink-100">{formatUsd(currentValueUsd)}</div>
      </div>

      <div className="text-right">
        <div className="text-xs text-ink-400">P&L</div>
        {knowCost ? (
          <>
            <div
              className={cn(
                "num text-sm",
                pnl > 0 ? "text-[color:var(--color-up)]"
                  : pnl < 0 ? "text-[color:var(--color-down)]"
                  : "text-ink-200",
              )}
            >
              {formatUsd(pnl, { showSign: true })}
            </div>
            <div
              className={cn(
                "text-[11px]",
                pnl > 0 ? "text-[color:var(--color-up)]"
                  : pnl < 0 ? "text-[color:var(--color-down)]"
                  : "text-ink-400",
              )}
            >
              {formatPct(pnlPct, { showSign: true })}
            </div>
          </>
        ) : (
          <>
            <div className="num text-sm text-ink-500">-</div>
            <div className="text-[11px] text-ink-500">no cost basis</div>
          </>
        )}
      </div>
    </div>
  );
}
