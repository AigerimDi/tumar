"use client";

/**
 * My vaults - on-chain Member-PDA scan + localStorage cache + paste fallback.
 *
 * The on-chain scan is the source of truth: query Member accounts owned by
 * our program where `owner == wallet` and you have the canonical list of
 * every vault the user is a member of, regardless of which browser they
 * created/joined from. localStorage layers on top to render fast on first
 * paint and to keep showing entries while the scan is in flight (or if the
 * scan is rate-limited).
 *
 * Member layout (see IDL):
 *   8  discriminator
 *   32 vault
 *   32 owner   ← memcmp at offset 40
 *   8  joinedAt
 *   8  contributedLifetime
 *   1  bump
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";

import { Button } from "@/components/ui/button";
import { Card, CardLabel, CardTitle } from "@/components/ui/card";
import { OrnamentDivider } from "@/components/ornament";
import { Input } from "@/components/ui/input";
import { useTumarProgram } from "@/lib/anchor/program";
import {
  forgetVault,
  loadRecentVaults,
  rememberVault,
  type RecentVault,
} from "@/lib/recent-vaults";
import { shorten } from "@/lib/utils";

export default function VaultsPage() {
  const router = useRouter();
  const { publicKey } = useWallet();
  const program = useTumarProgram();
  const [vaults, setVaults] = useState<RecentVault[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanErr, setScanErr] = useState<string | null>(null);
  const [paste, setPaste] = useState("");
  const [pasteErr, setPasteErr] = useState<string | null>(null);

  // First paint: localStorage. Then merge with on-chain Member-PDA scan.
  useEffect(() => {
    setVaults(loadRecentVaults());
  }, []);

  useEffect(() => {
    if (!program || !publicKey) return;

    // Throttle on-chain scans - getProgramAccounts is heavy and Helius free
    // tier rate-limits aggressively. Cache the scan in sessionStorage for 5
    // minutes per-wallet so navigating between /vaults and /create doesn't
    // burn the RPC budget the create flow needs to confirm txs.
    const cacheKey = `tumar.scan.${publicKey.toBase58()}`;
    const TTL_MS = 5 * 60 * 1000;
    if (typeof window !== "undefined") {
      try {
        const raw = window.sessionStorage.getItem(cacheKey);
        if (raw) {
          const cached = JSON.parse(raw) as { scannedAt: number };
          if (Date.now() - cached.scannedAt < TTL_MS) {
            // Cache still warm - localStorage already has the merged list.
            return;
          }
        }
      } catch {
        /* ignore */
      }
    }

    let cancelled = false;
    setScanning(true);
    setScanErr(null);

    (async () => {
      try {
        // memcmp filter on `owner` field of Member: discriminator(8) + vault(32) = 40.
        const memberAcct = (program.account as unknown as {
          member: {
            all: (filters: Array<{ memcmp: { offset: number; bytes: string } }>) => Promise<
              Array<{ account: { vault: PublicKey; owner: PublicKey; joinedAt: { toNumber: () => number } } }>
            >;
          };
        }).member;
        const members = await memberAcct.all([
          { memcmp: { offset: 40, bytes: publicKey.toBase58() } },
        ]);
        if (cancelled) return;

        // Fetch each vault's name. Use fetchMultiple so it's one RPC roundtrip.
        const vaultAddrs = members.map((m) => m.account.vault);
        if (vaultAddrs.length === 0) {
          setScanning(false);
          return;
        }
        const vaultAcct = (program.account as unknown as {
          vault: {
            fetchMultiple: (addrs: PublicKey[]) => Promise<Array<{ name: string; creator: PublicKey } | null>>;
          };
        }).vault;
        const accs = await vaultAcct.fetchMultiple(vaultAddrs);
        if (cancelled) return;

        // Hydrate localStorage with everything we found, then re-read.
        for (let i = 0; i < members.length; i++) {
          const v = accs[i];
          if (!v) continue;
          const member = members[i];
          rememberVault({
            address: vaultAddrs[i].toBase58(),
            name: v.name,
            creator: v.creator.toBase58(),
            // Use the on-chain joinedAt as touchedAt - keeps "newest first"
            // ordering meaningful even for vaults this browser hasn't seen.
            touchedAt: member.account.joinedAt.toNumber() * 1000,
          });
        }
        setVaults(loadRecentVaults());
        // Stamp the cache so we don't re-run within the TTL window.
        try {
          window.sessionStorage.setItem(cacheKey, JSON.stringify({ scannedAt: Date.now() }));
        } catch {
          /* ignore */
        }
      } catch (e) {
        if (!cancelled) setScanErr(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setScanning(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [program, publicKey]);

  function handleOpen() {
    setPasteErr(null);
    const trimmed = paste.trim();
    if (!trimmed) return;
    try {
      const pk = new PublicKey(trimmed);
      router.push(`/vault/${pk.toBase58()}`);
    } catch {
      setPasteErr("That doesn't look like a valid Solana address.");
    }
  }

  function handleForget(addr: string) {
    forgetVault(addr);
    setVaults(loadRecentVaults());
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header>
        <div className="text-[11px] uppercase tracking-[0.2em] text-gold-300">
          My vaults
        </div>
        <h1 className="mt-2 font-serif text-5xl tracking-tight text-ink-100">
          Find your <span className="italic text-gold-200">vault</span>.
        </h1>
        <p className="mt-3 max-w-xl text-ink-300">
          Vaults this browser has touched, newest first. Or paste any vault
          PDA below to open it directly.
        </p>
      </header>

      <Card highlighted>
        <CardLabel>Open by address</CardLabel>
        <CardTitle className="mt-1">Paste a vault PDA</CardTitle>
        <OrnamentDivider className="my-6 opacity-40" />
        <div className="space-y-3">
          <Input
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleOpen();
            }}
            placeholder="HfCm…sp24Y"
            className="num text-base"
          />
          {pasteErr && (
            <div className="text-xs text-[color:var(--color-down)]">{pasteErr}</div>
          )}
          <Button onClick={handleOpen} disabled={paste.trim().length === 0}>
            Open vault
          </Button>
        </div>
      </Card>

      <Card>
        <CardLabel>{publicKey ? "Your memberships" : "Recent"}</CardLabel>
        <CardTitle className="mt-1">
          {vaults.length === 0
            ? scanning
              ? "Scanning chain…"
              : "No vaults yet"
            : `${vaults.length} vault${vaults.length === 1 ? "" : "s"}`}
        </CardTitle>
        <OrnamentDivider className="my-6 opacity-40" />

        {scanErr && (
          <div className="mb-4 rounded-xl border border-yellow-500/20 bg-yellow-500/[0.04] px-3 py-2 text-[11px] text-yellow-300/80">
            On-chain scan failed: {scanErr}. Showing browser cache only.
          </div>
        )}

        {vaults.length === 0 ? (
          <div className="space-y-4 text-sm text-ink-300">
            <p>
              {publicKey
                ? "We scanned for member accounts owned by your wallet and found none. Create a vault or open an invite link."
                : "Connect your wallet to load vaults you're a member of, or paste an address above."}
            </p>
            <Link href="/create" className="inline-block">
              <Button>New vault</Button>
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-white/5">
            {vaults.map((v) => {
              const isCreator = publicKey != null && v.creator === publicKey.toBase58();
              return (
                <li key={v.address} className="flex items-center justify-between gap-4 py-3">
                  <Link
                    href={`/vault/${v.address}`}
                    className="flex-1 min-w-0 text-left transition-colors hover:text-gold-300"
                  >
                    <div className="flex items-baseline gap-2">
                      <span className="font-serif text-lg text-ink-100">{v.name}</span>
                      {isCreator && (
                        <span className="rounded-full border border-gold-400/30 bg-gold-400/[0.06] px-2 py-0.5 text-[9px] uppercase tracking-[0.14em] text-gold-300">
                          creator
                        </span>
                      )}
                    </div>
                    <div className="num-tab mt-0.5 truncate text-[10px] text-ink-500">
                      {shorten(v.address, 6)} · last touched{" "}
                      {new Date(v.touchedAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </div>
                  </Link>
                  <button
                    type="button"
                    onClick={() => handleForget(v.address)}
                    className="text-[10px] uppercase tracking-[0.14em] text-ink-500 hover:text-[color:var(--color-down)]"
                    title="Remove from this list (the on-chain vault is unaffected)"
                  >
                    Forget
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <div className="rounded-xl border border-white/5 bg-white/[0.01] px-4 py-3 text-[11px] text-ink-500">
        Backed by an on-chain scan of Member PDAs owned by your wallet,
        cached in localStorage for fast loads. Forgetting an entry only
        clears the cache - re-loading this page will repopulate from chain.
      </div>
    </div>
  );
}
