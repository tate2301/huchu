"use client";

import * as React from "react";

/**
 * Which workspace this person is standing in.
 *
 * A preference, not a fact about the company: a group that runs a school and a
 * shop has two workspaces at all times, and which one you opened last is yours.
 * So it is held here rather than on the session, and it is keyed by company —
 * the same person in two tenants keeps two answers.
 *
 * Stored ids are never trusted: a module can be switched off between two sign
 * ins, and `getWorkspaceSidebarModel` falls back to the tenant's own profile
 * when the stored id no longer names a workspace.
 */
const STORAGE_PREFIX = "rail-workspace:";

function read(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(STORAGE_PREFIX + key);
  } catch {
    // A private window, or cleared site data. Not worth breaking navigation.
    return null;
  }
}

function write(key: string, id: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_PREFIX + key, id);
  } catch {
    // Storage full or blocked. The choice holds for this session.
  }
}

export function useActiveWorkspace(companyKey: string) {
  const [activeWorkspaceId, setId] = React.useState<string | null>(null);

  // After mount, not during render: the server has no localStorage, and a
  // first paint that disagrees with the client is a hydration error rather
  // than a preference.
  React.useEffect(() => {
    setId(read(companyKey));
  }, [companyKey]);

  const select = React.useCallback(
    (id: string) => {
      write(companyKey, id);
      setId(id);
    },
    [companyKey],
  );

  return { activeWorkspaceId, select };
}
