"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { LIST_PAGE_SIZES } from "@/lib/reports/types";

/**
 * The list's address (00-foundations 5.4.14): `?tab=&q=&<filter>=&sort=&group=&page=&size=`,
 * defaults omitted. The frame reads it on load and writes it on every change —
 * `replace` for everything but a page change, which pushes, so Back steps
 * through pages and not keystrokes. Other parameters on the address (an open
 * sheet's `sheet` and `id`) are left as they are.
 *
 * Rows per page and hidden columns also live in this browser per list
 * (`huchu.list.<key>.size`, `huchu.list.<key>.cols`); the address wins.
 */

/** Parameters that belong to something else on the page, not to the list. */
const NOT_THE_LIST = new Set(["sheet", "id", "ids"]);

export type ListAddressPatch = {
  tab?: string | null;
  q?: string | null;
  sort?: string | null;
  group?: string | null;
  page?: number | null;
  size?: number | null;
  filters?: Record<string, string | null>;
};

function storageKey(source: string, what: "size" | "cols") {
  return `huchu.list.${source}.${what}`;
}

function readStored(source: string, what: "size" | "cols"): string | null {
  try {
    return window.localStorage.getItem(storageKey(source, what));
  } catch {
    return null;
  }
}

function writeStored(source: string, what: "size" | "cols", value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(storageKey(source, what));
    else window.localStorage.setItem(storageKey(source, what), value);
  } catch {
    // Private windows and blocked storage: the address still carries it.
  }
}

export function useListAddress(source: string) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // What this browser remembers, read once it is mounted (the server has no storage).
  const [storedSize, setStoredSize] = React.useState<string | null>(null);
  const [storedCols, setStoredCols] = React.useState<string[] | null>(null);
  const [ready, setReady] = React.useState(false);
  React.useEffect(() => {
    const cols = readStored(source, "cols");
    // Browser storage is only readable after mount.
    setStoredSize(readStored(source, "size"));
    setStoredCols(cols === null ? null : cols.split(",").filter(Boolean));
    setReady(true);
  }, [source]);

  /** The list's own parameters, as the API takes them. */
  const listParams = React.useMemo(() => {
    const params = new URLSearchParams();
    for (const [key, value] of searchParams) if (!NOT_THE_LIST.has(key)) params.append(key, value);
    if (!params.has("size") && storedSize && (LIST_PAGE_SIZES as readonly number[]).includes(Number(storedSize))) {
      params.set("size", storedSize);
    }
    if (!params.has("page")) params.set("page", "1");
    if (storedCols?.length) params.set("cols", storedCols.join(","));
    return params;
  }, [searchParams, storedCols, storedSize]);

  const write = React.useCallback(
    (patch: ListAddressPatch, defaults: { tab?: string | null; sort?: string; group?: string | null; filters?: Record<string, string> }) => {
      const next = new URLSearchParams(searchParams.toString());
      const set = (key: string, value: string | null | undefined, fallback?: string | null) => {
        if (value === undefined) return;
        if (value === null || value === "" || value === fallback) next.delete(key);
        else next.set(key, value);
      };
      set("tab", patch.tab, defaults.tab);
      set("q", patch.q);
      set("sort", patch.sort, defaults.sort);
      if (patch.group !== undefined) set("group", patch.group ?? "none", defaults.group ?? "none");
      for (const [key, value] of Object.entries(patch.filters ?? {})) set(key, value, defaults.filters?.[key] ?? "any");
      if (patch.size !== undefined) {
        set("size", patch.size === null ? null : String(patch.size), "50");
        const size = patch.size === null ? null : String(patch.size);
        writeStored(source, "size", size);
        setStoredSize(size);
      }
      // Anything but a page change starts again at page 1 (rule 3).
      const pageChange = patch.page !== undefined;
      if (pageChange) set("page", patch.page === null ? null : String(patch.page), "1");
      else next.delete("page");
      const query = next.toString();
      const href = query ? `${pathname}?${query}` : pathname;
      if (pageChange) router.push(href, { scroll: false });
      else router.replace(href, { scroll: false });
    },
    [pathname, router, searchParams, source],
  );

  const setHidden = React.useCallback(
    (hidden: string[]) => {
      setStoredCols(hidden);
      writeStored(source, "cols", hidden.length ? hidden.join(",") : null);
    },
    [source],
  );

  return { listParams, write, hidden: storedCols, setHidden, ready };
}
