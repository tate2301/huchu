"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { CrmLeadStage } from "@corelithzw/db";

import type { CrmBoardColumn } from "../../crm-v2";
import { LEAD_STAGE_COLOR, stageColor } from "../../tones";
import { cn } from "@corelithzw/ui/lib/utils";

import { BoardColumnHeader } from "../records/board-column-header";

import { LeadCard } from "./lead-card";
import { CRM_STAGE_LABELS, formatLeadValue } from "./stage-config";

export function BoardColumn({
  column,
  currency,
  onViewAll,
}: {
  column: CrmBoardColumn;
  currency: string;
  onViewAll: (stage: CrmLeadStage) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `column:${column.stage}` });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex w-72 shrink-0 flex-col rounded-[var(--card-radius)]",
        "transition-colors duration-[var(--motion-duration-fast,120ms)]",
        // No frame in the resting state — the cards are the objects, and a
        // border round each lane draws eight boxes the eye has to get past
        // first. It appears only while something is being dragged over it,
        // where it is doing a job.
        isOver
          ? "bg-[var(--action-primary-bg)]/[0.06] ring-1 ring-[var(--action-primary-bg)]"
          : "bg-transparent",
      )}
    >
      <BoardColumnHeader
        name={CRM_STAGE_LABELS[column.stage]}
        count={column.count}
        color={LEAD_STAGE_COLOR[column.stage] ?? stageColor(null)}
        meta={
          column.totalValue > 0 ? (
            <span className="font-mono text-sm text-[var(--text-muted)]">
              {formatLeadValue(column.totalValue, currency)}
            </span>
          ) : null
        }
        actions={
          column.hasMore
            ? [
                {
                  label: `Open all ${column.count} as a list`,
                  onSelect: () => onViewAll(column.stage),
                },
              ]
            : undefined
        }
      />

      <div className="flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto px-1 pb-2">
        <SortableContext
          items={column.leads.map((lead) => lead.id)}
          strategy={verticalListSortingStrategy}
        >
          {column.leads.map((lead) => (
            <LeadCard key={lead.id} lead={lead} />
          ))}
        </SortableContext>

        {column.leads.length === 0 ? (
          <p
            className={cn(
              "rounded-[var(--radius-md)] border border-dashed border-[var(--border)] px-1 py-6 text-center text-sm transition-colors",
              isOver
                ? "border-[var(--action-primary-bg)] text-[var(--action-primary-bg)]"
                : "text-[var(--text-muted)]",
            )}
          >
            Drop a lead here
          </p>
        ) : null}
      </div>
    </div>
  );
}
