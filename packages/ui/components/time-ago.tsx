"use client";

import { useSyncExternalStore } from "react";

/**
 * "3d ago", hydration-safe.
 *
 * Anything derived from `Date.now()` differs between the server render and
 * the browser's first paint, which is hydration error #418. So the clock is
 * read through `useSyncExternalStore`: the server snapshot is `null`, which
 * renders the raw date slice of the ISO input — same bytes on both sides — and
 * the client snapshot, taken after hydration, swaps in the relative wording.
 * The snapshot is quantised to the minute so consecutive reads agree, which is
 * what the store contract asks for and all the precision "3d ago" has.
 */
const subscribe = () => () => {};
let minuteSnapshot: number | null = null;

function readClientMinute() {
  const now = Date.now();
  const minute = now - (now % 60_000);
  if (minuteSnapshot !== minute) minuteSnapshot = minute;
  return minuteSnapshot;
}

export function TimeAgo({ value }: { value: string | null | undefined }) {
  const now = useSyncExternalStore(subscribe, readClientMinute, () => null);

  if (!value) return null;
  if (now === null) return <>{value.slice(0, 10)}</>;

  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return <>{value.slice(0, 10)}</>;

  const seconds = Math.max(0, Math.floor((now - then) / 1000));
  const label =
    seconds < 60
      ? "just now"
      : seconds < 3600
        ? `${Math.floor(seconds / 60)}m ago`
        : seconds < 86400
          ? `${Math.floor(seconds / 3600)}h ago`
          : seconds < 86400 * 30
            ? `${Math.floor(seconds / 86400)}d ago`
            : seconds < 86400 * 365
              ? `${Math.floor(seconds / (86400 * 30))}mo ago`
              : `${Math.floor(seconds / (86400 * 365))}y ago`;

  return <>{label}</>;
}
