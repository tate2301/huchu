"use client";

/**
 * What this till has done, as a timeline.
 *
 * S-7.6, contract surface 16. The rows come from `pos/activity`, which derives
 * them from `RetailSale`, `RetailCashMovement` and `RetailShift` — see
 * `lib/retail/till-activity.ts` for why that is a derived view rather than an
 * audit trail, and for the two sign traps it exists to avoid.
 *
 * The screen states that limit out loud at the bottom. A log that quietly
 * implies completeness is worse than no log: a shop investigating a shortfall
 * would read "nothing here" as "nothing happened", when what it means is
 * "nothing that writes a row happened".
 */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { fetchJson } from "@corelithzw/platform/api-client";
import { Clock, Coins, Info, Percent, Receipt, ReceiptLong, XCircle } from "@corelithzw/ui/lib/icons";
/*
  `till-activity-shared`, never `till-activity`. The latter imports `lib/money`
  → `lib/prisma` → `pg` → `dns`, and importing it here failed the build with
  `Module not found: Can't resolve 'dns'`. The shared module has no imports for
  exactly this reason; see its header.
*/
import {
  TILL_ACTIVITY_FILTERS,
  TILL_ACTIVITY_LABELS,
  filterTillActivity,
  type TillActivityEntry,
  type TillActivityKind,
} from "@/lib/retail/till-activity-shared";
import type { LucideIcon } from "@corelithzw/ui/lib/icons";
import { cn } from "@corelithzw/ui/lib/utils";

import { PosEmptyState, PosPanel, PosPanelHeader, PosStatusPill } from "./pos-primitives";

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

/** `2026-08-17T14:10:00.000Z` → `Sun 17 Aug, 16:10` in the reader's own zone. */
function when(iso: string) {
  const date = new Date(iso);
  return date.toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

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

  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-4">
      <PosPanel>
        <PosPanelHeader
          eyebrow="This till"
          title="Activity"
          description={
            payload
              ? `Everything you have rung, reversed, moved or counted in the last ${payload.windowDays} days.`
              : "Everything you have rung, reversed, moved or counted recently."
          }
          actions={
            <PosStatusPill tone="neutral">
              {entries.length} {entries.length === 1 ? "event" : "events"}
            </PosStatusPill>
          }
        />

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
                  ? "Unable to load this till's activity"
                  : activityQuery.isLoading
                    ? "Reading this till's activity"
                    : kind === "all"
                      ? "Nothing recorded yet"
                      : `No ${TILL_ACTIVITY_LABELS[kind].toLowerCase()} events`
              }
              description={
                activityQuery.isError
                  ? "This is a loading failure, not an empty log — do not read it as nothing having happened. Try again in a moment."
                  : activityQuery.isLoading
                    ? "One moment."
                    : kind === "all"
                      ? "Sales, refunds, voids, cash moves and shift openings appear here as they happen."
                      : "Try another filter, or All."
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
                        {when(entry.at)}
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

        {/*
          The caveat, on the screen rather than only in the source. What this
          list can and cannot see decides whether a manager reading it draws the
          right conclusion from a gap in it.
        */}
        <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-[var(--edge-subtle)] bg-[var(--surface-muted)] px-3 py-2.5">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-muted)]" />
          <p className="text-xs leading-5 text-[var(--text-muted)]">
            This is built from the sales, cash movements and shifts themselves, so it shows
            everything that left a record — and only that. A cart cleared before payment, a
            refused manager override or a wrong PIN write nothing and cannot appear here.
          </p>
        </div>
      </PosPanel>
    </div>
  );
}
