"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { t } from "@/lib/i18n";
import { useLang } from "@/lib/use-lang";

const DISMISS_KEY = "tumar:private-banner-dismissed";

export function PrivateBanner() {
  const [lang] = useLang();
  const pathname = usePathname() ?? "";
  const [dismissed, setDismissed] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
    try {
      if (window.sessionStorage.getItem(DISMISS_KEY) === "1") {
        setDismissed(true);
      }
    } catch {
      // sessionStorage may be unavailable in privacy mode; ignore.
    }
  }, []);

  // /deck is a dev-only PDF render target. The banner would end up baked
  // into slide 1 of the shipped PDF, which is wrong.
  if (pathname.startsWith("/deck")) return null;

  const handleDismiss = () => {
    setDismissed(true);
    try {
      window.sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // ignore
    }
  };

  // Avoid rendering the wrong-language text on hydration for users who already dismissed.
  if (!hydrated || dismissed) return null;

  return (
    <div
      className="sticky top-0 z-50 flex items-center justify-center gap-3 border-b px-4 py-2 font-sans text-[11px] font-semibold uppercase tracking-[0.16em] text-white"
      style={{
        background:
          "linear-gradient(90deg, #9e2530 0%, #c9303c 50%, #9e2530 100%)",
        borderColor: "rgba(0, 0, 0, 0.22)",
      }}
      role="status"
      aria-label="Private preview notice"
    >
      <span
        aria-hidden
        className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-white"
      />
      <span className="text-center">{t(lang, "bannerText")}</span>
      <span
        aria-hidden
        className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-white"
      />
      <button
        type="button"
        onClick={handleDismiss}
        aria-label={t(lang, "bannerDismiss")}
        className="ml-2 grid h-5 w-5 shrink-0 place-items-center rounded-full text-white/85 transition-colors hover:bg-white/15 hover:text-white focus:bg-white/15 focus:outline-none focus-visible:ring-1 focus-visible:ring-white/60"
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          aria-hidden
        >
          <path
            d="M1.5 1.5l7 7M8.5 1.5l-7 7"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  );
}
