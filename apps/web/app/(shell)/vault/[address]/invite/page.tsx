"use client";

import { use, useState } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";

import { Button } from "@/components/ui/button";
import { Card, CardLabel, CardTitle } from "@/components/ui/card";
import { OrnamentDivider } from "@/components/ornament";
import { useVault } from "@/hooks/use-vault";

export default function InvitePage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = use(params);
  const vault = useVault(address);
  const [copied, setCopied] = useState(false);

  const origin =
    (typeof window !== "undefined" ? window.location.origin : null) ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "https://tumar.app";
  const link = `${origin}/join/${address}`;

  if (!vault) return null;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <Link href={`/vault/${address}`} className="text-xs text-ink-400 hover:text-ink-100">
        ← Back to {vault.name}
      </Link>

      <header>
        <div className="text-[11px] uppercase tracking-[0.2em] text-gold-300">
          Invite
        </div>
        <h1 className="mt-2 font-serif text-5xl tracking-tight text-ink-100">
          Bring the family.
        </h1>
        <p className="mt-3 max-w-xl text-ink-300">
          Send this link to anyone you want as a member. They connect a wallet,
          sign once, and can contribute forever.
        </p>
      </header>

      <Card highlighted>
        <div className="grid gap-8 lg:grid-cols-[1fr_220px]">
          <div>
            <CardLabel>{vault.name}</CardLabel>
            <CardTitle className="mt-1">Member invite link</CardTitle>

            <OrnamentDivider className="my-6 opacity-40" />

            <div className="break-all rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-mono text-ink-200">
              {link}
            </div>

            <div className="mt-4 flex gap-3">
              <Button
                onClick={() => {
                  navigator.clipboard.writeText(link);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
              >
                {copied ? "Copied ✓" : "Copy link"}
              </Button>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(`Join our family vault on Tumar: ${link}`)}`}
                target="_blank"
                rel="noreferrer"
              >
                <Button variant="secondary">WhatsApp</Button>
              </a>
              <a
                href={`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent("Join our family vault on Tumar")}`}
                target="_blank"
                rel="noreferrer"
              >
                <Button variant="secondary">Telegram</Button>
              </a>
            </div>
          </div>

          <div className="flex flex-col items-center gap-3">
            <div className="rounded-2xl bg-white p-4">
              <QRCodeSVG value={link} size={180} level="M" includeMargin={false} />
            </div>
            <div className="text-center text-xs text-ink-400">
              Scan with any<br />phone camera
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
