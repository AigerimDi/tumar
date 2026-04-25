/**
 * Cloak relay proxy.
 *
 * The Cloak relay at `https://api.cloak.ag` doesn't return
 * `Access-Control-Allow-Origin` on its CORS preflight, so direct browser
 * fetches die with `TypeError: Failed to fetch`. This route accepts every
 * method we care about and re-issues the call server-side (no CORS),
 * streaming the response back to the browser.
 *
 * The Cloak SDK constructs URLs as `${relayUrl}/<endpoint>` for its many
 * endpoints (`/utxos`, `/relay`, `/anchor`, `/range-quote`, etc.). Setting
 * `relayUrl` to our same-origin `/api/cloak` keeps everything on the same
 * origin from the browser's perspective.
 */

import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UPSTREAM = process.env.CLOAK_RELAY_UPSTREAM ?? "https://api.cloak.ag";

async function proxy(req: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await ctx.params;
  const search = req.nextUrl.search ?? "";
  const url = `${UPSTREAM}/${path.join("/")}${search}`;

  const headers = new Headers();
  for (const [k, v] of req.headers.entries()) {
    const lk = k.toLowerCase();
    if (
      lk === "host" ||
      lk === "connection" ||
      lk === "content-length" ||
      lk.startsWith("x-vercel") ||
      lk.startsWith("x-forwarded") ||
      lk.startsWith("x-real-ip") ||
      lk === "cookie"
    ) continue;
    headers.set(k, v);
  }

  const init: RequestInit = { method: req.method, headers, cache: "no-store" };
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = await req.arrayBuffer();
  }

  try {
    const res = await fetch(url, init);
    const buf = await res.arrayBuffer();
    const out = new Headers();
    for (const [k, v] of res.headers.entries()) {
      const lk = k.toLowerCase();
      if (lk === "content-encoding" || lk === "transfer-encoding" || lk === "connection") continue;
      out.set(k, v);
    }
    out.set("cache-control", "no-store");
    return new Response(buf, { status: res.status, headers: out });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: `Cloak proxy error: ${msg}` }), {
      status: 502,
      headers: { "content-type": "application/json" },
    });
  }
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const DELETE = proxy;
export const PATCH = proxy;
export const OPTIONS = proxy;
