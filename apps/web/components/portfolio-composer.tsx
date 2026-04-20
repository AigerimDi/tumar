"use client";

import { useMemo, useState } from "react";
import { Button } from "./ui/button";
import { Slider } from "./ui/slider";
import { AllocationRing } from "./allocation-ring";
import {
  ALL_TOKENS,
  DEFAULT_ALLOCATION,
  type Token,
} from "@/lib/tokens";
import { cn } from "@/lib/utils";

export type ComposerSlot = { token: Token; bps: number };

const MIN_BPS = 0;
const MAX_BPS = 10_000;

export function PortfolioComposer({
  initial = DEFAULT_ALLOCATION,
  onSubmit,
  submitLabel = "Save allocation",
  submitting,
}: {
  initial?: ComposerSlot[];
  onSubmit: (slots: ComposerSlot[]) => void;
  submitLabel?: string;
  submitting?: boolean;
}) {
  const [slots, setSlots] = useState<ComposerSlot[]>(initial);

  const total = slots.reduce((s, x) => s + x.bps, 0);
  const balanced = total === MAX_BPS;

  const available = useMemo(
    () => ALL_TOKENS.filter((t) => !slots.find((s) => s.token.mint === t.mint)),
    [slots],
  );

  function updateBps(idx: number, nextBps: number) {
    // Rebalance other slots pro-rata so the sum stays at 10000.
    setSlots((prev) => {
      const clamped = Math.max(MIN_BPS, Math.min(MAX_BPS, nextBps));
      const others = prev.filter((_, i) => i !== idx);
      const otherTotal = others.reduce((s, x) => s + x.bps, 0);
      const remaining = MAX_BPS - clamped;
      const next = prev.map((slot, i) => {
        if (i === idx) return { ...slot, bps: clamped };
        if (otherTotal === 0) return { ...slot, bps: Math.floor(remaining / others.length) };
        const share = slot.bps / otherTotal;
        return { ...slot, bps: Math.round(remaining * share) };
      });
      // Tidy rounding drift onto the last non-edited slot.
      const sum = next.reduce((s, x) => s + x.bps, 0);
      if (sum !== MAX_BPS && next.length > 1) {
        const drift = MAX_BPS - sum;
        const fixIdx = next.findIndex((_, i) => i !== idx);
        if (fixIdx >= 0) next[fixIdx] = { ...next[fixIdx], bps: next[fixIdx].bps + drift };
      }
      return next;
    });
  }

  function addSlot(token: Token) {
    setSlots((prev) => [...prev, { token, bps: 0 }]);
  }

  function removeSlot(idx: number) {
    setSlots((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      const sum = next.reduce((s, x) => s + x.bps, 0);
      if (sum === 0 || next.length === 0) return next;
      // Redistribute the removed slot's bps proportionally.
      const factor = MAX_BPS / sum;
      return next.map((s) => ({ ...s, bps: Math.round(s.bps * factor) }));
    });
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
      <div className="space-y-3">
        {slots.map((slot, idx) => (
          <div
            key={slot.token.mint}
            className="group flex items-center gap-4 rounded-2xl border border-white/5 bg-white/[0.02] p-4 transition-colors hover:border-white/10 hover:bg-white/[0.04]"
          >
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold"
              style={{
                background: `${slot.token.color}22`,
                color: slot.token.color,
                boxShadow: `inset 0 0 0 1px ${slot.token.color}33`,
              }}
            >
              {slot.token.symbol.slice(0, 2)}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-ink-100">
                    {slot.token.symbol}
                    <span className="ml-2 text-ink-400">{slot.token.name}</span>
                  </div>
                  {slot.token.underlying && (
                    <div className="truncate text-xs text-ink-400">
                      {slot.token.underlying}
                    </div>
                  )}
                </div>
                <div className="num shrink-0 text-lg tabular-nums text-ink-100">
                  {(slot.bps / 100).toFixed(1)}
                  <span className="ml-0.5 text-sm text-ink-400">%</span>
                </div>
              </div>

              <Slider
                className="mt-3"
                value={slot.bps}
                onChange={(v) => updateBps(idx, v)}
                color={slot.token.color}
              />
            </div>

            <button
              onClick={() => removeSlot(idx)}
              className="opacity-0 transition-opacity group-hover:opacity-100 text-ink-400 hover:text-ink-100"
              aria-label={`Remove ${slot.token.symbol}`}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        ))}

        <AddAssetMenu tokens={available} onAdd={addSlot} />
      </div>

      <div className="space-y-6">
        <div className="glass flex flex-col items-center gap-4 p-6">
          <AllocationRing
            slices={slots
              .filter((s) => s.bps > 0)
              .map((s) => ({ label: s.token.symbol, bps: s.bps, color: s.token.color }))}
            centerLabel={balanced ? "Allocation" : "Unbalanced"}
            centerValue={`${(total / 100).toFixed(0)}%`}
            size={200}
          />
          <div className={cn(
            "text-xs",
            balanced ? "text-ink-300" : "text-[color:var(--color-down)]",
          )}>
            {balanced
              ? "Sums to 100%. Ready to save."
              : `Off by ${((MAX_BPS - total) / 100).toFixed(1)}%`}
          </div>
        </div>

        <Button
          className="w-full"
          size="lg"
          disabled={!balanced || submitting}
          onClick={() => onSubmit(slots)}
        >
          {submitting ? "Confirming…" : submitLabel}
        </Button>
      </div>
    </div>
  );
}

function AddAssetMenu({
  tokens,
  onAdd,
}: {
  tokens: readonly Token[];
  onAdd: (t: Token) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = tokens.filter((t) =>
    [t.symbol, t.name, t.underlying].some((x) =>
      x?.toLowerCase().includes(query.toLowerCase()),
    ),
  );

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-white/10 py-4 text-sm text-ink-300 transition-colors hover:border-gold-400/40 hover:text-ink-100"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        Add an asset
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-20 max-h-96 overflow-hidden rounded-2xl border border-white/10 bg-ink-800/95 shadow-2xl backdrop-blur-xl">
          <input
            autoFocus
            placeholder="Search tenge, stocks, SOL…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-transparent px-4 py-3 text-sm text-ink-100 placeholder:text-ink-400 focus:outline-none border-b border-white/5"
          />
          <div className="max-h-72 overflow-y-auto py-1">
            {filtered.length === 0 && (
              <div className="px-4 py-6 text-center text-sm text-ink-400">No match.</div>
            )}
            {filtered.map((t) => (
              <button
                key={t.mint}
                onClick={() => {
                  onAdd(t);
                  setOpen(false);
                  setQuery("");
                }}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-white/5"
              >
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold"
                  style={{ background: `${t.color}22`, color: t.color }}
                >
                  {t.symbol.slice(0, 2)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-ink-100">{t.symbol} <span className="text-ink-400">{t.name}</span></div>
                  {t.underlying && <div className="truncate text-xs text-ink-400">{t.underlying}</div>}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
