"use client";

import * as React from "react";
import { useSession } from "next-auth/react";

import { clampSize, DEFAULT_SIZES, readSizes, sizesKey, type PanelName, type PanelSizes } from "./sizes";

/**
 * A builder's panel sizes for the person signed in, kept in this browser under
 * their id: one person's widths never become another's on a shared machine.
 * Read after mount, since the server has no storage and the first paint must
 * match it; storage that is blocked or full only means the sizes are not kept.
 */
export function usePanelSizes(scope: string) {
  const { data: session } = useSession();
  const userId = (session?.user as { id?: string } | undefined)?.id ?? null;
  const key = sizesKey(scope, userId);
  const [sizes, setSizes] = React.useState<PanelSizes>(DEFAULT_SIZES);

  React.useEffect(() => {
    if (!key) return;
    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem(key);
    } catch {
      raw = null;
    }
    setSizes(readSizes(raw));
  }, [key]);

  /** While dragging: the size changes, nothing is written yet. */
  const resize = React.useCallback((panel: PanelName, size: number) => {
    setSizes((current) => ({ ...current, [panel]: clampSize(panel, size) }));
  }, []);

  /** On letting go: the sizes as they are now are this person's. */
  const keep = React.useCallback(
    (next?: PanelSizes) => {
      if (!key) return;
      setSizes((current) => {
        const sizes = next ?? current;
        try {
          window.localStorage.setItem(key, JSON.stringify(sizes));
        } catch {
          // Blocked or full: the sizes hold for this visit.
        }
        return sizes;
      });
    },
    [key],
  );

  return { sizes, resize, keep };
}
