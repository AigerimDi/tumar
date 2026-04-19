import Link from "next/link";
import { explorerUrl, formatUsd, relativeTime, shorten } from "@/lib/utils";

export type Contribution = {
  signature: string;
  contributor: string;
  amount: number;      // USDC
  timestamp: number;   // unix seconds
  memo?: string;
};

export function ContributionFeed({ items }: { items: Contribution[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-white/10 px-6 py-10 text-center text-sm text-ink-400">
        No contributions yet. Share the invite link to get started.
      </div>
    );
  }

  return (
    <div className="divide-y divide-white/5">
      {items.map((c) => (
        <div key={c.signature} className="grid grid-cols-[auto_1fr_auto] items-center gap-4 py-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full border border-gold-400/20 bg-gold-400/5 text-gold-300">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm text-ink-100">
              {shorten(c.contributor, 4)}
              {c.memo && <span className="ml-2 text-ink-400">· {c.memo}</span>}
            </div>
            <div className="text-xs text-ink-400">
              {relativeTime(c.timestamp)} ·{" "}
              <Link
                href={explorerUrl("tx", c.signature)}
                target="_blank"
                className="transition-colors hover:text-gold-300"
              >
                {shorten(c.signature, 6)} ↗
              </Link>
            </div>
          </div>
          <div className="num text-right text-[color:var(--color-up)]">
            +{formatUsd(c.amount)}
          </div>
        </div>
      ))}
    </div>
  );
}
