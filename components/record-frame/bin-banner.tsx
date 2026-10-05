"use client";

import * as React from "react";

import { Loader2, Trash } from "@/lib/icons";
import type { BinState } from "@/lib/retail/bin";
import { formatDay, formatTime } from "@/lib/workspace/format";

/** "3 October" — the banner's dates leave the year to the reader. */
function dayMonth(iso: string) {
  return formatDay(iso).replace(/ \d{4}$/, "");
}

/**
 * The bin banner (5.6.3): when it went in, who moved it, until when it is
 * kept, and Restore for roles with Bin update. Past 30 days it says so and
 * offers nothing.
 */
export function BinBanner({
  state,
  viewerId,
  canRestore,
  onRestore,
}: {
  state: BinState;
  viewerId: string | null;
  canRestore: boolean;
  onRestore: () => Promise<void>;
}) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const by = state.by ? (state.by.id && state.by.id === viewerId ? "you" : state.by.name) : null;
  const since = `since ${dayMonth(state.since)}, ${formatTime(state.since)}${by ? `, moved by ${by}` : ""}.`;

  const restore = async () => {
    setBusy(true);
    setError(null);
    try {
      await onRestore();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That did not restore. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div role="status" className="cx-rf-banner">
      <Trash aria-hidden="true" />
      <span className="cx-rf-banner__text">
        <b>In the bin</b>{" "}
        {state.restorable
          ? `${since} Kept until ${dayMonth(state.keptUntil)}, then gone for good. Nothing sold, paid or counted against it changes.`
          : `${since.replace(/\.$/, "")}. It is past 30 days and can no longer be restored.`}
        {error ? (
          <>
            {" "}
            <span className="cx-rf-banner__error">{error}</span>
          </>
        ) : null}
      </span>
      {state.restorable && canRestore ? (
        <button type="button" className="cx-rf-banner__restore" onClick={restore} disabled={busy} aria-busy={busy || undefined}>
          {busy ? <Loader2 aria-hidden="true" /> : null}
          Restore
        </button>
      ) : null}
    </div>
  );
}
