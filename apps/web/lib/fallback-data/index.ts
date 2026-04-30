/**
 * Bundled Yahoo Finance snapshots used as a fallback when the live API is
 * unreachable, rate-limited, or returns an empty series. The snapshots are
 * raw v8/chart (historical) and v7/spark (spark) responses captured offline
 * so the charts in the pitch deck, backtester, and ticker tape always render
 * something reasonable, even with no upstream connectivity.
 *
 * Payload size is ~560 KB historical + ~49 KB spark, bundled into the server
 * route handler only - never shipped to the client.
 */

import historicalBundle from "./historical-bundle.json";
import sparkBundle from "./spark-bundle.json";

type YahooChartResult = {
  meta?: {
    currency?: string;
    regularMarketPrice?: number;
    chartPreviousClose?: number;
    previousClose?: number;
  };
  timestamp?: number[];
  indicators?: { quote?: Array<{ close?: Array<number | null> }> };
};

type HistoricalKey = `${string}|${string}|${string}`;
const historicalMap = historicalBundle as Record<
  HistoricalKey,
  { chart?: { result?: YahooChartResult[] } }
>;

type SparkEntry = {
  symbol: string;
  response?: Array<{
    meta?: {
      regularMarketPrice?: number;
      chartPreviousClose?: number;
      previousClose?: number;
    };
    indicators?: { quote?: Array<{ close?: Array<number | null> }> };
  }>;
};
const sparkMap = sparkBundle as {
  spark?: { result?: SparkEntry[] };
};

export type HistoricalResponse = {
  symbol: string;
  currency: string;
  price: number | null;
  prevClose: number | null;
  series: { t: number; close: number }[];
};

export type SparkPoint = {
  price: number;
  prevClose: number;
  changePct: number;
  spark: number[];
};

/**
 * Return a bundled historical snapshot for `symbol` at the given range/interval,
 * or `null` if we don't have one. The shape matches /api/historical's response.
 */
export function getHistoricalFallback(
  symbol: string,
  range: string,
  interval: string,
): HistoricalResponse | null {
  // We only shipped 5y/1wk snapshots; gracefully handle other ranges by
  // falling back to the 5y/1wk bundle (the simulator + deck use 5y/1wk
  // exclusively; the /api/historical route is also used ad hoc).
  const candidates: HistoricalKey[] = [
    `${symbol}|${range}|${interval}` as HistoricalKey,
    `${symbol}|5y|1wk` as HistoricalKey,
  ];
  let raw: YahooChartResult | undefined;
  for (const key of candidates) {
    const hit = historicalMap[key];
    const r = hit?.chart?.result?.[0];
    if (r) {
      raw = r;
      break;
    }
  }
  if (!raw) return null;

  const ts = raw.timestamp ?? [];
  const closes = raw.indicators?.quote?.[0]?.close ?? [];
  const series: { t: number; close: number }[] = [];
  for (let i = 0; i < ts.length; i++) {
    const c = closes[i];
    if (c != null && Number.isFinite(c)) series.push({ t: ts[i], close: c });
  }
  return {
    symbol,
    currency: raw.meta?.currency ?? "USD",
    price: raw.meta?.regularMarketPrice ?? null,
    prevClose: raw.meta?.chartPreviousClose ?? null,
    series,
  };
}

/**
 * Return a bundled spark snapshot subset matching `symbols`. The shape matches
 * /api/spark's response. Missing symbols are simply omitted.
 */
export function getSparkFallback(symbolsCsv: string): Record<string, SparkPoint> {
  const wanted = new Set(
    symbolsCsv
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  const results = sparkMap.spark?.result ?? [];
  const out: Record<string, SparkPoint> = {};
  for (const r of results) {
    if (!wanted.has(r.symbol)) continue;
    const meta = r.response?.[0]?.meta ?? {};
    const rawSpark = r.response?.[0]?.indicators?.quote?.[0]?.close ?? [];
    const spark = rawSpark.filter(
      (n): n is number => n != null && Number.isFinite(n),
    );
    const price = Number(
      meta.regularMarketPrice ?? spark[spark.length - 1] ?? 0,
    );
    const prevClose = Number(
      meta.chartPreviousClose ?? meta.previousClose ?? spark[0] ?? price,
    );
    const changePct = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0;
    out[r.symbol] = { price, prevClose, changePct, spark };
  }
  return out;
}

/** Shallow check: does the live response actually contain a non-empty series? */
export function isEmptyHistorical(
  json: unknown,
): boolean {
  const r = (json as { chart?: { result?: YahooChartResult[] } })?.chart
    ?.result?.[0];
  if (!r) return true;
  const ts = r.timestamp ?? [];
  const closes = r.indicators?.quote?.[0]?.close ?? [];
  let valid = 0;
  for (let i = 0; i < ts.length && valid < 2; i++) {
    const c = closes[i];
    if (c != null && Number.isFinite(c)) valid++;
  }
  return valid < 2;
}
