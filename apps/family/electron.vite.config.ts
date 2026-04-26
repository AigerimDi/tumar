import { resolve } from "path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";

/**
 * electron-vite config.
 *
 * Three build targets:
 *   - main: Electron main process. Owns @qvac/sdk + @cloak.dev/sdk; native
 *     bindings stay external (not bundled) so they can call N-API.
 *   - preload: contextBridge surface. Externalize Electron itself.
 *   - renderer: standard Vite + React build. Loads the renderer bundle in
 *     the BrowserWindow.
 */
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: "out/main",
      rollupOptions: {
        input: resolve(__dirname, "src/main/index.ts"),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: "out/preload",
      rollupOptions: {
        input: resolve(__dirname, "src/preload/index.ts"),
      },
    },
  },
  renderer: {
    root: resolve(__dirname, "src/renderer"),
    plugins: [react()],
    resolve: {
      alias: {
        "@": resolve(__dirname, "src/renderer/src"),
        "@tumar/shared": resolve(__dirname, "../../packages/shared/src/index.ts"),
      },
    },
    build: {
      outDir: resolve(__dirname, "out/renderer"),
      rollupOptions: {
        input: resolve(__dirname, "src/renderer/index.html"),
      },
    },
  },
});
