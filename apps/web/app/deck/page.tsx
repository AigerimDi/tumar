/**
 * Pitch-deck render target for the 1280×720 PDF at repo root (tumar-deck.pdf).
 *
 * This route exists ONLY to render slides for printing. It is gated to
 * development/preview builds and returns 404 in production. The PDF is the
 * shippable artifact - /deck does NOT live on the public site.
 *
 * S1lkPay framing (v2, correct):
 *   S1lkPay / Kaspi / any bank card are ONE layer (the user's funding card).
 *   Flow: any card → onramp (Binance / Bybit / Coinbase / Phantom) → USDC
 *   on Solana → Tumar family vault PDA. S1lkPay has no crypto rails.
 *
 * Slide 2 label clamp:
 *   The SPY/KZT labels in ProblemChart are absolutely positioned at a
 *   percentage of the 420-unit viewBox. When SPY peaks near the top of the
 *   chart, the label's translate(-50%) would push its top edge off the
 *   sidebar. We clamp the computed `top` to min=32px / max=(height-32px)
 *   so neither label ever clips.
 */

import Image from "next/image";
import { notFound } from "next/navigation";
import { KZ_CPI_ANNUAL, US_CPI_ANNUAL, cpiMultiplier } from "@/lib/cpi";
import { KZT_5Y_1WK, SPY_5Y_1WK } from "@/lib/chart-seed";

export const dynamic = "force-dynamic";

/**
 * Track variants - each hackathon side track gets a tailored slide order
 * via /deck?track=<slug>. The universal version (no param, or ?track=all)
 * keeps the original 11-slide flow plus the 3 new slides (Cloak privacy,
 * Palm USD halal, QVAC offline AI).
 *
 * Slug → which slide leads + which slides get featured. We don't write 6
 * separate decks; we reorder the same atoms. The Palm USD listing caps at
 * 12 slides, so each variant trims `Slide8Composability` (planned, not
 * built) to fit cleanly.
 */
type TrackSlug =
  | "all"
  | "cloak"
  | "qvac"
  | "palm"
  | "kz"
  | "s1lkpay"
  | "metaforra";

type SlideKey =
  | "title"
  | "problem"
  | "personas"
  | "gap"
  | "solution"
  | "how"
  | "cloak"
  | "palm"
  | "qvac"
  | "solana"
  | "composability"
  | "team"
  | "roadmap"
  | "close";

const TRACK_ORDERS: Record<TrackSlug, SlideKey[]> = {
  // Universal - full deck (drops composability to keep at 13 slides; 12-slide
  // tracks below trim further). Lead with story, then product, then proof.
  all: [
    "title",
    "problem",
    "personas",
    "gap",
    "solution",
    "how",
    "cloak",
    "palm",
    "qvac",
    "solana",
    "team",
    "roadmap",
    "close",
  ],
  // Cloak - privacy is load-bearing. Lead the deck with privacy after the
  // problem; expand Cloak into the 'how' position; demote QVAC + Palm USD.
  cloak: [
    "title",
    "problem",
    "personas",
    "cloak",
    "solution",
    "how",
    "gap",
    "qvac",
    "palm",
    "solana",
    "team",
    "close",
  ],
  // Tether QVAC - sovereign intelligence for sovereign money. Lead with
  // grandma slide; product flow follows.
  qvac: [
    "title",
    "problem",
    "personas",
    "qvac",
    "solution",
    "how",
    "cloak",
    "palm",
    "gap",
    "solana",
    "team",
    "close",
  ],
  // Palm USD - halal stablecoin for the diaspora's Muslim families. Lead
  // with the PUSD slide; UAE corridor in personas does the rest.
  palm: [
    "title",
    "problem",
    "personas",
    "palm",
    "solution",
    "how",
    "cloak",
    "qvac",
    "solana",
    "team",
    "roadmap",
    "close",
  ],
  // Superteam KZ general - founder-first, story-first, roadmap-prominent.
  kz: [
    "title",
    "problem",
    "personas",
    "gap",
    "solution",
    "how",
    "qvac",
    "cloak",
    "palm",
    "solana",
    "team",
    "roadmap",
    "close",
  ],
  // S1lkPay - payments + KZTE corridor. Lead with the funding-card flow.
  s1lkpay: [
    "title",
    "problem",
    "personas",
    "solution",
    "how",
    "gap",
    "cloak",
    "palm",
    "qvac",
    "solana",
    "team",
    "roadmap",
    "close",
  ],
  // Metaforra - RWA tokenization. Lead with what's actually inside the vault.
  metaforra: [
    "title",
    "problem",
    "personas",
    "solution",
    "solana",
    "how",
    "composability",
    "cloak",
    "qvac",
    "palm",
    "team",
    "roadmap",
    "close",
  ],
};

const SLIDE_RENDERERS: Record<SlideKey, (n: number, last: boolean) => React.ReactNode> = {
  title: (n) => <Slide1 n={n} key="title" />,
  problem: (n) => <Slide2Problem n={n} key="problem" />,
  personas: (n) => <Slide3Personas n={n} key="personas" />,
  gap: (n) => <Slide4Gap n={n} key="gap" />,
  solution: (n) => <Slide5Solution n={n} key="solution" />,
  how: (n) => <Slide6HowItWorks n={n} key="how" />,
  cloak: (n) => <SlideCloak n={n} key="cloak" />,
  palm: (n) => <SlidePalm n={n} key="palm" />,
  qvac: (n) => <SlideQvac n={n} key="qvac" />,
  solana: (n) => <Slide7WhySolana n={n} key="solana" />,
  composability: (n) => <Slide8Composability n={n} key="composability" />,
  team: (n) => <Slide9Team n={n} key="team" />,
  roadmap: (n) => <Slide10Roadmap n={n} key="roadmap" />,
  close: (n, last) => <Slide11Close n={n} last={last} key="close" />,
};

export default async function DeckPage({
  searchParams,
}: {
  searchParams: Promise<{ track?: string }>;
}) {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.TUMAR_DECK_ENABLED !== "1"
  ) {
    notFound();
  }

  const params = await searchParams;
  const track = (
    Object.keys(TRACK_ORDERS).includes(params.track ?? "")
      ? params.track
      : "all"
  ) as TrackSlug;
  const order = TRACK_ORDERS[track];

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `@page { size: 1280px 720px; margin: 0; }
            @media print { body { margin: 0; } }`,
        }}
      />
      <main style={{ background: "var(--paper-100)" }} data-track={track}>
        {order.map((key, i) =>
          SLIDE_RENDERERS[key](i + 1, i === order.length - 1),
        )}
      </main>
    </>
  );
}

// ----------------------------------------------------------------------
// Slide chrome
// ----------------------------------------------------------------------

