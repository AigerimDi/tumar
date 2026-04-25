/**
 * Cloak SDK lazy loader.
 *
 * The SDK is heavy (~1 MB gzipped - snarkjs, circomlibjs, Jupiter client).
 * Static-importing it would tax every page; instead, every callable in this
 * module dynamically imports `@cloak.dev/sdk` on first use and caches the
 * namespace. The first private-deposit click pays the bundle cost; nothing
 * else does.
 *
 * Two cross-cutting concerns also live here:
 *
 * 1. The Cloak relay (`https://api.cloak.ag`) doesn't return
 *    `Access-Control-Allow-Origin` on its CORS preflight, so direct browser
 *    fetches die with `TypeError: Failed to fetch`. We send the SDK to a
 *    same-origin proxy at `/api/cloak` instead (see that route file).
 *
 * 2. The SDK pins its snarkjs proving artifacts at
 *    `https://cloak-circuits.s3.us-east-1.amazonaws.com/circuits/0.1.0/`
 *    with no CORS allowance for our origin and no public override (the
 *    `circuitsPath` arg is documented as ignored). We monkey-patch
 *    `window.fetch` once, before the SDK loads, to redirect that S3 origin
 *    through our same-origin `/api/cloak-circuits` proxy. Other fetches
 *    pass through unchanged.
 */

import type * as CloakNs from "@cloak.dev/sdk";

let cached: typeof CloakNs | null = null;
let fetchPatched = false;

const CLOAK_S3_HOST = "cloak-circuits.s3.us-east-1.amazonaws.com";

function patchFetchForCloakCircuits() {
  if (fetchPatched) return;
  if (typeof window === "undefined") return;
  const origin = window.location.origin;
  const original = window.fetch.bind(window);
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    let url: string | undefined;
    if (typeof input === "string") url = input;
    else if (input instanceof URL) url = input.toString();
    else if (input instanceof Request) url = input.url;

    if (url && url.includes(CLOAK_S3_HOST)) {
      const idx = url.indexOf("/circuits/0.1.0/");
      const tail =
        idx >= 0
          ? url.slice(idx + "/circuits/0.1.0/".length)
          : url.split(`${CLOAK_S3_HOST}/`).pop()!;
      const rewritten = `${origin}/api/cloak-circuits/${tail}`;
      // For Request inputs we can't simply swap URL - re-issue as plain fetch.
      return original(rewritten, init);
    }
    return original(input as RequestInfo, init);
  }) as typeof fetch;
  fetchPatched = true;
}

export async function loadCloak(): Promise<typeof CloakNs> {
  if (cached) return cached;
  patchFetchForCloakCircuits();
  cached = await import("@cloak.dev/sdk");
  return cached;
}

export const CLOAK_NETWORK = "mainnet" as const;

/**
 * Cloak relay URL. The SDK constructs `${relayUrl}/<endpoint>` fetches.
 *
 * Browser uses our same-origin `/api/cloak` proxy (CORS-friendly + keeps
 * the Helius-style "key never in the bundle" pattern available if we ever
 * need an authenticated relay). Server-side, point straight at upstream.
 */
export const CLOAK_RELAY_URL =
  typeof window !== "undefined"
    ? `${window.location.origin}/api/cloak`
    : "https://api.cloak.ag";
