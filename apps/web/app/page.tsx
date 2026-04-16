"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { SilkCard } from "@/components/silk-card";
import { TengeVsSpyChart } from "@/components/tenge-vs-spy-chart";
import { t, type Lang } from "@/lib/i18n";
import { useLang } from "@/lib/use-lang";

const LANGS: { code: Lang; label: string }[] = [
  { code: "en", label: "ENG" },
  { code: "ru", label: "РУС" },
  { code: "kz", label: "ҚАЗ" },
];

export default function Landing() {
  const [lang, setLang] = useLang();
  const [kztRate, setKztRate] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/spark?symbols=KZT=X&range=1d&interval=5m");
        const j = await res.json();
        const price = j?.["KZT=X"]?.price;
        if (!cancelled && Number.isFinite(price) && price > 0) setKztRate(price);
      } catch {}
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="landing relative min-h-[100dvh]">
      <header className="mx-auto flex w-full max-w-[1100px] items-center justify-between px-6 pt-6 pb-2">
        <TumarMark />
        <div className="flex items-center gap-3">
          <div className="flex items-center overflow-hidden rounded-full border border-[var(--hair-strong)] bg-[var(--paper-50)]">
            {LANGS.map((l) => (
              <button
                key={l.code}
                onClick={() => setLang(l.code)}
                className={`px-3 py-1.5 font-sans text-[11px] font-semibold tracking-[0.1em] transition-colors ${
                  lang === l.code
                    ? "bg-[var(--coal-950)] text-[var(--paper-100)]"
                    : "text-[var(--coal-600)] hover:text-[var(--coal-950)]"
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
          <Link
            href="/terminal"
            className="hidden rounded-full bg-[var(--brand-500)] px-4 py-1.5 font-sans text-[12px] font-semibold tracking-[0.06em] text-white shadow-[0_3px_12px_rgba(232,65,79,0.24)] hover:bg-[var(--brand-600)] sm:inline-block"
          >
            {t(lang, "openTerminal")}
          </Link>
        </div>
      </header>

      <section className="mx-auto w-full max-w-[1100px] px-6 pt-6 pb-4 sm:pt-8">
        <h1
          className={`display-soft max-w-[24ch] text-[30px] leading-[1.1] text-[var(--coal-950)] sm:text-[44px] ${
            lang === "en" ? "" : "hero-cyrillic"
          }`}
        >
          {t(lang, "headline")}
        </h1>
        <p className="mt-3 max-w-[620px] font-sans text-[14px] leading-[1.55] text-[var(--coal-600)] sm:text-[16px]">
          {t(lang, "subtitle")}
        </p>
      </section>

      <section className="mx-auto w-full max-w-[1100px] px-6">
        <TengeVsSpyChart lang={lang} kztRate={kztRate} />
      </section>

      <section className="mx-auto mt-12 flex w-full max-w-[1100px] flex-col items-start gap-5 px-6 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="display-soft text-[26px] leading-[1.1] text-[var(--coal-950)] sm:text-[32px]">
            {t(lang, "ctaTitle")}
          </div>
          <div className="mt-2 font-sans text-[13px] text-[var(--coal-600)]">
            {t(lang, "ctaSub")}
          </div>
        </div>
        <Link
          href="/terminal"
          className="group inline-flex items-center gap-3 rounded-full bg-[var(--brand-500)] px-7 py-4 font-sans text-[14px] font-semibold tracking-[0.02em] text-white shadow-[0_6px_24px_rgba(232,65,79,0.28)] transition-colors hover:bg-[var(--brand-600)]"
        >
          {t(lang, "enterTerminal")}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="transition-transform group-hover:translate-x-1">
            <path d="M5 12h14M13 5l7 7-7 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
      </section>

      <section className="mx-auto w-full max-w-[1100px] px-6 pt-14">
        <div className="pb-5">
          <div className="font-sans text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--brand-600)]">
            {t(lang, "remitLabel")}
          </div>
          <h2 className="display-soft mt-2 max-w-[720px] text-[26px] leading-[1.1] text-[var(--coal-950)] sm:text-[34px]">
            {t(lang, "remitTitle")}
          </h2>
          <p className="mt-4 max-w-[720px] font-sans text-[14px] leading-[1.6] text-[var(--coal-600)] sm:text-[15px]">
            {t(lang, "remitSub")}
          </p>
        </div>

        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-[var(--hair)] px-5 py-3">
            <span className="font-sans text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--coal-500)]">
              {t(lang, "remitFlowLabel")}
            </span>
            <span className="font-sans text-[10.5px] uppercase tracking-[0.12em] text-[var(--coal-500)]">
              {t(lang, "remitFlowSub")}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-0 border-b border-[var(--hair)] sm:grid-cols-[1fr_auto_1fr] sm:items-center">
            <div className="px-6 py-7">
              <div className="font-sans text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--coal-500)]">
                {t(lang, "remitDiasporaTag")}
              </div>
              <div className="mt-1 font-sans text-[14px] font-semibold text-[var(--coal-950)]">
                {t(lang, "remitDiasporaTitle")}
              </div>
              <p className="mt-1 font-sans text-[11.5px] leading-[1.55] text-[var(--coal-600)]">
                {t(lang, "remitDiasporaBody")}
              </p>
              <div className="mt-4 flex items-center justify-center">
                <SilkCard />
              </div>
              <div className="mt-3 text-center font-sans text-[10.5px] text-[var(--coal-500)]">
                {t(lang, "remitLoaded")}
              </div>
            </div>

            <div className="hidden items-center justify-center px-2 sm:flex">
              <ArrowRight />
            </div>
            <div className="flex items-center justify-center border-t border-[var(--hair)] py-3 sm:hidden">
              <ArrowDown />
            </div>

            <div className="px-6 py-7">
              <div className="font-sans text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--land-up)]">
                {t(lang, "remitFamilyTag")}
              </div>
              <div className="mt-1 font-sans text-[14px] font-semibold text-[var(--coal-950)]">
                {t(lang, "remitFamilyTitle")}
              </div>
              <p className="mt-1 font-sans text-[11.5px] leading-[1.55] text-[var(--coal-600)]">
                {t(lang, "remitFamilyBody")}
              </p>
              <div className="mt-4 flex items-center justify-center">
                <TumarCard />
              </div>
              <div className="mt-3 text-center font-sans text-[10.5px] text-[var(--coal-500)]">
                {t(lang, "remitVaultLabel")}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-0 divide-y divide-[var(--hair)] sm:grid-cols-4 sm:divide-x sm:divide-y-0">
            <FlowStep
              kicker={t(lang, "remitS1Kick")}
              title={t(lang, "remitS1Title")}
              line1={t(lang, "remitS1Line")}
              line1Note={t(lang, "remitS1Note")}
              amount="AED 3,670"
              amountFx="≈ $1,000"
              chip={t(lang, "remitS1Chip")}
              chipTone="muted"
            />
            <FlowStep
              kicker={t(lang, "remitS2Kick")}
              title={t(lang, "remitS2Title")}
              line1={t(lang, "remitS2Line")}
              line1Note={t(lang, "remitS2Note")}
              amount="999.10 USDC"
              amountFx="$0.90 spread"
              chip={t(lang, "remitS2Chip")}
              chipTone="muted"
            />
            <FlowStep
              kicker={t(lang, "remitS3Kick")}
              title={t(lang, "remitS3Title")}
              line1={t(lang, "remitS3Line")}
              line1Note={t(lang, "remitS3Note")}
              amount="+$999"
              amountFx="share: 22%"
              chip={t(lang, "remitS3Chip")}
              chipTone="up"
            />
            <FlowStep
              kicker={t(lang, "remitS4Kick")}
              title={t(lang, "remitS4Title")}
              line1={t(lang, "remitS4Line")}
              line1Note={t(lang, "remitS4Note")}
              amount={t(lang, "remitS4Amount")}
              amountFx={t(lang, "remitS4FX")}
              chip={t(lang, "remitS4Chip")}
              chipTone="up"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--hair)] px-5 py-3">
            <div className="flex items-center gap-5 font-sans text-[11px] text-[var(--coal-600)]">
              <MetricInline label={t(lang, "remitMetricEnd")} value="~47 s" />
              <MetricInline label={t(lang, "remitMetricCost")} value="$1.70" />
              <MetricInline label={t(lang, "remitMetricVsWU")} value="−91%" tone="up" />
            </div>
            <span className="font-sans text-[10.5px] text-[var(--coal-500)]">
              {t(lang, "remitBottom")}
            </span>
          </div>

          <div className="border-t border-[var(--hair)] bg-[var(--paper-200)] px-5 py-2.5 text-center font-sans text-[10px] leading-[1.5] tracking-[0.02em] text-[var(--coal-500)]">
            {t(lang, "remitDisclaim")}
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-[1100px] px-6 pt-16">
        <div className="pb-6">
          <div className="font-sans text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--brand-600)]">
            {t(lang, "pillarsLabel")}
          </div>
          <h2
            className={`display-soft mt-2 max-w-[820px] text-[26px] leading-[1.1] text-[var(--coal-950)] sm:text-[34px] ${
              lang === "en" ? "" : "hero-cyrillic"
            }`}
          >
            {t(lang, "pillarsTitle")}
          </h2>
          <p className="mt-4 max-w-[820px] font-sans text-[14px] leading-[1.6] text-[var(--coal-600)] sm:text-[15px]">
            {t(lang, "pillarsSub")}
          </p>
        </div>

        <div className="card overflow-hidden">
          <div className="grid grid-cols-1 gap-0 divide-y divide-[var(--hair)] sm:grid-cols-4 sm:divide-x sm:divide-y-0">
            <RwaCell
              label={t(lang, "rwa1Label")}
              title={t(lang, "rwa1Title")}
              body={t(lang, "rwa1Body")}
              stat={t(lang, "rwa1Stat")}
              tone="up"
            />
            <RwaCell
              label={t(lang, "rwa2Label")}
              title={t(lang, "rwa2Title")}
              body={t(lang, "rwa2Body")}
              stat={t(lang, "rwa2Stat")}
            />
            <RwaCell
              label={t(lang, "rwa3Label")}
              title={t(lang, "rwa3Title")}
              body={t(lang, "rwa3Body")}
              stat={t(lang, "rwa3Stat")}
            />
            <RwaCell
              label={t(lang, "rwa4Label")}
              title={t(lang, "rwa4Title")}
              body={t(lang, "rwa4Body")}
              stat={t(lang, "rwa4Stat")}
              tone="muted"
            />
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-[1100px] px-6 pt-16">
        <div className="flex items-end justify-between gap-6 pb-5">
          <div>
            <div className="font-sans text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--brand-600)]">
              {t(lang, "solanaLabel")}
            </div>
            <h2 className="display-soft mt-2 max-w-[720px] text-[26px] leading-[1.1] text-[var(--coal-950)] sm:text-[34px]">
              {t(lang, "solanaSub")}
            </h2>
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="divide-y divide-[var(--hair)] sm:grid sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <SolMetric
              label="Block time"
              value="400"
              unit="ms"
              bars={[
                { label: "SOL", width: 4, tone: "up", note: "0.4 s" },
                { label: "ETH L1", width: 20, tone: "muted", note: "12 s" },
                { label: "BTC", width: 100, tone: "muted", note: "600 s" },
              ]}
              delta="30× faster than Ethereum"
            />
            <SolMetric
              label="Median transfer fee"
              value="$0.0002"
              unit=""
              bars={[
                { label: "SOL", width: 1, tone: "up", note: "$0.0002" },
                { label: "ETH L1", width: 100, tone: "muted", note: "$2 – $10" },
                { label: "BTC", width: 55, tone: "muted", note: "$1 – $5" },
              ]}
              delta="~10,000× cheaper than L1"
            />
            <SolMetric
              label="Sustained tx/s"
              value="4,500"
              unit="TPS"
              bars={[
                { label: "SOL", width: 100, tone: "up", note: "4,500" },
                { label: "ETH L1", width: 2, tone: "muted", note: "~15" },
                { label: "BTC", width: 1, tone: "muted", note: "~7" },
              ]}
              delta="300× Ethereum L1 capacity"
            />
          </div>
        </div>

        <div className="card mt-5 overflow-hidden">
          <div className="divide-y divide-[var(--hair)] sm:grid sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <SolStat
              label="USDC on Solana"
              value="$8B+"
              sub="Second-largest USDC network · Circle native, no bridge"
            />
            <SolStat
              label="Solana TVL"
              value="$5B+"
              sub="Jupiter · Kamino · Jito · Marinade · Drift"
            />
            <SolStat
              label="Tokenized equities live"
              value="17"
              sub="Backed xStocks · SPY · NVDA · TSLA · GLD · META · MSFT …"
            />
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-[1100px] px-6 pt-16">
        <div className="pb-5">
          <div className="font-sans text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--brand-600)]">
            {t(lang, "composeLabel")}
          </div>
          <h2 className="display-soft mt-2 max-w-[720px] text-[26px] leading-[1.1] text-[var(--coal-950)] sm:text-[34px]">
            {t(lang, "composeTitle")}
          </h2>
          <p className="mt-4 max-w-[720px] font-sans text-[14px] leading-[1.6] text-[var(--coal-600)] sm:text-[15px]">
            {t(lang, "composeSub")}
          </p>
        </div>

        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-[var(--hair)] px-5 py-3">
            <span className="font-sans text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--coal-500)]">
              {t(lang, "compFlowLabel")}
            </span>
            <span className="font-sans text-[10.5px] uppercase tracking-[0.12em] text-[var(--coal-500)]">
              {t(lang, "compFlowSub")}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-0 border-b border-[var(--hair)] sm:grid-cols-[1fr_auto_1fr_auto_1fr] sm:items-stretch sm:divide-x sm:divide-[var(--hair)]">
            <FlowNode
              kicker={t(lang, "compN1Kick")}
              title={t(lang, "compN1Title")}
              line1={t(lang, "compN1Line")}
              amount="12.4 SPYx"
              amountFx="≈ $7,082"
              chip={t(lang, "compN1Chip")}
            />
            <div className="hidden items-center justify-center px-4 sm:flex">
              <ArrowRight />
            </div>
            <FlowNode
              kicker={t(lang, "compN2Kick")}
              title={t(lang, "compN2Title")}
              line1={t(lang, "compN2Line")}
              amount={t(lang, "compN2Amount")}
              amountFx="LTV 60%"
              chip={t(lang, "compN2Chip")}
              chipTone="up"
            />
            <div className="hidden items-center justify-center px-4 sm:flex">
              <ArrowRight />
            </div>
            <FlowNode
              kicker={t(lang, "compN3Kick")}
              title={t(lang, "compN3Title")}
              line1="4.2% APR"
              amount="3,000 USDC"
              amountFx={t(lang, "compN3Fx")}
              chip={t(lang, "compN3Chip")}
              chipTone="muted"
            />
          </div>

          <div className="grid grid-cols-1 gap-0 sm:grid-cols-[1.2fr_1fr] sm:divide-x sm:divide-[var(--hair)]">
            <div className="px-5 py-5">
              <div className="flex items-center justify-between font-sans text-[11px] text-[var(--coal-600)]">
                <span>{t(lang, "compLiqBuffer")}</span>
                <span className="num-tab text-[var(--coal-800)]">SPY $381 · now $571</span>
              </div>
              <div className="relative mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--hair)]">
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-[var(--land-up)]"
                  style={{ width: "62%" }}
                />
                <div
                  className="absolute -top-1 h-3.5 w-0.5 bg-[var(--coal-950)]"
                  style={{ left: "62%" }}
                />
              </div>
              <div className="mt-1.5 flex justify-between font-sans text-[10px] text-[var(--coal-500)]">
                <span>{t(lang, "compLiqSafe")}</span>
                <span className="text-[var(--coal-950)]">{t(lang, "compLiqNow")}</span>
                <span>{t(lang, "compLiqLiquidate")}</span>
              </div>
              <p className="mt-4 font-sans text-[11.5px] leading-[1.55] text-[var(--coal-600)]">
                {t(lang, "compLiqBody")}
              </p>
            </div>

            <div className="px-5 py-4">
              <div className="font-sans text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[var(--coal-500)]">
                {t(lang, "compOther")}
              </div>
              <div className="mt-2 divide-y divide-[var(--hair)]">
                <IntegrationRow protocol="MarginFi" action={t(lang, "compR1Action")} metric="~3% APY" sub={t(lang, "compR1Sub")} />
                <IntegrationRow protocol="Orca Whirlpool" action={t(lang, "compR2Action")} metric="~12% APR" sub={t(lang, "compR2Sub")} />
                <IntegrationRow protocol="Jito" action={t(lang, "compR3Action")} metric="~7.8% APY" sub={t(lang, "compR3Sub")} />
                <IntegrationRow protocol="Drift" action={t(lang, "compR4Action")} metric="2× short" sub={t(lang, "compR4Sub")} />
              </div>
            </div>
          </div>

          <div className="border-t border-[var(--hair)] bg-[var(--paper-200)] px-5 py-2.5 text-center font-sans text-[10px] leading-[1.5] tracking-[0.02em] text-[var(--coal-500)]">
            {t(lang, "compDisclaim")}
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-[1100px] px-6 pt-16">
        <div className="pb-5">
          <div className="font-sans text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--brand-600)]">
            {t(lang, "complianceLabel")}
          </div>
          <h2
            className={`display-soft mt-2 max-w-[820px] text-[26px] leading-[1.1] text-[var(--coal-950)] sm:text-[34px] ${
              lang === "en" ? "" : "hero-cyrillic"
            }`}
          >
            {t(lang, "complianceTitle")}
          </h2>
          <p className="mt-4 max-w-[820px] font-sans text-[14px] leading-[1.6] text-[var(--coal-600)] sm:text-[15px]">
            {t(lang, "complianceSub")}
          </p>
        </div>

        <div className="card overflow-hidden">
          <div className="grid grid-cols-1 gap-0 divide-y divide-[var(--hair)] sm:grid-cols-4 sm:divide-x sm:divide-y-0">
            <RwaCell
              label={t(lang, "comp1Label")}
              title={t(lang, "comp1Title")}
              body={t(lang, "comp1Body")}
              stat="Accredited · KYC"
              tone="brand"
            />
            <RwaCell
              label={t(lang, "comp2Label")}
              title={t(lang, "comp2Title")}
              body={t(lang, "comp2Body")}
              stat="No custodian"
              tone="up"
            />
            <RwaCell
              label={t(lang, "comp3Label")}
              title={t(lang, "comp3Title")}
              body={t(lang, "comp3Body")}
              stat="OFAC · EU · UK"
              tone="brand"
            />
            <RwaCell
              label={t(lang, "comp4Label")}
              title={t(lang, "comp4Title")}
              body={t(lang, "comp4Body")}
              stat="Per issuer allowlist"
              tone="muted"
            />
          </div>
        </div>
      </section>

      <footer className="mx-auto flex w-full max-w-[1100px] flex-wrap items-center justify-between gap-2 px-6 pt-16 pb-10">
        <span className="font-sans text-[12px] text-[var(--coal-500)]">
          {t(lang, "footer1")}
        </span>
        <span className="font-sans text-[12px] text-[var(--coal-500)]">
          {t(lang, "disclaimer")}
        </span>
      </footer>
    </div>
  );
}

function TumarMark() {
  return (
    <Link href="/" className="flex items-center" aria-label="tumar">
      <Image
        src="/tumar-mark.png"
        alt="tumar"
        width={423}
        height={138}
        priority
        className="h-10 w-auto sm:h-12"
      />
    </Link>
  );
}

function TumarCard() {
  return (
    <div
      className="relative aspect-[1.586/1] w-full max-w-[260px] overflow-hidden rounded-[14px] text-white shadow-[0_12px_28px_-14px_rgba(201,48,60,0.45)]"
      style={{
        background:
          "linear-gradient(135deg, #1a1410 0%, #2a1a18 42%, #4a1620 100%)",
      }}
    >
      <svg
        className="absolute inset-0 h-full w-full opacity-50"
        viewBox="0 0 260 164"
        fill="none"
        aria-hidden
      >
        <path d="M0 30 Q 80 10 160 40 T 320 30" stroke="#e8414f" strokeOpacity="0.35" strokeWidth="1" fill="none" />
        <path d="M-20 90 Q 60 60 150 90 T 320 80" stroke="#e8414f" strokeOpacity="0.25" strokeWidth="1" fill="none" />
        <path d="M-20 130 Q 80 110 180 140 T 360 120" stroke="#e8414f" strokeOpacity="0.18" strokeWidth="1" fill="none" />
        <circle cx="225" cy="42" r="40" fill="#e8414f" fillOpacity="0.12" />
      </svg>
      <div className="relative flex h-full flex-col justify-between p-4">
        <div className="flex items-center justify-between">
          <span className="display-soft text-[18px] font-semibold tracking-tight text-white">
            tumar
          </span>
          <span className="font-sans text-[8.5px] uppercase tracking-[0.16em] text-white/50">
            Family vault
          </span>
        </div>
        <div className="flex items-end justify-between">
          <div>
            <div className="font-sans text-[9px] uppercase tracking-[0.14em] text-white/50">
              PDA
            </div>
            <div className="num-tab mt-0.5 text-[11.5px] tracking-tight text-white/90">
              8vRk…hQ2f
            </div>
          </div>
          <div className="text-right">
            <div className="font-sans text-[9px] uppercase tracking-[0.14em] text-white/50">
              Network
            </div>
            <div className="mt-0.5 font-sans text-[11px] font-semibold text-[#e8414f]">
              Solana
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ArrowRight() {
  return (
    <svg width="42" height="14" viewBox="0 0 42 14" fill="none" aria-hidden>
      <path
        d="M1 7 H 36 M 30 2 L 38 7 L 30 12"
        stroke="var(--coal-500)"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ArrowDown() {
  return (
    <svg width="14" height="28" viewBox="0 0 14 28" fill="none" aria-hidden>
      <path
        d="M7 1 V 22 M 2 18 L 7 24 L 12 18"
        stroke="var(--coal-500)"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function RwaCell({
  label,
  title,
  body,
  stat,
  tone = "brand",
}: {
  label: string;
  title: string;
  body: string;
  stat: string;
  tone?: "brand" | "up" | "muted";
}) {
  const labelColor =
    tone === "up"
      ? "var(--land-up)"
      : tone === "muted"
        ? "var(--coal-500)"
        : "var(--brand-600)";
  return (
    <div className="px-5 py-5">
      <div
        className="font-sans text-[10.5px] font-semibold uppercase tracking-[0.12em]"
        style={{ color: labelColor }}
      >
        {label}
      </div>
      <div className="mt-1.5 font-sans text-[15px] font-semibold text-[var(--coal-950)]">
        {title}
      </div>
      <p className="mt-2 font-sans text-[12px] leading-[1.55] text-[var(--coal-600)]">
        {body}
      </p>
      <div className="num-tab mt-3 font-sans text-[11px] font-semibold tracking-[0.02em] text-[var(--coal-950)]">
        {stat}
      </div>
    </div>
  );
}

type Bar = { label: string; width: number; tone: "up" | "muted"; note: string };

function SolMetric({
  label,
  value,
  unit,
  bars,
  delta,
}: {
  label: string;
  value: string;
  unit?: string;
  bars: Bar[];
  delta: string;
}) {
  return (
    <div className="px-6 py-6">
      <div className="font-sans text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--coal-600)]">
        {label}
      </div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className="num-soft text-[42px] leading-none text-[var(--coal-950)] sm:text-[52px]">
          {value}
        </span>
        {unit && (
          <span className="font-sans text-[14px] font-semibold text-[var(--coal-600)]">
            {unit}
          </span>
        )}
      </div>
      <div className="mt-5 space-y-2">
        {bars.map((b) => (
          <div key={b.label} className="flex items-center gap-3">
            <span className="w-12 shrink-0 font-sans text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--coal-500)]">
              {b.label}
            </span>
            <div className="relative h-[5px] flex-1 rounded-full bg-[var(--hair)]">
              <div
                className="absolute inset-y-0 left-0 rounded-full"
                style={{
                  width: `${Math.max(1.5, Math.min(100, b.width))}%`,
                  backgroundColor:
                    b.tone === "up" ? "var(--land-up)" : "var(--coal-400)",
                }}
              />
            </div>
            <span className="w-[72px] shrink-0 text-right font-sans text-[10.5px] text-[var(--coal-500)] tabular-nums">
              {b.note}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-4 inline-flex items-center rounded-full border border-[rgba(31,157,85,0.22)] bg-[rgba(31,157,85,0.10)] px-2.5 py-1 font-sans text-[10.5px] font-semibold tracking-[0.02em] text-[var(--land-up)]">
        {delta}
      </div>
    </div>
  );
}

function FlowStep({
  kicker,
  title,
  line1,
  line1Note,
  amount,
  amountFx,
  chip,
  chipTone,
}: {
  kicker: string;
  title: string;
  line1: string;
  line1Note: string;
  amount: string;
  amountFx: string;
  chip: string;
  chipTone: "muted" | "brand" | "up";
}) {
  const chipStyle =
    chipTone === "brand"
      ? "bg-[var(--brand-100)] text-[var(--brand-600)] border-[rgba(232,65,79,0.24)]"
      : chipTone === "up"
        ? "bg-[rgba(31,157,85,0.10)] text-[var(--land-up)] border-[rgba(31,157,85,0.22)]"
        : "bg-[var(--paper-200)] text-[var(--coal-600)] border-[var(--hair)]";
  return (
    <div className="px-5 py-5">
      <div className="font-sans text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--coal-500)]">
        {kicker}
      </div>
      <div className="mt-1.5 font-sans text-[14px] font-semibold text-[var(--coal-950)]">
        {title}
      </div>
      <div className="mt-3 font-sans text-[12px] text-[var(--coal-800)]">
        {line1}
        <span className="ml-1.5 text-[var(--coal-500)]">· {line1Note}</span>
      </div>
      <div className="mt-3">
        <div className="num-soft text-[20px] leading-none text-[var(--coal-950)]">
          {amount}
        </div>
        <div className="mt-1 font-sans text-[11px] text-[var(--coal-500)]">
          {amountFx}
        </div>
      </div>
      <div className={`mt-4 inline-flex items-center rounded-full border px-2 py-0.5 font-sans text-[10px] font-semibold uppercase tracking-[0.06em] ${chipStyle}`}>
        {chip}
      </div>
    </div>
  );
}

function FlowNode({
  kicker,
  title,
  line1,
  amount,
  amountFx,
  chip,
  chipTone = "muted",
}: {
  kicker: string;
  title: string;
  line1: string;
  amount: string;
  amountFx: string;
  chip: string;
  chipTone?: "muted" | "brand" | "up";
}) {
  const chipStyle =
    chipTone === "brand"
      ? "bg-[var(--brand-100)] text-[var(--brand-600)] border-[rgba(232,65,79,0.24)]"
      : chipTone === "up"
        ? "bg-[rgba(31,157,85,0.10)] text-[var(--land-up)] border-[rgba(31,157,85,0.22)]"
        : "bg-[var(--paper-200)] text-[var(--coal-600)] border-[var(--hair)]";
  return (
    <div className="px-5 py-5">
      <div className="font-sans text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--coal-500)]">
        {kicker}
      </div>
      <div className="mt-1.5 font-sans text-[14px] font-semibold text-[var(--coal-950)]">
        {title}
      </div>
      <div className="mt-2 font-sans text-[11.5px] text-[var(--coal-600)]">
        {line1}
      </div>
      <div className="mt-3">
        <div className="num-soft text-[22px] leading-none text-[var(--coal-950)]">
          {amount}
        </div>
        <div className="mt-1 font-sans text-[11px] text-[var(--coal-500)]">
          {amountFx}
        </div>
      </div>
      <div className={`mt-4 inline-flex items-center rounded-full border px-2 py-0.5 font-sans text-[10px] font-semibold uppercase tracking-[0.06em] ${chipStyle}`}>
        {chip}
      </div>
    </div>
  );
}

function MetricInline({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "brand" | "up";
}) {
  const color =
    tone === "brand"
      ? "var(--brand-600)"
      : tone === "up"
        ? "var(--land-up)"
        : "var(--coal-950)";
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="font-sans text-[10.5px] uppercase tracking-[0.12em] text-[var(--coal-500)]">
        {label}
      </span>
      <span className="num-tab text-[13px] font-semibold" style={{ color }}>
        {value}
      </span>
    </span>
  );
}

function IntegrationRow({
  protocol,
  action,
  metric,
  sub,
  active = false,
}: {
  protocol: string;
  action: string;
  metric: string;
  sub: string;
  active?: boolean;
}) {
  return (
    <div className="flex items-center justify-between px-5 py-3">
      <div className="flex items-center gap-2.5">
        {active ? (
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--land-up)] shadow-[0_0_0_3px_rgba(31,157,85,0.18)]" />
        ) : (
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--coal-400)]" />
        )}
        <div>
          <div className="font-sans text-[12.5px] font-semibold text-[var(--coal-950)]">
            {protocol}
          </div>
          <div className="font-sans text-[10.5px] uppercase tracking-[0.06em] text-[var(--coal-500)]">
            {action}
          </div>
        </div>
      </div>
      <div className="text-right">
        <div className="num-tab text-[13px] font-semibold text-[var(--coal-950)]">{metric}</div>
        <div className="font-sans text-[10.5px] text-[var(--coal-500)]">{sub}</div>
      </div>
    </div>
  );
}

function SolStat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="px-6 py-6">
      <div className="font-sans text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--coal-600)]">
        {label}
      </div>
      <div className="num-soft mt-2 text-[40px] leading-none text-[var(--coal-950)] sm:text-[48px]">
        {value}
      </div>
      <div className="mt-3 font-sans text-[12px] leading-[1.5] text-[var(--coal-500)]">
        {sub}
      </div>
    </div>
  );
}
