"use client";

import { cn } from "@/lib/utils";
import {
  Dashboard,
  TableRows,
  GitCompare,
  Gem,
  ShoppingBag,
  LocalShipping,
  ReceiptLong,
  Coins,
  AlertCircle,
} from "@/lib/icons";

export type StudioTab =
  | "overview"
  | "ledger"
  | "mappings"
  | "pours"
  | "purchases"
  | "dispatches"
  | "receipts"
  | "payouts"
  | "exceptions";

const TABS: Array<{ id: StudioTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: "overview", label: "Overview", icon: Dashboard },
  { id: "ledger", label: "Ledger", icon: TableRows },
  { id: "mappings", label: "Mappings", icon: GitCompare },
  { id: "pours", label: "Pours", icon: Gem },
  { id: "purchases", label: "Purchases", icon: ShoppingBag },
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
      className="flex w-44 shrink-0 flex-col border-r border-[--border] bg-[--surface-base] py-2"
    >
      {TABS.map(({ id, label, icon: Icon }) => {
        const isActive = id === active;
        const badge =
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
              "flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium transition-colors text-left",
              isActive
                ? "bg-[--action-secondary-bg] text-[--action-primary-bg] border-r-2 border-[--action-primary-bg]"
                : "text-[--text-muted] hover:bg-[--surface-muted] hover:text-[--text-strong]",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="flex-1 truncate">{label}</span>
            {badge ? (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                  id === "exceptions"
                    ? "bg-rose-100 text-rose-700"
                    : "bg-amber-100 text-amber-700",
                )}
              >
                {badge > 99 ? "99+" : badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}
