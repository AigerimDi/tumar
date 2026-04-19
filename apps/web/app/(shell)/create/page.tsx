"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  ComputeBudgetProgram,
  SystemProgram,
  Transaction,
  PublicKey,
} from "@solana/web3.js";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardLabel, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { OrnamentDivider } from "@/components/ornament";
import {
  PortfolioComposer,
  type ComposerSlot,
} from "@/components/portfolio-composer";
import { useTumarProgram } from "@/lib/anchor/program";
import { memberPda, vaultPda } from "@/lib/anchor/pdas";
import { confirmViaHttp } from "@/lib/anchor/confirm";
import { explainTxError } from "@/lib/anchor/explain";
import { signAndSend } from "@/lib/anchor/send";
import { rememberVault } from "@/lib/recent-vaults";
import { DEFAULT_ALLOCATION } from "@/lib/tokens";

type Step = "name" | "allocate" | "confirm";

export default function CreateVaultPage() {
  const router = useRouter();
  const wallet = useWallet();
  const { publicKey } = wallet;
  const { connection } = useConnection();
  const program = useTumarProgram();

  const [step, setStep] = useState<Step>("name");
  const [name, setName] = useState("");
  const [allocation, setAllocation] = useState<ComposerSlot[]>(DEFAULT_ALLOCATION);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!publicKey || !program) {
      setError("Connect your wallet first.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const [vault] = vaultPda(publicKey, name);
      const [member] = memberPda(vault, publicKey);

      // Pre-flight: if a vault already exists at this PDA (same creator+name),
      // just navigate there. This handles the "already created, UI dropped the
      // success" case cleanly on a retry.
      const existing = await (program.account as unknown as { vault: { fetchNullable: (p: PublicKey) => Promise<unknown> } }).vault.fetchNullable(vault);
      if (existing) {
        rememberVault({ address: vault.toBase58(), name, creator: publicKey.toBase58() });
        router.push(`/vault/${vault.toBase58()}`);
        return;
      }

      const payload = allocation.map((s) => ({
        mint: new PublicKey(s.token.mint),
        bps: s.bps,
      }));

      try {
        // Build the ix instead of calling .rpc(). Anchor's .rpc() internally
        // calls confirmTransaction, which opens a WebSocket subscription
        // against the Connection's wsEndpoint. Our /api/rpc proxy doesn't
        // handle WS upgrades, so that turns into a reconnect-loop. We sign
        // in the wallet, broadcast via our own Connection, and poll
        // getSignatureStatuses - same guarantee, zero WebSockets, and no
        // wallet-adapter `sendTransaction` quietly misrouting to mainnet
        // because it can't classify our `/api/rpc` endpoint.
        const ix = await program.methods
          .initializeVault(name, payload)
          .accounts({
            creator: publicKey,
            vault,
            creatorMember: member,
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
          // 100k µlamports × ~200k CU ≈ 20k lamports (~$0.003). Without a
          // priority tip the tx loses the inclusion race during congestion
          // and surfaces as "Transaction confirmation timed out" because
          // the signature never lands.
          ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100_000 }),
          ix,
        );

        const signature = await signAndSend(wallet, connection, tx);
        await confirmViaHttp(connection, signature, lastValidBlockHeight);
      } catch (sendErr) {
        // Soft-failure modes that mean "actually it worked":
        //   "This transaction has already been processed" - same signature
        //     landed on chain but the adapter retried and got dedup-bounced.
        //   "already in use" (InstructionError: 0; custom program error 0x0) -
        //     the Vault PDA already exists because a prior attempt succeeded.
        //   "Transaction confirmation timed out" - our 90s poll didn't see
        //     a status update, but the tx may still have landed. The vault
        //     PDA fetch is ground truth; if it's there, the tx confirmed.
        // In all three cases, poll the account: if it's there, we're done.
        const msg = sendErr instanceof Error ? sendErr.message : String(sendErr);
        const looksRecoverable =
          /already been processed/i.test(msg) ||
          /already in use/i.test(msg) ||
          /confirmation timed out/i.test(msg) ||
          /0x0\b/i.test(msg);
        if (!looksRecoverable) throw sendErr;
        // Aggressive recovery - after a timeout, poll `fetchNullable` up to
        // 15× with 2s spacing (30s total) before giving up. The most common
        // cause of false-timeout was RPC lag returning `null` while the
        // vault account was already on chain; this loop catches both that
        // and the slow-inclusion case where the tx lands a few blocks past
        // our 90s confirm window.
        let landed: unknown = null;
        for (let attempt = 0; attempt < 15 && !landed; attempt++) {
          await new Promise((r) => setTimeout(r, 2000));
          landed = await (program.account as unknown as { vault: { fetchNullable: (p: PublicKey) => Promise<unknown> } }).vault.fetchNullable(vault);
        }
        if (!landed) throw sendErr;
      }

      rememberVault({ address: vault.toBase58(), name, creator: publicKey.toBase58() });
      router.push(`/vault/${vault.toBase58()}`);
    } catch (e) {
      setError(explainTxError(e));
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-10">
      <header>
        <div className="text-[11px] uppercase tracking-[0.2em] text-gold-300">
          New vault
        </div>
        <h1 className="mt-3 font-serif text-5xl tracking-tight text-ink-100">
          Name the family.
        </h1>
        <p className="mt-3 max-w-xl text-ink-300">
          One line. Use your surname, or the reason. "Saule Schooling Fund" is
          as valid as "Nurlanov Family". You can't change it later.
        </p>
      </header>

      <Stepper step={step} />

      {step === "name" && (
        <Card>
          <CardLabel>Step 1 · Vault name</CardLabel>
          <CardTitle className="mt-2">What should we call it?</CardTitle>

          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, 48))}
            placeholder="Almaty Family"
            className="mt-6 font-serif text-2xl"
          />
          <div className="mt-2 flex justify-between text-xs text-ink-400">
            <span>Stored on-chain. {name.length}/48 characters.</span>
          </div>

          <div className="mt-8 flex justify-end">
            <Button
              onClick={() => setStep("allocate")}
              disabled={name.trim().length === 0}
            >
              Continue
            </Button>
          </div>
        </Card>
      )}

      {step === "allocate" && (
        <Card>
          <CardLabel>Step 2 · Portfolio</CardLabel>
          <CardTitle className="mt-2">Compose the allocation.</CardTitle>
          <p className="mt-2 max-w-lg text-sm text-ink-300">
            Drag sliders to match the plan. Every deposit gets split this way.
          </p>

          <OrnamentDivider className="my-8 opacity-40" />

          <PortfolioComposer
            initial={allocation}
            onSubmit={(slots) => {
              setAllocation(slots);
              setStep("confirm");
            }}
            submitLabel="Continue"
          />
        </Card>
      )}

      {step === "confirm" && (
        <Card highlighted>
          <CardLabel>Step 3 · Confirm</CardLabel>
          <CardTitle className="mt-2">
            <span className="italic text-gold-200">{name}</span>
          </CardTitle>
          <p className="mt-2 text-sm text-ink-300">
            Creating this vault costs a small rent deposit (~0.002 SOL) that's
            returned if you ever close it.
          </p>

          <div className="mt-8 space-y-2">
            {allocation
              .filter((s) => s.bps > 0)
              .map((s) => (
                <div key={s.token.mint} className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ background: s.token.color }}
                    />
                    <span className="text-sm text-ink-100">{s.token.symbol}</span>
                    <span className="text-xs text-ink-400">{s.token.name}</span>
                  </div>
                  <span className="num text-sm text-ink-100">{(s.bps / 100).toFixed(1)}%</span>
                </div>
              ))}
          </div>

          {error && (
            <div className="mt-6 rounded-xl border border-[color:var(--color-down)]/30 bg-[color:var(--color-down)]/10 px-4 py-3 text-sm text-[color:var(--color-down)]">
              {error}
            </div>
          )}

          <div className="mt-8 flex items-center justify-between">
            <Button variant="ghost" onClick={() => setStep("allocate")}>
              ← Back
            </Button>
            <Button size="lg" onClick={submit} disabled={submitting}>
              {submitting ? "Creating…" : "Create vault"}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

function Stepper({ step }: { step: Step }) {
  const steps: { id: Step; label: string }[] = [
    { id: "name", label: "Name" },
    { id: "allocate", label: "Allocate" },
    { id: "confirm", label: "Confirm" },
  ];
  const idx = steps.findIndex((s) => s.id === step);
  return (
    <div className="flex items-center gap-3">
      {steps.map((s, i) => (
        <div key={s.id} className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div
              className={
                "flex h-6 w-6 items-center justify-center rounded-full text-[11px] transition-colors " +
                (i <= idx
                  ? "bg-gold-300 text-ink-950"
                  : "border border-white/10 text-ink-400")
              }
            >
              {i + 1}
            </div>
            <span
              className={
                "text-xs uppercase tracking-[0.16em] " +
                (i <= idx ? "text-ink-100" : "text-ink-400")
              }
            >
              {s.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <span className="h-px w-10 bg-white/10" />
          )}
        </div>
      ))}
    </div>
  );
}
