"use client";

import { useEffect, useMemo, useState } from "react";
import type { Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";
import { KZ_CPI_ANNUAL, US_CPI_ANNUAL, cpiMultiplier } from "@/lib/cpi";
import { KZT_5Y_1WK, SPY_5Y_1WK } from "@/lib/chart-seed";

type Pt = { t: number; close: number };

type Normalized = {
  t: number;
  tengeRealUsd: number;
  spyRealUsd: number;
}[];

type Props = {
  lang: Lang;
  kztRate: number | null;
};

// Seed arrays -> {t, close} point objects, once at module scope so every
// render hits the same reference.
const SEED_KZT: Pt[] = KZT_5Y_1WK.map(([t, close]) => ({ t, close }));
const SEED_SPY: Pt[] = SPY_5Y_1WK.map(([t, close]) => ({ t, close }));

export function TengeVsSpyChart({ lang, kztRate }: Props) {
  // Seed with the bundled 5y weekly closes so the chart paints on first render
  // without a "Fetching 5-year…" flash. The useEffect below still refreshes
  // against the live /api/historical endpoint in the background so the numbers
  // stay fresh when Yahoo moves, but the visible chart never blanks out.
  const [kzt, setKzt] = useState<Pt[]>(SEED_KZT);
  const [spy, setSpy] = useState<Pt[]>(SEED_SPY);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [kztRes, spyRes] = await Promise.all([
          fetch("/api/historical?symbol=KZT=X&range=5y&interval=1wk").then((r) => r.json()),
          fetch("/api/historical?symbol=SPY&range=5y&interval=1wk").then((r) => r.json()),
        ]);
        if (cancelled) return;
        const fresh = (arr: unknown): Pt[] =>
          Array.isArray(arr) && arr.length >= 2 ? (arr as Pt[]) : [];
        const kztFresh = fresh(kztRes?.series);
        const spyFresh = fresh(spyRes?.series);
        if (kztFresh.length) setKzt(kztFresh);
        if (spyFresh.length) setSpy(spyFresh);
      } catch {
        // Stay on the seeded data - never show a blank chart to the user.
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const data: Normalized = useMemo(() => {
    if (kzt.length < 2 || spy.length < 2) return [];
    const WEEK = 7 * 86400;
    const kztMap = new Map<number, Pt>();
    for (const p of kzt) kztMap.set(Math.floor(p.t / WEEK), p);
    const spyMap = new Map<number, Pt>();
    for (const p of spy) spyMap.set(Math.floor(p.t / WEEK), p);

    const weeks = [...kztMap.keys()].filter((w) => spyMap.has(w)).sort((a, b) => a - b);
    if (weeks.length < 2) return [];

    const kzt0 = kztMap.get(weeks[0])!.close;
    const spy0 = spyMap.get(weeks[0])!.close;
    const startSec = kztMap.get(weeks[0])!.t;
    return weeks.map((w) => {
      const kp = kztMap.get(w)!;
      const sp = spyMap.get(w)!;
      const kztNominalUsd = 1000 * (kzt0 / kp.close);
      const spyNominalUsd = 1000 * (sp.close / spy0);
      const kzCpi = cpiMultiplier(kp.t, startSec, KZ_CPI_ANNUAL);
      const usCpi = cpiMultiplier(kp.t, startSec, US_CPI_ANNUAL);
      return {
        t: kp.t,
        tengeRealUsd: kztNominalUsd / kzCpi,
        spyRealUsd: spyNominalUsd / usCpi,
      };
    });
  }, [kzt, spy]);

  const geom = useMemo(() => {
    if (data.length < 2) return null;
    const values = data.flatMap((d) => [d.tengeRealUsd, d.spyRealUsd, 1000]);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = (max - min) * 0.08;
    return { min: min - pad, max: max + pad };
  }, [data]);

  // With SEED_KZT/SEED_SPY pre-loaded, `data` is already populated on first
  // render - this guard is only a safety net for the theoretical case where
  // the seed arrays diverge from each other. No user-visible "Fetching…" flash.
  if (!geom || data.length < 2) {
    return (
      <div className="card relative h-[360px] w-full sm:h-[460px]">
        <div className="absolute inset-0 flex items-center justify-center font-sans text-[12px] text-[var(--coal-500)]">
          {t(lang, "loading")}
        </div>
      </div>
    );
  }

  const w = 1200;
  const h = 460;
  const step = w / (data.length - 1);
  const toY = (v: number) => h - ((v - geom.min) / (geom.max - geom.min)) * h;
  const toX = (i: number) => i * step;

  const tengePath = data
    .map((d, i) => `${i === 0 ? "M" : "L"} ${toX(i).toFixed(1)} ${toY(d.tengeRealUsd).toFixed(1)}`)
    .join(" ");
  const spyPath = data
    .map((d, i) => `${i === 0 ? "M" : "L"} ${toX(i).toFixed(1)} ${toY(d.spyRealUsd).toFixed(1)}`)
    .join(" ");

  const baselineY = toY(1000);
  const first = data[0];
  const last = data[data.length - 1];
  const missed = last.spyRealUsd - last.tengeRealUsd;
  const fromDate = new Date(first.t * 1000);
  const toDate = new Date(last.t * 1000);

  const gapPath = data
    .map((d, i) => `${i === 0 ? "M" : "L"} ${toX(i).toFixed(1)} ${toY(d.spyRealUsd).toFixed(1)}`)
    .concat(
      [...data]
        .reverse()
        .map((d, i) => {
          const origIdx = data.length - 1 - i;
          return `L ${toX(origIdx).toFixed(1)} ${toY(d.tengeRealUsd).toFixed(1)}`;
        }),
    )
    .join(" ") + " Z";

  const fmt = (usd: number) => formatMoney(usd, lang, kztRate);
  const fmtPct = (pct: number) => `${pct >= 0 ? "+" : ""}${pct.toFixed(0)}%`;

  const spyRetPct = ((last.spyRealUsd - 1000) / 1000) * 100;
  const kztRetPct = ((last.tengeRealUsd - 1000) / 1000) * 100;

  const dateFormatter = new Intl.DateTimeFormat(localeFor(lang), { month: "short", year: "numeric" });

  return (
    <div className="relative">
      <div className="card overflow-hidden">
        <div className="flex items-stretch gap-0">
          <svg
            viewBox={`0 0 ${w} ${h}`}
            className="h-[360px] min-w-0 flex-1 sm:h-[460px]"
            preserveAspectRatio="none"
          >
            {[0.25, 0.5, 0.75].map((f) => (
              <line
                key={f}
                x1={0}
                x2={w}
                y1={h * f}
                y2={h * f}
                stroke="var(--hair)"
                strokeDasharray="3,5"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            <line
              x1={0}
              x2={w}
              y1={baselineY}
              y2={baselineY}
              stroke="var(--coal-400)"
              strokeDasharray="5,5"
              strokeWidth="1.2"
              vectorEffect="non-scaling-stroke"
            />
            <path d={gapPath} fill="var(--brand-500)" opacity={0.07} />
            <path
              d={tengePath}
              stroke="var(--land-down)"
              strokeWidth="3.2"
              fill="none"
              vectorEffect="non-scaling-stroke"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <path
              d={spyPath}
              stroke="var(--land-up)"
              strokeWidth="3.2"
              fill="none"
              vectorEffect="non-scaling-stroke"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <circle cx={toX(data.length - 1)} cy={toY(last.spyRealUsd)} r={6.5} fill="var(--land-up)" />
            <circle cx={toX(data.length - 1)} cy={toY(last.tengeRealUsd)} r={6.5} fill="var(--land-down)" />
          </svg>

          <div className="relative w-[150px] shrink-0 sm:w-[180px]">
            <div
              className="absolute left-2 -translate-y-1/2"
              style={{ top: `${(toY(last.spyRealUsd) / h) * 100}%` }}
            >
              <div className="font-sans text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--land-up)]">
                {t(lang, "spyLabel")}
              </div>
              <div className="num-soft text-[26px] leading-none text-[var(--land-up)] sm:text-[32px]">
                {fmt(last.spyRealUsd)}
              </div>
              <div className="font-sans mt-1 text-[11px] font-semibold text-[var(--land-up)]">
                {fmtPct(spyRetPct)}
              </div>
            </div>
            <div
              className="absolute left-2 -translate-y-1/2"
              style={{ top: `${(toY(last.tengeRealUsd) / h) * 100}%` }}
            >
              <div className="font-sans text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--land-down)]">
                {t(lang, "kztLabel")}
              </div>
              <div className="num-soft text-[26px] leading-none text-[var(--land-down)] sm:text-[32px]">
                {fmt(last.tengeRealUsd)}
              </div>
              <div className="font-sans mt-1 text-[11px] font-semibold text-[var(--land-down)]">
                {fmtPct(kztRetPct)}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2 px-1 font-sans text-[11px] text-[var(--coal-500)]">
        <div>
          {fmt(1000)} · {dateFormatter.format(fromDate)} → {dateFormatter.format(toDate)}
        </div>
        <div>{t(lang, "chartSource")}</div>
      </div>

      <div className="card-inset mt-5 px-6 py-5">
        <div className="font-sans text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--brand-600)]">
          {t(lang, "methodologyLabel")}
        </div>
        <p className="mt-2 font-sans text-[15px] leading-[1.6] text-[var(--coal-800)] sm:text-[16px]">
          {t(lang, "methodology")}
        </p>
        <a
          href="/methodology"
          className="mt-4 inline-flex items-center gap-1.5 font-sans text-[13px] font-semibold text-[var(--brand-600)] underline decoration-[var(--brand-300)] decoration-1 underline-offset-4 hover:decoration-[var(--brand-600)]"
        >
          {t(lang, "methodologyLink")}
        </a>
      </div>

      <div className="card mt-5 divide-y divide-[var(--hair)] sm:grid sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <Cell label={t(lang, "spyToday")} value={fmt(last.spyRealUsd)} tone="up" sub={fmtPct(spyRetPct)} />
        <Cell label={t(lang, "kztToday")} value={fmt(last.tengeRealUsd)} tone="down" sub={fmtPct(kztRetPct)} />
        <Cell label={t(lang, "missed")} value={fmt(missed)} tone="brand" sub={t(lang, "missedSub")} />
      </div>
    </div>
  );
}

function Cell({
  label,
  value,
  tone,
  sub,
}: {
  label: string;
  value: string;
  tone: "up" | "down" | "brand";
  sub: string;
}) {
  const color =
    tone === "up"
      ? "var(--land-up)"
      : tone === "down"
      ? "var(--land-down)"
      : "var(--brand-600)";
  return (
    <div className="px-6 py-5">
      <div className="font-sans text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--coal-600)]">
        {label}
      </div>
      <div className="num-soft mt-1.5 text-[34px] leading-none" style={{ color }}>
        {value}
      </div>
      <div className="font-sans mt-2 text-[12px] font-semibold" style={{ color }}>
        {sub}
      </div>
    </div>
  );
}

function localeFor(lang: Lang): string {
  if (lang === "ru") return "ru-RU";
  if (lang === "kz") return "kk-KZ";
  return "en-US";
}

function formatMoney(usd: number, lang: Lang, kztRate: number | null): string {
  if (lang === "en" || !kztRate) {
    const n = Math.round(usd);
    return `$${n.toLocaleString("en-US")}`;
  }
  const kzt = Math.round(usd * kztRate);
  const grouped = kzt.toLocaleString(localeFor(lang)).replace(/,/g, "\u202F");
  return `₸${grouped}`;
}
