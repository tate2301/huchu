"use client";

import Link from "next/link";
import * as React from "react";

import { Loader2, Trash } from "@/lib/icons";
import type { BinState } from "@/lib/retail/bin";
import type { BinLead } from "@/lib/retail/record-kinds/types";
import { formatDay, formatTime } from "@/lib/workspace/format";

/** "3 October" — the banner's dates leave the year to the reader. */
function dayMonth(iso: string) {
  return formatDay(iso).replace(/ \d{4}$/, "");
}

/**
 * The bin banner (5.6.3): when it went in, who moved it, until when it is
 * kept, and Restore for roles with Bin update. Past 30 days, or deleted for
 * good, it says so and offers nothing.
 */
export function BinBanner({
  state,
  lead,
  meanwhile,
  viewerId,
  canRestore,
  onRestore,
}: {
  state: BinState;
  /** A line before the rest ("Merged into Tapiwa Marange"), its link last; the when and who follow it. */
  lead?: BinLead | null;
  /** The kind's words for what happens while it is kept ("Off the till and out of lists; …"). */
  meanwhile?: string;
  viewerId: string | null;
  canRestore: boolean;
  onRestore: () => Promise<void>;
}) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const by = state.by ? (state.by.id && state.by.id === viewerId ? "you" : state.by.name) : null;
  const when = `${dayMonth(state.since)}, ${formatTime(state.since)}`;
  // With a lead the when joins its sentence ("Merged into Tapiwa Marange on 12 October, 09:30, by you.").
  const since = lead ? "" : `since ${when}${by ? `, moved by ${by}` : ""}. `;
  const rest = state.restorable
    ? `Kept until ${dayMonth(state.keptUntil)}${meanwhile ? `. ${meanwhile}` : ", then gone for good. Nothing sold, paid or counted against it changes."}`
    : state.purged
      ? "It was deleted for good and is kept only for what was sold, paid or counted against it."
      : "It is past 30 days and can no longer be restored.";

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
        <b>{lead ? "In the bin." : "In the bin"}</b>{" "}
        {lead ? (
          <>
            {lead.text}{" "}
            <Link className="cx-rf-banner__link" href={lead.link.href}>
              {lead.link.label}
            </Link>
            {` on ${when}${by ? `, by ${by}` : ""}. `}
          </>
        ) : null}
        {since}
        {rest}
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
