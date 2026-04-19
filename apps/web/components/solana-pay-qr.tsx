"use client";

import { QRCodeSVG } from "qrcode.react";
import { useMemo, useState } from "react";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { buildPayUrl } from "@/lib/solana-pay";

export function SolanaPayQr({ vault, origin }: { vault: string; origin: string }) {
  const [amount, setAmount] = useState<string>("100");
  const [memo, setMemo] = useState("");

  const url = useMemo(
    () =>
      buildPayUrl({
        origin,
        vault,
        amount: amount ? Number(amount) : undefined,
        memo: memo || undefined,
      }),
    [vault, origin, amount, memo],
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
      <div className="space-y-5">
        <div>
          <label className="mb-2 block text-[11px] uppercase tracking-[0.16em] text-ink-300">
            Amount (USDC)
          </label>
          <Input
            type="number"
            inputMode="decimal"
            min="1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="100"
            className="num text-xl"
          />
          <div className="mt-2 flex gap-2">
            {[25, 100, 500, 1000].map((v) => (
              <button
                key={v}
                onClick={() => setAmount(String(v))}
                className="rounded-full border border-white/10 bg-white/[0.02] px-3 py-1 text-xs text-ink-300 transition-colors hover:border-gold-400/40 hover:text-ink-100"
              >
                ${v}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-2 block text-[11px] uppercase tracking-[0.16em] text-ink-300">
            Memo (optional)
          </label>
          <Input
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="For Aidana's tuition"
            maxLength={140}
          />
        </div>

        <Button
          variant="secondary"
          className="w-full"
          onClick={() => navigator.clipboard.writeText(url)}
        >
          Copy Solana Pay link
        </Button>
      </div>

      <div className="flex flex-col items-center gap-3">
        <div className="glass-gold rounded-[28px] p-4">
          <div className="rounded-2xl bg-white p-4">
            <QRCodeSVG value={url} size={220} level="M" includeMargin={false} />
          </div>
        </div>
        <div className="text-center text-xs text-ink-400">
          Scan with Phantom or any<br />Solana Pay wallet
        </div>
      </div>
    </div>
  );
}
