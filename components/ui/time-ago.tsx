"use client";

import { useSyncExternalStore } from "react";

/**
 * A clock the whole page shares, ticking once a minute.
 *
 * One interval for every `TimeAgo` on the screen rather than one each: a
 * hundred-row table would otherwise hold a hundred timers all firing to compute
 * the same number.
 *
 * The minute is the resolution the labels actually use — "just now", "3m ago",
 * "2h ago" — so ticking faster would re-render the tree to produce identical
 * text. Subscribers are re-notified on the minute boundary and not before.
 */
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let snapshot = 0;

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  if (!timer) {
    snapshot = Date.now();
    timer = setInterval(() => {
      snapshot = Date.now();
      for (const listener of listeners) listener();
    }, 60_000);
  }
  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

function getSnapshot() {
  // First read of a fresh subscription happens before the interval fires.
  if (snapshot === 0) snapshot = Date.now();
  return snapshot;
}

/** Zero on the server, and the marker for "do not render a relative time yet". */
const getServerSnapshot = () => 0;

/**
 * "3d ago", hydration-safe, and it updates.
 *
 * ## Two problems, one shape
 *
 * **Hydration.** Anything derived from the clock differs between the server
 * render and the browser's first paint, which is React error #418. So until
 * this component has a client clock it emits the raw date slice of the ISO
 * input — the same bytes on both sides.
 *
 * **Purity.** This used to read `Date.now()` in the render body, behind a
 * mounted flag. Hydration-safe, and still wrong: a render body that reads a
 * clock is impure, React may render twice for one commit, and the compiler
 * refuses to memoize anything in a component that does it
 * ("Cannot call impure function during render").
 *
 * The first fix attempt — hold the reading in state, set it in a mount effect —
 * traded that error for `react-hooks/set-state-in-effect`, which is the same
 * objection wearing a different hat. Both rules are pointing at the same thing:
 * **the clock is external state, so subscribe to it.**
 *
 * Doing that turns out to fix a defect nobody had filed. Read once at mount,
 * the label is frozen at whatever render produced it: a record open on a
 * screen still says "just now" an hour later. Subscribed, it says what it
 * means.
 */
export function TimeAgo({ value }: { value: string | null | undefined }) {
  const now = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  if (!value) return null;
  if (now === 0) return <>{value.slice(0, 10)}</>;

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
