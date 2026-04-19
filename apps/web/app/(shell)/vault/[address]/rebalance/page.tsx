"use client";

/**
 * Vault rebalance page - Jupiter-routed public swap.
 *
 * The Cloak shielded swap was removed alongside the rest of the Cloak
 * integration: the SDK's nullifier/state model proved too fragile to ship
 * at hackathon-tier reliability without committing to days of upstream
 * debugging. The public path is what's wired here.
 */

import { use } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardLabel, CardTitle } from "@/components/ui/card";
import { OrnamentDivider } from "@/components/ornament";
import { useVault } from "@/hooks/use-vault";
import { shorten } from "@/lib/utils";

export default function RebalancePage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = use(params);
  const vault = useVault(address);

  if (vault === undefined) return <RebalanceSkeleton />;
  if (vault === null) return <RebalanceNotFound address={address} />;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <Link
        href={`/vault/${address}`}
        className="text-xs text-ink-400 hover:text-ink-100"
      >
        ← Back to {vault.name}
      </Link>

      <header>
        <div className="text-[11px] uppercase tracking-[0.2em] text-gold-300">
          Rebalance
        </div>
        <h1 className="mt-2 font-serif text-5xl tracking-tight text-ink-100">
          Rebalance <span className="italic text-gold-200">{vault.name}</span>.
        </h1>
        <p className="mt-3 max-w-xl text-ink-300">
          Vault holds USDC today. The target allocation is recorded on
          chain but the swap from USDC into the basket isn&apos;t wired
          yet - that&apos;s the next instruction we&apos;ll add to the
          Anchor program.
        </p>
      </header>

      <Card highlighted>
        <CardLabel>Roadmap</CardLabel>
        <CardTitle className="mt-1">Vault-side rebalance</CardTitle>
        <OrnamentDivider className="my-8 opacity-40" />
        <div className="space-y-4 text-sm text-ink-300">
          <p>
            To move USDC out of the vault PDA into target tokens, the
            program itself needs a <code className="rounded bg-white/5 px-1.5 py-0.5 text-xs">rebalance_swap</code>{" "}
            instruction that signs a Jupiter CPI as the vault PDA. Until
            that&apos;s added, a vault holds whatever was deposited into
            it (USDC in v1).
          </p>
          <p className="text-xs text-ink-400">
            The single-tx alternative for individual contributors:{" "}
            <Link href="/buy" className="text-gold-300 hover:text-gold-200">
              Buy privately
            </Link>{" "}
            buys an xStock with your USDC privately via Cloak - useful for
            personal exposure without going through the vault. A
            &quot;contribute as NVDAx&quot; / &quot;contribute as SPYx&quot;
            per-asset deposit (one Jupiter swap into the vault&apos;s
            target ATA, in the same tx as <code className="rounded bg-white/5 px-1 py-0.5 text-[10px]">record_contribution</code>) is the
            right next addition - same ergonomics as the current direct
            deposit, but the vault ends up with the actual asset.
          </p>
        </div>
      </Card>
    </div>
  );
}

function RebalanceSkeleton() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="h-4 w-32 animate-pulse rounded bg-white/5" />
      <div className="h-12 w-96 animate-pulse rounded-md bg-white/5" />
      <div className="h-80 animate-pulse rounded-2xl bg-white/5" />
    </div>
  );
}

function RebalanceNotFound({ address }: { address: string }) {
  return (
    <div className="mx-auto max-w-xl space-y-6 text-center">
      <h1 className="font-serif text-3xl text-ink-100">Vault not found.</h1>
      <p className="text-ink-300">
        We couldn&apos;t find a Family Vault at{" "}
        <code className="rounded bg-white/5 px-1.5 py-0.5 text-xs">
          {shorten(address, 6)}
        </code>
        .
      </p>
      <Link href="/terminal" className="inline-block">
        <Button>Back to terminal</Button>
      </Link>
    </div>
  );
}
