"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  defaultDropAnimationSideEffects,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  type DropAnimation,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CrmLeadStage } from "@corelithzw/db";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import { getApiErrorMessage } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import {
  fetchCrmLeadsBoard,
  updateCrmLeadStage,
  type CrmBoardCard,
  type CrmBoardColumn,
} from "@/lib/crm/crm-v2";
import type { LeadViewFilters } from "@/lib/crm/views";

import { LEAD_STAGE_COLOR, stageColor } from "@/lib/crm/tones";
import { MobileBoard } from "@/components/crm/records/board-mobile";

import { BoardColumn } from "./board-column";
import { LeadCardBody } from "./lead-card";
import { LostReasonDialog } from "./lost-reason-dialog";
import { CRM_STAGE_LABELS, formatLeadValue } from "./stage-config";

/**
 * The card animates back into its column rather than vanishing, and the hole
 * it left fades out under it. Without this the overlay is destroyed the
 * instant the pointer lifts and the card appears to teleport.
 */
const DROP_ANIMATION: DropAnimation = {
  duration: 220,
  easing: "cubic-bezier(0.2, 0, 0, 1)",
  sideEffects: defaultDropAnimationSideEffects({
    styles: { active: { opacity: "0.4" } },
  }),
};


type BoardData = { columns: CrmBoardColumn[]; cardsPerColumn: number };

/** Move a card between columns in the cache, keeping counts and totals in step. */
function moveCardInCache(
  data: BoardData,
  leadId: string,
  toStage: CrmLeadStage,
): BoardData {
  let moved: CrmBoardCard | undefined;
  const stripped = data.columns.map((column) => {
    const found = column.leads.find((lead) => lead.id === leadId);
    if (!found) return column;
    moved = found;
    const value = found.estimatedValue ?? 0;
    return {
      ...column,
      count: Math.max(0, column.count - 1),
      totalValue: column.totalValue - value,
      leads: column.leads.filter((lead) => lead.id !== leadId),
    };
  });

  if (!moved) return data;
  const card = { ...moved, stage: toStage, stageEnteredAt: new Date().toISOString() };
  const value = card.estimatedValue ?? 0;

  return {
    ...data,
    columns: stripped.map((column) =>
      column.stage === toStage
        ? {
            ...column,
            count: column.count + 1,
            totalValue: column.totalValue + value,
            leads: [card, ...column.leads],
          }
        : column,
    ),
  };
}