function SlideFrame({
  n,
  last = false,
  children,
  className = "",
}: {
  n: number;
  last?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      data-slide={n}
      className={`relative flex h-[720px] w-[1280px] flex-col justify-center overflow-hidden px-20 py-16 ${className}`}
      style={
        last
          ? undefined
          : { pageBreakAfter: "always", breakAfter: "page" }
      }
    >
      {children}
    </section>
  );
}

function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-sans text-[11px] font-bold uppercase tracking-[0.24em] text-[var(--brand-600)]">
      {children}
    </div>
  );
}

function SlideTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-serif mt-5 text-[52px] font-semibold leading-[1.08] tracking-tight text-[var(--coal-950)]">
      {children}
    </h2>
  );
}

function SlideSub({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-4 max-w-[900px] font-sans text-[17px] font-medium leading-[1.55] text-[var(--coal-950)]">
      {children}
    </p>
  );
}

// ----------------------------------------------------------------------
// Slide 1 - Title
// ----------------------------------------------------------------------

function Slide1({ n }: { n: number }) {
  return (
    <SlideFrame n={n} className="items-center justify-center text-center">
      <Image
        src="/tumar-mark.png"
        alt="tumar"
        width={423}
        height={138}
        priority
        className="h-[80px] w-auto"
      />
      <h1 className="font-serif mt-14 max-w-[920px] text-[62px] font-semibold leading-[1.05] tracking-tight text-[var(--coal-950)]">
        Send money home that builds capital, instead of losing to inflation.
      </h1>
      <p className="mt-8 max-w-[720px] font-sans text-[19px] font-medium text-[var(--coal-800)]">
        A non-custodial family vault on Solana. USDC in, tokenized real-world
        assets out.
      </p>
      <div className="mt-14 font-sans text-[11px] font-bold uppercase tracking-[0.24em] text-[var(--coal-800)]">
        Colosseum Frontier &nbsp;·&nbsp; Superteam KZ &nbsp;·&nbsp; 2026
      </div>
      <div className="mt-3 font-sans text-[14px] font-semibold text-[var(--coal-950)]">
        Aigerim Dildakhanova · Frederik Bussler
      </div>
    </SlideFrame>
  );
}

// ----------------------------------------------------------------------
// Slide 2 - Problem
// ----------------------------------------------------------------------

function Slide2Problem({ n }: { n: number }) {
  return (
    <SlideFrame n={n}>
      <Kicker>01 · The Problem</Kicker>
      <SlideTitle>
        The tenge your family saved is
        <br />
        worth less each year.
      </SlideTitle>
      <div className="mt-8 grid grid-cols-[680px_1fr] gap-12">
        <ProblemChart />
        <div className="flex flex-col justify-center gap-6">
          <ProblemStat
            stat="11.2%"
            label="AVG ANNUAL CPI"
            body="Kazakhstan consumer inflation averaged 11.2% per year since 2021, peaking at 20.3% in 2022."
          />
          <ProblemStat
            stat="−44%"
            label="REAL PURCHASING POWER"
            body="The tenge lost roughly 44% of its real purchasing power against USD over five years."
          />
          <ProblemStat
            stat="~$300/mo"
            label="AVG DIASPORA REMITTANCE"
            body="Average diaspora remittance from UAE and Turkey to KZ arrives as tenge and erodes on arrival."
          />
        </div>
      </div>
    </SlideFrame>
  );
}

function ProblemChart() {
  const WEEK = 7 * 86400;
  const kztMap = new Map<number, number>();
  for (const [t, close] of KZT_5Y_1WK) kztMap.set(Math.floor(t / WEEK), close);
  const spyMap = new Map<number, number>();
  for (const [t, close] of SPY_5Y_1WK) spyMap.set(Math.floor(t / WEEK), close);
  const weeks = [...kztMap.keys()]
    .filter((w) => spyMap.has(w))
    .sort((a, b) => a - b);
  const startSec = weeks[0] * WEEK;
  const kzt0 = kztMap.get(weeks[0])!;
  const spy0 = spyMap.get(weeks[0])!;
  const data = weeks.map((w) => {
    const t = w * WEEK;
    const kp = kztMap.get(w)!;
    const sp = spyMap.get(w)!;
    const kztNominal = 1000 * (kzt0 / kp);
    const spyNominal = 1000 * (sp / spy0);
    const kzCpi = cpiMultiplier(t, startSec, KZ_CPI_ANNUAL);
    const usCpi = cpiMultiplier(t, startSec, US_CPI_ANNUAL);
    return {
      t,
      tenge: kztNominal / kzCpi,
      spy: spyNominal / usCpi,
    };
  });
  const last = data[data.length - 1];
  const first = data[0];
  const values = data.flatMap((d) => [d.tenge, d.spy, 1000]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = (max - min) * 0.08;
  const yMin = min - pad;
  const yMax = max + pad;
  const W = 1200;
  const H = 420;
  const toY = (v: number) => H - ((v - yMin) / (yMax - yMin)) * H;
  const toX = (i: number) => (i / (data.length - 1)) * W;
  const tengePath = data
    .map((d, i) => `${i === 0 ? "M" : "L"} ${toX(i).toFixed(1)} ${toY(d.tenge).toFixed(1)}`)
    .join(" ");
  const spyPath = data
    .map((d, i) => `${i === 0 ? "M" : "L"} ${toX(i).toFixed(1)} ${toY(d.spy).toFixed(1)}`)
    .join(" ");
  const baselineY = toY(1000);
  const spyRet = ((last.spy - 1000) / 1000) * 100;
  const kzRet = ((last.tenge - 1000) / 1000) * 100;
  const fromLabel = new Date(first.t * 1000).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });
  const toLabel = new Date(last.t * 1000).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });

  // Clamp label centers to at least LABEL_PAD px from either sidebar edge so
  // the translate(-50%) stack never clips off top/bottom. SPY tends to peak
  // high (small toY → label would otherwise sit at the very top edge).
  const LABEL_PAD_PCT = 12; // ~36px of a 300px sidebar
  const clampPct = (pct: number) =>
    Math.max(LABEL_PAD_PCT, Math.min(100 - LABEL_PAD_PCT, pct));
  const spyTopPct = clampPct((toY(last.spy) / H) * 100);
  const kztTopPct = clampPct((toY(last.tenge) / H) * 100);

  return (
    <div className="card overflow-hidden">
      <div className="flex items-stretch">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-[300px] min-w-0 flex-1" preserveAspectRatio="none">
          {[0.25, 0.5, 0.75].map((f) => (
            <line
              key={f}
              x1={0}
              x2={W}
              y1={H * f}
              y2={H * f}
              stroke="var(--hair)"
              strokeDasharray="3,5"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <line
            x1={0}
            x2={W}
            y1={baselineY}
            y2={baselineY}
            stroke="var(--coal-400)"
            strokeDasharray="5,5"
            strokeWidth="1.2"
            vectorEffect="non-scaling-stroke"
          />
          <path d={tengePath} stroke="var(--land-down)" strokeWidth="3.5" fill="none" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          <path d={spyPath} stroke="var(--land-up)" strokeWidth="3.5" fill="none" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          <circle cx={toX(data.length - 1)} cy={toY(last.spy)} r={6} fill="var(--land-up)" />
          <circle cx={toX(data.length - 1)} cy={toY(last.tenge)} r={6} fill="var(--land-down)" />
        </svg>
        <div className="relative w-[160px] shrink-0">
          <div
            className="absolute left-2 -translate-y-1/2"
            style={{ top: `${spyTopPct}%` }}
          >
            <div className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--land-up)]">
              SPY ↗
            </div>
            <div className="num-soft text-[26px] leading-none text-[var(--land-up)]">
              ${Math.round(last.spy).toLocaleString()}
            </div>
            <div className="font-sans mt-1 text-[11px] font-bold text-[var(--land-up)]">
              {spyRet >= 0 ? "+" : ""}
              {spyRet.toFixed(0)}%
            </div>
          </div>
          <div
            className="absolute left-2 -translate-y-1/2"
            style={{ top: `${kztTopPct}%` }}
          >
            <div className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--land-down)]">
              KZT ↘
            </div>
            <div className="num-soft text-[26px] leading-none text-[var(--land-down)]">
              ${Math.round(last.tenge).toLocaleString()}
            </div>
            <div className="font-sans mt-1 text-[11px] font-bold text-[var(--land-down)]">
              {kzRet.toFixed(0)}%
            </div>
          </div>
        </div>
      </div>
      <div className="flex items-baseline justify-between border-t border-[var(--hair)] px-5 py-3 font-sans text-[11px] font-semibold text-[var(--coal-800)]">
        <div>
          $1,000 · {fromLabel} → {toLabel}
        </div>
        <div>REAL PURCHASING POWER · CPI-ADJUSTED</div>
      </div>
    </div>
  );
}

