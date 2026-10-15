"use client";

import * as React from "react";

import { Button, ButtonLink, Empty, Kit, KitScreen } from "@/components/core";

import "./explore.css";

/** An Explore page in the kit: the main column the board draws (`main.ex-main`). */
export function ExplorePage({ children }: { children: React.ReactNode }) {
  return (
    <Kit className="kit-main">
      <KitScreen slug="explore">
        <div className="ex-main">{children}</div>
      </KitScreen>
    </Kit>
  );
}

/** While the studio loads: the ask bar, the editor and rows as grey bars, so nothing jumps. */
export function ExploreLoading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="ex-loading">
      <div className="skeleton" style={{ height: 40 }} />
      <div className="skeleton" style={{ height: 200 }} />
      {[0, 1, 2, 3].map((n) => (
        <div key={n} className="skeleton" style={{ height: 22 }} />
      ))}
    </div>
  );
}

export function ExploreError({ what, onRetry }: { what: string; onRetry: () => void }) {
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
      {offline ? "Explore needs the connection. It loads again when you are back online." : "Check the connection and try again."}
    </Empty>
  );
}

/** Someone whose role may not use Explore: who can, and what they can do instead. */
export function ExploreNotYours({ who }: { who: string }) {
  return (
    <Empty icon="lock" title="Explore is for owners and managers" action={<ButtonLink href="/reports" icon="reports">Open reports</ButtonLink>}>
      {who} use Explore here. Everyone else asks Vane, or opens reports. Management → Explore says who may.
    </Empty>
  );
}
