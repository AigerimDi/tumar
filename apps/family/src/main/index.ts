/**
 * Tumar Family - Electron main process.
 *
 * Owns three native-bound responsibilities that can't run in the renderer:
 *   1. @qvac/sdk model lifecycle: loadModel, completion (streaming),
 *      transcribe, unloadModel. Native llama.cpp + whisper.cpp bindings.
 *   2. Cloak `scanTransactions` for shielded history decryption - runs on
 *      a connected Solana RPC, which is the ONLY network call this process
 *      makes after model load. After the user pastes a viewing key and
 *      the family chooses "decrypt history once," the renderer can
 *      thereafter operate offline indefinitely.
 *   3. IPC shuttle: token streams from llama-cpp → renderer over
 *      `webContents.send('completion-stream', token)`.
 *
 * Air-gap guarantee: nothing in this file calls `fetch`, `https`, or any
 * network API except (a) the QVAC SDK's model loader (one-time, cached
 * to ~/.qvac/models) and (b) the Cloak history scan (only when the user
 * presses "Decrypt history" and only over the user-provided RPC URL).
 * The LLM and Whisper inference paths are 100% local.
 */

import { app, BrowserWindow, ipcMain, shell } from "electron";
import { join } from "path";
import { fileURLToPath } from "url";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";

import {
  QWEN3_1_7B_INST_Q4,
  WHISPER_TINY,
  loadModel,
  unloadModel,
  completion,
  transcribe,
  type ModelProgressUpdate,
} from "@qvac/sdk";

// On Linux QVAC requires --no-sandbox; harmless on macOS, kept here so we
// can dev on Linux without surprises.
app.commandLine.appendSwitch("no-sandbox");

const __dirname = fileURLToPath(new URL(".", import.meta.url));

