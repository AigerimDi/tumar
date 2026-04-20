"use client";

import { useEffect, useState } from "react";
import { XSTOCKS } from "@/lib/tokens";

type Quote = {
  price: number;
  prevClose: number;
  changePct: number;
};

const YAHOO_TO_XSTOCK: Record<string, { symbol: string; name: string }> = {};
for (const t of XSTOCKS) {
  if (t.yahoo) YAHOO_TO_XSTOCK[t.yahoo] = { symbol: t.symbol, name: t.name };
}
YAHOO_TO_XSTOCK["SOL-USD"] = { symbol: "jitoSOL", name: "Solana" };
YAHOO_TO_XSTOCK["BTC-USD"] = { symbol: "BTC", name: "Bitcoin" };
YAHOO_TO_XSTOCK["ETH-USD"] = { symbol: "ETH", name: "Ethereum" };
YAHOO_TO_XSTOCK["KZT=X"] = { symbol: "KZTE", name: "USD/KZT" };

const TICKER_SYMBOLS = [
  "SPY", "QQQ", "GLD",
  "AAPL", "NVDA", "TSLA", "GOOGL", "META", "MSFT", "AMZN",
  "COIN", "MSTR", "HOOD", "BRK-B", "LLY", "JPM", "PLTR",
  "BTC-USD", "ETH-USD", "SOL-USD",
];

export function TickerTape() {
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const url = `/api/spark?symbols=${TICKER_SYMBOLS.join(",")}&range=1d&interval=5m`;
        const res = await fetch(url);
        const json = await res.json();
        if (!cancelled) setQuotes(json);
      } catch {}
    }
    load();
    const id = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const entries = TICKER_SYMBOLS.map((y) => ({
    yahoo: y,
    meta: YAHOO_TO_XSTOCK[y] ?? { symbol: y, name: y },
    q: quotes[y],
  })).filter((e) => e.q && Number.isFinite(e.q.price) && e.q.price > 0);

  if (entries.length === 0) {
    return (
      <div className="border-y border-[var(--hairline)] bg-[var(--color-ink-900)]">
        <div className="num-tab flex h-9 items-center px-5 text-[11px] text-[var(--color-ink-400)]">
          Loading live quotes from Yahoo Finance…
        </div>
      </div>
    );
  }

  const track = [...entries, ...entries];

  return (
    <div className="overflow-hidden border-y border-[var(--hairline)] bg-[var(--color-ink-900)]">
      <div className="ticker-track flex w-max items-center whitespace-nowrap">
        {track.map((e, i) => {
          const up = e.q.changePct >= 0;
          return (
            <div
              key={`${e.yahoo}-${i}`}
              className="flex h-9 items-center gap-2 border-r border-[var(--hairline)] px-4 text-[11px]"
            >
              <span className="num-tab font-semibold tracking-wide text-[var(--color-ink-100)]">
                {e.meta.symbol}
              </span>
              <span className="num-tab text-[var(--color-ink-50)]">
                {e.q.price >= 100 ? e.q.price.toFixed(2) : e.q.price.toFixed(e.q.price < 1 ? 4 : 3)}
              </span>
              <span
                className="num-tab"
                style={{ color: up ? "var(--color-up)" : "var(--color-down)" }}
              >
                {up ? "▲" : "▼"} {Math.abs(e.q.changePct).toFixed(2)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
