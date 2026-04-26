/**
 * First-launch model download UI.
 *
 * Two progress bars (Whisper + LLM). The LLM is by far the larger download
 * (~1.1 GB Qwen3 1.7B Q4 vs ~75 MB Whisper Tiny). Both bars stream live
 * from the QVAC SDK's `onProgress` over IPC.
 *
 * Don't gate the LLM bar on Whisper finishing - both load in parallel
 * inside main, so showing both bars from the start is honest.
 */

type LoadState =
  | { kind: "splash" }
  | { kind: "loading"; whisper: number; llm: number }
  | { kind: "ready" }
  | { kind: "error"; message: string };

export function ModelLoader({ state }: { state: LoadState }) {
  if (state.kind === "ready") return null;

  return (
    <main className="flex flex-1 items-center justify-center px-8 py-16">
      <div className="w-full max-w-md space-y-8">
        <div className="space-y-2 text-center">
          <div className="text-[10px] uppercase tracking-[0.18em] text-gold-300">
            QVAC · @qvac/sdk
          </div>
          <h1 className="font-serif text-3xl tracking-tight text-ink-50">
            {state.kind === "error"
              ? "Не удалось загрузить модель"
              : state.kind === "splash"
              ? "Запускается…"
              : "Загружается локальная модель"}
          </h1>
          <p className="text-sm text-ink-300">
            {state.kind === "error"
              ? "Проверьте интернет - модели грузятся только при первом запуске."
              : "Около 1.2 ГБ при первом запуске. Дальше всё работает оффлайн."}
          </p>
        </div>

        {state.kind === "loading" && (
          <div className="space-y-5">
            <Bar label="Qwen3 1.7B Instruct (Q4)" percent={state.llm} />
            <Bar label="Whisper Tiny (мультиязычный)" percent={state.whisper} />
          </div>
        )}

        {state.kind === "error" && (
          <div className="rounded-md border border-down/30 bg-down/10 px-4 py-3 text-sm text-down">
            {state.message}
          </div>
        )}
      </div>
    </main>
  );
}

function Bar({ label, percent }: { label: string; percent: number }) {
  const pct = Math.max(0, Math.min(100, percent));
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-[11px]">
        <span className="text-ink-200">{label}</span>
        <span className="font-mono tabular-nums text-gold-300">
          {pct.toFixed(0)}%
        </span>
      </div>
      <div className="h-[2px] overflow-hidden bg-ink-800">
        <div
          className="h-full bg-gold-400 transition-all duration-200"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
