"use client";

import { useSyncExternalStore } from "react";
import { Toaster as DsToaster } from "@corelithzw/react";

/** Never changes, so the subscription never fires — this store is a constant. */
function subscribe() {
  return () => {};
}

/**
 * Toaster — the design system's host, mounted once in `app-providers.tsx`.
 *
 * The DS renders the stack itself from its own store, so the local
 * `toasts.map(...)` loop is gone. `position` and `max` are passed to preserve
 * this repo's placement (top-right) and limit (4); the DS defaults are
 * bottom-right and 5.
 *
 * The gate below is load-bearing. The DS host renders nothing on the server
 * and a toast viewport on the client, so hydration saw two different trees and
 * React discarded everything under it — on a data-driven page that left the
 * screen as its header with no query in flight. `useSyncExternalStore` with a
 * server snapshot of `false` makes the client's *first* render match the
 * server's, and the second render adds the viewport once hydration is done.
 *
 * Two things that look like fixes and are not: `dynamic(…, { ssr: false })`
 * suspends during hydration and the commit never lands, which leaves the page
 * frozen on the server's HTML; and a `useState` + `useEffect` mount flag is
 * the same idea with a cascading render, which the compiler's lint rejects.
 */
export function Toaster() {
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

  if (!hydrated) return null;

  return <DsToaster position="top-right" max={4} />;
}
