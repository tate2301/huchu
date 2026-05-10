"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Dashboard,
  TableRows,
  GitCompare,
  Gem,
  LocalShipping,
  ReceiptLong,
  Coins,
  Layers,
  AlertCircle,
} from "@/lib/icons";

export type StudioTab =
  | "overview"
  | "ledger"
  | "mappings"
  | "pours"
  | "allocations"
  | "dispatches"
  | "receipts"
  | "payouts"
  | "exceptions";

// Imports never produce purchases — that's a domain rule.
// Allocations get their own tab.
const TABS: Array<{
  id: StudioTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: "overview", label: "Overview", icon: Dashboard },
  { id: "ledger", label: "Ledger", icon: TableRows },
  { id: "mappings", label: "Mappings", icon: GitCompare },
  { id: "pours", label: "Pours", icon: Gem },
  { id: "allocations", label: "Allocations", icon: Layers },
  { id: "dispatches", label: "Dispatches", icon: LocalShipping },
  { id: "receipts", label: "Receipts", icon: ReceiptLong },
  { id: "payouts", label: "Payouts", icon: Coins },
  { id: "exceptions", label: "Exceptions", icon: AlertCircle },
];

export function ImportTabRail({
  active,
  onChange,
  anomalyCount,
  exceptionCount,
}: {
  active: StudioTab;
  onChange: (tab: StudioTab) => void;
  anomalyCount?: number;
  exceptionCount?: number;
}) {
  return (
    <nav
      aria-label="Import sections"
      className="flex w-44 shrink-0 flex-col gap-0.5 border-r border-[--border] bg-[--surface-base] p-2"
    >
      {TABS.map(({ id, label, icon: Icon }) => {
        const isActive = id === active;
        const badgeCount =
          id === "ledger" && anomalyCount && anomalyCount > 0
            ? anomalyCount
            : id === "exceptions" && exceptionCount && exceptionCount > 0
              ? exceptionCount
              : null;

        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              // Base: shadcn button-like sizing + typography from the design system
              "group relative flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
              isActive
                ? // Active: solid surface + primary text + a left accent bar so
                  // the selection is unmissable across both light and dark
                  // themes (the previous border-r approach was easy to miss).
                  "bg-[--action-secondary-bg] text-[--action-primary-bg] shadow-[inset_2px_0_0_0_var(--action-primary-bg)]"
                : "text-[--text-muted] hover:bg-[--surface-muted] hover:text-[--text-strong]",
            )}
          >
            <Icon
              className={cn(
                "h-4 w-4 shrink-0",
                isActive ? "" : "text-[--text-subtle] group-hover:text-[--text-muted]",
              )}
            />
            <span className="flex-1 truncate">{label}</span>
            {badgeCount ? (
              <Badge
                variant={id === "exceptions" ? "destructive" : "warning"}
                className="h-4 min-w-[1rem] justify-center px-1 text-[10px] tabular-nums"
              >
                {badgeCount > 99 ? "99+" : badgeCount}
              </Badge>
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}