export function LeadsBoard({
  filters,
  className,
}: {
  filters: LeadViewFilters;
  className?: string;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [activeCard, setActiveCard] = useState<CrmBoardCard | null>(null);
  const [pendingLost, setPendingLost] = useState<CrmBoardCard | null>(null);

  const queryKey = useMemo(() => ["crm", "board", filters] as const, [filters]);

  const boardQuery = useQuery({
    queryKey,
    queryFn: () => fetchCrmLeadsBoard(filters),
    placeholderData: (previous) => previous,
  });

  const sensors = useSensors(
    // A small activation distance keeps a click on the card title a click,
    // not an accidental one-pixel drag.
    // MouseSensor and TouchSensor rather than PointerSensor. PointerSensor
    // answers touch too, and its 6px threshold is crossed long before any
    // long-press delay elapses — so with both registered, every attempt to
    // swipe the board sideways started a drag instead. Splitting them lets a
    // finger scroll immediately and drag only after a deliberate hold.
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const moveStage = useMutation({
    mutationFn: ({
      leadId,
      stage,
      lostReason,
    }: {
      leadId: string;
      stage: CrmLeadStage;
      lostReason?: string;
    }) => updateCrmLeadStage(leadId, stage, lostReason),
    onMutate: async ({ leadId, stage }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<BoardData>(queryKey);
      if (previous) {
        queryClient.setQueryData(queryKey, moveCardInCache(previous, leadId, stage));
      }
      return { previous };
    },
    onError: (error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
      toast({
        title: "Could not move the lead",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
    onSuccess: (_result, { stage }) => {
      toast({ title: `Moved to ${CRM_STAGE_LABELS[stage]}` });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["crm", "board"] });
      queryClient.invalidateQueries({ queryKey: ["crm", "leads"] });
    },
  });

  // Filtering by stage on a board means the columns you unticked go away.
  // Leaving them in place and emptying them is the version that looks broken:
  // eight columns, two with cards, and no explanation.
  const allColumns = boardQuery.data?.columns ?? [];
  const chosen = filters.stages;
  const columns =
    chosen && chosen.length > 0
      ? allColumns.filter((column) => chosen.includes(column.stage))
      : allColumns;

  const resolveDropStage = (overId: string): CrmLeadStage | null => {
    if (overId.startsWith("column:")) return overId.slice("column:".length) as CrmLeadStage;
    // Dropped onto another card — inherit that card's column.
    const target = columns.find((column) => column.leads.some((lead) => lead.id === overId));
    return target?.stage ?? null;
  };

  const handleDragStart = (event: DragStartEvent) => {
    const id = String(event.active.id);
    const found = columns.flatMap((column) => column.leads).find((lead) => lead.id === id);
    setActiveCard(found ?? null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const card = activeCard;
    setActiveCard(null);
    if (!card || !event.over) return;

    const toStage = resolveDropStage(String(event.over.id));
    if (!toStage || toStage === card.stage) return;

    if (toStage === "LOST") {
      setPendingLost(card);
      return;
    }
    moveStage.mutate({ leadId: card.id, stage: toStage });
  };

  if (boardQuery.isLoading) {
    return (
      <div className={cn("space-y-2 lg:flex lg:space-y-0 lg:gap-3 lg:overflow-x-auto lg:pb-2", className)}>
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-16 w-full rounded-[var(--card-radius)] lg:h-96 lg:w-72 lg:shrink-0" />
        ))}
      </div>
    );
  }

  if (boardQuery.error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Unable to load the pipeline</AlertTitle>
        <AlertDescription>{getApiErrorMessage(boardQuery.error)}</AlertDescription>
      </Alert>
    );
  }

  // Columns report their own currency mix; the first lead's currency is a
  // reasonable label for a tenant that trades in one.
  const currency =
    columns.flatMap((column) => column.leads).find((lead) => lead.currency)?.currency ?? "USD";

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      {/* A phone gets the stage picker and one list; the strip of columns is
          desktop-only. Tapping a lead opens it, where the stage stepper is —
          so restaging stays reachable without dragging anything. */}
      <MobileBoard
        className="lg:hidden"
        noun={{ one: "lead", many: "leads" }}
        emptyTitle="No leads in this stage"
        stages={columns.map((column) => ({
          id: column.stage,
          label: CRM_STAGE_LABELS[column.stage],
          dot: (LEAD_STAGE_COLOR[column.stage] ?? stageColor(null)).dot,
          count: column.count,
          meta:
            column.totalValue > 0
              ? formatLeadValue(column.totalValue, currency)
              : undefined,
          rows: column.leads.map((lead) => ({
            id: lead.id,
            href: `/crm/leads/${lead.id}`,
            title: lead.title ?? lead.leadNo,
            subtitle: [
              lead.deal?.dealNo ?? lead.leadNo,
              lead.client?.name ?? lead.contactName ?? "No client",
            ]
              .filter(Boolean)
              .join(" · "),
            facts: [
              {
                value: formatLeadValue(lead.estimatedValue, lead.currency ?? currency),
                mono: true,
                primary: true,
              },
            ],
          })),
        }))}
      />

      <div className="hidden min-h-0 flex-1 flex-col lg:flex">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveCard(null)}
      >
        {/* The strip of columns takes the height the page has left, so a short
            pipeline still reaches the bottom instead of floating in white
            space, and a long one scrolls inside its column. */}
        <div className="scroll-rail flex min-h-0 flex-1 items-stretch gap-3 overflow-x-auto pb-2">
          {columns.map((column) => (
            <BoardColumn
              key={column.stage}
              column={column}
              currency={currency}
              onViewAll={() => {
                toast({
                  title: `${CRM_STAGE_LABELS[column.stage]} has ${column.count} leads`,
                  description: "Switch to the table view to page through all of them.",
                });
              }}
            />
          ))}
        </div>

        <DragOverlay dropAnimation={DROP_ANIMATION}>
          {activeCard ? (
            <div className="w-72 rotate-2 scale-[1.02] cursor-grabbing rounded-[var(--card-radius)] border border-[var(--border-strong)] bg-[var(--surface)] p-3 shadow-[var(--shadow-lg)]">
              <LeadCardBody lead={activeCard} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
      </div>

      <LostReasonDialog
        open={Boolean(pendingLost)}
        leadLabel={pendingLost?.title ?? pendingLost?.leadNo}
        isPending={moveStage.isPending}
        onCancel={() => setPendingLost(null)}
        onConfirm={(reason) => {
          if (!pendingLost) return;
          moveStage.mutate(
            { leadId: pendingLost.id, stage: "LOST", lostReason: reason },
            { onSettled: () => setPendingLost(null) },
          );
        }}
      />
    </div>
  );
}
