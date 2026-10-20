"use client";

import * as React from "react";

const noopSubscribe = () => () => {};

/**
 * True once the page has hydrated. The query cache is persisted for offline
 * use, so what it holds is read only after hydration: until then a page draws
 * what the server drew.
 */
export function useMounted(): boolean {
  return React.useSyncExternalStore(noopSubscribe, () => true, () => false);
}
