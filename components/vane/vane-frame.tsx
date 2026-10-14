"use client";

import * as React from "react";

import { Empty, Kit, KitScreen } from "@/components/core";

import "./vane.css";

/**
 * Vane's pages inside the app's shell. For you (`vane`) is the boards' two
 * columns, the cards and what Vane is doing; Plans, Done and Muted are one
 * column (`vane-list`).
 */
export function VaneFrame({ screen = "vane-list", children }: { screen?: "vane" | "vane-list"; children: React.ReactNode }) {
  return (
    <Kit className="kit-main">
      <KitScreen slug={screen}>
        <div className="mn">{children}</div>
      </KitScreen>
    </Kit>
  );
}

/** A page's body while its data loads: rows in the page's shape. */
export function VaneLoading() {
  return (
    <div className="kbody vn-body" aria-busy="true">
      <div className="skeleton" style={{ height: 56, maxWidth: 640 }} />
      <div className="skeleton" style={{ height: 96 }} />
      <div className="skeleton" style={{ height: 96 }} />
      <div className="skeleton" style={{ height: 96 }} />
    </div>
  );
}

/** What failed, and Try again. */
export function VaneError({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <div className="kbody vn-body">
      <Empty
        icon="warn"
        title={`${what} did not load`}
        action={
          <button type="button" className="btn" onClick={onRetry}>
            Try again
          </button>
        }
      >
        Check the connection, then try again.
      </Empty>
    </div>
  );
}
