/**
 * Cloak circuits (S3) proxy.
 *
 * The SDK pins its snarkjs proving artifacts at
 * `https://cloak-circuits.s3.us-east-1.amazonaws.com/circuits/0.1.0/`.
 * That bucket has no CORS allowance for our origin (returns 403 with
 * `CORSResponse: This CORS request is not allowed`), and the SDK has no
 * public override for the URL - `circuitsPath` is documented as ignored.
 *
 * Workaround: a fetch monkey-patch in `lib/cloak/sdk.ts` rewrites requests
 * to that S3 origin to land on this route, which re-issues server-side
 * (no CORS) and streams the bytes back. The .zkey is ~10 MB so we let
 * fetch stream rather than buffering it.
 */

import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UPSTREAM =
  process.env.CLOAK_CIRCUITS_UPSTREAM ??
  "https://cloak-circuits.s3.us-east-1.amazonaws.com/circuits/0.1.0";

async function proxy(req: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await ctx.params;
  const search = req.nextUrl.search ?? "";
  const url = `${UPSTREAM}/${path.join("/")}${search}`;

  const headers = new Headers();
  const accept = req.headers.get("accept");
  const range = req.headers.get("range");
  if (accept) headers.set("accept", accept);
  if (range) headers.set("range", range);

  try {
    const res = await fetch(url, { method: "GET", headers, cache: "force-cache" });
    const out = new Headers();
    for (const [k, v] of res.headers.entries()) {
      const lk = k.toLowerCase();
      if (lk === "content-encoding" || lk === "transfer-encoding" || lk === "connection") continue;
      out.set(k, v);
    }
    // Circuit files are immutable per pinned version - long cache is safe.
    out.set("cache-control", "public, max-age=31536000, immutable");
    return new Response(res.body, { status: res.status, headers: out });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: `Cloak circuits proxy error: ${msg}` }), {
      status: 502,
      headers: { "content-type": "application/json" },
    });
  }
}

export const GET = proxy;
export const HEAD = proxy;
