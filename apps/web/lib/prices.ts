/**
 * Price feed. We proxy Jupiter Price API v2 through our own /api/prices route
 * so the browser avoids CORS and we can cache aggressively.
 */

export type PriceMap = Record<string, { usd: number }>;

export async function fetchPrices(mints: string[]): Promise<PriceMap> {
  if (mints.length === 0) return {};
  const params = new URLSearchParams({ mints: mints.join(",") });
  const res = await fetch(`/api/prices?${params}`, { next: { revalidate: 30 } });
  if (!res.ok) return {};
  return res.json();
}
