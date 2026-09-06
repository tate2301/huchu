"use client";

import Link from "next/link";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { Clock } from "@corelithzw/ui/lib/icons";
import { formatSlaRemaining, stageSla } from "@/lib/crm/sla";
import type { CrmBoardCard } from "@/lib/crm/crm-v2";
import { cn } from "@corelithzw/ui/lib/utils";

import { RecordMark } from "@/components/records/record-mark";
import { useBoardField } from "@/components/crm/records/board-fields";

import { formatDaysAgo, formatLeadValue, isOverdue } from "./stage-config";

export function LeadCardBody({ lead }: { lead: CrmBoardCard }) {
  const showReference = useBoardField("reference");
  const showClient = useBoardField("client");
  const showValue = useBoardField("value");
  const showOwner = useBoardField("owner");
  const showSla = useBoardField("sla");
  const showOverdue = useBoardField("overdue");

  const overdue = isOverdue(lead.nextFollowUp?.dueAt);
  // Time in stage against what the stage is allowed, counted in working hours.
  // "3 days in stage" over a weekend is not the same fact as three working
  // days, and the card is where somebody decides what to pick up next.
  const sla = stageSla(lead.stage, lead.stageEnteredAt);
  const slaLabel = formatSlaRemaining(sla);

  const subtitle = [
    showReference ? (lead.deal?.dealNo ?? lead.leadNo) : null,
    showClient ? (lead.client?.name ?? lead.contactName ?? "No client") : null,
  ].filter(Boolean);

  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{lead.title ?? lead.leadNo}</p>
          {subtitle.length > 0 ? (
            <p className="truncate text-sm text-[var(--text-muted)]">
              {showReference ? (
                <span className="font-mono">{lead.deal?.dealNo ?? lead.leadNo}</span>
              ) : null}
              {subtitle.length > 1 ? " · " : null}
              {showClient ? (lead.client?.name ?? lead.contactName ?? "No client") : null}
            </p>
          ) : null}
        </div>
        {overdue && showOverdue ? (
          <span
            className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[var(--status-error-border)]"
            title={`Overdue: ${lead.nextFollowUp?.title ?? "task"}`}
            aria-label="Has an overdue task"
          />
        ) : null}
      </div>

      {showValue || showOwner ? (
        <div className="flex items-center justify-between gap-2">
          {showValue ? (
            <span className="font-mono text-sm">
              {formatLeadValue(lead.estimatedValue, lead.currency)}
            </span>
          ) : (
            <span />
          )}
          {/* A rep is a person, so the same avatar they get everywhere else. */}
          {showOwner ? (
            <RecordMark
              kind="rep"
              name={lead.assignedTo?.name ?? "Unassigned"}
              size="sm"
              className="shrink-0"
            />
          ) : null}
        </div>
      ) : null}

      {showSla ? (
        <div
          className={cn(
            "flex items-center gap-1 text-sm",
            sla.breached
              ? "font-medium text-[var(--status-danger-fg)]"
              : sla.atRisk
                ? "font-medium text-[var(--status-warning-fg)]"
                : "text-[var(--text-muted)]",
          )}
        >
          <Clock className="h-3 w-3" />
          <span>
            {formatDaysAgo(lead.stageEnteredAt)} in stage
            {slaLabel ? ` · ${slaLabel}` : ""}
          </span>
        </div>
      ) : null}
    </div>
  );
}

/**
 * A draggable pipeline card. The title stays a real link so the board is still
 * navigable by keyboard and the card opens in a new tab like any other link.
 */
export function LeadCard({ lead }: { lead: CrmBoardCard }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: lead.id,
    data: { stage: lead.stage },
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        // dnd-kit only supplies a transition while cards are shuffling out of
        // the way. Without a fallback the card being dragged snaps home with
        // no animation at all, which is what made the board feel broken.
        transition: transition ?? "transform var(--motion-duration-base, 180ms) var(--motion-ease-standard, ease)",
      }}
      className={cn(
        "rounded-[var(--card-radius)] border border-[var(--border)] bg-[var(--surface)] p-3",
        // `touch-manipulation` keeps the board scrollable under a finger until
        // the long-press fires; `select-none` stops the hold raising a text
        // selection callout over the card it is about to move.
        "cursor-grab touch-manipulation select-none shadow-[var(--shadow-xs)] transition-shadow active:cursor-grabbing",
        "hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-sm)]",
        // The card left behind is a hole the size of the card, not a ghost of
        // it — the real thing is under the cursor in the drag overlay.
        isDragging &&
          "border-dashed bg-[var(--surface-muted)] opacity-50 shadow-none [&_*]:invisible",
      )}
      {...attributes}
      {...listeners}
    >
      <Link
        // Once promoted, the deal is the live record — the lead behind it is
        // history. Opening the lead from the board would show the husk.
        href={lead.deal ? `/crm/deals/${lead.deal.id}` : `/crm/leads/${lead.id}`}
        className="block focus:outline-none focus-visible:underline"
        // Let the drag sensor own pointer gestures; the link still works for
        // clicks, keyboard activation, and open-in-new-tab.
        onClick={(event) => event.stopPropagation()}
      >
        <LeadCardBody lead={lead} />
      </Link>
    </div>
  );
}
