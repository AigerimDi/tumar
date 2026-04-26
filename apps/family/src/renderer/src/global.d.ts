/**
 * Renderer-side ambient declaration for `window.tumar`.
 *
 * The preload script defines a `TumarAPI` type that we mirror here, by
 * shape. We can't `import` from the preload module across the renderer
 * sandbox boundary (Vite would try to bundle preload code into the
 * renderer build), so we declare the surface manually.
 */

type ChatRole = "system" | "user" | "assistant";
type ChatTurn = { role: ChatRole; content: string };

interface TumarRendererAPI {
  models: {
    load: () => Promise<{ llmId: string; whisperId: string }>;
    onProgress: (
      cb: (p: { kind: "llm" | "whisper"; percentage: number }) => void,
    ) => () => void;
  };
  llm: {
    complete: (
      history: ChatTurn[],
      onToken: (token: string) => void,
    ) => { promise: Promise<void>; unsubscribe: () => void };
  };
  stt: {
    transcribe: (pcm: ArrayBuffer) => Promise<string>;
  };
  cloak: {
    scan: (args: {
      rpcUrl: string;
      viewingKeyNkHex: string;
    }) => Promise<unknown>;
  };
  net: {
    isOnline: () => boolean;
    onChange: (cb: (online: boolean) => void) => () => void;
  };
}

interface Window {
  tumar: TumarRendererAPI;
}