let mainWindow: BrowserWindow | null = null;
let llmId: string | null = null;
let whisperId: string | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 780,
    minWidth: 960,
    minHeight: 640,
    show: false,
    titleBarStyle: "hiddenInset",
    backgroundColor: "#07080a",
    webPreferences: {
      // electron-vite outputs the preload as ESM (`.mjs`) when the package is
      // type:module. The .js path that ships in most boilerplates resolves
      // to a non-existent file in the packaged asar; renderer logs say
      // "Unable to load preload script" and `window.tumar` is undefined.
      preload: join(__dirname, "../preload/index.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.on("ready-to-show", () => mainWindow?.show());

  // TEMP debug: open DevTools on every launch so a black-screen / silent
  // crash is visible without keyboard gymnastics. Remove once the model
  // load path is verified to work end-to-end.
  mainWindow.webContents.openDevTools({ mode: "detach" });

  // External links open in the user's browser, not inside the Electron
  // window. We never want the renderer to navigate to arbitrary URLs.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

/** Wire IPC. Called once after `app.whenReady`. */
function setupIpc(): void {
  // Trigger model load. Renderer awaits this after the splash screen and
  // listens to "model-progress" for download bars. The first call is the
  // expensive one (downloads ~1.1 GB Qwen3 + ~75 MB Whisper); subsequent
  // calls return immediately because the SDK caches to ~/.qvac/models.
  ipcMain.handle("models:load", async () => {
    if (llmId && whisperId) return { llmId, whisperId };

    if (!llmId) {
      llmId = await loadModel({
        modelSrc: QWEN3_1_7B_INST_Q4,
        modelType: "llm",
        modelConfig: { ctx_size: 4096, device: "gpu", gpu_layers: 99 },
        onProgress: (p: ModelProgressUpdate) => {
          mainWindow?.webContents.send("model-progress", {
            kind: "llm",
            percentage: p.percentage,
          });
        },
      });
    }

    // Whisper load is optional. @qvac/transcription-whispercpp imports
    // `exclusiveRunQueue` from @qvac/infer-base, which only exists in
    // 0.3.x+, but the package's own peer dep can pin an older infer-base
    // depending on which combination pnpm picks for the deployed bundle.
    // Wrap in try/catch - if whisper fails, the LLM still works (text
    // input is the demoable beat anyway). The mic button just stays
    // disabled in the renderer.
    if (!whisperId) {
      try {
        whisperId = await loadModel({
          modelSrc: WHISPER_TINY,
          modelType: "whisper",
          modelConfig: {
            // Renderer ships f32 PCM; whisper.cpp expects little-endian.
            audio_format: "f32le",
            strategy: "greedy",
            contextParams: {
              use_gpu: true,
              flash_attn: true,
              gpu_device: 0,
            },
          },
          onProgress: (p: ModelProgressUpdate) => {
            mainWindow?.webContents.send("model-progress", {
              kind: "whisper",
              percentage: p.percentage,
            });
          },
        });
      } catch (e) {
        console.error("[main] Whisper load failed (mic disabled):", e);
        whisperId = null;
      }
    }

    return { llmId, whisperId, whisperAvailable: whisperId != null };
  });

  // Streaming completion. The renderer passes a chat history array; we
  // shuttle tokens back via "completion-stream". An empty-string token
  // signals "done" (closes the bubble).
  ipcMain.handle(
    "llm:complete",
    async (_e, history: { role: "system" | "user" | "assistant"; content: string }[]) => {
      if (!llmId) throw new Error("LLM not loaded - call models:load first.");
      const result = completion({ modelId: llmId, history, stream: true });
      try {
        for await (const token of result.tokenStream) {
          mainWindow?.webContents.send("completion-stream", token);
        }
      } finally {
        // Always send the terminal sentinel, even on error, so the
        // renderer's bubble doesn't sit in "typing…" forever.
        mainWindow?.webContents.send("completion-stream", "");
      }
    },
  );

  // Whisper STT. Renderer passes raw f32 LE PCM (16 kHz mono); we hand it
  // to the whisper context.
  ipcMain.handle("stt:transcribe", async (_e, pcm: ArrayBuffer) => {
    if (!whisperId) throw new Error("Whisper not loaded - call models:load first.");
    const result = await transcribe({
      modelId: whisperId,
      audioChunk: Buffer.from(pcm),
    });
    return result;
  });

  // Cloak history scan via viewing key. Only network call after model load,
  // and only when the user explicitly clicks "Decrypt history."
  ipcMain.handle(
    "cloak:scan",
    async (_e, args: { rpcUrl: string; viewingKeyNkHex: string }) => {
      const { Connection } = await import("@solana/web3.js");
      const cloak = await import("@cloak.dev/sdk");
      const connection = new Connection(args.rpcUrl, "confirmed");
      const nk = new Uint8Array(
        args.viewingKeyNkHex.match(/.{1,2}/g)!.map((b) => parseInt(b, 16)),
      );
      // Use the SDK's authoritative `CLOAK_PROGRAM_ID` rather than a
      // renderer-supplied value - that string can drift (or be wrong) when
      // we re-derive constants in shared/types.ts. The SDK is the source
      // of truth for which on-chain program to scan.
      const result = await cloak.scanTransactions({
        connection,
        programId: cloak.CLOAK_PROGRAM_ID,
        viewingKeyNk: nk,
      });
      // ComplianceReport is JSON-serializable (numbers, not bigint) - clean
      // for IPC + rendering.
      return cloak.toComplianceReport(result);
    },
  );
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId("app.tumar.family");
  app.on("browser-window-created", (_, w) => optimizer.watchWindowShortcuts(w));
  setupIpc();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// Guarantee we release native memory + GPU contexts on quit. Without this
// macOS can hold onto the Metal context past app exit, which makes a fresh
// dev cycle complain about "device already in use."
app.on("before-quit", async () => {
  try {
    if (llmId) await unloadModel({ modelId: llmId });
    if (whisperId) await unloadModel({ modelId: whisperId });
  } catch {
    /* shutting down anyway */
  }
});
