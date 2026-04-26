import { useState } from "react";
import bs58 from "bs58";

/**
 * Modal: paste a `tumar-vk1.…` viewing key, fetch decrypted history.
 *
 * The decrypted ScanResult is a ComplianceReport (numbers, not bigint -
 * JSON-clean so it traverses IPC). We render the transaction summary in
 * a small list so the user can verify the key works.
 */

const VK_PREFIX = "tumar-vk1.";

type ScanReport = {
  transactions: Array<{
    txType: string;
    amount: number;
    netAmount: number;
    timestamp: number;
    symbol?: string;
    signature?: string;
  }>;
  summary: {
    totalDeposits: number;
    totalWithdrawals: number;
    netChange: number;
    transactionCount: number;
    finalBalance: number;
  };
};

const DEFAULT_RPC = "https://api.mainnet-beta.solana.com";

export function DecryptDialog({
  vaultAddress: _vaultAddress,
  onClose,
}: {
  vaultAddress: string;
  onClose: () => void;
}) {
  const [vk, setVk] = useState("");
  const [rpc, setRpc] = useState(DEFAULT_RPC);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ScanReport | null>(null);

  async function decrypt() {
    setError(null);
    setReport(null);
    const trimmed = vk.trim();
    if (!trimmed.startsWith(VK_PREFIX)) {
      setError("Это не ключ Tumar (ожидается tumar-vk1.…). Вставьте полную строку.");
      return;
    }
    let nk: Uint8Array;
    try {
      nk = bs58.decode(trimmed.slice(VK_PREFIX.length));
      if (nk.length !== 32) {
        throw new Error(`длина nk = ${nk.length}, ожидалось 32 байта`);
      }
    } catch (e) {
      setError(`Ошибка декодирования: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }

    setBusy(true);
    try {
      const result = (await window.tumar.cloak.scan({
        rpcUrl: rpc,
        viewingKeyNkHex: bytesToHex(nk),
      })) as ScanReport;
      setReport(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl border border-[var(--hairline-strong)] bg-ink-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-baseline justify-between border-b border-[var(--hairline)] px-5 py-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.16em] text-gold-300">
              Cloak · viewing key
            </div>
            <div className="mt-0.5 font-serif text-lg tracking-tight text-ink-50">
              Расшифровать историю сейфа
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[11px] uppercase tracking-[0.14em] text-ink-400 hover:text-ink-100"
          >
            Закрыть
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          <div>
            <label className="mb-1.5 block text-[10px] uppercase tracking-[0.16em] text-ink-300">
              Ключ просмотра (от семьи)
            </label>
            <textarea
              value={vk}
              onChange={(e) => setVk(e.target.value)}
              placeholder={`${VK_PREFIX}…`}
              rows={3}
              className="w-full resize-none border border-[var(--hairline)] bg-ink-950 px-3 py-2 font-mono text-[11px] leading-relaxed text-ink-100 outline-none focus:border-gold-400/40"
              disabled={busy}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-[10px] uppercase tracking-[0.16em] text-ink-300">
              RPC URL
            </label>
            <input
              type="text"
              value={rpc}
              onChange={(e) => setRpc(e.target.value)}
              className="w-full border border-[var(--hairline)] bg-ink-950 px-3 py-2 font-mono text-[11px] text-ink-100 outline-none focus:border-gold-400/40"
              disabled={busy}
            />
            <div className="mt-1 text-[10px] text-ink-500">
              Единственный сетевой вызов после загрузки моделей. Используйте
              свой Helius/QuickNode URL для скорости.
            </div>
          </div>

          {error && (
            <div className="border border-down/30 bg-down/10 px-3 py-2 text-sm text-down">
              {error}
            </div>
          )}

          {report && (
            <div className="space-y-2 border border-up/30 bg-up/5 px-4 py-3">
              <div className="text-[10px] uppercase tracking-[0.14em] text-up">
                ✓ Расшифровано: {report.summary.transactionCount} транзакций
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[11px] tabular-nums">
                <span className="text-ink-400">Поступления:</span>
                <span className="text-right text-ink-50">
                  ${report.summary.totalDeposits.toFixed(2)}
                </span>
                <span className="text-ink-400">Снятия:</span>
                <span className="text-right text-ink-50">
                  ${report.summary.totalWithdrawals.toFixed(2)}
                </span>
                <span className="text-ink-400">Чистое движение:</span>
                <span className="text-right text-up">
                  ${report.summary.netChange.toFixed(2)}
                </span>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={decrypt}
            disabled={busy || vk.length === 0}
            className="w-full border border-gold-500 bg-gold-500 px-4 py-2.5 text-[11px] uppercase tracking-[0.12em] font-semibold text-ink-950 transition-colors hover:bg-gold-400 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy ? "Подключаемся к Solana…" : "Расшифровать"}
          </button>
        </div>
      </div>
    </div>
  );
}

function bytesToHex(b: Uint8Array): string {
  return Array.from(b)
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
