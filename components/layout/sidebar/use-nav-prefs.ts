"use client";

import * as React from "react";

import {
  NO_PREFS,
  parsePrefs,
  reordered,
  toggled,
  toggledPage,
  workspaceOrder,
  type NavListKey,
  type NavPrefs,
  type PinnedPage,
} from "@/lib/nav/prefs";

const KEY = "corelith.nav.v1:";

/*
  One store per workspace, shared by every part of the shell that reads it
  (the sidebar, the rail, the phone bar, the app bar's Pin), so pinning a page
  from the app bar shows in the sidebar at once. Kept in this browser; read
  after mount, since the server has no storage and a first paint that
  disagrees with the client is a hydration error rather than a preference.
*/
const cache = new Map<string, NavPrefs>();
const listeners = new Map<string, Set<() => void>>();

function read(workspaceKey: string): NavPrefs {
  const held = cache.get(workspaceKey);
  if (held) return held;
  let prefs = NO_PREFS;
  try {
    prefs = parsePrefs(window.localStorage.getItem(KEY + workspaceKey));
  } catch {
    prefs = NO_PREFS;
  }
  cache.set(workspaceKey, prefs);
  return prefs;
}

function write(workspaceKey: string, next: NavPrefs) {
  cache.set(workspaceKey, next);
  try {
    window.localStorage.setItem(KEY + workspaceKey, JSON.stringify(next));
  } catch {
    // Storage can be full or blocked; the arrangement holds for this visit.
  }
  for (const listener of listeners.get(workspaceKey) ?? []) listener();
}

function subscribe(workspaceKey: string, listener: () => void) {
  const set = listeners.get(workspaceKey) ?? new Set();
  set.add(listener);
  listeners.set(workspaceKey, set);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== KEY + workspaceKey) return;
    cache.delete(workspaceKey);
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    set.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** How this person arranged their sidebar, per workspace, and the ways to change it. */
export function useNavPrefs(workspaceKey: string) {
  const prefs = React.useSyncExternalStore(
    React.useCallback((listener) => subscribe(workspaceKey, listener), [workspaceKey]),
    () => read(workspaceKey),
    () => NO_PREFS,
  );

  const update = React.useCallback(
    (change: (current: NavPrefs) => NavPrefs) => write(workspaceKey, change(read(workspaceKey))),
    [workspaceKey],
  );

  const toggle = React.useCallback((key: NavListKey, id: string) => update((current) => toggled(current, key, id)), [update]);
  const togglePage = React.useCallback((page: PinnedPage) => update((current) => toggledPage(current, page)), [update]);
  const setOrder = React.useCallback((groupId: string, ids: string[]) => update((current) => reordered(current, groupId, ids)), [update]);
  const resetOrder = React.useCallback(() => update(workspaceOrder), [update]);

  return { prefs, toggle, togglePage, setOrder, resetOrder };
}
