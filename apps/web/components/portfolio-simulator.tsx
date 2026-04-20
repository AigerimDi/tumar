"use client";

import { useEffect, useMemo, useState } from "react";
import { DEFAULT_ALLOCATION, type Token } from "@/lib/tokens";
import { backtest, type Series } from "@/lib/backtest";
import { t } from "@/lib/i18n";
import { useLang } from "@/lib/use-lang";
import { PerformanceChart } from "./performance-chart";

type Row = { token: Token; bps: number };
type SeriesMap = Record<string, Series>;

const RANGES = [
  { key: "1mo", label: "1M" },
  { key: "6mo", label: "6M" },
  { key: "1y",  label: "1Y" },
  { key: "5y",  label: "5Y" },
  { key: "max", label: "MAX" },
] as const;
type RangeKey = (typeof RANGES)[number]["key"];

const DATE_LOCALE: Record<"en" | "ru" | "kz", string> = {
  en: "en-US",
  ru: "ru-RU",
  kz: "kk-KZ",
};

export function PortfolioSimulator() {
  const [lang] = useLang();
  const [rows, setRows] = useState<Row[]>(DEFAULT_ALLOCATION);
  const [initial, setInitial] = useState(1000);
  const [range, setRange] = useState<RangeKey>("5y");
  const [seriesMap, setSeriesMap] = useState<SeriesMap>({});
  const [loading, setLoading] = useState(true);
  const dateLocale = DATE_LOCALE[lang];

  const totalBps = rows.reduce((s, r) => s + r.bps, 0);

  const pegKey = "__USD__";

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const uniq = new Set<string>();
      for (const r of rows) {
        if (r.token.pegged) continue;
        if (r.token.yahoo) uniq.add(r.token.yahoo);
      }
      const yahoos = [...uniq];
      const results = await Promise.all(
        yahoos.map(async (sym) => {
          try {
            const res = await fetch(
              `/api/historical?symbol=${encodeURIComponent(sym)}&range=${range}&interval=1d`,
            );
            const j = await res.json();
            return [sym, (j.series ?? []) as Series] as const;
          } catch {
            return [sym, [] as Series] as const;
          }
        }),
      );
      if (cancelled) return;
      const next: SeriesMap = {};
      for (const [k, v] of results) next[k] = v;
      setSeriesMap(next);
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [range, rows]);

  const { points, stats, dateRange } = useMemo(() => {
    const usableRows = rows.filter((r) => r.bps > 0);
    if (usableRows.length === 0) {
      return { points: [], stats: null, dateRange: null };
    }

    let refLen = 0;
    let refTs: number[] = [];
    for (const r of usableRows) {
      if (r.token.pegged) continue;
      const s = seriesMap[r.token.yahoo ?? ""] ?? [];
      if (s.length > refLen) {
        refLen = s.length;
        refTs = s.map((x) => x.t);
      }
    }
    if (refLen === 0) {
      return { points: [], stats: null, dateRange: null };
    }

    const pegSeries: Series = refTs.map((t) => ({ t, close: 1 }));

    const weights = usableRows.map((r) => ({
      symbol: r.token.symbol,
      bps: r.bps,
      series: r.token.pegged
        ? pegSeries
        : seriesMap[r.token.yahoo ?? ""] ?? [],
    }));

    const result = backtest({ initial, weights });
    const dr =
      result.points.length >= 2
        ? {
            from: result.points[0].t,
            to: result.points[result.points.length - 1].t,
          }
        : null;
    return { points: result.points, stats: result.stats, dateRange: dr };
  }, [rows, seriesMap, initial]);

  const setBps = (i: number, bps: number) => {
    setRows((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], bps: Math.max(0, Math.round(bps)) };
      return next;
    });
  };

  const returnColor =
    stats && stats.totalReturnPct >= 0 ? "var(--color-up)" : "var(--color-down)";

  return (
    <section className="panel">
      {/* Header strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--hairline)] px-5 py-3">
        <div className="flex items-baseline gap-3">
          <span className="num-tab text-[10px] uppercase tracking-[0.16em] text-[var(--color-ink-400)]">
            {t(lang, "simBacktest")}
          </span>
          {dateRange && (
            <span className="num-tab text-[10px] text-[var(--color-ink-500)]">
              {new Date(dateRange.from * 1000).toLocaleDateString(dateLocale, { month: "short", day: "numeric", year: "numeric" })}
              {" → "}
              {new Date(dateRange.to * 1000).toLocaleDateString(dateLocale, { month: "short", day: "numeric", year: "numeric" })}
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              className={`num-tab h-7 px-2.5 text-[11px] uppercase tracking-wider ${
                range === r.key
                  ? "bg-[var(--color-ink-50)] text-[var(--color-ink-950)]"
                  : "text-[var(--color-ink-300)] hover:text-[var(--color-ink-50)]"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px]">
        {/* LEFT: hero number + chart */}
        <div className="border-b border-[var(--hairline)] lg:border-b-0 lg:border-r">
          <div className="px-5 pt-6 pb-4">
            <div className="flex items-baseline gap-3">
              <span className="num-tab text-[10px] uppercase tracking-[0.16em] text-[var(--color-ink-400)]">
                {t(lang, "simPortfolioValue")}
              </span>
              <span className="num-tab text-[10px] text-[var(--color-ink-500)]">
                {loading ? t(lang, "simLoading") : t(lang, "simLive")}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-end gap-x-6 gap-y-2">
              <div
                key={stats?.final.toFixed(2) ?? "0"}
                className="num count-rise text-[64px] leading-none tracking-tight text-[var(--color-ink-50)] sm:text-[84px]"
              >
                ${(stats?.final ?? initial).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </div>
              {stats && (
                <div className="flex flex-col">
                  <span
                    className="num text-[28px] leading-none"
                    style={{ color: returnColor }}
                  >
                    {stats.totalReturnPct >= 0 ? "+" : ""}
                    {stats.totalReturnPct.toFixed(2)}%
                  </span>
                  <span className="num-tab mt-1 text-[10px] uppercase tracking-wider text-[var(--color-ink-400)]">
                    {t(lang, "simFrom")} ${initial.toLocaleString()} · {stats.annualizedPct.toFixed(1)}% {t(lang, "simAnnShort")}
                  </span>
                </div>
              )}
            </div>
          </div>

          <PerformanceChart points={points} initial={initial} />

          {/* Stats grid */}
          <div className="grid grid-cols-4 border-t border-[var(--hairline)]">
            <Stat label={t(lang, "simTotalReturn")} value={stats ? `${stats.totalReturnPct >= 0 ? "+" : ""}${stats.totalReturnPct.toFixed(2)}%` : "-"} accent={returnColor} />
            <Stat label={t(lang, "simAnnualized")} value={stats ? `${stats.annualizedPct.toFixed(2)}%` : "-"} />
            <Stat label={t(lang, "simVolatility")} value={stats ? `${stats.volatilityPct.toFixed(2)}%` : "-"} />
            <Stat label={t(lang, "simMaxDD")} value={stats ? `-${stats.maxDrawdownPct.toFixed(2)}%` : "-"} accent="var(--color-down)" />
          </div>
          <div className="grid grid-cols-4 border-t border-[var(--hairline)]">
            <Stat label={t(lang, "simSharpe")} value={stats ? stats.sharpe.toFixed(2) : "-"} />
            <Stat label={t(lang, "simTradingDays")} value={points.length > 0 ? String(points.length) : "-"} />
            <Stat label={t(lang, "simInitial")} value={`$${initial.toLocaleString()}`} />
            <Stat label={t(lang, "simFinal")} value={stats ? `$${stats.final.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "-"} />
          </div>
        </div>

        {/* RIGHT: allocation editor */}
        <div>
          <div className="flex items-center justify-between border-b border-[var(--hairline)] px-5 py-3">
            <span className="num-tab text-[10px] uppercase tracking-[0.16em] text-[var(--color-ink-400)]">
              {t(lang, "simAllocation")}
            </span>
            <div className="flex items-center gap-2">
              <span className="num-tab text-[10px] text-[var(--color-ink-400)]">{t(lang, "simInitial")}</span>
              <div className="flex items-center border border-[var(--hairline)]">
                <span className="num-tab px-2 text-[11px] text-[var(--color-ink-400)]">$</span>
                <input
                  type="number"
                  value={initial}
                  min={100}
                  max={1_000_000}
                  step={100}
                  onChange={(e) => setInitial(Math.max(100, Number(e.target.value) || 0))}
                  className="num-tab w-20 bg-transparent px-1 py-1 text-right text-[12px] text-[var(--color-ink-50)] outline-none"
                />
              </div>
            </div>
          </div>

          <div className="grid-lines">
            {rows.map((r, i) => {
              const pct = totalBps > 0 ? (r.bps / totalBps) * 100 : 0;
              return (
                <div key={r.token.mint} className="px-5 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 shrink-0"
                        style={{ background: r.token.color }}
                      />
                      <div className="min-w-0">
                        <div className="num-tab text-[12px] font-semibold text-[var(--color-ink-50)]">
                          {r.token.symbol}
                        </div>
                        <div className="truncate text-[10px] text-[var(--color-ink-400)]">
                          {r.token.underlying ?? r.token.name}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={Math.round(pct)}
                        min={0}
                        max={100}
                        onChange={(e) => {
                          const v = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                          setBps(i, v * 100);
                        }}
                        className="num-tab w-12 border border-[var(--hairline)] bg-transparent px-1 py-1 text-right text-[12px] text-[var(--color-ink-50)] outline-none"
                      />
                      <span className="num-tab text-[11px] text-[var(--color-ink-400)]">%</span>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      type="range"
                      min={0}
                      max={10000}
                      step={100}
                      value={r.bps}
                      onChange={(e) => setBps(i, Number(e.target.value))}
                      className="slider-raw grow"
                      style={{
                        accentColor: r.token.color,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between border-t border-[var(--hairline)] px-5 py-2.5">
            <span className="num-tab text-[10px] uppercase tracking-[0.16em] text-[var(--color-ink-400)]">
              {t(lang, "simTotal")}
            </span>
            <span
              className="num-tab text-[12px] font-semibold"
              style={{
                color:
                  totalBps === 10000
                    ? "var(--color-up)"
                    : totalBps > 10000
                    ? "var(--color-down)"
                    : "var(--color-gold-400)",
              }}
            >
              {(totalBps / 100).toFixed(0)}%
              {totalBps !== 10000 && totalBps > 0 && (
                <span className="ml-1 text-[var(--color-ink-400)]">
                  {t(lang, "simScaled")}
                </span>
              )}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="border-r border-[var(--hairline)] px-4 py-3 last:border-r-0">
      <div className="num-tab text-[9px] uppercase tracking-[0.14em] text-[var(--color-ink-400)]">
        {label}
      </div>
      <div
        className="num-tab mt-1 text-[15px] font-semibold"
        style={{ color: accent ?? "var(--color-ink-50)" }}
      >
        {value}
      </div>
    </div>
  );
}