function ProblemStat({
  stat,
  label,
  body,
}: {
  stat: string;
  label: string;
  body: string;
}) {
  return (
    <div className="border-l-[3px] border-[var(--brand-500)] pl-5">
      <div className="flex items-baseline gap-3">
        <div className="num-soft text-[44px] font-semibold leading-none text-[var(--coal-950)]">
          {stat}
        </div>
        <div className="font-sans text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--coal-800)]">
          {label}
        </div>
      </div>
      <p className="mt-2 font-sans text-[14px] font-medium leading-[1.45] text-[var(--coal-950)]">
        {body}
      </p>
    </div>
  );
}

// ----------------------------------------------------------------------
// Slide 3 - Personas
// ----------------------------------------------------------------------

function Slide3Personas({ n }: { n: number }) {
  return (
    <SlideFrame n={n}>
      <Kicker>02 · Who this is for</Kicker>
      <SlideTitle>
        The diaspora sends money home. It
        <br />
        erodes before the family can use it.
      </SlideTitle>
      <div className="mt-10 grid grid-cols-3 gap-6">
        <PersonaCard
          initial="K"
          color="#8c5c2a"
          name="Kirill"
          locRole="DUBAI, UAE · CONSTRUCTION FOREMAN"
          amount="~$800 / month"
          purpose="→ Parents in Shymkent"
        />
        <PersonaCard
          initial="A"
          color="#c9303c"
          name="Aigerim"
          locRole="ISTANBUL, TR · REGISTERED NURSE"
          amount="~$500 / month"
          purpose="→ Sister's university fees · Almaty"
        />
        <PersonaCard
          initial="N"
          color="#1f3f75"
          name="Nurlan"
          locRole="BERLIN, DE · SOFTWARE ENGINEER"
          amount="$1,500 / month"
          purpose="→ Family down-payment fund · Almaty"
        />
      </div>
      <p className="mt-10 max-w-[1000px] font-sans text-[14px] font-medium leading-[1.55] text-[var(--coal-950)]">
        An estimated 1.5M+ ethnic Kazakhs live and work abroad. The UAE and
        Turkey corridors grow fastest. Annual personal remittances to
        Kazakhstan run into the hundreds of millions of dollars. Most of it
        lands as tenge and starts losing value the day it arrives.
      </p>
      <p className="mt-3 font-sans text-[11px] font-semibold italic text-[var(--coal-600)]">
        Sources: NBK personal remittances · MFA RK diaspora.
      </p>
    </SlideFrame>
  );
}

