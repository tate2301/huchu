"use client";

import { Badge } from "@/components/ui/badge";
import { NavRail, NavRailItem } from "@/components/ui/nav-rail";
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
    <NavRail
      label="Import sections"
      className="w-44 shrink-0 border-r border-[--border] bg-[--surface-base] p-2"
    >
      {TABS.map(({ id, label, icon: Icon }) => {
        const badgeCount =
          id === "ledger" && anomalyCount && anomalyCount > 0
            ? anomalyCount
            : id === "exceptions" && exceptionCount && exceptionCount > 0
              ? exceptionCount
              : null;

        return (
          <NavRailItem
            key={id}
            active={id === active}
            onClick={() => onChange(id)}
            icon={<Icon className="size-4" />}
            trailing={
              badgeCount ? (
                <Badge
                  variant={id === "exceptions" ? "destructive" : "warning"}
                  className="h-4 min-w-[1rem] justify-center px-1 text-[10px] tabular-nums"
                >
                  {badgeCount > 99 ? "99+" : badgeCount}
                </Badge>
              ) : null
            }
          >
            {label}
          </NavRailItem>
        );
      })}
    </NavRail>
  );
}
