"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

/**
 * Where you came from, so going back means what it says.
 *
 * A CRM is a graph, and the way people actually work it is a path through that
 * graph: a deal, the company on it, another deal at that company, the person
 * who owns it. Every one of those hops is a real link and every one of them
 * used to arrive at a page whose back arrow said "All deals" — pointing at a
 * list nobody had been near, three hops ago.
 *
 * The trail is the path. Following a reference pushes the record you are
 * leaving; arriving at a record that is already on the trail pops back to it,
 * which is what makes the browser's own back button and the bar's back arrow
 * agree without either of them knowing about the other.
 *
 * ## Why in memory rather than the URL or storage
 *
 * The URL is tempting and wrong: a trail in the query string makes every link
 * to a record non-canonical, so a link somebody pastes into WhatsApp carries a
 * stranger's browsing history in it, and two paths to the same record stop
 * being the same page for caching.
 *
 * `sessionStorage` survives a reload, which sounds like a feature until a
 * reload restores a trail whose pages are no longer behind the browser's back
 * button — the arrow and the button then disagree, which is worse than a
 * back arrow that has forgotten. Held in React state under the app shell, the
 * trail survives every client navigation (which is all of them) and resets on
 * a hard load, which is exactly when the reader has no history either.
 */

export type TrailEntry = {
  href: string;
  label: string;
};

type TrailValue = {
  trail: TrailEntry[];
  /** The record being looked at, if the current page is one. */
  current: TrailEntry | null;
  /** Called by a record page as it renders. */
  register: (entry: TrailEntry | null) => void;
  /** Called by a reference as it is followed. */
  follow: (from: TrailEntry) => void;
  /** Where the back arrow should go, or null to fall back to the list. */
  back: TrailEntry | null;
};

const RecordTrailContext = createContext<TrailValue | null>(null);

export function RecordTrailProvider({ children }: { children: ReactNode }) {
  const [trail, setTrail] = useState<TrailEntry[]>([]);
  const [current, setCurrent] = useState<TrailEntry | null>(null);

  // Registration happens in an effect on every record render; without this the
  // provider would re-render the whole app shell each time a record re-fetched
  // and re-registered the same href.
  const currentRef = useRef<TrailEntry | null>(null);

  const register = useCallback((entry: TrailEntry | null) => {
    const previous = currentRef.current;
    if (previous?.href === entry?.href && previous?.label === entry?.label) return;
    currentRef.current = entry;
    setCurrent(entry);

    if (!entry) return;

    // Arriving somewhere already on the trail means we went back — by the bar's
    // arrow, by the browser's, or by following a reference in a circle. Either
    // way the path ends here, so everything after it is gone.
    setTrail((existing) => {
      const index = existing.findIndex((item) => item.href === entry.href);
      return index === -1 ? existing : existing.slice(0, index);
    });
  }, []);

  const follow = useCallback((from: TrailEntry) => {
    setTrail((existing) => {
      if (existing.at(-1)?.href === from.href) return existing;
      // A path long enough to need scrolling is a path nobody is retracing by
      // hand. Keep the last ten hops and let the older ones go.
      return [...existing, from].slice(-10);
    });
  }, []);

  const value = useMemo<TrailValue>(
    () => ({ trail, current, register, follow, back: trail.at(-1) ?? null }),
    [trail, current, register, follow],
  );

  return <RecordTrailContext.Provider value={value}>{children}</RecordTrailContext.Provider>;
}

/**
 * The trail, or a dead one.
 *
 * Returns a no-op value rather than throwing when there is no provider: this
 * is read by `EntityLink`, which renders in sheets, previews and tests that
 * have no app shell around them, and a reference that throws because nothing
 * is tracking where you have been is a worse bug than one that does not know.
 */
export function useRecordTrail(): TrailValue {
  return useContext(RecordTrailContext) ?? DEAD_TRAIL;
}

const DEAD_TRAIL: TrailValue = {
  trail: [],
  current: null,
  register: () => {},
  follow: () => {},
  back: null,
};
