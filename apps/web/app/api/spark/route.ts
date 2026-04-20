/**
 * Yahoo Finance spark endpoint - last price, prev close, % change, and a
 * thin sparkline series for a batch of symbols in one request.
 *
 * /api/spark?symbols=SPY,AAPL,NVDA,TSLA&range=1d&interval=5m
 * Response: { SPY: { price, prevClose, changePct, spark: [n...] }, ... }
 *
 * Caching:
 *   - `revalidate = 300` (5 min) - fresh enough for a ticker tape, cheap
 *     enough to survive a deck demo.
 *   - On upstream failure / empty payload we splice in bundled snapshots.
 *     The snapshot was captured at 1d/5m so callers asking for different
 *     range/interval just get the most recent intraday bars.
 */

import { getSparkFallback, type SparkPoint } from "@/lib/fallback-data";

export const revalidate = 300; // 5 min

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbols = searchParams.get("symbols");
  const range = searchParams.get("range") ?? "1d";
  const interval = searchParams.get("interval") ?? "5m";
  if (!symbols) return Response.json({}, { status: 200 });

  try {
    const url = `https://query1.finance.yahoo.com/v7/finance/spark?symbols=${encodeURIComponent(
      symbols,
    )}&range=${range}&interval=${interval}&indicators=close&includeTimestamps=false`;
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Tumar/0.1",
      },
      next: { revalidate: 300 },
    });

    if (res.ok) {
      const json = await res.json();
      const results = json?.spark?.result ?? [];
      const out: Record<string, SparkPoint> = {};
      for (const r of results) {
        const sym = r.symbol as string;
        const meta = r.response?.[0]?.meta ?? {};
        const spark = (r.response?.[0]?.indicators?.quote?.[0]?.close ?? [])
          .filter((n: number | null) => n != null);
        const price = Number(meta.regularMarketPrice ?? spark[spark.length - 1] ?? 0);
        const prevClose = Number(
          meta.chartPreviousClose ?? meta.previousClose ?? spark[0] ?? price,
        );
        const changePct = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0;
        out[sym] = { price, prevClose, changePct, spark };
      }
      if (Object.keys(out).length > 0) return Response.json(out);
    }

    // Upstream failed or empty - splice in bundled snapshot for whatever we have.
    return Response.json(getSparkFallback(symbols));
  } catch {
    return Response.json(getSparkFallback(symbols));
  }
}
