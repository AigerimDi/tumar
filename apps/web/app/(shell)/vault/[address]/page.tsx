"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";

import { Button } from "@/components/ui/button";
import { Card, CardLabel, CardTitle } from "@/components/ui/card";
import { AllocationRing } from "@/components/allocation-ring";
import { AssetRow, type AssetRowData } from "@/components/asset-row";
import { BalanceCounter } from "@/components/balance-counter";
import {
  ContributionFeed,
  type Contribution,
} from "@/components/contribution-feed";
import { CreatorWithdraw } from "@/components/creator-withdraw";
import { OrnamentDivider } from "@/components/ornament";
import { useVault } from "@/hooks/use-vault";
import { useVaultHoldings } from "@/hooks/use-vault-holdings";
import { rememberVault } from "@/lib/recent-vaults";
import { findToken } from "@/lib/tokens";
import { explorerUrl, shorten } from "@/lib/utils";

export default function VaultPage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = use(params);
  const vault = useVault(address);
  const { publicKey } = useWallet();
  const router = useRouter();
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [showWithdraw, setShowWithdraw] = useState(false);

  const isCreator =
    publicKey != null && vault != null && publicKey.toBase58() === vault.creator;

  // Save to localStorage so the user can find this vault again from /vaults.
  useEffect(() => {
    if (!vault) return;
    rememberVault({ address: vault.address, name: vault.name, creator: vault.creator });
  }, [vault]);

  // Real contribution feed, straight from chain. Poll every 15s so a fresh
  // deposit shows up without a manual refresh.
  useEffect(() => {
    if (!vault) return;
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch(`/api/vault/${vault.address}/contributions`, {
          cache: "no-store",
        });
        const j = await r.json();
        if (cancelled || !j.ok) return;
        setContributions(
          (j.contributions as Array<{
            signature: string;
            contributor: string;
            amount: number;
            timestamp: number;
            memo: string;
          }>).map((c) => ({
            signature: c.signature,
            contributor: c.contributor,
            amount: c.amount,
            timestamp: c.timestamp,
            memo: c.memo || undefined,
          })),
        );
      } catch {
        /* keep last-known list */
      }
    };
    load();
    const id = setInterval(load, 15_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [vault]);

  const { holdings } = useVaultHoldings(vault?.address);

  const rows: AssetRowData[] = useMemo(() => {
    if (!vault) return [];

    // Per-asset cost basis is unknown - `record_contribution` stores the
    // dollar inflow but not which asset each dollar bought, and the
    // contribution feed is a stream of "+$X" entries with no per-leg
    // breakdown. So we set `costBasisUsd: null` on every row, AssetRow
    // hides PnL with a "no cost basis" hint, and aggregate PnL is
    // computed below from `vault.usdcDeposited` (the chain-side net
    // deposit total) - which IS accurate at the portfolio level.
    const targetMints = new Set(vault.allocation.map((s) => s.mint));
    const targetRows: AssetRowData[] = vault.allocation
      .map((slot): AssetRowData | null => {
        const token = findToken(slot.mint);
        if (!token) return null;
        const live = holdings?.find((h) => h.token.mint === token.mint);
        // Show 0 once holdings load; show a soft target-pro-rated value
        // during the first paint so the page doesn't flash $0.
        const fallbackValue = vault.usdcDeposited * (slot.bps / 10_000);
        const currentValueUsd =
          holdings === null
            ? fallbackValue
            : live && Number.isFinite(live.valueUsd)
            ? live.valueUsd
            : 0;
        return {
          token,
          targetBps: slot.bps,
          currentValueUsd,
          costBasisUsd: null,
        };
      })
      .filter((x): x is AssetRowData => x !== null);

    // Surface holdings that AREN'T in the target allocation - typically
    // USDC sitting in the vault from regular deposits, or post-rebalance
    // residue. Without this they're invisible and the portfolio total
    // looks short.
    const extraRows: AssetRowData[] = (holdings ?? [])
      .filter((h) => !targetMints.has(h.token.mint))
      .filter((h) => Number.isFinite(h.valueUsd) && h.valueUsd > 0)
      .map((h): AssetRowData => ({
        token: h.token,
        targetBps: 0,
        currentValueUsd: h.valueUsd,
        costBasisUsd: null,
      }));

    return [...targetRows, ...extraRows];
  }, [vault, holdings]);

  // Aggregate PnL: real portfolio value (sum of on-chain holdings × spot)
  // vs net USDC deposited (chain-side `vault.usdcDeposited`, which is
  // gross deposits minus withdrawals - the accurate cost-basis number at
  // the portfolio level even though per-asset cost is unknown).
  const total = rows.reduce((s, r) => s + r.currentValueUsd, 0);
  const cost = vault?.usdcDeposited ?? 0;
  const pnl = total - cost;
  const pnlPct = cost > 0 ? (pnl / cost) * 100 : 0;

  if (vault === undefined) return <LoadingState />;
  if (vault === null) return <NotFound address={address} />;

  return (
    <div className="space-y-10">
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <div className="text-[11px] uppercase tracking-[0.2em] text-gold-300">
            Family Vault
          </div>
          <h1 className="mt-2 font-serif text-5xl tracking-tight text-ink-100">
            {vault.name}
          </h1>
          <div className="mt-2 flex items-center gap-3 text-xs text-ink-400">
            <Link
              href={explorerUrl("address", vault.address)}
              target="_blank"
              className="transition-colors hover:text-gold-300"
            >
              {shorten(vault.address, 6)} ↗
            </Link>
            <span className="h-1 w-1 rounded-full bg-ink-600" />
            <span>{vault.memberCount} {vault.memberCount === 1 ? "member" : "members"}</span>
            <span className="h-1 w-1 rounded-full bg-ink-600" />
            <span>Created {new Date(vault.createdAt * 1000).toLocaleDateString()}</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          {isCreator && (
            <Button
              variant="ghost"
              onClick={() => setShowWithdraw((v) => !v)}
              aria-expanded={showWithdraw}
            >
              {showWithdraw ? "Hide withdraw" : "Withdraw"}
            </Button>
          )}
          <Link href={`/vault/${vault.address}/rebalance`}>
            <Button variant="secondary">Rebalance</Button>
          </Link>
          <Link href={`/vault/${vault.address}/invite`}>
            <Button variant="secondary">Invite</Button>
          </Link>
          <Link href={`/vault/${vault.address}/deposit`}>
            <Button>Deposit</Button>
          </Link>
        </div>
      </header>

      {isCreator && showWithdraw && (
        <Card className="border-gold-400/10">
          <div className="flex items-baseline justify-between">
            <div>
              <CardLabel>Creator withdraw</CardLabel>
              <div className="mt-1 font-serif text-xl text-ink-100">
                Move USDC from the vault back to your wallet
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowWithdraw(false)}
              className="text-xs text-ink-400 hover:text-ink-100"
              aria-label="Close withdraw"
            >
              Close
            </button>
          </div>
          <OrnamentDivider className="my-6 opacity-40" />
          <CreatorWithdraw
            vault={vault.address}
            creator={vault.creator}
            onClosed={() => router.push("/terminal")}
          />
        </Card>
      )}

      {/* Summary */}
      <section className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <Card highlighted>
          <CardLabel>Portfolio value</CardLabel>
          <div className="mt-3 flex items-baseline gap-4">
            <BalanceCounter
              value={total}
              className="num text-6xl tracking-tight text-ink-100"
            />
            <span
              className={
                "num text-lg " +
                (pnl > 0
                  ? "text-[color:var(--color-up)]"
                  : pnl < 0
                  ? "text-[color:var(--color-down)]"
                  : "text-ink-300")
              }
            >
              {pnl >= 0 ? "+" : ""}
              {pnl.toLocaleString("en-US", { style: "currency", currency: "USD" })}
              <span className="ml-1 text-sm">
                ({pnlPct >= 0 ? "+" : ""}
                {pnlPct.toFixed(2)}%)
              </span>
            </span>
          </div>
          <OrnamentDivider className="my-8 opacity-40" />

          <div className="grid grid-cols-2 gap-6 text-sm sm:grid-cols-4">
            <Stat label="Deposited" value={`$${vault.usdcDeposited.toLocaleString("en-US", { maximumFractionDigits: 0 })}`} />
            <Stat label="Members" value={String(vault.memberCount)} />
            <Stat label="Assets" value={String(vault.allocation.length)} />
            <Stat label="Contributions" value={String(contributions.length)} />
          </div>
        </Card>

        <Card className="flex flex-col items-center justify-center gap-6">
          <AllocationRing
            slices={rows.map((r) => ({ label: r.token.symbol, bps: r.targetBps, color: r.token.color }))}
            centerLabel="Target mix"
            centerValue={`${rows.length}`}
            size={200}
          />
          <div className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs">
            {rows.map((r) => (
              <div key={r.token.mint} className="flex items-center gap-2 text-ink-200">
                <span className="h-2 w-2 rounded-full" style={{ background: r.token.color }} />
                <span>{r.token.symbol}</span>
                <span className="text-ink-400 num">{(r.targetBps / 100).toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </Card>
      </section>

      {/* Asset table */}
      <Card className="p-0">
        <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
          <div className="font-serif text-lg text-ink-100">Assets</div>
          <div className="text-[11px] uppercase tracking-[0.14em] text-ink-500">
            Target mix · {rows.length} {rows.length === 1 ? "asset" : "assets"}
          </div>
        </div>
        <div className="px-4">
          {rows.map((r) => (
            <AssetRow key={r.token.mint} row={r} total={total} />
          ))}
        </div>
      </Card>

      {/* Contributions */}
      <Card>
        <div className="flex items-center justify-between">
          <CardTitle>Contributions</CardTitle>
          <Link href={`/vault/${vault.address}/deposit`} className="text-xs text-gold-300 hover:text-gold-200">
            New deposit →
          </Link>
        </div>
        <div className="mt-6">
          <ContributionFeed items={contributions} />
        </div>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-[0.14em] text-ink-400">{label}</div>
      <div className="num mt-1 text-lg text-ink-100">{value}</div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-4">
      <div className="h-8 w-64 animate-pulse rounded-md bg-white/5" />
      <div className="h-48 animate-pulse rounded-2xl bg-white/5" />
    </div>
  );
}

function NotFound({ address }: { address: string }) {
  return (
    <div className="mx-auto max-w-xl space-y-6 text-center">
      <h1 className="font-serif text-3xl text-ink-100">Vault not found.</h1>
      <p className="text-ink-300">
        We couldn't find a Family Vault at{" "}
        <code className="rounded bg-white/5 px-1.5 py-0.5 text-xs">{shorten(address, 6)}</code>.
        Double-check the link, or create a new one.
      </p>
      <Link href="/create" className="inline-block">
        <Button>Create a vault</Button>
      </Link>
    </div>
  );
}
