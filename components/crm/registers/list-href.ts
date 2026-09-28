"use client";

import { useSyncExternalStore } from "react";

import { REGISTERS, type EngineRegisterKey } from "@/lib/crm/registers/registry";

function storageKey(key: string) {
  return `huchu.register.${key}.last`;
}

/**
 * Remember the address a list was last looked at in this tab — its canonical
 * query string — for its records' back links. An empty one forgets it: the
 * list was left at its front door.
 */
export function rememberListQuery(key: string, query: string) {
  try {
    if (query) window.sessionStorage.setItem(storageKey(key), query);
    else window.sessionStorage.removeItem(storageKey(key));
  } catch {
    // Storage refused (a private window): back goes to the list's front door.
  }
}

function readListQuery(key: string): string | null {
  try {
    return window.sessionStorage.getItem(storageKey(key));
  } catch {
    return null;
  }
}

/** Nothing to subscribe to: the list is written before a record is opened, and read once there. */
const subscribe = () => () => {};

/**
 * Where a record's back link goes: its list as it was last looked at in this
 * tab — Deals narrowed to mine, grouped by stage, on page 2 — rather than the
 * list's front door, the way a browser's back button would have it. The
 * server and the first render use the bare list, which is also where a
 * record opened from a link lands.
 */
export function useListHref(key: EngineRegisterKey): string {
  const route = REGISTERS[key].route;
  const query = useSyncExternalStore(subscribe, () => readListQuery(key), () => null);
  return query ? `${route}?${query}` : route;
}
