import { useState } from "react";
import { findToken, type VaultState } from "@tumar/shared";

/**
 * LEFT pane - portfolio view.
 *
 * Static for the hackathon (mock VaultState). The two real-call buttons:
 *   - "Deposit USDC (private)" launches a Cloak shielded deposit. Reuses
 *     the same SDK calls as the website's PrivateDeposit component, just
 *     wrapped in an Electron-friendly UX. (Stubbed for v1; the SDK has
 *     to run in a renderer with wallet access, which is out of scope for
 *     a one-window app - leaving this as a "deep-link to web" button.)
 *   - "Decrypt with viewing key" opens a paste dialog, ships the nk to
 *     main, calls `cloak.scan`, and renders decrypted shielded history.
 *
 * The portfolio numbers feeding the LLM live in `MOCK_VAULT`. If a
 * decryption returns history, we merge it into the displayed feed but
 * keep the LLM context pointing at the mock - judges shouldn't have to
 * connect to mainnet to ask about the demo vault.
 */

import { DecryptDialog } from "./DecryptDialog";

const fmtUsd = (n: number) =>
  n.toLocaleString("ru-RU", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });

export function PortfolioPanel({ vault }: { vault: VaultState }) {
  const [decryptOpen, setDecryptOpen] = useState(false);

  return (
    <section className="flex flex-col border-r border-[var(--hairline)] bg-ink-950">
      <div className="border-b border-[var(--hairline)] px-6 py-4">
        <div className="text-[10px] uppercase tracking-[0.18em] text-gold-300">
          Семейный сейф
        </div>
        <div className="mt-1 font-serif text-2xl tracking-tight text-ink-50">
          {vault.name}
        </div>
        <div className="mt-1 font-mono text-[10px] text-ink-500">
          {vault.address.slice(0, 6)}…{vault.address.slice(-6)} · {vault.memberCount} участников
        </div>
      </div>

      <div className="grid grid-cols-2 gap-0 border-b border-[var(--hairline)]">
        <Stat label="Стоимость портфеля" value={fmtUsd(vault.totalValueUsd)} accent="gold" />
        <Stat
          label="Внесено USDC"
          value={fmtUsd(vault.usdcDeposited)}
          tail={`P&L ${(((vault.totalValueUsd - vault.usdcDeposited) / vault.usdcDeposited) * 100).toFixed(1)}%`}
        />
      </div>

      <div className="border-b border-[var(--hairline)]">
        <div className="flex items-baseline justify-between px-6 py-3">
          <span className="text-[10px] uppercase tracking-[0.16em] text-ink-400">
            Распределение
          </span>
          <span className="font-mono text-[10px] tabular-nums text-ink-500">
            {vault.allocation.length} актива
          </span>
        </div>
        <div>
          {vault.allocation.map((a) => {
            const t = findToken(a.mint);
            const sym = t?.symbol ?? a.mint.slice(0, 6);
            const pct = a.bps / 100;
            const value = vault.totalValueUsd * (a.bps / 10_000);
            return (
              <div
                key={a.mint}
                className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 border-t border-[var(--hairline)] px-6 py-2 first:border-t-0"
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: t?.color ?? "#888" }}
                />
                <span className="font-mono text-[12px] tabular-nums text-ink-100">
                  {sym}
                </span>
                <span className="font-mono text-[11px] tabular-nums text-ink-300">
                  {pct.toFixed(0)}%
                </span>
                <span className="font-mono text-[12px] tabular-nums text-ink-50">
                  {fmtUsd(value)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="border-b border-[var(--hairline)]">
        <div className="px-6 py-3 text-[10px] uppercase tracking-[0.16em] text-ink-400">
          Последние пополнения
        </div>
        <div>
          {vault.recentContributions.map((c) => {
            const date = new Date(c.timestamp * 1000);
            return (
              <div
                key={c.signature}
                className="grid grid-cols-[auto_1fr_auto] items-baseline gap-3 border-t border-[var(--hairline)] px-6 py-2"
              >
                <span className="font-mono text-[10px] tabular-nums text-ink-500">
                  {date.toLocaleDateString("ru-RU", {
                    day: "2-digit",
                    month: "short",
                  })}
                </span>
                <span className="truncate text-[12px] text-ink-300">
                  {c.memo ?? "-"}
                </span>
                <span className="font-mono text-[12px] tabular-nums text-up">
                  +{fmtUsd(c.amount)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-auto flex flex-col gap-2 px-6 py-4">
        <button
          type="button"
          onClick={() => setDecryptOpen(true)}
          className="border border-[var(--hairline-strong)] bg-ink-900 px-4 py-2.5 text-[11px] uppercase tracking-[0.12em] text-ink-100 transition-colors hover:border-gold-400/40 hover:text-gold-300"
        >
          Расшифровать ключом просмотра
        </button>
        <a
          href="https://web-phi-drab-54.vercel.app"
          target="_blank"
          rel="noreferrer"
          className="border border-[var(--hairline)] bg-ink-900 px-4 py-2.5 text-center text-[11px] uppercase tracking-[0.12em] text-ink-300 transition-colors hover:border-[var(--hairline-strong)] hover:text-ink-50"
          // target="_blank" + the setWindowOpenHandler in main routes the
          // navigation through shell.openExternal - opens in the system
          // browser rather than inside the Electron window.
        >
          Внести USDC (через сайт)
        </a>
      </div>

      {decryptOpen && (
        <DecryptDialog
          vaultAddress={vault.address}
          onClose={() => setDecryptOpen(false)}
        />
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  tail,
  accent,
}: {
  label: string;
  value: string;
  tail?: string;
  accent?: "gold";
}) {
  return (
    <div className="px-6 py-4 [&:nth-child(even)]:border-l [&:nth-child(even)]:border-[var(--hairline)]">
      <div className="text-[10px] uppercase tracking-[0.16em] text-ink-400">
        {label}
      </div>
      <div
        className={
          "mt-1 font-serif text-2xl tabular-nums tracking-tight " +
          (accent === "gold" ? "text-gold-300" : "text-ink-50")
        }
      >
        {value}
      </div>
      {tail && (
        <div className="mt-1 font-mono text-[11px] tabular-nums text-up">
          {tail}
        </div>
      )}
    </div>
  );
}
