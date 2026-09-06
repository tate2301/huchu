"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
} from "react";

import type { ParentChild, ParentHousehold } from "@/lib/schools/parent-household-loader";

/**
 * Which child the parent is looking at.
 *
 * S-6.2. The choice belongs to the shell, not to each screen: a parent with three
 * children who picks Tendai on Home and then opens Fees expects Tendai's fees.
 * Holding it per screen is how a portal ends up showing one child's attendance
 * above another child's balance, which is worse than showing nothing.
 *
 * Persisted in `localStorage` rather than in the URL. A parent's phone reopens on
 * the child they were last dealing with, and a child id in the address bar is one
 * somebody can edit — the server never trusts it either way (the household is
 * loaded from the session), but there is no reason to invite the attempt.
 */

const STORAGE_KEY = "schools.portal.parent.child";

/**
 * The store behind `useSyncExternalStore`.
 *
 * Module scope, one per tab, which is the right lifetime: the choice is a property
 * of this browser rather than of any component that happens to be mounted.
 */
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  // `storage` fires when another tab changes it, so two tabs open on the portal do
  // not disagree about which child is being looked at.
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function getStoredChild(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

type ParentPortalValue = ParentHousehold & {
  /** The child in view. Null only when the household has none. */
  child: ParentChild | null;
  selectChild: (id: string) => void;
};

const ParentPortalContext = createContext<ParentPortalValue | null>(null);

export function ParentPortalProvider({
  household,
  children,
}: {
  household: ParentHousehold;
  children: React.ReactNode;
}) {
  /**
   * The stored choice, read through `useSyncExternalStore`.
   *
   * Three wrong ways to do this, all of which this codebase has paid for. Reading
   * `localStorage` in a lazy `useState` initialiser makes the first client render
   * differ from the server's, which is a hydration error — caveat 21, three times
   * over. Setting it from an effect renders one frame with the wrong child
   * selected, which is a frame showing another child's balance. And reading it in
   * render unguarded throws on the server.
   *
   * `useSyncExternalStore` is the sanctioned answer for exactly this: a mutable
   * value outside React. `getServerSnapshot` returns null, so the server and the
   * first client render agree, and React then re-renders with the real snapshot.
   */
  const selectedId = useSyncExternalStore(subscribe, getStoredChild, () => null);

  const selectChild = useCallback((id: string) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // A blocked localStorage is not a reason to break the portal.
    }
    // Notifies this tab. `storage` only fires in *other* tabs, so without this the
    // chip a parent just tapped would not become the selected one.
    listeners.forEach((listener) => listener());
  }, []);

  const value = useMemo<ParentPortalValue>(() => {
    // The stored id may name a child who has left the school, so it is resolved
    // against the household rather than trusted.
    const child =
      household.children.find((candidate) => candidate.id === selectedId) ??
      household.children[0] ??
      null;
    return { ...household, child, selectChild };
  }, [household, selectChild, selectedId]);

  return (
    <ParentPortalContext.Provider value={value}>{children}</ParentPortalContext.Provider>
  );
}

export function useParentPortal(): ParentPortalValue {
  const value = useContext(ParentPortalContext);
  if (!value) {
    throw new Error("useParentPortal must be used inside the parent portal shell");
  }
  return value;
}
