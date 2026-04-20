"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { TickerTape } from "@/components/ticker-tape";
import { PortfolioSimulator } from "@/components/portfolio-simulator";
import { XStockGrid } from "@/components/xstock-grid";
import { t } from "@/lib/i18n";
import { useLang } from "@/lib/use-lang";
import { ALL_TOKENS } from "@/lib/tokens";

type Stats = {
  vaults: number;
  tvlUsd: number;
  updatedAt: string;
  cluster: string;
};

function fmtUsd(n: number): string {
  if (n < 1) return `$${n.toFixed(2)}`;
  if (n < 1_000) return `$${n.toFixed(0)}`;
  if (n < 1_000_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${(n / 1_000_000).toFixed(2)}M`;
}

export default function Home() {
  const [lang] = useLang();
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch("/api/stats", { cache: "no-store" });
        const j = await r.json();
        if (!cancelled && j.ok) setStats(j);
      } catch {
        // silent - header will just keep showing "-"
      }
    };
    load();
    const id = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);
  return (
    <div>
      <TickerTape />

      <div className="mx-auto w-full max-w-[1400px] px-5 py-5">
        {/* Meta strip */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-[var(--hairline)] pb-3">
          <div className="flex items-center gap-3">
            <span className="num-tab inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink-300)]">
              <span className="h-1.5 w-1.5 animate-pulse bg-[var(--color-up)]" />
              {t(lang, "termBadge")}
            </span>
            <span className="num-tab text-[10px] uppercase tracking-[0.16em] text-[var(--color-ink-500)]">
              {t(lang, "termChain")}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="num-tab text-[10px] uppercase tracking-[0.14em] text-[var(--color-ink-500)]">
              {t(lang, "termDataSrc")}
            </span>
            <Link
              href="/create"
              className="num-tab border border-[var(--color-gold-500)] bg-[var(--color-gold-500)] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-ink-950)] hover:bg-[var(--color-gold-400)]"
            >
              {t(lang, "termOpenVault")}
            </Link>
          </div>
        </div>

        {/* Page heading */}
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h1 className="num text-[32px] leading-none tracking-tight text-[var(--color-ink-50)] sm:text-[40px]">
              {t(lang, "termTitle")}
            </h1>
            <p className="mt-1 max-w-[640px] text-[12px] leading-relaxed text-[var(--color-ink-300)]">
              {t(lang, "termDesc")}
            </p>
          </div>
          <div className="num-tab flex gap-6 text-[10px] uppercase tracking-[0.14em] text-[var(--color-ink-400)]">
            <div>
              <div>{t(lang, "termVaults")}</div>
              <div className="mt-0.5 text-[16px] font-semibold text-[var(--color-ink-50)] tabular-nums">
                {stats ? stats.vaults.toLocaleString() : "-"}
              </div>
            </div>
            <div>
              <div>{t(lang, "termTvl")}</div>
              <div className="mt-0.5 text-[16px] font-semibold text-[var(--color-ink-50)] tabular-nums">
                {stats ? fmtUsd(stats.tvlUsd) : "-"}
              </div>
            </div>
            <div>
              <div>{t(lang, "termAssets")}</div>
              <div className="mt-0.5 text-[16px] font-semibold text-[var(--color-ink-50)] tabular-nums">
                {ALL_TOKENS.length}
              </div>
            </div>
          </div>
        </div>

        {/* Simulator - the star of the show */}
        <div className="mb-5">
          <PortfolioSimulator />
        </div>

        {/* Stock grid */}
        <div className="mb-5">
          <XStockGrid />
        </div>

        {/* How the vault flow works - compact, data-dense */}
        <section className="panel mb-5">
          <div className="flex items-center justify-between border-b border-[var(--hairline)] px-5 py-3">
            <span className="num-tab text-[10px] uppercase tracking-[0.16em] text-[var(--color-ink-400)]">
              {t(lang, "termPipeline")}
            </span>
            <span className="num-tab text-[10px] uppercase tracking-[0.14em] text-[var(--color-ink-500)]">
              {t(lang, "termStack")}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-5 grid-lines sm:grid-lines-x">
            <Step n="01" kw="initialize_vault" title={t(lang, "termStep1Title")} body={t(lang, "termStep1Body")} />
            <Step n="02" kw="update_allocation" title={t(lang, "termStep2Title")} body={t(lang, "termStep2Body")} />
            <Step
              n="03"
              kw="record_contribution"
              title={t(lang, "termStep3Title")}
              body={t(lang, "termStep3Body")}
              tag={{ label: "LEDGER", color: "gold" }}
            />
            <Step
              n="04"
              kw="jupiter.swap()"
              title={t(lang, "termStep4Title")}
              body={t(lang, "termStep4Body")}
              tag={{ label: "ROUTED", color: "gold" }}
            />
            <Step
              n="05"
              kw="close_vault"
              title={t(lang, "termStep5Title")}
              body={t(lang, "termStep5Body")}
              tag={{ label: "FAMILY", color: "gold" }}
            />
          </div>
        </section>

        {/* Roadmap - one line each, no fluff */}
        <section className="panel mb-5">
          <div className="flex items-center justify-between border-b border-[var(--hairline)] px-5 py-3">
            <span className="num-tab text-[10px] uppercase tracking-[0.16em] text-[var(--color-ink-400)]">
              {t(lang, "termRoadmap")}
            </span>
          </div>
          <div className="grid-lines">
            <Road label="Palm USD" status="Q3 26" body={t(lang, "termRoad1")} />
            <Road label="KZT on-ramp" status="Q4 26" body={t(lang, "termRoad2")} />
            <Road label="Real estate" status="2027" body={t(lang, "termRoad3")} />
          </div>
        </section>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--hairline)] pt-3 pb-6">
          <span className="num-tab text-[10px] uppercase tracking-[0.14em] text-[var(--color-ink-500)]">
            {t(lang, "footer1")}
          </span>
          <span className="num-tab text-[10px] uppercase tracking-[0.14em] text-[var(--color-ink-500)]">
            {t(lang, "disclaimer")}
          </span>
        </footer>
      </div>
    </div>
  );
}

function Step({
  n,
  kw,
  title,
  body,
  tag,
}: {
  n: string;
  kw: string;
  title: string;
  body: string;
  tag?: { label: string; color: "gold" };
}) {
  return (
    <div className="px-5 py-4">
      <div className="flex items-center gap-2">
        <span className="num-tab text-[10px] text-[var(--color-gold-400)]">{n}</span>
        <code className="num-tab rounded-[2px] bg-[var(--color-ink-850)] px-1.5 py-0.5 text-[10px] text-[var(--color-ink-200)]">
          {kw}
        </code>
        {tag && (
          <span className="num-tab rounded-[2px] border border-[var(--color-gold-500)]/40 bg-[var(--color-gold-500)]/10 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.12em] text-[var(--color-gold-300)]">
            {tag.label}
          </span>
        )}
      </div>
      <div className="mt-2 text-[13px] font-semibold text-[var(--color-ink-50)]">{title}</div>
      <p className="mt-1 text-[11px] leading-relaxed text-[var(--color-ink-300)]">{body}</p>
    </div>
  );
}

function Road({ label, status, body }: { label: string; status: string; body: string }) {
  return (
    <div className="grid grid-cols-[140px_90px_1fr] items-center gap-4 px-5 py-2.5">
      <span className="num-tab text-[12px] font-semibold text-[var(--color-ink-50)]">{label}</span>
      <span className="num-tab text-[10px] uppercase tracking-[0.14em] text-[var(--color-gold-400)]">{status}</span>
      <span className="text-[12px] text-[var(--color-ink-300)]">{body}</span>
    </div>
  );
}
