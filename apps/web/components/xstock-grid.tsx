"use client";

import { useEffect, useState } from "react";
import { XSTOCKS } from "@/lib/tokens";
import { Sparkline } from "./sparkline";

type Quote = {
  price: number;
  prevClose: number;
  changePct: number;
  spark: number[];
};

type SortKey = "symbol" | "price" | "change";
type SortDir = "asc" | "desc";

export function XStockGrid() {
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [sortBy, setSortBy] = useState<SortKey>("change");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const symbols = XSTOCKS.map((t) => t.yahoo).filter(Boolean).join(",");
        const res = await fetch(
          `/api/spark?symbols=${symbols}&range=1d&interval=5m`,
        );
        const j = await res.json();
        if (!cancelled) {
          setQuotes(j);
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    const id = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const rows = XSTOCKS.map((t) => {
    const q = t.yahoo ? quotes[t.yahoo] : undefined;
    return { token: t, q };
  });

  const sorted = [...rows].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    if (sortBy === "symbol") {
      return dir * a.token.symbol.localeCompare(b.token.symbol);
    }
    if (sortBy === "price") {
      return dir * ((a.q?.price ?? 0) - (b.q?.price ?? 0));
    }
    return dir * ((a.q?.changePct ?? 0) - (b.q?.changePct ?? 0));
  });

  const toggleSort = (k: SortKey) => {
    if (sortBy === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortBy(k);
      setSortDir(k === "symbol" ? "asc" : "desc");
    }
  };

  const arrow = (k: SortKey) =>
    sortBy === k ? (sortDir === "asc" ? "▲" : "▼") : "";

  return (
    <section className="panel">
      <div className="flex items-center justify-between border-b border-[var(--hairline)] px-5 py-3">
        <div className="flex items-baseline gap-3">
          <span className="num-tab text-[10px] uppercase tracking-[0.16em] text-[var(--color-ink-400)]">
            Backed xStocks · Solana Mainnet
          </span>
          <span className="num-tab text-[10px] text-[var(--color-ink-500)]">
            {loading ? "loading…" : `${rows.filter((r) => r.q).length} of ${rows.length} live`}
          </span>
        </div>
        <span className="num-tab text-[10px] uppercase tracking-[0.14em] text-[var(--color-ink-500)]">
          auto · 60s
        </span>
      </div>

      <div className="grid-lines">
        {/* Header row */}
        <div className="grid grid-cols-[1.3fr_1fr_0.9fr_1.2fr_0.5fr] items-center gap-3 px-5 py-2">
          <button
            onClick={() => toggleSort("symbol")}
            className="num-tab text-left text-[9px] uppercase tracking-[0.14em] text-[var(--color-ink-400)] hover:text-[var(--color-ink-100)]"
          >
            Asset {arrow("symbol")}
          </button>
          <button
            onClick={() => toggleSort("price")}
            className="num-tab text-right text-[9px] uppercase tracking-[0.14em] text-[var(--color-ink-400)] hover:text-[var(--color-ink-100)]"
          >
            Price {arrow("price")}
          </button>
          <button
            onClick={() => toggleSort("change")}
            className="num-tab text-right text-[9px] uppercase tracking-[0.14em] text-[var(--color-ink-400)] hover:text-[var(--color-ink-100)]"
          >
            1D {arrow("change")}
          </button>
          <span className="num-tab text-right text-[9px] uppercase tracking-[0.14em] text-[var(--color-ink-400)]">
            Session
          </span>
          <span />
        </div>

        {sorted.map(({ token, q }) => {
          const up = (q?.changePct ?? 0) >= 0;
          return (
            <div
              key={token.mint}
              className="grid grid-cols-[1.3fr_1fr_0.9fr_1.2fr_0.5fr] items-center gap-3 px-5 py-2.5 hover:bg-[var(--color-ink-850)]"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="h-2 w-2 shrink-0"
                  style={{ background: token.color }}
                />
                <div className="min-w-0">
                  <div className="num-tab text-[12px] font-semibold text-[var(--color-ink-50)]">
                    {token.symbol}
                  </div>
                  <div className="truncate text-[10px] text-[var(--color-ink-400)]">
                    {token.underlying ?? token.name}
                  </div>
                </div>
              </div>

              <div className="num-tab text-right text-[13px] text-[var(--color-ink-50)]">
                {q?.price ? (
                  `$${q.price.toFixed(2)}`
                ) : (
                  <span className="text-[var(--color-ink-500)]">-</span>
                )}
              </div>

              <div
                className="num-tab text-right text-[12px]"
                style={{ color: q ? (up ? "var(--color-up)" : "var(--color-down)") : "var(--color-ink-500)" }}
              >
                {q ? `${up ? "+" : ""}${q.changePct.toFixed(2)}%` : "-"}
              </div>

              <div className="flex justify-end">
                {q && q.spark.length > 1 ? (
                  <Sparkline
                    values={q.spark}
                    width={120}
                    height={24}
                    color={up ? "var(--color-up)" : "var(--color-down)"}
                    fill
                  />
                ) : (
                  <span className="text-[10px] text-[var(--color-ink-500)]">-</span>
                )}
              </div>

              <a
                href={`https://solscan.io/token/${token.mint}`}
                target="_blank"
                rel="noreferrer"
                title="View on Solscan"
                className="num-tab justify-self-end text-[10px] uppercase tracking-wider text-[var(--color-ink-400)] hover:text-[var(--color-gold-400)]"
              >
                SOL ↗
              </a>
            </div>
          );
        })}
      </div>
    </section>
  );
}
