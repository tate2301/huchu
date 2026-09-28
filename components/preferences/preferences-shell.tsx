"use client";

import * as React from "react";

import { SettingsFrame } from "@/components/settings/management-shell";

export type PreferencesShellProps = {
  /** The fallback title line. A converted page puts its own `RecordHeader` in `children` instead. */
  title?: string;
  /**
   * Rule 1: never rendered. This shell used to draw it as a muted paragraph at
   * the top of the content, which is exactly the descriptive helper text the
   * design review deleted. Kept in the type so the pages still passing one
   * keep compiling while their owners remove them.
   */
  description?: string;
  /** The page's one verb, drawn in the fallback title line rather than teleported into the app bar. */
  actions?: React.ReactNode;
  /** Counts for the rail, keyed by nav entry id. See `SettingsFrame`. */
  railCounts?: Record<string, number>;
  railAttention?: string[];
  children: React.ReactNode;
};

/**
 * Account and organization preferences.
 *
 * This is `SettingsFrame` under its other name. The two shells drew the same
 * surface with different chrome and two different rails — Account/Organization
 * here, Settings/<area> there — and Branding and Templates rendered the
 * management one from inside a `/preferences` route, so the rail swapped out
 * mid-surface. `Rail.dc.html` draws one rail for both: People, Operations,
 * Compliance, Company, School, My account.
 *
 * The name stays because every `/preferences` page imports it and those pages
 * belong to other people. What it renders is the shared surface.
 *
 * Nothing about access changed. The rail's `/preferences` entries are still
 * filtered by `canViewPreferenceItem`, item id for item id, and every page
 * behind them still runs `requirePreferencesAccess` on the server.
 */
export function PreferencesShell({
  title,
  actions,
  railCounts,
  railAttention,
  children,
}: PreferencesShellProps) {
  return (
    <SettingsFrame
      title={title}
      actions={actions}
      railCounts={railCounts}
      railAttention={railAttention}
    >
      {children}
    </SettingsFrame>
  );
}