function PersonaCard({
  initial,
  color,
  name,
  locRole,
  amount,
  purpose,
}: {
  initial: string;
  color: string;
  name: string;
  locRole: string;
  amount: string;
  purpose: string;
}) {
  return (
    <div className="card flex flex-col gap-5 p-6">
      <div
        className="grid h-12 w-12 place-items-center rounded-full font-serif text-[22px] font-semibold text-white"
        style={{ background: color }}
      >
        {initial}
      </div>
      <div>
        <div className="font-serif text-[28px] font-semibold leading-none text-[var(--coal-950)]">
          {name}
        </div>
        <div className="mt-2 font-sans text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--coal-800)]">
          {locRole}
        </div>
      </div>
      <div>
        <div className="num-soft text-[30px] font-semibold leading-none text-[var(--coal-950)]">
          {amount}
        </div>
        <div className="mt-2 font-sans text-[13px] font-medium text-[var(--coal-950)]">
          {purpose}
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------
// Slide 4 - Gap
// ----------------------------------------------------------------------

function Slide4Gap({ n }: { n: number }) {
  const rows: [string, string, string][] = [
    [
      "Onboarding",
      "KZ residency · in-person KYC at branch",
      "Permissionless · Solana wallet in under 60 s",
    ],
    [
      "Russian-speaking KZ users",
      "Post-2022 compliance filters · high reject rate at foreign affiliates",
      "On-chain rules · no language or passport screening",
    ],
    ["Hours", "NYSE 9:30–16:00 ET · closed weekends and holidays", "24 / 7 / 365"],
    ["Settlement", "T+2", "Sub-second"],
    [
      "FX + fees",
      "Spread embedded in NAV · opaque per trade",
      "Jupiter v6 best route · per-swap quote disclosed",
    ],
    ["Min effective deposit", "~$1,000", "$10"],
  ];
  return (
    <SlideFrame n={n}>
      <Kicker>03 · The gap freedom leaves</Kicker>
      <SlideTitle>Freedom Broker exists. It doesn&apos;t serve them.</SlideTitle>
      <SlideSub>
        The obvious incumbent has strong brand recognition inside Kazakhstan.
        It wasn&apos;t built for the diaspora sending $300 on a Tuesday - and
        the friction compounds for Russian-speaking Kazakhs abroad.
      </SlideSub>
      <div className="card mt-8 overflow-hidden">
        <div className="grid grid-cols-[220px_1fr_1fr] bg-[var(--surface)]">
          <TableHead>Dimension</TableHead>
          <TableHead>Freedom Broker</TableHead>
          <TableHead>Tumar</TableHead>
        </div>
        {rows.map(([dim, fb, tm]) => (
          <div
            key={dim}
            className="grid grid-cols-[220px_1fr_1fr] border-t border-[var(--hair)]"
          >
            <div className="p-4 font-sans text-[13px] font-bold text-[var(--coal-950)]">
              {dim}
            </div>
            <div className="p-4 font-sans text-[13px] font-medium text-[var(--coal-800)]">
              {fb}
            </div>
            <div className="p-4 font-sans text-[13px] font-semibold text-[var(--coal-950)]">
              {tm}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-6 text-center font-sans text-[13px] font-semibold italic text-[var(--coal-800)]">
        We&apos;re not competing with Freedom. We&apos;re serving the user
        Freedom excludes.
      </p>
    </SlideFrame>
  );
}

function TableHead({ children }: { children: React.ReactNode }) {
  return (
    <div className="p-4 font-sans text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--coal-800)]">
      {children}
    </div>
  );
}

// ----------------------------------------------------------------------
// Slide 5 - Solution (three-layer flow visual)
// ----------------------------------------------------------------------

function Slide5Solution({ n }: { n: number }) {
  return (
    <SlideFrame n={n}>
      <Kicker>04 · The solution</Kicker>
      <SlideTitle>
        Tumar: a family vault that turns
        <br />
        remittance into a portfolio.
      </SlideTitle>
      <div className="mt-10 grid grid-cols-[620px_1fr] gap-14">
        <ThreeLayerFlow />
        <div className="flex flex-col justify-center gap-5">
          <SolutionBullet
            n="01"
            title="Any card funds any exchange"
            body="S1lkPay, Kaspi, VISA, Mastercard. Off-ramp banks, not us."
          />
          <SolutionBullet
            n="02"
            title="Exchange converts fiat → USDC"
            body="Binance, Bybit, Coinbase, Phantom onramp - users already know these."
          />
          <SolutionBullet
            n="03"
            title="Tumar vault receives on Solana"
            body="Non-custodial PDA. 20 on-chain assets, Jupiter v6 auto-allocation."
          />
          <SolutionBullet
            n="04"
            title="Trilingual UI, family never opens Phantom"
            body="English, Russian, Kazakh. One Solana Pay QR per family vault."
          />
        </div>
      </div>
      <div className="mt-auto flex items-center justify-between border-t border-[var(--hair)] pt-5">
        <div className="font-sans text-[13px] font-semibold italic text-[var(--coal-800)]">
          S1lkPay, Kaspi, etc are card issuers - not crypto rails. Tumar is the
          last mile.
        </div>
        <div className="font-sans text-[13px] font-bold text-[var(--brand-600)]">
          Try it live · /terminal →
        </div>
      </div>
    </SlideFrame>
  );
}

function ThreeLayerFlow() {
  return (
    <div className="flex items-center gap-3">
      <CardStack />
      <FlowArrow />
      <ExchangeCard />
      <FlowArrow />
      <VaultCard />
    </div>
  );
}

function FlowArrow() {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="text-[24px] font-bold text-[var(--coal-600)]">→</div>
    </div>
  );
}

function CardStack() {
  const cards = [
    { label: "S1lkPay", bg: "#1a0318", accent: "#ff9a55" },
    { label: "Kaspi", bg: "#b91c1c", accent: "#fde68a" },
    { label: "Any bank", bg: "#1e3a8a", accent: "#fef3c7" },
  ];
  return (
    <div className="relative h-[170px] w-[180px] shrink-0">
      {cards.map((c, i) => {
        const top = i * 14;
        const left = i * 10;
        return (
          <div
            key={c.label}
            className="absolute aspect-[1.586/1] w-[140px] overflow-hidden rounded-[10px] p-2.5 text-white ring-1 ring-black/10"
            style={{
              top,
              left,
              background: c.bg,
              boxShadow: "0 2px 6px rgba(0,0,0,0.18)",
              zIndex: cards.length - i,
            }}
          >
            <div className="flex items-center justify-between">
              <div
                className="h-3 w-3 rounded-full"
                style={{ background: c.accent }}
              />
              <div className="font-sans text-[7px] font-bold uppercase tracking-[0.14em] text-white/80">
                Mastercard
              </div>
            </div>
            <div className="mt-4 font-sans text-[10px] font-semibold tracking-wide text-white/85">
              {c.label}
            </div>
            <div className="num-tab mt-0.5 text-[8px] font-semibold text-white/60">
              •••• 4242
            </div>
          </div>
        );
      })}
      <div className="absolute -bottom-1 left-0 w-full text-center font-sans text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--coal-800)]">
        any card
      </div>
    </div>
  );
}

function ExchangeCard() {
  return (
    <div className="flex h-[150px] w-[140px] shrink-0 flex-col rounded-[10px] bg-[#0b0b0e] p-3 text-white ring-1 ring-black/20">
      <div className="flex items-center gap-1.5">
        <div className="grid h-5 w-5 place-items-center rounded-sm bg-[#f3ba2f]">
          <span className="text-[10px] font-bold text-black">B</span>
        </div>
        <div className="font-sans text-[11px] font-bold tracking-wide">
          Binance
        </div>
      </div>
      <div className="mt-auto">
        <div className="font-sans text-[9px] font-bold uppercase tracking-[0.18em] text-white/60">
          Buy
        </div>
        <div className="num-soft text-[18px] font-semibold leading-none">
          1,000 USDC
        </div>
        <div className="mt-1 font-sans text-[9px] font-medium text-white/60">
          card · instant
        </div>
      </div>
      <div className="mt-2 border-t border-white/10 pt-1.5 text-center font-sans text-[8px] font-bold uppercase tracking-[0.16em] text-white/50">
        or Bybit · Coinbase · Phantom
      </div>
    </div>
  );
}

function VaultCard() {
  return (
    <div
      className="relative aspect-[1.586/1] h-[150px] shrink-0 overflow-hidden rounded-[12px] text-white ring-1 ring-white/10"
      style={{
        background:
          "radial-gradient(120% 100% at 100% 0%, #3d0a12 0%, #1a0308 55%, #05020d 100%)",
      }}
    >
      <div className="flex h-full flex-col p-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <div className="h-4 w-4 rounded-full bg-[var(--brand-500)]" />
            <span className="font-serif text-[15px] font-semibold leading-none">
              tumar
            </span>
          </div>
          <span className="font-sans text-[8px] font-bold uppercase tracking-[0.16em] text-white/80">
            Family vault
          </span>
        </div>
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full opacity-50"
          viewBox="0 0 240 151"
          fill="none"
          aria-hidden
        >
          <path
            d="M-20 100 Q 60 60 160 70 T 280 20"
            stroke="#ff8a99"
            strokeOpacity="0.28"
            strokeWidth="1"
          />
          <path
            d="M-20 130 Q 70 100 180 110 T 280 80"
            stroke="#ff8a99"
            strokeOpacity="0.18"
            strokeWidth="1"
          />
        </svg>
        <div className="mt-auto flex items-end justify-between">
          <div>
            <div className="font-sans text-[7px] font-bold uppercase tracking-[0.18em] text-white/60">
              PDA
            </div>
            <div className="num-tab text-[11px] font-semibold leading-tight">
              8vRk…hQ2f
            </div>
          </div>
          <div className="text-right">
            <div className="font-sans text-[7px] font-bold uppercase tracking-[0.18em] text-white/60">
              Network
            </div>
            <div className="font-sans text-[11px] font-bold text-[var(--brand-400)]">
              Solana
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SolutionBullet({
  n,
  title,
  body,
}: {
  n: string;
  title: string;
  body: string;
}) {
  return (
    <div className="grid grid-cols-[40px_1fr] items-start gap-3 border-l-[3px] border-[var(--brand-500)] pl-4">
      <div className="font-sans text-[11px] font-bold text-[var(--coal-800)]">
        {n}
      </div>
      <div>
        <div className="font-sans text-[15px] font-bold text-[var(--coal-950)]">
          {title}
        </div>
        <div className="mt-1 font-sans text-[13px] font-medium text-[var(--coal-950)]">
          {body}
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------
// Slide 6 - How it works
// ----------------------------------------------------------------------

function Slide6HowItWorks({ n }: { n: number }) {
  return (
    <SlideFrame n={n}>
      <Kicker>05 · How it works</Kicker>
      <SlideTitle>
        Any card → any exchange → Tumar vault.
      </SlideTitle>
      <SlideSub>
        The diaspora already knows how to buy USDC - Binance, Bybit, Coinbase,
        Phantom&apos;s onramp - using any card they already hold. Tumar is the
        last mile: Solana Pay QR → family vault → auto-allocate.
      </SlideSub>
      <div className="mt-8 grid grid-cols-4 gap-4">
        <StepCard
          kicker="01 · Card"
          title="Any issuer"
          line1="S1lkPay · Kaspi · VISA · MC"
          line2="User already holds one"
          amount="$1,000"
          sub="≈ AED 3,670"
          chip="Any card"
        />
        <StepCard
          kicker="02 · Onramp"
          title="Exchange buys USDC"
          line1="Binance · card buy"
          line2="~1 min · 1% fee"
          amount="1,000 USDC"
          sub="on Solana"
          chip="Binance / Bybit / Coinbase"
        />
        <StepCard
          kicker="03 · Send"
          title="Solana Pay QR"
          line1="Scan → one tap"
          line2="~2 s finality"
          amount="1,000 USDC"
          sub="$0 network fee"
          chip="Non-custodial PDA"
        />
        <StepCard
          kicker="04 · Route"
          title="Auto-allocate"
          line1="Jupiter v6 · best route"
          line2="slippage 0.08%"
          amount="SPYx · NVDAx · jitoSOL"
          sub="per vault target"
          chip="Done"
        />
      </div>
      <div className="mt-6 grid grid-cols-3 gap-6 border-t border-[var(--hair)] pt-5">
        <Metric label="END-TO-END" value="~3 min" />
        <Metric label="TOTAL COST" value="~$11" />
        <Metric label="VS WESTERN UNION" value="−70%" tone="up" />
      </div>
      <p className="mt-3 font-sans text-[10px] font-semibold italic text-[var(--coal-600)]">
        S1lkPay, Kaspi and other card issuers have no crypto rails and no
        affiliation with Tumar. They appear only as examples of cards a user
        might fund an exchange with. Costs and timings illustrative.
      </p>
    </SlideFrame>
  );
}

function StepCard({
  kicker,
  title,
  line1,
  line2,
  amount,
  sub,
  chip,
}: {
  kicker: string;
  title: string;
  line1: string;
  line2: string;
  amount: string;
  sub: string;
  chip: string;
}) {
  return (
    <div className="card flex flex-col p-5">
      <div className="font-sans text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--brand-600)]">
        {kicker}
      </div>
      <div className="mt-2 font-sans text-[16px] font-bold text-[var(--coal-950)]">
        {title}
      </div>
      <div className="mt-3 font-sans text-[12px] font-semibold text-[var(--coal-950)]">
        {line1}
      </div>
      <div className="font-sans text-[12px] font-medium text-[var(--coal-800)]">
        {line2}
      </div>
      <div className="num-soft mt-3 text-[22px] font-semibold leading-none text-[var(--coal-950)]">
        {amount}
      </div>
      <div className="mt-1 font-sans text-[11px] font-semibold text-[var(--coal-800)]">
        {sub}
      </div>
      <div className="mt-auto pt-3">
        <span className="inline-block rounded-full bg-[var(--brand-100)] px-3 py-1 font-sans text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--brand-700)]">
          {chip}
        </span>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "up";
}) {
  return (
    <div>
      <div className="font-sans text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--coal-800)]">
        {label}
      </div>
      <div
        className="num-soft mt-1.5 text-[40px] font-semibold leading-none"
        style={{ color: tone === "up" ? "var(--land-up)" : "var(--coal-950)" }}
      >
        {value}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------
// Slide - Cloak (privacy)
// ----------------------------------------------------------------------

function SlideCloak({ n }: { n: number }) {
  return (
    <SlideFrame n={n}>
      <Kicker>Privacy · Cloak</Kicker>
      <SlideTitle>
        Sending money to family
        <br />
        is not a public ledger entry.
      </SlideTitle>
      <SlideSub>
        Solana is public by default. For a family vault that aggregates
        salaries from three countries, that&apos;s a deal-breaker. Tumar
        integrates Cloak - a UTXO shielded pool with client-side Groth16
        proofs - so the on-chain trail from your USDC source to the asset
        in your wallet is broken at the pool boundary.
      </SlideSub>
      <div className="mt-10 grid grid-cols-3 gap-6">
        <CloakBox
          tone="hidden"
          title="What stays hidden"
          rows={[
            ["Transfer amounts", "Shielded UTXO"],
            ["Source address", "Pool boundary"],
            ["Recipient counterparty", "Stealth note"],
            ["Timing fingerprint", "Relay-submitted"],
          ]}
        />
        <CloakBox
          tone="kept"
          title="What you keep"
          rows={[
            ["Self-custody", "User-signed shield"],
            ["Asset choice", "USDC → xStock"],
            ["Settlement", "Sub-second"],
            ["Audit trail", "Selectively shareable"],
          ]}
        />
        <CloakBox
          tone="who"
          title="Who can see"
          rows={[
            ["You", "Always"],
            ["Family viewing key", "Optional"],
            ["Auditor scoped key", "Optional, time-limited"],
            ["Public ledger", "Nothing"],
          ]}
        />
      </div>
      <p className="mt-6 font-sans text-[12px] font-medium italic text-[var(--coal-600)]">
        Built on @cloak.dev/sdk · UTXO pool + Orca-routed swap-with-change
        + viewing keys for family-level audit. Live on Solana mainnet.
      </p>
    </SlideFrame>
  );
}

function CloakBox({
  tone,
  title,
  rows,
}: {
  tone: "hidden" | "kept" | "who";
  title: string;
  rows: [string, string][];
}) {
  const accent =
    tone === "hidden"
      ? "var(--brand-600)"
      : tone === "kept"
      ? "var(--land-up)"
      : "var(--coal-800)";
  return (
    <div className="card flex flex-col p-6">
      <div className="font-serif text-[22px] font-semibold text-[var(--coal-950)]">
        {title}
      </div>
      <div
        className="mt-2 h-[2px] w-10 rounded-full"
        style={{ background: accent }}
      />
      <div className="mt-5 flex flex-col gap-3">
        {rows.map(([k, v]) => (
          <div
            key={k}
            className="flex items-baseline justify-between border-t border-[var(--hair)] pt-3 first:border-t-0 first:pt-0"
          >
            <div className="font-sans text-[13px] font-medium text-[var(--coal-950)]">
              {k}
            </div>
            <div className="font-sans text-[12px] font-bold text-[var(--coal-800)]">
              {v}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------
// Slide - Palm USD (halal stablecoin)
// ----------------------------------------------------------------------

function SlidePalm({ n }: { n: number }) {
  return (
    <SlideFrame n={n}>
      <Kicker>Halal-by-default · Palm USD</Kicker>
      <SlideTitle>
        A vault that respects what
        <br />
        your family believes.
      </SlideTitle>
      <SlideSub>
        Stablecoin choice isn&apos;t neutral. For Muslim families on the
        UAE side of the corridor, USDC&apos;s yield exposure isn&apos;t
        acceptable. Tumar treats Palm USD - non-freezable, fully reserved,
        no interest - as a first-class deposit asset, not an afterthought.
      </SlideSub>
      <div className="mt-10 grid grid-cols-3 gap-6">
        <PalmFeature
          stat="Non-freezable"
          label="MINT-LAYER COMPLIANCE"
          body="Compliance is enforced at permissioned mint and redeem only. No freeze, no blacklist, no pause function on the SPL token."
        />
        <PalmFeature
          stat="100%"
          label="CASH + SUKUK RESERVE"
          body="Sharia-compliant reserve structure: cash, commodity murabaha, sovereign sukuk. No interest-bearing US Treasury exposure."
        />
        <PalmFeature
          stat="0% interest"
          label="HALAL BY CONSTRUCTION"
          body="No staking yield, no rebasing, no overnight T-bill carry. The dollar you hold is the dollar you keep."
        />
      </div>
      <div className="mt-8 grid grid-cols-[1fr_auto] gap-8 border-t border-[var(--hair)] pt-6">
        <div>
          <div className="font-sans text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--brand-600)]">
            How Tumar handles it
          </div>
          <p className="mt-2 max-w-[780px] font-sans text-[13px] font-medium leading-[1.55] text-[var(--coal-950)]">
            PUSD has no Jupiter route at the time of writing - its
            acquisition path is permissioned mint via the Palm Treasury,
            not a DEX. Tumar detects PUSD and routes through a direct
            transferChecked path with idempotent vault-ATA creation and
            on-chain contribution recording. Same UX, no swap, vault holds
            the actual PUSD.
          </p>
        </div>
        <div className="card flex flex-col justify-center px-6 py-4">
          <div className="font-sans text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--coal-800)]">
            PUSD MINT
          </div>
          <div className="num-tab mt-1 text-[12px] font-bold text-[var(--coal-950)]">
            CZzgUBvxaMLwM…HF3s
          </div>
          <div className="mt-2 font-sans text-[11px] font-medium text-[var(--coal-600)]">
            Token-2022 · 6 decimals
          </div>
        </div>
      </div>
    </SlideFrame>
  );
}

function PalmFeature({
  stat,
  label,
  body,
}: {
  stat: string;
  label: string;
  body: string;
}) {
  return (
    <div className="card p-6">
      <div className="num-soft text-[34px] font-semibold leading-none text-[var(--coal-950)]">
        {stat}
      </div>
      <div className="mt-3 font-sans text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--brand-600)]">
        {label}
      </div>
      <p className="mt-3 font-sans text-[13px] font-medium leading-[1.55] text-[var(--coal-950)]">
        {body}
      </p>
    </div>
  );
}

// ----------------------------------------------------------------------
// Slide - QVAC (offline AI for the grandmother)
// ----------------------------------------------------------------------

function SlideQvac({ n }: { n: number }) {
  return (
    <SlideFrame n={n}>
      <Kicker>Offline-first · Tether QVAC</Kicker>
      <SlideTitle>
        Apa never installs an app.
        <br />
        Apa never trusts the cloud.
      </SlideTitle>
      <SlideSub>
        The grandmother in the village is the user with the highest stake
        and the lowest tolerance for cloud anything. Tumar ships a macOS
        app where the entire AI stack - language model, voice
        transcription - runs on her own laptop, fully offline, via Tether
        QVAC.
      </SlideSub>
      <div className="mt-10 grid grid-cols-[1.05fr_1fr] gap-8">
        <div className="card p-6">
          <div className="font-sans text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--brand-600)]">
            On-device stack
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <QvacChip k="LLM" v="Qwen3 1.7B" sub="@qvac/llm-llamacpp" />
            <QvacChip
              k="Voice"
              v="Whisper.cpp"
              sub="@qvac/transcription-whispercpp"
            />
            <QvacChip k="Engine" v="Vulkan" sub="hardware-agnostic GPU" />
            <QvacChip k="Network" v="Zero" sub="no API key, no cloud" />
          </div>
          <div className="mt-6 border-t border-[var(--hair)] pt-5">
            <div className="font-sans text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--coal-800)]">
              What it unlocks
            </div>
            <ul className="mt-3 flex flex-col gap-2">
              {[
                "Private family-finance Q&A on the grandmother's laptop.",
                "Kazakh, Russian, English - voice in, voice or text out.",
                "On-chain contribution data → local LLM context → answer.",
                "No data leaves the machine. Ever.",
              ].map((b) => (
                <li
                  key={b}
                  className="flex items-start gap-2 font-sans text-[13px] font-medium leading-[1.5] text-[var(--coal-950)]"
                >
                  <span className="mt-1.5 inline-block h-1 w-1 shrink-0 rounded-full bg-[var(--brand-500)]" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="card flex flex-col p-6">
          <div className="font-sans text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--brand-600)]">
            Live transcript
          </div>
          <div className="mt-5 flex flex-col gap-4">
            <div>
              <div className="font-sans text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--coal-800)]">
                Apa, in Kazakh
              </div>
              <div className="num-tab mt-1.5 font-serif text-[18px] font-semibold leading-[1.4] text-[var(--coal-950)]">
                &ldquo;Aidana bul ay qansha saldy?&rdquo;
              </div>
              <div className="mt-1 font-sans text-[12px] font-medium italic text-[var(--coal-600)]">
                How much did Aidana put in this month?
              </div>
            </div>
            <div className="border-t border-[var(--hair)] pt-4">
              <div className="font-sans text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--coal-800)]">
                Tumar, on her laptop
              </div>
              <div className="mt-1.5 font-serif text-[16px] font-medium leading-[1.45] text-[var(--coal-950)]">
                &ldquo;Aidana bul ay 500 dollar saldy. Vault qazіr 1,840 dollar
                turady - 38% NVDAx, 22% SPYx, 17% PUSD…&rdquo;
              </div>
            </div>
            <div className="mt-auto border-t border-[var(--hair)] pt-4">
              <div className="flex items-baseline justify-between font-sans text-[11px] font-semibold text-[var(--coal-800)]">
                <span>Round-trip</span>
                <span className="num-tab text-[var(--coal-950)]">~2.4 s</span>
              </div>
              <div className="mt-1 flex items-baseline justify-between font-sans text-[11px] font-semibold text-[var(--coal-800)]">
                <span>Bytes leaving the machine</span>
                <span
                  className="num-tab"
                  style={{ color: "var(--land-up)" }}
                >
                  0
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </SlideFrame>
  );
}

function QvacChip({ k, v, sub }: { k: string; v: string; sub: string }) {
  return (
    <div className="border-t border-[var(--hair)] pt-3">
      <div className="font-sans text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--coal-800)]">
        {k}
      </div>
      <div className="num-soft mt-1 text-[20px] font-semibold leading-none text-[var(--coal-950)]">
        {v}
      </div>
      <div className="mt-1 font-mono text-[10px] font-medium text-[var(--coal-600)]">
        {sub}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------
// Slide 7 - Why Solana
// ----------------------------------------------------------------------

function Slide7WhySolana({ n }: { n: number }) {
  return (
    <SlideFrame n={n}>
      <Kicker>06 · Why Solana</Kicker>
      <SlideTitle>
        The infrastructure to build this didn&apos;t
        <br />
        exist 18 months ago.
      </SlideTitle>
      <div className="mt-10 grid grid-cols-3 gap-6">
        <StatBlock
          title="Performance"
          rows={[
            ["Block time", "400 ms"],
            ["Sustained TPS", "4,500"],
            ["Median fee", "$0.0002"],
            ["Settlement", "Sub-second"],
          ]}
        />
        <StatBlock
          title="Liquidity"
          rows={[
            ["Native USDC", "$8B+"],
            ["DeFi TVL", "$5B+"],
            ["Bridge needed", "None"],
            ["L2 fragmentation", "None"],
          ]}
        />
        <StatBlock
          title="RWAs live today"
          rows={[
            ["Backed xStocks", "17 tickers"],
            ["Redemption", "Real, off-chain"],
            ["Token standard", "SPL"],
            ["Composability", "Every primitive"],
          ]}
        />
      </div>
      <p className="mt-10 max-w-[1100px] font-sans text-[13px] font-medium leading-[1.55] text-[var(--coal-950)]">
        Tumar is not possible on Ethereum L1 at these transaction sizes. Not
        possible on L2s without bridging. Solana is the only stack where
        diaspora-scale remittance, real equity exposure, and composability
        work today - and it&apos;s also why we can reach users Freedom
        Broker&apos;s rails can&apos;t: wallet-native, permissionless, no
        residency gate, no trading-hour cutoff.
      </p>
    </SlideFrame>
  );
}

function StatBlock({
  title,
  rows,
}: {
  title: string;
  rows: [string, string][];
}) {
  return (
    <div className="card p-6">
      <div className="font-serif text-[24px] font-semibold text-[var(--coal-950)]">
        {title}
      </div>
      <div className="mt-4 flex flex-col gap-3">
        {rows.map(([k, v]) => (
          <div
            key={k}
            className="flex items-baseline justify-between border-t border-[var(--hair)] pt-3 first:border-t-0 first:pt-0"
          >
            <div className="font-sans text-[13px] font-medium text-[var(--coal-800)]">
              {k}
            </div>
            <div className="font-sans text-[14px] font-bold text-[var(--coal-950)]">
              {v}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------
// Slide 8 - Composability
// ----------------------------------------------------------------------

function Slide8Composability({ n }: { n: number }) {
  const tiles: [string, string, string, string][] = [
    ["KAMINO", "SPYx collateral", "~4% APR", "borrow USDC"],
    ["MARGINFI", "NVDAx supply", "~3% APY", "supply yield"],
    ["ORCA", "SPYx / USDC LP", "~12% APR", "concentrated liquidity"],
    ["JITO", "jitoSOL", "~7.8% APY", "MEV-boosted stake"],
    ["DRIFT", "GLDx perp", "2× short", "portfolio hedge"],
  ];
  return (
    <SlideFrame n={n}>
      <Kicker>07 · Composability</Kicker>
      <SlideTitle>Your SPY can work for you.</SlideTitle>
      <SlideSub>
        xStocks are SPL tokens. The same position the vault holds can
        collateralize a USDC loan on Kamino, earn supply yield on MarginFi, or
        LP on Orca - without selling the underlying. Not wired in the
        hackathon build; this is the roadmap the terminal&apos;s vault +
        Jupiter v6 integration unlocks.
      </SlideSub>
      <div className="mt-10 grid grid-cols-5 gap-4">
        {tiles.map(([kicker, title, apr, sub]) => (
          <div key={kicker} className="card p-5">
            <div className="font-sans text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--brand-600)]">
              {kicker}
            </div>
            <div className="mt-2 font-sans text-[14px] font-bold text-[var(--coal-950)]">
              {title}
            </div>
            <div className="num-soft mt-4 text-[26px] font-semibold leading-none text-[var(--coal-950)]">
              {apr}
            </div>
            <div className="mt-2 font-sans text-[11px] font-semibold text-[var(--coal-800)]">
              {sub}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-6 font-sans text-[10px] font-semibold italic text-[var(--coal-600)]">
        Planned integrations. Yields drawn from each protocol&apos;s current
        public rates; illustrative, not a quote.
      </p>
    </SlideFrame>
  );
}

// ----------------------------------------------------------------------
// Slide 9 - Team
// ----------------------------------------------------------------------

function Slide9Team({ n }: { n: number }) {
  return (
    <SlideFrame n={n}>
      <Kicker>08 · Team</Kicker>
      <SlideTitle>Who&apos;s building this.</SlideTitle>
      <div className="mt-12 grid grid-cols-2 gap-8">
        <TeamCard
          photo="/team/aigerim.jpg"
          name="Aigerim Dildakhanova"
          location="ALMATY, KAZAKHSTAN"
          email="aigerim2001@proton.me"
          bullets={[
            "Product design, cultural framing, trilingual UX.",
            "Chose the тұмар naming - an amulet that protects what matters.",
            "This is her family's problem. Her parents save in tenge.",
          ]}
        />
        <TeamCard
          photo="/team/frederik.jpg"
          name="Frederik Bussler"
          location="NEW YORK, US"
          email="frederik@bussler.co"
          bullets={[
            "Solana program architecture, vault design, xStocks + Jupiter integration.",
            "Prior: data / ML infra, 3x founder, Forbes / IBM contributor on applied crypto.",
          ]}
        />
      </div>
      <p className="mt-10 text-center font-sans text-[13px] font-semibold italic text-[var(--coal-800)]">
        A cross-border team building a cross-border product.
      </p>
    </SlideFrame>
  );
}

function TeamCard({
  photo,
  name,
  location,
  email,
  bullets,
}: {
  photo: string;
  name: string;
  location: string;
  email: string;
  bullets: string[];
}) {
  return (
    <div className="card p-7">
      <div className="flex items-center gap-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo}
          alt={name}
          width={96}
          height={96}
          className="h-24 w-24 rounded-full object-cover ring-1 ring-[var(--hair)]"
        />
        <div>
          <div className="font-serif text-[28px] font-semibold leading-none text-[var(--coal-950)]">
            {name}
          </div>
          <div className="mt-2 font-sans text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--coal-800)]">
            {location}
          </div>
          <div className="num-tab mt-2 text-[12px] font-semibold text-[var(--brand-600)]">
            {email}
          </div>
        </div>
      </div>
      <div className="mt-5 border-t border-[var(--hair)] pt-4">
        <ul className="flex flex-col gap-3">
          {bullets.map((b) => (
            <li
              key={b}
              className="flex items-start gap-2 font-sans text-[14px] font-medium leading-[1.5] text-[var(--coal-950)]"
            >
              <span className="mt-2 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--brand-500)]" />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------
// Slide 10 - Roadmap
// ----------------------------------------------------------------------

function Slide10Roadmap({ n }: { n: number }) {
  return (
    <SlideFrame n={n}>
      <Kicker>09 · What&apos;s next</Kicker>
      <SlideTitle>Beyond the hackathon.</SlideTitle>
      <div className="mt-10 grid grid-cols-3 gap-6">
        <RoadmapCol
          quarter="Q3 2026"
          tag="MAINNET BETA"
          title="Invite-only rollout"
          bullets={[
            "100 families on the UAE → KZ corridor.",
            "Free Jupiter v6 rebalances during beta.",
            "Telegram + WhatsApp funnel for the diaspora.",
          ]}
        />
        <RoadmapCol
          quarter="Q4 2026"
          tag="COMPLIANCE"
          title="AIFC sandbox + issuer relationships"
          bullets={[
            "Astana International Financial Centre sandbox application.",
            "Direct issuer relationship with Backed for xStocks.",
            "Issuer-level KYC and sanctions screening layer.",
          ]}
        />
        <RoadmapCol
          quarter="2027"
          tag="SCALE"
          title="Second corridor + vault lending"
          bullets={[
            "Turkey → KZ corridor (second-largest diaspora flow).",
            "KZTE stablecoin in-country withdrawal rails.",
            "Vault-collateralized lending via Kamino.",
          ]}
        />
      </div>
      <p className="mt-10 font-sans text-[13px] font-semibold italic text-[var(--coal-950)]">
        We&apos;re not building a hackathon project. We&apos;re building the
        first real savings product for Kazakh families abroad.
      </p>
    </SlideFrame>
  );
}

function RoadmapCol({
  quarter,
  tag,
  title,
  bullets,
}: {
  quarter: string;
  tag: string;
  title: string;
  bullets: string[];
}) {
  return (
    <div className="card p-6">
      <div className="flex items-center gap-3">
        <div className="font-sans text-[13px] font-bold text-[var(--brand-600)]">
          {quarter}
        </div>
        <div className="font-sans text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--coal-800)]">
          {tag}
        </div>
      </div>
      <div className="mt-3 font-serif text-[22px] font-semibold leading-tight text-[var(--coal-950)]">
        {title}
      </div>
      <ul className="mt-5 flex flex-col gap-3 border-t border-[var(--hair)] pt-4">
        {bullets.map((b) => (
          <li
            key={b}
            className="flex items-start gap-2 font-sans text-[13px] font-medium leading-[1.5] text-[var(--coal-950)]"
          >
            <span className="mt-1.5 inline-block h-1 w-1 shrink-0 rounded-full bg-[var(--brand-500)]" />
            <span>{b}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ----------------------------------------------------------------------
// Slide 11 - Close
// ----------------------------------------------------------------------

function Slide11Close({ n, last }: { n: number; last: boolean }) {
  return (
    <SlideFrame n={n} last={last} className="items-center justify-center text-center">
      <Image
        src="/tumar-mark.png"
        alt="tumar"
        width={423}
        height={138}
        className="h-[80px] w-auto"
      />
      <h2 className="font-serif mt-14 max-w-[900px] text-[48px] font-semibold leading-[1.1] tracking-tight text-[var(--coal-950)]">
        <span className="italic text-[var(--brand-500)]">тұмар</span> - an
        amulet that protects what matters.
      </h2>
      <div className="mt-12 grid w-[1040px] grid-cols-3 divide-x divide-[var(--hair)] border border-[var(--hair)] bg-[var(--surface)]">
        <CloseLink label="LIVE DEMO" value="web-phi-drab-54.vercel.app" />
        <CloseLink label="FREDERIK" value="frederik@bussler.co" />
        <CloseLink label="AIGERIM" value="aigerim2001@proton.me" />
      </div>
      <div className="mt-12 font-sans text-[11px] font-bold uppercase tracking-[0.24em] text-[var(--coal-800)]">
        Hackathon demo · Not investment advice
      </div>
    </SlideFrame>
  );
}

function CloseLink({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-5">
      <div className="font-sans text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--coal-800)]">
        {label}
      </div>
      <div className="num-tab mt-2 text-[14px] font-bold text-[var(--coal-950)]">
        {value}
      </div>
    </div>
  );
}
