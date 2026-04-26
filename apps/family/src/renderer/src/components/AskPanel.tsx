import { useEffect, useRef, useState } from "react";
import type { VaultState } from "@tumar/shared";

import { AudioCapture } from "../lib/audio-capture";
import { buildSystemPrompt, type Lang } from "../lib/system-prompt";

/**
 * RIGHT pane - Ask panel.
 *
 * Two input modes:
 *   1. Text input - user types, Enter sends.
 *   2. Hold-to-talk - mousedown opens mic, mouseup closes + transcribes
 *      via Whisper, the transcript becomes a user message.
 *
 * Both feed the same chat history. The LLM streams tokens back via
 * `window.tumar.llm.complete`, which we render into the active assistant
 * bubble character by character.
 *
 * History layout: system message is rebuilt each turn from the live
 * VaultState (in case decryption pulls in real numbers later). Past turns
 * append normally. Qwen3 1.7B handles ~4k context; we don't bother
 * truncating because a family chat is short.
 */

type Turn = {
  role: "user" | "assistant";
  content: string;
  // Marks the in-flight assistant turn so we can append tokens to it.
  streaming?: boolean;
};

const DEMO_QUESTIONS_BY_LANG: Record<Lang, string[]> = {
  ru: [
    "Сколько у меня сейчас в портфеле?",
    "Что такое SPYx?",
    "Сколько я получил в этом месяце?",
    "Что будет, если SPY упадёт на 20%?",
  ],
  en: [
    "How much is in the portfolio right now?",
    "What is SPYx?",
    "How much came in this month?",
    "What happens if SPY drops 20%?",
  ],
  kz: [
    "Қазір портфельде қанша бар?",
    "SPYx деген не?",
    "Осы айда қанша түсті?",
    "Егер SPY 20%-ға құласа не болады?",
  ],
};

const LANG_LABELS: Record<Lang, string> = { ru: "РУС", en: "ENG", kz: "ҚАЗ" };
const LANG_PLACEHOLDERS: Record<Lang, string> = {
  ru: "Спросите про портфель…",
  en: "Ask about the portfolio…",
  kz: "Портфель туралы сұраңыз…",
};
const LANG_HEADERS: Record<Lang, { title: string; sub: string; tryLabel: string; recordingLabel: string; askLabel: string }> = {
  ru: { title: "Спросить · Qwen3 1.7B", sub: "работает на устройстве", tryLabel: "Попробуйте", recordingLabel: "Говорите…", askLabel: "Спросить" },
  en: { title: "Ask · Qwen3 1.7B", sub: "runs on this device", tryLabel: "Try", recordingLabel: "Listening…", askLabel: "Ask" },
  kz: { title: "Сұрау · Qwen3 1.7B", sub: "құрылғыда жұмыс істейді", tryLabel: "Сынап көріңіз", recordingLabel: "Тыңдап тұрмын…", askLabel: "Сұрау" },
};

/** Strip Qwen3 thinking blocks from streamed token output. We append
 * `/no_think` to the system prompt to disable them at the source, but
 * defensively filter them out here too - safety net if the prompt-flag
 * doesn't get honored for some quantization or chat-template variant. */
function makeThinkFilter() {
  let buffer = "";
  let inThink = false;
  return (token: string): string => {
    if (token === "") return "";
    buffer += token;
    let out = "";
    while (buffer.length > 0) {
      if (inThink) {
        const close = buffer.indexOf("</think>");
        if (close === -1) {
          // Need more tokens. Keep the buffer in case the closing tag
          // straddles a token boundary.
          buffer = buffer.slice(-Math.min(buffer.length, "</think>".length - 1));
          return out;
        }
        buffer = buffer.slice(close + "</think>".length);
        inThink = false;
      } else {
        const open = buffer.indexOf("<think>");
        if (open === -1) {
          // Could still be a partial "<think" at the end - hold the last
          // few chars back so we don't emit a half-tag.
          const safeLen = Math.max(0, buffer.length - "<think>".length + 1);
          out += buffer.slice(0, safeLen);
          buffer = buffer.slice(safeLen);
          return out;
        }
        out += buffer.slice(0, open);
        buffer = buffer.slice(open + "<think>".length);
        inThink = true;
      }
    }
    return out;
  };
}

