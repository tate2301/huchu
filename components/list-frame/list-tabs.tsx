"use client";

import { Tabs } from "@/components/workspace/tabs";
import type { ListSpecPublic } from "@/lib/reports/types";
import { formatCount, formatMoney } from "@/lib/workspace/format";

/**
 * Tabs (00-foundations 5.4.3): which slice of the subject, each with the
 * number of rows in it ignoring search and filters — the sizes of the tabs.
 * Only when the source declares them. A tab is not a filter. A tab with a
 * money badge shows its sum instead ("Held for customers US$84.30").
 */
export function ListTabs({
  spec,
  tab,
  counts,
  sums,
  onTab,
}: {
  spec: ListSpecPublic;
  tab: string | null;
  counts: Record<string, number> | null;
  sums?: Record<string, number> | null;
  onTab: (tab: string) => void;
}) {
  if (!spec.tabs?.length) return null;
  return (
    <Tabs
      aria-label={`${spec.noun} tabs`}
      items={spec.tabs.map((entry) => ({
        value: entry.key,
        label: entry.label,
        count: entry.badge
          ? sums
            ? formatMoney(sums[entry.key] ?? 0, entry.badge.currency)
            : "—"
          : counts
            ? formatCount(counts[entry.key] ?? 0)
            : "—",
      }))}
      value={tab ?? spec.tabs[0]!.key}
      onValueChange={onTab}
      style={{ flex: "none", background: "var(--surface)" }}
    />
  );
}
