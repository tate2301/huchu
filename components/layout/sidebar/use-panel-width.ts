"use client";

import * as React from "react";
import { useSession } from "next-auth/react";

/** A panel that resizes from its edge: where it starts and how far it goes. */
export type PanelWidthSpec = { initial: number; min: number; max: number };

export function clampWidth(spec: PanelWidthSpec, width: number): number {
  if (!Number.isFinite(width)) return spec.initial;
  return Math.round(Math.min(spec.max, Math.max(spec.min, width)));
}

/** Where a person's width for one panel is kept. Signed out, nobody's is. */
export function panelWidthKey(panel: string, userId: string | null | undefined): string | null {
  return userId ? `panel-width:${panel}:${userId}` : null;
}

/** A width as stored, checked: anything missing, unreadable or out of bounds falls back. */
export function readPanelWidth(spec: PanelWidthSpec, raw: string | null): number {
  const value = raw === null ? Number.NaN : Number(raw);
  return Number.isFinite(value) ? clampWidth(spec, value) : spec.initial;
}

/**
 * One panel's width for the person signed in, kept in this browser under
 * their id, as the builders keep theirs (`use-panel-sizes.ts`). Read after
 * mount, since the server has no storage and the first paint must match it;
 * storage that is blocked or full only means the width is not kept.
 */
export function usePanelWidth(panel: string, spec: PanelWidthSpec | null) {
  const { data: session } = useSession();
  const userId = (session?.user as { id?: string } | undefined)?.id ?? null;
  const key = spec ? panelWidthKey(panel, userId) : null;
  const initial = spec?.initial ?? 0;
  const min = spec?.min ?? 0;
  const max = spec?.max ?? 0;
  const [width, setWidth] = React.useState(initial);

  React.useEffect(() => {
    if (!max) return;
    let raw: string | null = null;
    try {
      raw = key ? window.localStorage.getItem(key) : null;
    } catch {
      raw = null;
    }
    setWidth(readPanelWidth({ initial, min, max }, raw));
  }, [key, initial, min, max]);

  /** While dragging: the width changes, nothing is written yet. */
  const resize = React.useCallback(
    (next: number) => {
      if (max) setWidth(clampWidth({ initial, min, max }, next));
    },
    [initial, min, max],
  );

  /** On letting go: the width as it is now is this person's. */
  const keep = React.useCallback(() => {
    if (!key) return;
    setWidth((current) => {
      try {
        window.localStorage.setItem(key, String(current));
      } catch {
        // Blocked or full: the width holds for this visit.
      }
      return current;
    });
  }, [key]);

  return { width, resize, keep };
}
