"use client";

import * as React from "react";

/**
 * The pins, which are the one thing in the rail a person owns.
 *
 * Kept per workspace: the same person in two companies keeps two sets, and
 * neither leaks into the other. Turning a module off does not delete a pin
 * into it — the href simply stops resolving and the pin waits, which is why
 * this stores hrefs rather than resolved items.
 */
const STORAGE_PREFIX = "rail-pins:";

function read(key: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((h): h is string => typeof h === "string")
      : [];
  } catch {
    // A private window, cleared site data, or a value somebody else wrote.
    // None of them are worth breaking navigation over.
    return [];
  }
}

function write(key: string, hrefs: string[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(hrefs));
  } catch {
    // Storage can be full or blocked. The pins stay in memory for this
    // session; nothing else depends on them.
  }
}

export function usePins(workspaceKey: string, capacity: number) {
  const [pins, setPins] = React.useState<string[]>([]);

  // Read after mount rather than during render: the server has no
  // localStorage, and a first paint that disagrees with the client is a
  // hydration error rather than a preference.
  React.useEffect(() => {
    setPins(read(workspaceKey));
  }, [workspaceKey]);

  const isPinned = React.useCallback(
    (href: string) => pins.includes(href),
    [pins],
  );

  const toggle = React.useCallback(
    (href: string) => {
      setPins((current) => {
        const next = current.includes(href)
          ? current.filter((h) => h !== href)
          : [...current, href].slice(-Math.max(0, capacity));
        write(workspaceKey, next);
        return next;
      });
    },
    [capacity, workspaceKey],
  );

  return { pins: pins.slice(0, capacity), isPinned, toggle };
}
