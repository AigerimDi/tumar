"use client";

import { use, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { ComputeBudgetProgram, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";

import { Button } from "@/components/ui/button";
import { Card, CardLabel, CardTitle } from "@/components/ui/card";
import { OrnamentDivider } from "@/components/ornament";
import { AllocationRing } from "@/components/allocation-ring";
import { useVault } from "@/hooks/use-vault";
import { useTumarProgram } from "@/lib/anchor/program";
import { memberPda } from "@/lib/anchor/pdas";
import { confirmViaHttp } from "@/lib/anchor/confirm";
import { explainTxError } from "@/lib/anchor/explain";
import { signAndSend } from "@/lib/anchor/send";
import { rememberVault } from "@/lib/recent-vaults";
import { findToken } from "@/lib/tokens";
import { shorten } from "@/lib/utils";

const WalletMultiButton = dynamic(
  () =>
    import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false },
);

export default function JoinPage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = use(params);
  const vault = useVault(address);
  const wallet = useWallet();
  const { publicKey } = wallet;
  const { connection } = useConnection();
  const program = useTumarProgram();
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function join() {
    if (!publicKey || !program || !vault) return;
    setJoining(true);
    setError(null);
    try {
      const vaultKey = new PublicKey(vault.address);
      const [member] = memberPda(vaultKey, publicKey);

      // Build + sign + send manually so we don't trip Anchor's confirm-via-WS
      // path (see lib/anchor/confirm.ts for the full rationale).
      const ix = await program.methods
        .joinVault()
        .accounts({
          joiner: publicKey,
          vault: vaultKey,
          member,
          systemProgram: SystemProgram.programId,
        })
        .instruction();

      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash("confirmed");
      const tx = new Transaction({
        feePayer: publicKey,
        blockhash,
        lastValidBlockHeight,
      }).add(
        // Match deposit/withdraw/create: 20k µlamports keeps the tx out of
        // the no-tip bucket on a congested mainnet. Without this, joins get
        // dropped from the leader's pool and surface as "confirmation timed
        // out" - even though the tx never landed.
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100_000 }),
        ix,
      );

      const signature = await signAndSend(wallet, connection, tx);
      await confirmViaHttp(connection, signature, lastValidBlockHeight);

      rememberVault({ address: vault.address, name: vault.name, creator: vault.creator });
      setJoined(true);
      setTimeout(() => { window.location.href = `/vault/${vault.address}`; }, 1500);
    } catch (e) {
      // "already in use" means a Member PDA for this (vault, signer) pair
      // already exists - they're already a member. Treat as success.
      const msg = e instanceof Error ? e.message : String(e);
      if (/already in use/i.test(msg) || /0x0\b/i.test(msg)) {
        rememberVault({ address: vault.address, name: vault.name, creator: vault.creator });
        setJoined(true);
        setTimeout(() => { window.location.href = `/vault/${vault.address}`; }, 1500);
        return;
      }
      setError(explainTxError(e));
      setJoining(false);
    }
  }

  // `useVault` returns: undefined = loading, null = fetch errored / not found,
  // object = found. Before today, this page just `return null`d in both
  // non-terminal states, which rendered as a blank black page - especially
  // bad on cold loads before the wallet provider even wired up.
  if (vault === undefined) return <JoinSkeleton />;
  if (vault === null) return <JoinNotFound address={address} />;

  const slices = vault.allocation
    .map((a) => {
      const t = findToken(a.mint);
      return t ? { label: t.symbol, bps: a.bps, color: t.color } : null;
    })
    .filter((x): x is { label: string; bps: number; color: string } => x !== null);

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <header className="text-center">
        <div className="text-[11px] uppercase tracking-[0.2em] text-gold-300">
          You're invited
        </div>
        <h1 className="mt-2 font-serif text-5xl tracking-tight text-ink-100">
          Join <span className="italic text-gold-200">{vault.name}</span>
        </h1>
        <p className="mt-3 text-ink-300">
          Connect a Solana wallet and co-sign the family's portfolio.
        </p>
      </header>

      <Card highlighted className="text-center">
        <div className="flex justify-center">
          <AllocationRing slices={slices} centerLabel="Allocation" centerValue={`${slices.length}`} size={200} />
        </div>
        <OrnamentDivider className="my-6 opacity-40" />

        <div className="grid grid-cols-2 gap-x-5 gap-y-2 text-sm text-left sm:grid-cols-4">
          {slices.map((s) => (
            <div key={s.label} className="flex items-center gap-2 text-ink-200">
              <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
              <span>{s.label}</span>
              <span className="ml-auto text-ink-400 num">{(s.bps / 100).toFixed(0)}%</span>
            </div>
          ))}
        </div>

        <CardLabel className="mt-8">Members</CardLabel>
        <CardTitle className="mt-1">{vault.memberCount}</CardTitle>

        <div className="mt-8 flex justify-center">
          {joined ? (
            <div className="text-sm text-[color:var(--color-up)]">
              ✓ Welcome. Redirecting…
            </div>
          ) : !publicKey ? (
            <WalletMultiButton />
          ) : (
            <Button size="lg" onClick={join} disabled={joining}>
              {joining ? "Joining…" : "Accept invite"}
            </Button>
          )}
        </div>

        {error && (
          <div className="mt-6 rounded-xl border border-[color:var(--color-down)]/30 bg-[color:var(--color-down)]/10 px-4 py-3 text-sm text-[color:var(--color-down)]">
            {error}
          </div>
        )}
      </Card>

      <div className="text-center text-xs text-ink-400">
        Already a member? <Link href={`/vault/${address}`} className="text-gold-300 hover:text-gold-200">Open the vault →</Link>
      </div>
    </div>
  );
}

function JoinSkeleton() {
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <header className="text-center">
        <div className="text-[11px] uppercase tracking-[0.2em] text-gold-300">
          You're invited
        </div>
        <div className="mx-auto mt-3 h-12 w-64 animate-pulse rounded-md bg-white/5" />
        <div className="mx-auto mt-4 h-4 w-80 animate-pulse rounded bg-white/5" />
      </header>
      <Card highlighted className="text-center">
        <div className="mx-auto h-[200px] w-[200px] animate-pulse rounded-full bg-white/5" />
        <OrnamentDivider className="my-6 opacity-40" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-4 animate-pulse rounded bg-white/5" />
          ))}
        </div>
      </Card>
    </div>
  );
}

function JoinNotFound({ address }: { address: string }) {
  return (
    <div className="mx-auto max-w-xl space-y-6 text-center">
      <div className="text-[11px] uppercase tracking-[0.2em] text-gold-300">
        Invite link
      </div>
      <h1 className="font-serif text-4xl tracking-tight text-ink-100">
        That vault doesn't exist.
      </h1>
      <p className="text-ink-300">
        We couldn't find a Family Vault at{" "}
        <code className="rounded bg-white/5 px-1.5 py-0.5 text-xs">{shorten(address, 6)}</code>.
        The link may be stale or the address was mistyped. Ask the person
        who invited you to resend it.
      </p>
      <div className="flex items-center justify-center gap-3">
        <Link href="/create">
          <Button>Create your own vault</Button>
        </Link>
        <Link href="/terminal">
          <Button variant="secondary">Back to terminal</Button>
        </Link>
      </div>
    </div>
  );
}
