/**
 * Preload - the only place the renderer can call native code through.
 *
 * `contextBridge.exposeInMainWorld('qvac', {...})` is sandboxed: the
 * renderer can't reach `ipcRenderer` directly, only the curated surface
 * exposed here. This is the security boundary.
 *
 * Kept tiny on purpose. Each method maps 1:1 to an `ipcMain.handle` call
 * over in main/index.ts. Nothing here imports @qvac or @cloak.dev - those
 * stay in the main process where their native bindings live.
 */

import { contextBridge, ipcRenderer } from "electron";

type ChatRole = "system" | "user" | "assistant";
type ChatTurn = { role: ChatRole; content: string };

const api = {
  models: {
    load: (): Promise<{ llmId: string; whisperId: string }> =>
      ipcRenderer.invoke("models:load"),
    onProgress: (
      cb: (p: { kind: "llm" | "whisper"; percentage: number }) => void,
    ): (() => void) => {
      const listener = (
        _e: unknown,
        p: { kind: "llm" | "whisper"; percentage: number },
      ) => cb(p);
      ipcRenderer.on("model-progress", listener);
      return () => ipcRenderer.removeListener("model-progress", listener);
    },
  },

  llm: {
    /**
     * Request a completion. Returns an unsubscribe function for the
     * token stream listener - call it in the React effect cleanup so we
     * don't leak listeners across mounts.
     */
    complete: (
      history: ChatTurn[],
      onToken: (token: string) => void,
    ): { promise: Promise<void>; unsubscribe: () => void } => {
      const listener = (_e: unknown, token: string) => onToken(token);
      ipcRenderer.on("completion-stream", listener);
      const unsubscribe = () =>
        ipcRenderer.removeListener("completion-stream", listener);
      const promise = ipcRenderer.invoke("llm:complete", history);
      return { promise, unsubscribe };
    },
  },

  stt: {
    /** Transcribe a raw f32-LE PCM buffer (16 kHz mono). */
    transcribe: (pcm: ArrayBuffer): Promise<string> =>
      ipcRenderer.invoke("stt:transcribe", pcm),
  },

  cloak: {
    /** Decrypt shielded history with a viewing key. RPC must be reachable. */
    scan: (args: {
      rpcUrl: string;
      viewingKeyNkHex: string;
    }): Promise<unknown> => ipcRenderer.invoke("cloak:scan", args),
  },

  /** Live online/offline indicator - driven by main, not renderer's
   *  navigator.onLine which is unreliable in Electron. */
  net: {
    isOnline: (): boolean => navigator.onLine,
    onChange: (cb: (online: boolean) => void): (() => void) => {
      const onOn = () => cb(true);
      const onOff = () => cb(false);
      window.addEventListener("online", onOn);
      window.addEventListener("offline", onOff);
      return () => {
        window.removeEventListener("online", onOn);
        window.removeEventListener("offline", onOff);
      };
    },
  },
};

contextBridge.exposeInMainWorld("tumar", api);

export type TumarAPI = typeof api;
