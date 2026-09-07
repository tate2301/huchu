"use client";

import * as React from "react";

/**
 * Which columns a person wants to see, remembered per surface.
 *
 * Every table in here shows every column it knows how to render, which is the
 * right default and the wrong permanent state: somebody chasing overdue
 * invoices does not need the source channel, and somebody reconciling does not
 * need the next task. Hiding a column is not filtering — the rows are the
 * same — so it is a preference, and preferences that reset on reload are worse
 * than no preference at all.
 *
 * Stored in localStorage rather than on the server on purpose. It is per
 * person and per device, it changes constantly while somebody is working, and
 * a round trip for "hide the source column" would be a round trip nobody asked
 * for. Saved views are where a deliberate, shareable arrangement belongs.
 */
export type ColumnOption = {
  id: string;
  label: string;
  /** A column the surface falls apart without — the name column, usually. */
  required?: boolean;
  /** Off until somebody turns it on. */
  hiddenByDefault?: boolean;
};

const PREFIX = "huchu.columns.";

function read(storageKey: string): string[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PREFIX + storageKey);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((value): value is string => typeof value === "string");
  } catch {
    // A corrupt preference is not worth a broken table.
    return null;
  }
}

function write(storageKey: string, hidden: string[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PREFIX + storageKey, JSON.stringify(hidden));
  } catch {
    // Private browsing, a full quota — the table still works, it just forgets.
  }
}

export function defaultHidden(columns: ColumnOption[]): string[] {
  return columns
    .filter((column) => column.hiddenByDefault && !column.required)
    .map((column) => column.id);
}

export type VisibleColumns = {
  /** Ids currently hidden. */
  hidden: string[];
  isVisible: (id: string) => boolean;
  toggle: (id: string) => void;
  showAll: () => void;
  reset: () => void;
  /** How many are hidden, for the button's badge. */
  hiddenCount: number;
};

export function useVisibleColumns(
  storageKey: string,
  columns: ColumnOption[],
): VisibleColumns {
  const fallback = React.useMemo(() => defaultHidden(columns), [columns]);
  const [hidden, setHidden] = React.useState<string[]>(fallback);

  // Read after mount rather than during, so the server and the first client
  // render agree and hydration does not warn about a table that lost a column.
  const [loadedFor, setLoadedFor] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (loadedFor === storageKey) return;
    setLoadedFor(storageKey);
    const stored = read(storageKey);
    setHidden(stored ?? fallback);
  }, [fallback, loadedFor, storageKey]);

  const required = React.useMemo(
    () => new Set(columns.filter((column) => column.required).map((column) => column.id)),
    [columns],
  );

  const persist = React.useCallback(
    (next: string[]) => {
      setHidden(next);
      write(storageKey, next);
    },
    [storageKey],
  );

  const toggle = React.useCallback(
    (id: string) => {
      if (required.has(id)) return;
      persist(
        hidden.includes(id) ? hidden.filter((value) => value !== id) : [...hidden, id],
      );
    },
    [hidden, persist, required],
  );

  const showAll = React.useCallback(() => persist([]), [persist]);
  const reset = React.useCallback(() => persist(fallback), [fallback, persist]);

  const hiddenSet = React.useMemo(() => new Set(hidden), [hidden]);
  const isVisible = React.useCallback(
    (id: string) => !hiddenSet.has(id),
    [hiddenSet],
  );

  return {
    hidden,
    isVisible,
    toggle,
    showAll,
    reset,
    hiddenCount: hidden.length,
  };
}