export function AskPanel({ vault }: { vault: VaultState }) {
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lang, setLang] = useState<Lang>(() => {
    if (typeof window === "undefined") return "ru";
    const saved = window.localStorage.getItem("tumar.family.lang");
    return saved === "en" || saved === "kz" || saved === "ru" ? saved : "ru";
  });

  // Persist language choice across launches.
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("tumar.family.lang", lang);
    }
  }, [lang]);

  const labels = LANG_HEADERS[lang];
  const demoQuestions = DEMO_QUESTIONS_BY_LANG[lang];

  // Audio capture is mutable + cancellable across renders - keep in a ref.
  const captureRef = useRef<AudioCapture | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the latest token while streaming.
  useEffect(() => {
    transcriptRef.current?.scrollTo({
      top: transcriptRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [history]);

  async function ask(question: string) {
    if (busy) return;
    const trimmed = question.trim();
    if (!trimmed) return;

    setError(null);
    setBusy(true);
    setInput("");

    // Snapshot the new chat history with a placeholder assistant bubble.
    setHistory((prev) => [
      ...prev,
      { role: "user", content: trimmed },
      { role: "assistant", content: "", streaming: true },
    ]);

    // Build the messages we send to the LLM. System prompt rebuilt each
    // turn so it stays in sync with current portfolio state and language.
    const llmHistory = [
      { role: "system" as const, content: buildSystemPrompt(vault, lang) },
      ...history.map((t) => ({ role: t.role, content: t.content })),
      { role: "user" as const, content: trimmed },
    ];

    // Per-turn filter strips any `<think>...</think>` Qwen3 may emit despite
    // the `/no_think` flag in the system prompt.
    const stripThink = makeThinkFilter();

    const { promise, unsubscribe } = window.tumar.llm.complete(
      llmHistory,
      (token) => {
        if (token === "") return;
        const visible = stripThink(token);
        if (visible.length === 0) return;
        setHistory((prev) => {
          const last = prev[prev.length - 1];
          if (!last || !last.streaming) return prev;
          const updated = [...prev];
          updated[updated.length - 1] = {
            ...last,
            content: last.content + visible,
          };
          return updated;
        });
      },
    );

    try {
      await promise;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      unsubscribe();
      // Mark the assistant bubble as no-longer-streaming.
      setHistory((prev) =>
        prev.map((t, i) =>
          i === prev.length - 1 && t.role === "assistant"
            ? { ...t, streaming: false }
            : t,
        ),
      );
      setBusy(false);
    }
  }

  async function startRecord() {
    if (busy || recording) return;
    setError(null);
    captureRef.current = new AudioCapture();
    try {
      await captureRef.current.start();
      setRecording(true);
    } catch (e) {
      setError(`Микрофон: ${e instanceof Error ? e.message : String(e)}`);
      captureRef.current = null;
    }
  }

  async function stopRecord() {
    if (!recording || !captureRef.current) return;
    setRecording(false);
    setBusy(true);
    try {
      const pcm = await captureRef.current.stop();
      captureRef.current = null;
      const text = await window.tumar.stt.transcribe(pcm);
      const trimmed = text.trim();
      if (trimmed) {
        // Don't await ask() inside the finally block - keep busy true
        // until the LLM finishes streaming.
        await ask(trimmed);
        return;
      }
    } catch (e) {
      setError(`Распознавание: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      // Only set busy false if we didn't end up in ask() (which manages
      // its own busy state).
      if (!recording) setBusy(false);
    }
  }

  return (
    <section className="flex flex-col bg-ink-900">
      <div className="flex items-baseline justify-between border-b border-[var(--hairline)] px-5 py-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-gold-300">
            {labels.title}
          </div>
          <div className="font-mono text-[10px] text-ink-500">
            {labels.sub}
          </div>
        </div>
        {/* Language picker - same three options as the web nav. */}
        <div className="flex items-center overflow-hidden border border-[var(--hairline)]">
          {(["en", "ru", "kz"] as Lang[]).map((code) => (
            <button
              key={code}
              type="button"
              onClick={() => setLang(code)}
              disabled={busy || recording}
              className={
                "px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] transition-colors " +
                (lang === code
                  ? "bg-ink-50 text-ink-950"
                  : "text-ink-400 hover:text-ink-50 disabled:opacity-40")
              }
            >
              {LANG_LABELS[code]}
            </button>
          ))}
        </div>
      </div>

      {/* Quick demo prompts - language-matched. */}
      {history.length === 0 && (
        <div className="space-y-2 border-b border-[var(--hairline)] px-5 py-4">
          <div className="text-[10px] uppercase tracking-[0.16em] text-ink-400">
            {labels.tryLabel}
          </div>
          <div className="flex flex-col gap-1.5">
            {demoQuestions.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => ask(q)}
                disabled={busy}
                className="border border-[var(--hairline)] bg-ink-950 px-3 py-2 text-left text-[12px] text-ink-200 transition-colors hover:border-gold-400/30 hover:text-ink-50 disabled:opacity-40"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      <div ref={transcriptRef} className="flex-1 overflow-y-auto px-5 py-4">
        <div className="space-y-4">
          {history.map((t, i) => (
            <Bubble key={i} turn={t} />
          ))}
        </div>
      </div>

      {error && (
        <div className="border-t border-down/30 bg-down/10 px-5 py-2 text-[11px] text-down">
          {error}
        </div>
      )}

      <div className="flex items-center gap-2 border-t border-[var(--hairline)] bg-ink-950 px-3 py-3">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !busy) ask(input);
          }}
          placeholder={LANG_PLACEHOLDERS[lang]}
          disabled={busy || recording}
          className="flex-1 border border-[var(--hairline)] bg-ink-900 px-3 py-2 text-[13px] text-ink-100 outline-none focus:border-gold-400/40"
        />
        <button
          type="button"
          onMouseDown={startRecord}
          onMouseUp={stopRecord}
          onMouseLeave={() => recording && stopRecord()}
          onTouchStart={startRecord}
          onTouchEnd={stopRecord}
          disabled={busy && !recording}
          className={
            "flex h-10 w-10 items-center justify-center border transition-colors " +
            (recording
              ? "border-down bg-down/20 text-down"
              : "border-[var(--hairline-strong)] bg-ink-900 text-ink-300 hover:border-gold-400/40 hover:text-gold-300 disabled:opacity-40")
          }
          title="Удерживайте для записи"
        >
          <MicIcon />
        </button>
      </div>
      <div className="border-t border-[var(--hairline)] px-5 py-2 text-center text-[10px] text-ink-500">
        🔒 локально, без интернета
      </div>
    </section>
  );
}

function Bubble({ turn }: { turn: Turn }) {
  const isUser = turn.role === "user";
  return (
    <div className={isUser ? "text-right" : "text-left"}>
      <div
        className={
          "inline-block max-w-[88%] whitespace-pre-wrap border px-3 py-2 text-left text-[13px] leading-relaxed " +
          (isUser
            ? "border-[var(--hairline)] bg-ink-800 text-ink-100"
            : "border-gold-400/20 bg-gold-400/[0.04] text-ink-50")
        }
      >
        {turn.content || (turn.streaming ? <Cursor /> : "")}
        {turn.streaming && turn.content && <Cursor />}
      </div>
    </div>
  );
}

function Cursor() {
  return (
    <span className="ml-0.5 inline-block h-3 w-[2px] animate-pulse bg-gold-400 align-middle" />
  );
}

function MicIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}
