"use client";

/**
 * Swallows errors thrown by rogue browser extensions - notably `evmAsk.js`
 * (OKX / Frontier / various multichain wallets) which attempt to
 * `Object.defineProperty(window, "ethereum", ...)` at page load. When another
 * extension has already locked `window.ethereum` as non-configurable, the
 * redefine throws an uncaught TypeError, which React 19 escalates to a full
 * client-side error boundary screen ("Application error: a client-side
 * exception has occurred") - even though none of our code caused it.
 *
 * We also defuse it at the source by trapping the global `error` and
 * `unhandledrejection` events so the exception never bubbles to React.
 */

import { Component, useEffect, type ReactNode } from "react";

type BoundaryState = { hasError: boolean };

const EXTENSION_NOISE = [
  "ethereum",
  "evmAsk",
  "chrome-extension",
  "moz-extension",
  "already registered as a Standard Wallet",
  "Cannot redefine property",
];

function isExtensionError(err: unknown): boolean {
  const msg = (() => {
    if (!err) return "";
    if (typeof err === "string") return err;
    if (err instanceof Error) return `${err.message} ${err.stack ?? ""}`;
    try {
      return String(err);
    } catch {
      return "";
    }
  })();
  return EXTENSION_NOISE.some((needle) => msg.includes(needle));
}

class Boundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { hasError: false };

  static getDerivedStateFromError(error: unknown): BoundaryState {
    // Extension errors should NOT take down the tree.
    if (isExtensionError(error)) return { hasError: false };
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    if (!isExtensionError(error) && process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.error("[ClientErrorBoundary]", error);
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[50vh] grid place-items-center p-8 text-center text-sm text-coal-700">
          <div>
            <p className="font-semibold text-coal-900">Something went wrong.</p>
            <p className="mt-1 text-coal-600">Try refreshing the page.</p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function GlobalErrorSink() {
  useEffect(() => {
    const onError = (e: ErrorEvent) => {
      if (isExtensionError(e.error ?? e.message)) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      if (isExtensionError(e.reason)) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    };
    window.addEventListener("error", onError, true);
    window.addEventListener("unhandledrejection", onRejection, true);
    return () => {
      window.removeEventListener("error", onError, true);
      window.removeEventListener("unhandledrejection", onRejection, true);
    };
  }, []);
  return null;
}

export function ClientErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <Boundary>
      <GlobalErrorSink />
      {children}
    </Boundary>
  );
}
