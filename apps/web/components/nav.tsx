"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import type { Lang } from "@/lib/i18n";
import { useLang } from "@/lib/use-lang";

const WalletMultiButton = dynamic(
  () =>
    import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false },
);

const LANGS: { code: Lang; label: string }[] = [
  { code: "en", label: "ENG" },
  { code: "ru", label: "РУС" },
  { code: "kz", label: "ҚАЗ" },
];

export function Nav() {
  const [lang, setLang] = useLang();
  const handleLang = setLang;

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--hairline)] bg-[var(--color-ink-950)]/95 backdrop-blur-0">
      <div className="mx-auto flex w-full max-w-[1400px] items-center justify-between px-5 py-2.5">
        <Link href="/" className="flex items-center gap-2.5" aria-label="tumar">
          <Image
            src="/tumar-mark.png"
            alt="tumar"
            width={423}
            height={138}
            priority
            className="h-7 w-auto [filter:brightness(0)_invert(0.96)_sepia(0.12)_saturate(1.1)_hue-rotate(-8deg)]"
          />
          <span className="num-tab text-[10px] uppercase tracking-[0.14em] text-[var(--color-ink-400)]">
            v0.1 · mainnet
          </span>
        </Link>

        <nav className="hidden items-center gap-1 text-[12px] text-[var(--color-ink-300)] sm:flex">
          <Link
            href="/terminal"
            className="px-3 py-1.5 uppercase tracking-[0.08em] hover:text-[var(--color-ink-50)]"
          >
            Terminal
          </Link>
          <Link
            href="/vaults"
            className="px-3 py-1.5 uppercase tracking-[0.08em] hover:text-[var(--color-ink-50)]"
          >
            My vaults
          </Link>
          <Link
            href="/create"
            className="px-3 py-1.5 uppercase tracking-[0.08em] hover:text-[var(--color-ink-50)]"
          >
            New vault
          </Link>
          <Link
            href="/buy"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 uppercase tracking-[0.08em] hover:text-[var(--color-ink-50)]"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-gold-400" />
            Buy privately
          </Link>
          <a
            href="https://docs.xstocks.fi"
            target="_blank"
            rel="noreferrer"
            className="px-3 py-1.5 uppercase tracking-[0.08em] hover:text-[var(--color-ink-50)]"
          >
            xStocks
          </a>
          <a
            href="https://github.com/AigerimDi/tumar"
            target="_blank"
            rel="noreferrer"
            className="px-3 py-1.5 uppercase tracking-[0.08em] hover:text-[var(--color-ink-50)]"
          >
            Source
          </a>
        </nav>

        <div className="flex items-center gap-3">
          <div className="flex items-center overflow-hidden border border-[var(--hairline-strong)]">
            {LANGS.map((l) => (
              <button
                key={l.code}
                onClick={() => handleLang(l.code)}
                className={`num-tab px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] transition-colors ${
                  lang === l.code
                    ? "bg-[var(--color-ink-50)] text-[var(--color-ink-950)]"
                    : "text-[var(--color-ink-400)] hover:text-[var(--color-ink-50)]"
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
          <WalletMultiButton />
        </div>
      </div>
    </header>
  );
}
