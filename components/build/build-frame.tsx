"use client";

import * as React from "react";

import { Button, Empty, Kit, KitScreen } from "@/components/core";

import "./build.css";

/** Build's pages inside the app's shell, with its own rules (`.sc-build`, `build.css`). */
export function BuildFrame({ children }: { children: React.ReactNode }) {
  return (
    <Kit className="kit-main">
      <KitScreen slug="build">
        <div className="mn" style={{ flex: 1, minHeight: 0 }}>
          {children}
        </div>
      </KitScreen>
    </Kit>
  );
}

/** While a Build page loads: its finding and rows as grey bars, so nothing jumps when they arrive. */
export function BuildLoading() {
  return (
    <div aria-busy="true" aria-label="Loading" style={{ padding: "var(--space-24)", display: "flex", flexDirection: "column", gap: "var(--space-12)" }}>
      <div className="skeleton" style={{ height: 36, width: "50%" }} />
      <div className="skeleton" style={{ height: 28, width: "70%" }} />
      <div className="skeleton" style={{ height: 240, marginTop: "var(--space-24)" }} />
    </div>
  );
}

/** When it did not load: offline, or the server refused. */
export function BuildError({ what, onRetry, message }: { what: string; onRetry: () => void; message?: string }) {
  const offline = typeof navigator !== "undefined" && !navigator.onLine;
  return (
    <Empty
      icon="warn"
      title={offline ? "You are offline" : `${what} did not load`}
      action={
        <Button icon="history" onClick={onRetry}>
          Try again
        </Button>
      }
    >
      {offline ? "Build needs the connection. It loads again when you are back online." : (message ?? "Check the connection and try again.")}
    </Empty>
  );
}
