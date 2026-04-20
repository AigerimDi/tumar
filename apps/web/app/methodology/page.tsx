"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  KZ_CPI_ANNUAL,
  US_CPI_ANNUAL,
  CPI_SOURCES_KZ,
  CPI_SOURCES_US,
  cpiMultiplier,
} from "@/lib/cpi";

type Pt = { t: number; close: number };

export default function Methodology() {
  const [kzt, setKzt] = useState<Pt[]>([]);
  const [spy, setSpy] = useState<Pt[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [k, s] = await Promise.all([
          fetch("/api/historical?symbol=KZT=X&range=5y&interval=1wk").then((r) => r.json()),
          fetch("/api/historical?symbol=SPY&range=5y&interval=1wk").then((r) => r.json()),
        ]);
        if (cancelled) return;
        setKzt(k.series ?? []);
        setSpy(s.series ?? []);
        setLoading(false);
      } catch {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const snapshot = useMemo(() => {
    if (kzt.length < 2 || spy.length < 2) return null;
    const WEEK = 7 * 86400;
    const kMap = new Map<number, Pt>();
    for (const p of kzt) kMap.set(Math.floor(p.t / WEEK), p);
    const sMap = new Map<number, Pt>();
    for (const p of spy) sMap.set(Math.floor(p.t / WEEK), p);
    const weeks = [...kMap.keys()].filter((w) => sMap.has(w)).sort((a, b) => a - b);
    if (weeks.length < 2) return null;
    const first = { k: kMap.get(weeks[0])!, s: sMap.get(weeks[0])! };
    const last = { k: kMap.get(weeks[weeks.length - 1])!, s: sMap.get(weeks[weeks.length - 1])! };
    const kztNominalUsd = 1000 * (first.k.close / last.k.close);
    const spyNominalUsd = 1000 * (last.s.close / first.s.close);
    const kzCpi = cpiMultiplier(last.k.t, first.k.t, KZ_CPI_ANNUAL);
    const usCpi = cpiMultiplier(last.k.t, first.k.t, US_CPI_ANNUAL);
    const kztRealUsd = kztNominalUsd / kzCpi;
    const spyRealUsd = spyNominalUsd / usCpi;
    return {
      first,
      last,
      weeks: weeks.length,
      kztNominalUsd,
      spyNominalUsd,
      kzCpi,
      usCpi,
      kztRealUsd,
      spyRealUsd,
      kztDepreciation: (1 - first.k.close / last.k.close) * 100,
      spyNominalReturn: ((last.s.close - first.s.close) / first.s.close) * 100,
    };
  }, [kzt, spy]);

  const dateFmt = new Intl.DateTimeFormat("en-US", { day: "2-digit", month: "short", year: "numeric" });

  return (
    <div className="landing min-h-[100dvh]">
      <header className="mx-auto flex w-full max-w-[900px] items-center justify-between px-6 pt-6 pb-2">
        <Link href="/" className="flex items-center" aria-label="tumar">
          <Image src="/tumar-mark.png" alt="tumar" width={423} height={138} priority className="h-10 w-auto sm:h-12" />
        </Link>
        <Link
          href="/"
          className="rounded-full border border-[var(--hair-strong)] bg-[var(--paper-50)] px-4 py-1.5 font-sans text-[12px] font-semibold tracking-[0.06em] text-[var(--coal-800)] hover:border-[var(--coal-950)] hover:text-[var(--coal-950)]"
        >
          ← Back
        </Link>
      </header>

      <section className="mx-auto w-full max-w-[900px] px-6 pt-8 pb-4">
        <h1 className="display-soft text-[36px] leading-[1.05] text-[var(--coal-950)] sm:text-[48px]">
          Methodology
        </h1>
        <p className="mt-4 max-w-[620px] font-sans text-[15px] leading-[1.55] text-[var(--coal-600)]">
          Both lines on the landing are in <strong className="text-[var(--coal-950)]">real purchasing power</strong>.
          The tenge line is deflated by Kazakhstan CPI; the SPY line is deflated by US CPI.
        </p>
      </section>

      <section className="mx-auto w-full max-w-[900px] px-6 pt-2">
        <div className="card overflow-hidden">
          <div className="border-b border-[var(--hair)] px-6 py-3 font-sans text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--coal-600)]">
            The formula · per $1,000
          </div>
          <div className="px-6 py-5 font-mono text-[13px] leading-[1.8] text-[var(--coal-800)]">
            <div>
              <span className="text-[var(--coal-500)]">kzt_nominal(t)</span> = 1000 × (kzt_close[t0] / kzt_close[t])
            </div>
            <div>
              <span className="text-[var(--coal-500)]">kz_cpi(t)</span>      = ∏ (1 + kz_cpi[year])^years_in_year
            </div>
            <div>
              <span className="text-[var(--coal-500)]">kzt_real(t)</span>    = kzt_nominal(t) / kz_cpi(t)
            </div>
            <div className="mt-3 pt-3 border-t border-[var(--hair)]">
              <span className="text-[var(--coal-500)]">spy_nominal(t)</span> = 1000 × (spy_close[t] / spy_close[t0])
            </div>
            <div>
              <span className="text-[var(--coal-500)]">us_cpi(t)</span>      = ∏ (1 + us_cpi[year])^years_in_year
            </div>
            <div>
              <span className="text-[var(--coal-500)]">spy_real(t)</span>    = spy_nominal(t) / us_cpi(t)
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-[900px] gap-4 px-6 pt-6 sm:grid-cols-2">
        <CpiTable title="Kazakhstan CPI" table={KZ_CPI_ANNUAL} sources={CPI_SOURCES_KZ} />
        <CpiTable title="US CPI" table={US_CPI_ANNUAL} sources={CPI_SOURCES_US} />
      </section>

      <section className="mx-auto w-full max-w-[900px] px-6 pt-6">
        <div className="card overflow-hidden">
          <div className="border-b border-[var(--hair)] px-6 py-3 font-sans text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--coal-600)]">
            Live calculation · $1,000 5-year backtest
          </div>
          {loading || !snapshot ? (
            <div className="px-6 py-8 font-sans text-[13px] text-[var(--coal-500)]">Fetching data…</div>
          ) : (
            <table className="w-full font-mono text-[13px]">
              <tbody className="divide-y divide-[var(--hair)]">
                <Row
                  label="Window"
                  value={`${dateFmt.format(new Date(snapshot.first.k.t * 1000))} → ${dateFmt.format(new Date(snapshot.last.k.t * 1000))}`}
                />
                <Row label="Weekly closes matched" value={`${snapshot.weeks}`} />
                <Row label="KZT/USD at t₀ → t" value={`${snapshot.first.k.close.toFixed(3)} → ${snapshot.last.k.close.toFixed(3)} ₸`} />
                <Row label="SPY at t₀ → t" value={`$${snapshot.first.s.close.toFixed(2)} → $${snapshot.last.s.close.toFixed(2)}`} />
                <Row label="Tenge FX depreciation vs USD" value={`${snapshot.kztDepreciation.toFixed(1)}%`} />
                <Row label="SPY nominal USD return" value={`+${snapshot.spyNominalReturn.toFixed(1)}%`} />
                <Row label="KZ CPI multiplier (compounded)" value={`×${snapshot.kzCpi.toFixed(3)}`} />
                <Row label="US CPI multiplier (compounded)" value={`×${snapshot.usCpi.toFixed(3)}`} />
                <Row label="$1k tenge · nominal USD today" value={`$${Math.round(snapshot.kztNominalUsd).toLocaleString("en-US")}`} />
                <Row label="$1k SPY · nominal USD today" value={`$${Math.round(snapshot.spyNominalUsd).toLocaleString("en-US")}`} />
                <Row label="$1k tenge · REAL USD today" value={`$${Math.round(snapshot.kztRealUsd).toLocaleString("en-US")}`} bold />
                <Row label="$1k SPY · REAL USD today" value={`$${Math.round(snapshot.spyRealUsd).toLocaleString("en-US")}`} bold />
                <Row
                  label="Gap (SPY real − tenge real)"
                  value={`$${Math.round(snapshot.spyRealUsd - snapshot.kztRealUsd).toLocaleString("en-US")}`}
                  bold
                />
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section className="mx-auto w-full max-w-[900px] px-6 pt-6">
        <div className="card overflow-hidden">
          <div className="border-b border-[var(--hair)] px-6 py-3 font-sans text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--coal-600)]">
            Data sources
          </div>
          <ul className="divide-y divide-[var(--hair)] font-sans text-[13px]">
            <Src
              title="Yahoo Finance ·KZT=X weekly"
              url="https://finance.yahoo.com/quote/KZT%3DX/history?frequency=1wk"
              note="USDKZT spot, weekly close, 5y range"
            />
            <Src
              title="Yahoo Finance ·SPY weekly"
              url="https://finance.yahoo.com/quote/SPY/history?frequency=1wk"
              note="SPDR S&P 500 ETF, weekly close, 5y range"
            />
            <Src
              title="National Bank of Kazakhstan · CPI"
              url="https://www.nationalbank.kz/en/news/inflyaciya"
              note="Official monthly and annual inflation series"
            />
            <Src
              title="US BLS · CPI-U annual"
              url="https://www.bls.gov/cpi/"
              note="Consumer Price Index, all urban consumers, annual average"
            />
            <Src
              title="IMF World Economic Outlook · Kazakhstan"
              url="https://www.imf.org/en/Publications/WEO"
              note="Forward CPI estimates (2025, 2026)"
            />
          </ul>
        </div>
      </section>

      <section className="mx-auto w-full max-w-[900px] px-6 pt-6">
        <div className="card-inset px-6 py-5">
          <div className="font-sans text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--brand-600)]">
            Known limitations
          </div>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 font-sans text-[13px] leading-[1.55] text-[var(--coal-800)]">
            <li>CPI is applied as flat annual rate. Monthly CPI granularity would shift real values by &lt;1%.</li>
            <li>Weekly buckets align KZT=X (Sun 23:00 UTC) and SPY (Mon 04:00 UTC) into the same 7-day slot.</li>
            <li>2025 and 2026 CPI are partial-year / forecast values. Actual annual prints will slightly adjust both lines.</li>
            <li>No tax, no brokerage fee, no FX spread: a clean like-for-like comparison of closes.</li>
          </ul>
        </div>
      </section>

      <footer className="mx-auto flex w-full max-w-[900px] flex-wrap items-center justify-between gap-2 px-6 pt-10 pb-10 font-sans text-[12px] text-[var(--coal-500)]">
        <span>Tumar · тұмар · an amulet that protects what matters</span>
        <span>Mainnet beta. Not investment advice.</span>
      </footer>
    </div>
  );
}

function CpiTable({
  title,
  table,
  sources,
}: {
  title: string;
  table: Record<number, number>;
  sources: Record<number, string>;
}) {
  return (
    <div className="card overflow-hidden">
      <div className="border-b border-[var(--hair)] px-6 py-3 font-sans text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--coal-600)]">
        {title} · annual
      </div>
      <table className="w-full font-mono text-[13px]">
        <tbody className="divide-y divide-[var(--hair)]">
          {Object.keys(table)
            .map(Number)
            .sort()
            .map((y) => (
              <tr key={y} className="text-[var(--coal-800)]">
                <td className="px-6 py-2 num-tab w-16">{y}</td>
                <td className="px-6 py-2 num-tab w-20">{(table[y] * 100).toFixed(1)}%</td>
                <td className="px-6 py-2 font-sans text-[12px] text-[var(--coal-600)]">{sources[y]}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

function Row({ label, value, bold = false }: { label: string; value: string; bold?: boolean }) {
  return (
    <tr className={bold ? "text-[var(--coal-950)]" : "text-[var(--coal-800)]"}>
      <td className="px-6 py-2.5 font-sans text-[12px] text-[var(--coal-600)]">{label}</td>
      <td className={`px-6 py-2.5 num-tab text-right ${bold ? "font-semibold" : ""}`}>{value}</td>
    </tr>
  );
}

function Src({ title, url, note }: { title: string; url: string; note: string }) {
  return (
    <li className="flex flex-col gap-0.5 px-6 py-3 sm:flex-row sm:items-baseline sm:justify-between">
      <div>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="font-semibold text-[var(--coal-950)] underline decoration-[var(--hair-strong)] decoration-1 underline-offset-4 hover:decoration-[var(--brand-500)]"
        >
          {title}
        </a>
        <div className="text-[12px] text-[var(--coal-600)]">{note}</div>
      </div>
      <div className="font-mono text-[11px] text-[var(--coal-500)]">{new URL(url).host}</div>
    </li>
  );
}
