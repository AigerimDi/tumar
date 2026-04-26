/**
 * Type declaration for the `window.tumar` surface exposed by preload.
 *
 * The renderer imports nothing from this file - it's a pure ambient
 * declaration so TypeScript knows what shape `window.tumar` has.
 */

import type { TumarAPI } from "./index";

declare global {
  interface Window {
    tumar: TumarAPI;
  }
}

export {};
