import Image from "next/image";

/**
 * Premium mockup of the S1lkPay Mastercard that the diaspora tops up in-app.
 * Shared between the landing remittance example and the deck solution slide.
 *
 * Design notes:
 *   - S1lkPay is a Mastercard Principal Member (s1lkpay.com), so the scheme
 *     mark is Mastercard, not Visa.
 *   - The official s1lk. wordmark is rainbow on transparent; it reads best
 *     against a neutral dark base (not the original plain white), so we put
 *     it on a deep obsidian gradient with a subtle purple sheen.
 *   - Logo is sized large enough to be recognizable at deck-presentation
 *     scale; aspect ratio preserved via next/image width/height.
 */
export function SilkCard() {
  return (
    <div
      className="relative aspect-[1.586/1] w-full max-w-[280px] overflow-hidden rounded-[14px] text-white shadow-[0_16px_36px_-16px_rgba(101,55,199,0.5)] ring-1 ring-white/10"
      style={{
        background:
          "radial-gradient(140% 110% at 0% 0%, #2e1451 0%, #120521 55%, #05020d 100%)",
      }}
    >
      {/* subtle flow lines */}
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full opacity-60"
        viewBox="0 0 280 176"
        fill="none"
        aria-hidden
      >
        <path
          d="M-20 140 Q 80 70 200 80 T 360 20"
          stroke="#c8a6ff"
          strokeOpacity="0.22"
          strokeWidth="1"
          fill="none"
        />
        <path
          d="M-20 160 Q 90 110 220 110 T 380 70"
          stroke="#c8a6ff"
          strokeOpacity="0.14"
          strokeWidth="1"
          fill="none"
        />
        <path
          d="M-20 50 Q 70 30 170 40 T 360 0"
          stroke="#c8a6ff"
          strokeOpacity="0.10"
          strokeWidth="1"
          fill="none"
        />
      </svg>

      <div className="relative flex h-full flex-col p-4">
        {/* Top row - logo + contactless.
            Logo is intentionally small (~18px tall). This is a card mockup,
            not a hero wordmark: on a 280px-wide card the s1lk. mark should
            read as a brand chip in the corner, not occupy the top band. */}
        <div className="flex items-start justify-between">
          <Image
            src="/s1lk.webp"
            alt="s1lk"
            width={188}
            height={125}
            className="h-[18px] w-auto drop-shadow-[0_1px_3px_rgba(0,0,0,0.35)]"
            priority
          />
          {/* contactless waves */}
          <svg
            width="14"
            height="16"
            viewBox="0 0 14 16"
            fill="none"
            aria-hidden
            className="mt-0.5 text-white/65"
          >
            <path
              d="M2 3.5 Q 5 8 2 12.5"
              stroke="currentColor"
              strokeWidth="1.1"
              strokeLinecap="round"
              fill="none"
            />
            <path
              d="M5.5 2.2 Q 10 8 5.5 13.8"
              stroke="currentColor"
              strokeWidth="1.1"
              strokeLinecap="round"
              fill="none"
            />
            <path
              d="M9 1 Q 14.5 8 9 15"
              stroke="currentColor"
              strokeWidth="1.1"
              strokeLinecap="round"
              fill="none"
            />
          </svg>
        </div>

        {/* Middle - EMV chip */}
        <div className="mt-3">
          <ChipSvg />
        </div>

        <div className="mt-auto flex items-end justify-between">
          <span className="num-tab font-sans text-[11px] tracking-[0.22em] text-white/90">
            ••••&nbsp;6098
          </span>
          <MastercardMark />
        </div>
      </div>
    </div>
  );
}

function ChipSvg() {
  return (
    <svg
      width="32"
      height="24"
      viewBox="0 0 32 24"
      fill="none"
      aria-hidden
      className="drop-shadow-[0_1px_3px_rgba(0,0,0,0.45)]"
    >
      <defs>
        <linearGradient id="silkChipGrad" x1="0" y1="0" x2="32" y2="24" gradientUnits="userSpaceOnUse">
          <stop stopColor="#f3dd97" />
          <stop offset="0.5" stopColor="#cba557" />
          <stop offset="1" stopColor="#8c6520" />
        </linearGradient>
      </defs>
      <rect x="0.5" y="0.5" width="31" height="23" rx="4" fill="url(#silkChipGrad)" stroke="rgba(255,255,255,0.25)" />
      <path
        d="M10 0 V 24 M 22 0 V 24 M 0 8 H 32 M 0 16 H 32"
        stroke="rgba(0,0,0,0.32)"
        strokeWidth="0.7"
      />
      <rect x="12" y="9" width="8" height="6" rx="1" fill="rgba(0,0,0,0.12)" />
    </svg>
  );
}

/**
 * Mastercard scheme mark - two interlocking circles with the signature
 * vesica-piscis overlap in #ff5f00. Drawn as real geometry (not a faked
 * colored-dots blend), so the mark reads at every scale.
 */
function MastercardMark() {
  return (
    <svg width="40" height="24" viewBox="0 0 40 24" aria-hidden>
      <circle cx="14" cy="12" r="11" fill="#eb001b" />
      <circle cx="26" cy="12" r="11" fill="#f79e1b" />
      {/* lens overlap. circles with r=11 centered 12 apart → intersections
          at x=20, y=12±√(121−36)=12±9.22. Two quadratic Béziers approximate
          the lens with control points at the extreme x of each circle's
          overlapping arc (x=25 and x=15). */}
      <path
        d="M 20 2.78 Q 25 12 20 21.22 Q 15 12 20 2.78 Z"
        fill="#ff5f00"
      />
    </svg>
  );
}
