import { useEffect, useState } from "react";

/**
 * Online/offline indicator.
 *
 * Demo intent: judges literally unplug ethernet mid-conversation. The dot
 * goes red, the LLM keeps streaming. That's the whole demo moment.
 *
 * Implementation: we react to `navigator.onLine` events the preload pipes
 * through. In Electron those fire reliably (unlike Safari or some
 * Chromium variants where onLine lies). For belt-and-suspenders accuracy
 * a future version could ping a known-offline-friendly local socket, but
 * for the demo the OS-level event is fine.
 */
export function OnlineIndicator() {
  const [online, setOnline] = useState(() => window.tumar.net.isOnline());

  useEffect(() => {
    return window.tumar.net.onChange(setOnline);
  }, []);

  return (
    <div
      className={
        "inline-flex items-center gap-2 border px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] " +
        (online
          ? "border-ink-700 bg-ink-900 text-ink-300"
          : "border-up/40 bg-up/10 text-up")
      }
    >
      <span
        className={
          "inline-block h-1.5 w-1.5 rounded-full " +
          (online ? "bg-ink-500" : "animate-pulse bg-up")
        }
      />
      {online ? "Online" : "Offline · полностью локально"}
    </div>
  );
}
