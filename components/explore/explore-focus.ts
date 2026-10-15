"use client";

import * as React from "react";

/**
 * What the question on screen reads, for Explore's panel: the panel lives in
 * the shell, beside the page, so the studio tells it here which tables to
 * mark as open.
 */

let reads: readonly string[] = [];
const listeners = new Set<() => void>();

export function setExploreReads(next: readonly string[]) {
  if (next.length === reads.length && next.every((name, index) => name === reads[index])) return;
  reads = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const EMPTY: readonly string[] = [];

export function useExploreReads(): readonly string[] {
  return React.useSyncExternalStore(subscribe, () => reads, () => EMPTY);
}
