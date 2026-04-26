import { useEffect, useState } from "react";

import { ModelLoader } from "./components/ModelLoader";
import { OnlineIndicator } from "./components/OnlineIndicator";
import { PortfolioPanel } from "./components/PortfolioPanel";
import { AskPanel } from "./components/AskPanel";
import { MOCK_VAULT } from "./lib/mock-vault";

type LoadState =
  | { kind: "splash" }
  | { kind: "loading"; whisper: number; llm: number }
  | { kind: "ready" }
  | { kind: "error"; message: string };

export function App() {
  const [load, setLoad] = useState<LoadState>({ kind: "splash" });

  // Subscribe to model progress before kicking off the load, so we don't
  // miss early percentage updates during cache-hit fast paths.
  useEffect(() => {
    const unsubscribe = window.tumar.models.onProgress((p) => {
      setLoad((cur) => {
        if (cur.kind === "ready" || cur.kind === "error") return cur;
        const base =
          cur.kind === "loading"
            ? cur
            : { kind: "loading" as const, whisper: 0, llm: 0 };
        return { ...base, [p.kind]: p.percentage };
      });
    });

    setLoad({ kind: "loading", whisper: 0, llm: 0 });
    window.tumar.models
      .load()
      .then(() => setLoad({ kind: "ready" }))
      .catch((e) =>
        setLoad({
          kind: "error",
          message: e instanceof Error ? e.message : String(e),
        }),
      );

    return unsubscribe;
  }, []);

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      {load.kind !== "ready" ? (
        <ModelLoader state={load} />
      ) : (
        <main className="grid flex-1 grid-cols-1 gap-0 lg:grid-cols-[minmax(420px,1fr)_minmax(380px,420px)]">
          <PortfolioPanel vault={MOCK_VAULT} />
          <AskPanel vault={MOCK_VAULT} />
        </main>
      )}
    </div>
  );
}

function Header() {
  return (
    <header className="app-drag flex items-center justify-between border-b border-[var(--hairline)] bg-ink-950/95 px-5 py-3">
      {/* Empty left padding under the macOS traffic-lights. */}
      <div className="w-[72px]" />
      <div className="flex items-baseline gap-3">
        <span className="font-serif text-[15px] tracking-tight text-ink-50">
          Tumar Family
        </span>
        <span className="text-[10px] uppercase tracking-[0.18em] text-ink-500">
          Локально, без интернета
        </span>
      </div>
      <div className="app-no-drag">
        <OnlineIndicator />
      </div>
    </header>
  );
}
