/**
 * Portfolio backtest math.
 *
 * Given daily close series for each asset and target weights, produce:
 *   - portfolio value series (normalized or in $)
 *   - total return, annualized return
 *   - daily-return-based volatility (annualized)
 *   - max drawdown
 *   - Sharpe ratio (assume 4.5% risk-free for 2025-26)
 */

export type Series = { t: number; close: number }[];

export type PortfolioPoint = { t: number; value: number };

export type PortfolioStats = {
  initial: number;
  final: number;
  totalReturnPct: number;
  annualizedPct: number;
  volatilityPct: number;
  maxDrawdownPct: number;
  sharpe: number;
};

export type BacktestInput = {
  initial: number; // USD
  weights: { symbol: string; bps: number; series: Series }[];
  riskFreePct?: number; // default 4.5
};

/** Align timestamps across assets to the earliest common start. */
function alignSeries(
  inputs: { series: Series }[],
): { ts: number[]; values: number[][] } {
  if (inputs.length === 0) return { ts: [], values: [] };

  // Build a timestamp → close map per series.
  const maps = inputs.map((x) => {
    const m = new Map<number, number>();
    for (const p of x.series) m.set(dayKey(p.t), p.close);
    return m;
  });

  // Intersect keys (common days).
  const allDays = [...maps[0].keys()].filter((k) =>
    maps.every((m) => m.has(k)),
  ).sort((a, b) => a - b);

  const values = maps.map((m) => allDays.map((k) => m.get(k)!));
  return { ts: allDays, values };
}

function dayKey(unixSeconds: number): number {
  return Math.floor(unixSeconds / 86400);
}

export function backtest(input: BacktestInput): {
  points: PortfolioPoint[];
  stats: PortfolioStats;
} {
  const weights = input.weights;
  const totalBps = weights.reduce((s, w) => s + w.bps, 0);

  if (totalBps === 0 || weights.length === 0) {
    return emptyResult(input.initial);
  }

  const { ts, values } = alignSeries(weights);
  if (ts.length < 2) return emptyResult(input.initial);

  // Normalize each series to start at 1.0
  const normalized = values.map((arr) => arr.map((c) => c / arr[0]));

  const points: PortfolioPoint[] = ts.map((k, i) => {
    const v = weights.reduce((sum, w, idx) => {
      const weight = w.bps / totalBps;
      return sum + weight * normalized[idx][i];
    }, 0);
    return { t: k * 86400, value: v * input.initial };
  });

  const final = points[points.length - 1].value;
  const totalReturnPct = ((final - input.initial) / input.initial) * 100;

  const days = ts.length;
  const years = days / 252; // trading days
  const annualizedPct =
    (Math.pow(final / input.initial, 1 / Math.max(years, 1 / 252)) - 1) * 100;

  const dailyReturns: number[] = [];
  for (let i = 1; i < points.length; i++) {
    dailyReturns.push((points[i].value - points[i - 1].value) / points[i - 1].value);
  }
  const mean = dailyReturns.reduce((s, x) => s + x, 0) / dailyReturns.length;
  const variance =
    dailyReturns.reduce((s, x) => s + (x - mean) ** 2, 0) / dailyReturns.length;
  const dailyStd = Math.sqrt(variance);
  const volatilityPct = dailyStd * Math.sqrt(252) * 100;

  // Max drawdown
  let peak = points[0].value;
  let maxDd = 0;
  for (const p of points) {
    if (p.value > peak) peak = p.value;
    const dd = (peak - p.value) / peak;
    if (dd > maxDd) maxDd = dd;
  }
  const maxDrawdownPct = maxDd * 100;

  const rf = (input.riskFreePct ?? 4.5) / 100;
  const excessDaily = mean - rf / 252;
  const sharpe = dailyStd === 0 ? 0 : (excessDaily / dailyStd) * Math.sqrt(252);

  return {
    points,
    stats: {
      initial: input.initial,
      final,
      totalReturnPct,
      annualizedPct,
      volatilityPct,
      maxDrawdownPct,
      sharpe,
    },
  };
}

function emptyResult(initial: number): {
  points: PortfolioPoint[];
  stats: PortfolioStats;
} {
  return {
    points: [],
    stats: {
      initial,
      final: initial,
      totalReturnPct: 0,
      annualizedPct: 0,
      volatilityPct: 0,
      maxDrawdownPct: 0,
      sharpe: 0,
    },
  };
}
