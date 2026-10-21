"use client";

import * as React from "react";

import { NO_PREFS, parsePrefs, toggled, type NavPrefs } from "@/lib/nav/prefs";

const KEY = "corelith.nav.v1:";

/**
 * How this person arranged their sidebar, kept in this browser, per
 * workspace. It is read after mount, since the server has no storage and a
 * first paint that disagrees with the client is a hydration error rather
 * than a preference.
 */
export function useNavPrefs(workspaceKey: string) {
  const [prefs, setPrefs] = React.useState<NavPrefs>(NO_PREFS);

  React.useEffect(() => {
    try {
      setPrefs(parsePrefs(window.localStorage.getItem(KEY + workspaceKey)));
    } catch {
      setPrefs(NO_PREFS);
    }
  }, [workspaceKey]);

  const toggle = React.useCallback(
    (key: keyof NavPrefs, id: string) => {
      setPrefs((current) => {
        const next = toggled(current, key, id);
        try {
          window.localStorage.setItem(KEY + workspaceKey, JSON.stringify(next));
        } catch {
          // Storage can be full or blocked; the arrangement holds for this visit.
        }
        return next;
      });
    },
    [workspaceKey],
  );

  return { prefs, toggle };
}
