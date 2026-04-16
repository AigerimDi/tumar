/**
 * Server-side Solana JSON-RPC proxy.
 *
 * Why this exists: Solana Labs' public endpoint (api.mainnet-beta.solana.com)
 * returns 403 to browser traffic - rate-limited, CORS-restricted - so calling
 * it directly from a wallet-adapter `Connection` blows up with:
 *   "failed to get recent blockhash: Error: 403 : Access forbidden"
 *
 * This route accepts the same JSON-RPC POST body the client would have sent,
 * forwards it server-side to an upstream RPC (configurable via
 * `SOLANA_RPC_UPSTREAM`, defaulting to mainnet-beta which works from a
 * server), and returns the response. The browser talks to its same origin,
 * so no CORS headaches and no rate-limit rejections.
 *
 * If you have a Helius / QuickNode / Triton key, set `SOLANA_RPC_UPSTREAM`
 * to that URL in Vercel env and this proxy forwards straight to it -
 * authenticated RPC stays server-side and never hits the browser bundle.
 */

import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function upstream() {
  return (
    process.env.SOLANA_RPC_UPSTREAM ??
    process.env.NEXT_PUBLIC_RPC_URL ??
    "https://api.mainnet-beta.solana.com"
  );
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  try {
    const res = await fetch(upstream(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      // Solana RPC responses are not cacheable - they carry a unique id per call.
      cache: "no-store",
    });
    const text = await res.text();
    return new Response(text, {
      status: res.status,
      headers: {
        "content-type": res.headers.get("content-type") ?? "application/json",
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: `Proxy error: ${err instanceof Error ? err.message : String(err)}`,
        },
        id: null,
      }),
      {
        status: 502,
        headers: { "content-type": "application/json" },
      },
    );
  }
}

export async function GET() {
  return new Response(
    JSON.stringify({ ok: true, upstream: upstream().replace(/\/[^/]+$/, "/…") }),
    { headers: { "content-type": "application/json" } },
  );
}
