"use client";

import * as React from "react";

import { Button, Empty, Kit, KitScreen } from "@/components/core";

/** A Vane page in the kit: its screen's rules (`.sc-<slug>`) around the page's body. */
export function VanePage({ screen, children }: { screen: string; children: React.ReactNode }) {
  return (
    <Kit className="kit-main">
      <KitScreen slug={screen}>
        <div className="mn" style={{ flex: 1, minHeight: 0 }}>
          {children}
        </div>
      </KitScreen>
    </Kit>
  );
}

/** While a Vane page loads: its finding and rows as grey bars, so nothing jumps when they arrive. */
export function VaneLoading() {
  return (
    <div aria-busy="true" aria-label="Loading" style={{ padding: "var(--space-24)", display: "flex", flexDirection: "column", gap: "var(--space-12)" }}>
      <div className="skeleton" style={{ height: 32, width: "60%" }} />
      <div className="skeleton" style={{ height: 20, width: "40%" }} />
      <div className="skeleton" style={{ height: 160, marginTop: "var(--space-24)" }} />
    </div>
  );
}

/** When it did not load: offline or the server refused. */
export function VaneError({ what, onRetry }: { what: string; onRetry: () => void }) {
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
      {offline ? "Vane needs the connection. It loads again when you are back online." : "Check the connection and try again."}
    </Empty>
  );
}
