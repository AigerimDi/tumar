"use client";

import { Card, CardLabel, CardTitle } from "@/components/ui/card";
import { OrnamentDivider } from "@/components/ornament";
import { PrivateBuy } from "@/components/private-buy";

export default function PrivateBuyPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header>
        <div className="text-[11px] uppercase tracking-[0.2em] text-gold-300">
          Private buy
        </div>
        <h1 className="mt-2 font-serif text-5xl tracking-tight text-ink-100">
          Buy <span className="italic text-gold-200">privately</span>.
        </h1>
        <p className="mt-3 max-w-xl text-ink-300">
          Shield your USDC inside Cloak&apos;s pool, then swap through
          Orca to xStocks (NVDAx, SPYx, …), KZTE, or jitoSOL. The on-chain
          link to where your USDC came from breaks at the pool boundary -
          observers see a wallet hold tokenized exposure, not how it was
          funded.
        </p>
      </header>

      <Card highlighted>
        <CardLabel>Cloak - Orca-routed</CardLabel>
        <CardTitle className="mt-1">Shielded swap</CardTitle>
        <OrnamentDivider className="my-8 opacity-40" />
        <PrivateBuy />
      </Card>

      <Card>
        <CardTitle>How it works</CardTitle>
        <ol className="mt-4 space-y-3 text-sm text-ink-300">
          <li className="flex gap-3">
            <span className="num text-gold-300">1.</span>
            We build an Address Lookup Table covering Cloak&apos;s pool
            accounts (one Phantom prompt). Required for SPL transactions
            to fit Solana&apos;s 1232-byte legacy size limit.
          </li>
          <li className="flex gap-3">
            <span className="num text-gold-300">2.</span>
            Your wallet signs the shield deposit - USDC enters Cloak&apos;s
            shielded pool, you get back a UTXO encrypted to a fresh keypair.
          </li>
          <li className="flex gap-3">
            <span className="num text-gold-300">3.</span>
            The Cloak relay routes the shielded note through Orca&apos;s
            swap pools and delivers your target token straight to your
            associated token account. <em>No user signature</em> on this
            leg - that&apos;s where the privacy lives.
          </li>
          <li className="flex gap-3">
            <span className="num text-gold-300">4.</span>
            Tokens land in your wallet&apos;s ATA. You can hold them, sell
            them, or move them later through Cloak again.
          </li>
        </ol>

        <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-[11px] text-ink-400">
          <span className="uppercase tracking-[0.16em] text-ink-300">Honest privacy.</span>{" "}
          What this hides: the on-chain link from{" "}
          <em>where you got the USDC</em> to the swap. What this doesn&apos;t
          hide: your wallet still receives the output token, so an observer
          who watches your wallet still sees you acquire NVDAx (or
          whatever). For source-untraceable holdings, shield in advance and
          hold the shielded note - don&apos;t same-flow.
        </div>
      </Card>
    </div>
  );
}
