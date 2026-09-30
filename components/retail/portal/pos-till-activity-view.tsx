"use client";

/**
 * What this till has done, as a timeline.
 *
 * S-7.6, contract surface 16. The rows come from `pos/activity`, which derives
 * them from `RetailSale`, `RetailCashMovement` and `RetailShift` — see
 * `lib/retail/till-activity.ts` for why that is a derived view rather than an
 * audit trail, and for the two sign traps it exists to avoid.
 *
 * A failed read never renders as an empty log: a shop investigating a
 * shortfall would read "nothing here" as "nothing happened".
 */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { fetchJson } from "@/lib/api-client";
import { Clock, Coins, Info, Percent, Receipt, ReceiptLong, XCircle } from "@/lib/icons";
import { formatRetailDateTime } from "@/lib/retail/words";
/*
  `till-activity-shared`, never `till-activity`. The latter imports `lib/money`
  → `lib/prisma` → `pg` → `dns`, and importing it here failed the build with
  `Module not found: Can't resolve 'dns'`. The shared module has no imports for
  exactly this reason; see its header.
*/
import {
  TILL_ACTIVITY_FILTERS,
  filterTillActivity,
  type TillActivityEntry,
  type TillActivityKind,
} from "@/lib/retail/till-activity-shared";
import type { LucideIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";

import { PosEmptyState, PosPanel } from "./pos-primitives";

type ActivityPayload = {
  entries: TillActivityEntry[];
  counts: Record<TillActivityKind, number>;
  windowDays: number;
};

const KIND_ICON: Record<TillActivityKind, LucideIcon> = {
  sale: Receipt,
  refund: ReceiptLong,
  void: XCircle,
  override: Percent,
  cash: Coins,
  shift: Clock,
};

const KIND_TONE: Record<TillActivityKind, "brand" | "success" | "warning" | "danger" | "neutral"> = {
  sale: "success",
  refund: "warning",
  void: "danger",
  override: "brand",
  cash: "neutral",
  shift: "neutral",
};

const TONE_SWATCH: Record<string, { bg: string; text: string }> = {
  brand: { bg: "var(--pos-status-info-bg)", text: "var(--pos-status-info-text)" },
  success: { bg: "var(--pos-status-success-bg)", text: "var(--pos-status-success-text)" },
  warning: { bg: "var(--pos-status-warning-bg)", text: "var(--pos-status-warning-text)" },
  danger: { bg: "var(--pos-status-danger-bg)", text: "var(--pos-status-danger-text)" },
  neutral: { bg: "var(--surface-muted)", text: "var(--text-muted)" },
};

/**
 * The amount, exactly as the server signed it.
 *
 * Never parsed to a number and re-formatted: it arrives as a fixed-2 string in
 * the base currency and the whole point of `till-activity.ts` is that the sign
 * is already correct. A reader that re-signed it would put a void back to
 * positive, which is the specific bug the prototype has.
 */
function Amount({ value }: { value: string }) {
  const negative = value.startsWith("-");
  return (
    <span
      className={cn(
        "font-mono text-sm font-black tabular-nums",
        negative ? "text-[var(--pos-status-danger-text)]" : "text-[var(--text-strong)]",
      )}
    >
      {negative ? `−${value.slice(1)}` : value}
    </span>
  );
}

export function PosTillActivityView() {
  const [kind, setKind] = useState<TillActivityKind | "all">("all");

  const activityQuery = useQuery({
    queryKey: ["retail-pos-activity"],
    queryFn: () => fetchJson<{ data: ActivityPayload }>("/api/v2/retail/pos/activity"),
  });

  const payload = activityQuery.data?.data ?? null;
  const entries = useMemo(() => payload?.entries ?? [], [payload?.entries]);
  const shown = useMemo(() => filterTillActivity(entries, kind), [entries, kind]);
  const filterLabel = TILL_ACTIVITY_FILTERS.find((filter) => filter.id === kind)?.label ?? "";

  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-4">
      <PosPanel>
        {/* Filter chips. Counts included so an empty filter is visibly empty
            rather than looking like a screen that failed to load. */}
        <div className="flex flex-wrap gap-1.5">
          {TILL_ACTIVITY_FILTERS.map((filter) => {
            const count =
              filter.id === "all" ? entries.length : payload?.counts?.[filter.id] ?? 0;
            const active = kind === filter.id;
            return (
              <button
                key={filter.id}
                type="button"
                onClick={() => setKind(filter.id)}
                className={cn(
                  "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
                  active
                    ? "border-[var(--action-primary-bg)] bg-[color-mix(in_srgb,var(--action-primary-bg)_10%,var(--surface-base))] text-[var(--action-primary-bg)]"
                    : "border-[var(--border-default)] bg-[var(--surface-muted)] text-[var(--text-muted)] hover:border-[var(--action-primary-bg)] hover:text-[var(--text-strong)]",
                )}
              >
                {filter.label}
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums",
                    active
                      ? "bg-[var(--action-primary-bg)] text-white"
                      : "bg-[var(--surface-base)] text-[var(--text-muted)]",
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </PosPanel>

      <PosPanel className="flex min-h-0 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {shown.length === 0 ? (
            /*
              A failed read must never render as "nothing recorded". On this
              screen the difference is the whole point: an empty timeline is a
              claim that nothing happened at this till, and somebody looking
              into a shortfall would take it as one.
            */
            <PosEmptyState
              icon={Info}
              title={
                activityQuery.isError
                  ? "The activity would not load"
                  : activityQuery.isLoading
                    ? "Loading the activity…"
                    : kind === "all"
                      ? "No activity yet"
                      : `No ${filterLabel.toLowerCase()} yet`
              }
            />
          ) : (
            <ol className="divide-y divide-[var(--edge-subtle)]">
              {shown.map((entry) => {
                const Icon = KIND_ICON[entry.kind];
                const swatch = TONE_SWATCH[KIND_TONE[entry.kind]];
                return (
                  <li key={entry.id} className="flex items-start gap-3 py-3">
                    <span
                      className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                      style={{ background: swatch.bg, color: swatch.text }}
                    >
                      <Icon className="h-4 w-4" />
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <span className="text-sm font-semibold text-[var(--text-strong)]">
                          {entry.title}
                        </span>
                        {entry.shiftNo ? (
                          <span className="font-mono text-[11px] text-[var(--text-muted)]">
                            {entry.shiftNo}
                          </span>
                        ) : null}
                      </div>
                      {entry.detail ? (
                        <p className="mt-0.5 text-xs leading-5 text-[var(--text-muted)]">
                          {entry.detail}
                        </p>
                      ) : null}
                      <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                        {formatRetailDateTime(entry.at)}
                        {entry.actor ? ` · ${entry.actor}` : ""}
                      </p>
                    </div>

                    {entry.amount === null ? null : (
                      <div className="shrink-0 pt-0.5 text-right">
                        <Amount value={entry.amount} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </div>

      </PosPanel>
    </div>
  );
}
