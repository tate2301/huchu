"use client";

import { Tabs } from "@/components/workspace/tabs";
import type { ListSpecPublic } from "@/lib/reports/types";
import { formatCount } from "@/lib/workspace/format";

/**
 * Tabs (00-foundations 5.4.3): which slice of the subject, each with the
 * number of rows in it ignoring search and filters — the sizes of the tabs.
 * Only when the source declares them. A tab is not a filter.
 */
export function ListTabs({
  spec,
  tab,
  counts,
  onTab,
}: {
  spec: ListSpecPublic;
  tab: string | null;
  counts: Record<string, number> | null;
  onTab: (tab: string) => void;
}) {
  if (!spec.tabs?.length) return null;
  return (
    <Tabs
      aria-label={`${spec.noun} tabs`}
      items={spec.tabs.map((entry) => ({
        value: entry.key,
        label: entry.label,
        count: counts ? formatCount(counts[entry.key] ?? 0) : "—",
      }))}
      value={tab ?? spec.tabs[0]!.key}
      onValueChange={onTab}
      style={{ flex: "none", background: "var(--surface)" }}
    />
  );
}
