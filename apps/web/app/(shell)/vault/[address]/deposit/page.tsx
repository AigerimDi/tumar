"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";

import { Button } from "@/components/ui/button";
import { Card, CardLabel, CardTitle } from "@/components/ui/card";
import { OrnamentDivider } from "@/components/ornament";
import { SolanaPayQr } from "@/components/solana-pay-qr";
import { DirectDeposit } from "@/components/direct-deposit";
import { AssetDeposit } from "@/components/asset-deposit";
import { useVault } from "@/hooks/use-vault";
import { shorten } from "@/lib/utils";

type Mode = "direct" | "asset" | "qr";

export default function DepositPage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = use(params);
  const vault = useVault(address);
  const { publicKey } = useWallet();

  // Mode selection has a subtle timing trap: on first render, wallet-adapter's
  // `autoConnect` hasn't finished, so `publicKey` is null. A naive
  // `useState(() => publicKey ? "direct" : "qr")` locks in "qr" and stays
  // there even after the wallet attaches a second later - which is why the
  // Send button appeared "gone" (it was hidden behind the QR view).
  //
  // Track only the user's manual override. The *effective* mode derives from
  // override first, then auto-follows the wallet. If they connect, they see
  // direct; if they manually pick QR, that sticks regardless.
  const [userMode, setUserMode] = useState<Mode | null>(null);
  const mode: Mode = userMode ?? (publicKey ? "direct" : "qr");
  const setMode = setUserMode;

  const origin =
    (typeof window !== "undefined" ? window.location.origin : null) ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "https://tumar.app";

  if (vault === undefined) return <DepositSkeleton />;
  if (vault === null) return <DepositNotFound address={address} />;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <Link href={`/vault/${address}`} className="text-xs text-ink-400 hover:text-ink-100">
        ← Back to {vault.name}
      </Link>

      <header>
        <div className="text-[11px] uppercase tracking-[0.2em] text-gold-300">
          Deposit
        </div>
        <h1 className="mt-2 font-serif text-5xl tracking-tight text-ink-100">
          Contribute to <span className="italic text-gold-200">{vault.name}</span>.
        </h1>
        <p className="mt-3 max-w-xl text-ink-300">
          USDC lands in the vault. The family can rebalance into the target
          allocation when they're ready.
        </p>
      </header>

      {/* Three modes: direct USDC, "as asset" (Jupiter swap → vault target
          ATA + record_contribution in one tx), and Solana Pay QR for phone
          scans. The asset mode is the alternative to a vault-side rebalance
          - contributors put their share in directly as the asset they want
          the vault to hold. */}
      <div className="inline-flex rounded-full border border-white/10 bg-white/[0.02] p-1 text-xs">
        <ModeButton active={mode === "direct"} onClick={() => setMode("direct")}>
          USDC
        </ModeButton>
        <ModeButton
          active={mode === "asset"}
          onClick={() => setMode("asset")}
          disabled={!publicKey}
          title={!publicKey ? "Connect a wallet" : undefined}
        >
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-gold-400" />
            Per asset
          </span>
        </ModeButton>
        <ModeButton active={mode === "qr"} onClick={() => setMode("qr")}>
          Share QR
        </ModeButton>
      </div>

      <Card highlighted>
        {mode === "direct" && (
          <>
            <CardLabel>Direct deposit</CardLabel>
            <CardTitle className="mt-1">
              {publicKey ? (
                <>
                  Signed in as{" "}
                  <code className="text-base text-ink-200">
                    {shorten(publicKey.toBase58(), 5)}
                  </code>
                </>
              ) : (
                "Connect a wallet"
              )}
            </CardTitle>
            <OrnamentDivider className="my-8 opacity-40" />
            <DirectDeposit vault={address} />
          </>
        )}
        {mode === "asset" && (
          <>
            <CardLabel>Per-asset deposit · via Jupiter</CardLabel>
            <CardTitle className="mt-1">
              Vault holds the actual asset, not idle USDC
            </CardTitle>
            <OrnamentDivider className="my-8 opacity-40" />
            <AssetDeposit vault={address} />
          </>
        )}
        {mode === "qr" && (
          <>
            <CardLabel>{vault.name}</CardLabel>
            <CardTitle className="mt-1">Solana Pay transaction request</CardTitle>
            <OrnamentDivider className="my-8 opacity-40" />
            <SolanaPayQr vault={address} origin={origin} />
          </>
        )}
      </Card>

      <Card>
        <CardTitle>How it works</CardTitle>
        <ol className="mt-4 space-y-3 text-sm text-ink-300">
          <li className="flex gap-3"><span className="num text-gold-300">1.</span> One transaction: ATA-create for the vault&apos;s USDC account (idempotent), the USDC transfer, and a <code className="rounded bg-white/5 px-1.5 py-0.5 text-xs">record_contribution</code> call to the Tumar program. You sign once.</li>
          <li className="flex gap-3"><span className="num text-gold-300">2.</span> Tx lands on Solana in ~10 seconds. The contribution appears in the vault&apos;s feed, queryable by anyone.</li>
          <li className="flex gap-3"><span className="num text-gold-300">3.</span> Vault holds USDC. The target allocation is recorded on chain - auto-rebalance into the basket via a vault-PDA Jupiter CPI is the next instruction we&apos;ll add to the Anchor program.</li>
          <li className="flex gap-3"><span className="num text-gold-300">4.</span> Want to contribute as a specific asset (NVDAx, SPYx, jitoSOL, …)? Use the per-asset deposit option above - Jupiter swap USDC → target token, then transfer to the vault&apos;s ATA and <code className="rounded bg-white/5 px-1.5 py-0.5 text-xs">record_contribution</code>. Two txs, batched into one wallet popup.</li>
        </ol>

        <div className="mt-6 flex items-center gap-2 rounded-xl border border-gold-400/15 bg-gold-400/5 px-4 py-3 text-xs text-gold-200">
          <span>Fiat onramp (coming soon)</span>
          <span className="text-gold-400/60">· card → USDC in-flow</span>
        </div>
      </Card>
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  disabled,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={
        "rounded-full px-4 py-1.5 transition-colors " +
        (active
          ? "bg-gold-300 text-ink-950"
          : disabled
          ? "text-ink-500 cursor-not-allowed"
          : "text-ink-300 hover:text-ink-100")
      }
    >
      {children}
    </button>
  );
}

function DepositSkeleton() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="h-4 w-32 animate-pulse rounded bg-white/5" />
      <div className="h-12 w-96 animate-pulse rounded-md bg-white/5" />
      <div className="h-80 animate-pulse rounded-2xl bg-white/5" />
    </div>
  );
}

function DepositNotFound({ address }: { address: string }) {
  return (
    <div className="mx-auto max-w-xl space-y-6 text-center">
      <h1 className="font-serif text-3xl text-ink-100">Vault not found.</h1>
      <p className="text-ink-300">
        We couldn't find a Family Vault at{" "}
        <code className="rounded bg-white/5 px-1.5 py-0.5 text-xs">{shorten(address, 6)}</code>.
      </p>
      <Link href="/terminal" className="inline-block">
        <Button>Back to terminal</Button>
      </Link>
    </div>
  );
}
