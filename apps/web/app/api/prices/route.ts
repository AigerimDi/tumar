/**
 * Jupiter Price API proxy.
 *
 * The old `api.jup.ag/price/v2` endpoint was retired - calling it now
 * returns "Route not found" with empty body, which is why the vault page
 * was showing $0 for every asset (price map silently empty → every
 * holding's `valueUsd` came out NaN → fallback to 0).
 *
 * The current free endpoint is `lite-api.jup.ag/price/v3`. Response shape
 * also changed - flat `{ [mint]: { usdPrice: number, ... } }` instead of
 * the old `{ data: { [mint]: { price: string } } }`. We unwrap to a
 * stable shape (`{ [mint]: { usd: number } }`) so callers don't have to
 * track Jupiter's API churn.
 *
 * Docs: https://dev.jup.ag/docs/api/price-api/v3
 */

export const revalidate = 30;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const mints = searchParams.get("mints");
  if (!mints) return Response.json({}, { status: 200 });

  const url = `https://lite-api.jup.ag/price/v3?ids=${mints}`;
  try {
    const res = await fetch(url, { next: { revalidate: 30 } });
    if (!res.ok) return Response.json({}, { status: 200 });
    const json = (await res.json()) as Record<string, { usdPrice?: number }>;
    const out: Record<string, { usd: number }> = {};
    for (const [mint, v] of Object.entries(json ?? {})) {
      const price = Number(v?.usdPrice);
      if (Number.isFinite(price)) out[mint] = { usd: price };
    }
    return Response.json(out);
  } catch {
    return Response.json({}, { status: 200 });
  }
}
