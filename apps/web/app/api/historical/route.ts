/**
 * Yahoo Finance v8/chart proxy - daily/weekly closes for one symbol over a
 * range. Response shape: { symbol, currency, price, prevClose, series: [{ t, close }] }.
 *
 * Caching strategy:
 *   - `revalidate = 21600` (6h) so the Vercel Data Cache serves most requests
 *     without touching Yahoo. Historical weekly bars don't move often.
 *   - On upstream failure / empty payload we fall back to bundled snapshots
 *     shipped in `lib/fallback-data` so the chart always has something to
 *     render, even offline.
 */

import {
  getHistoricalFallback,
  isEmptyHistorical,
  type HistoricalResponse,
} from "@/lib/fallback-data";

export const revalidate = 21600; // 6h

function emptyResponse(symbol: string): HistoricalResponse {
  return { symbol, currency: "USD", price: null, prevClose: null, series: [] };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol");
  const range = searchParams.get("range") ?? "1y";
  const interval = searchParams.get("interval") ?? "1d";

  if (!symbol) return Response.json({ error: "symbol required" }, { status: 400 });

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
      symbol,
    )}?interval=${interval}&range=${range}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Tumar/0.1",
      },
      next: { revalidate: 21600 },
    });

    if (res.ok) {
      const json = await res.json();
      if (!isEmptyHistorical(json)) {
        const r = json.chart.result[0];
        const ts = (r.timestamp ?? []) as number[];
        const closes = (r.indicators?.quote?.[0]?.close ?? []) as (number | null)[];
        const series: { t: number; close: number }[] = [];
        for (let i = 0; i < ts.length; i++) {
          const c = closes[i];
          if (c != null && Number.isFinite(c)) series.push({ t: ts[i], close: c });
        }
        return Response.json({
          symbol,
          currency: r.meta?.currency ?? "USD",
          price: r.meta?.regularMarketPrice ?? null,
          prevClose: r.meta?.chartPreviousClose ?? null,
          series,
        } satisfies HistoricalResponse);
      }
    }

    // Upstream failed or returned empty - try bundled snapshot.
    const fallback = getHistoricalFallback(symbol, range, interval);
    return Response.json(fallback ?? emptyResponse(symbol));
  } catch {
    const fallback = getHistoricalFallback(symbol, range, interval);
    return Response.json(fallback ?? emptyResponse(symbol));
  }
}
