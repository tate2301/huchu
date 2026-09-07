"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
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
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Alert, AlertDescription, AlertTitle } from "@corelithzw/ui/components/alert";
import { Skeleton } from "@corelithzw/ui/components/skeleton";
import { useToast } from "@corelithzw/ui/components/use-toast";
import { ClientDate } from "@corelithzw/ui/components/client-date";
import { getApiErrorMessage } from "@corelithzw/platform/api-client";
import { Clock } from "@corelithzw/ui/lib/icons";
import {
  fetchCrmDealsBoard,
  updateCrmDealStage,
  type CrmDealBoard,
  type CrmDealBoardCard,
  type CrmDealBoardColumn,
} from "../../crm-v2";
import { stageColor } from "../../tones";
import { cn } from "@corelithzw/ui/lib/utils";

import { isOverdue } from "../leads/stage-config";

import { BoardColumnHeader } from "./board-column-header";
import { MobileBoard } from "./board-mobile";
import { RecordMark } from "@corelithzw/module-records/components/record-mark";
import { useBoardField } from "./board-fields";

/**
 * The card animates back into its column rather than vanishing. Without this
 * the overlay is destroyed the instant the pointer lifts and the card appears
 * to teleport.
 */
const DROP_ANIMATION: DropAnimation = {
  duration: 220,
  easing: "cubic-bezier(0.2, 0, 0, 1)",
  sideEffects: defaultDropAnimationSideEffects({
    styles: { active: { opacity: "0.4" } },
  }),
};

function money(value: number | null, currency: string): string {
  if (typeof value !== "number") return "—";
  return value.toLocaleString(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  });
}

function DealCardBody({ deal }: { deal: CrmDealBoardCard }) {
  const showReference = useBoardField("reference");
  const showClient = useBoardField("client");
  const showValue = useBoardField("value");
  const showOwner = useBoardField("owner");
  const showCloseDate = useBoardField("closeDate");
  const showOverdue = useBoardField("overdue");

  const overdue = isOverdue(deal.nextFollowUp?.dueAt);

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-2">
        <RecordMark
          kind="deal"
          name={deal.title}
          emoji={deal.emoji}
          avatarUrl={deal.avatarUrl}
          size="sm"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{deal.title}</p>
          {showReference || showClient ? (
            <p className="truncate text-sm text-[var(--text-muted)]">
              {showReference ? <span className="font-mono">{deal.dealNo}</span> : null}
              {showReference && showClient ? " · " : null}
              {showClient ? (deal.client?.name ?? "No company") : null}
            </p>
          ) : null}
        </div>
        {overdue && showOverdue ? (
          <span
            className="mt-1 size-2 shrink-0 rounded-full bg-[var(--status-error-border)]"
            title={`Overdue: ${deal.nextFollowUp?.title ?? "task"}`}
            aria-label="Has an overdue task"
          />
        ) : null}
      </div>

      {showValue || showOwner ? (
        <div className="flex items-center justify-between gap-2">
          {showValue ? (
            <span className="font-mono text-sm">{money(deal.value, deal.currency)}</span>
          ) : (
            <span />
          )}
          {showOwner ? (
            <RecordMark
              kind="rep"
              name={deal.assignedTo?.name ?? "Unassigned"}
              size="sm"
              className="shrink-0"
            />
          ) : null}
        </div>
      ) : null}

      {deal.expectedCloseDate && showCloseDate ? (
        <p className="flex items-center gap-1 text-sm text-[var(--text-muted)]">
          <Clock className="size-3" />
          <span>
            Expected <ClientDate value={deal.expectedCloseDate} mode="date" />
          </span>
        </p>
      ) : null}
    </div>
  );
}

function DealCard({ deal }: { deal: CrmDealBoardCard }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: deal.id,
    data: { stageId: deal.stageId },
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        transition:
          transition ??
          "transform var(--motion-duration-base, 180ms) var(--motion-ease-standard, ease)",
      }}
      className={cn(
        "rounded-[var(--card-radius)] border border-[var(--border)] bg-[var(--surface)] p-3",
        // `touch-manipulation` keeps the board scrollable under a finger until
        // the long-press fires; `select-none` stops the hold raising a text
        // selection callout over the card it is about to move.
        "cursor-grab touch-manipulation select-none shadow-[var(--shadow-xs)] transition-shadow active:cursor-grabbing",
        "hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-sm)]",
        isDragging &&
          "border-dashed bg-[var(--surface-muted)] opacity-50 shadow-none [&_*]:invisible",
      )}
      {...attributes}
      {...listeners}
    >
      <Link
        href={`/crm/deals/${deal.id}`}
        className="block focus:outline-none focus-visible:underline"
        onClick={(event) => event.stopPropagation()}
      >
        <DealCardBody deal={deal} />
      </Link>
    </div>
  );
}

function DealColumn({
  column,
  currency,
  onAdd,
  onViewAll,
}: {
  column: CrmDealBoardColumn;
  currency: string;
  onAdd?: (stageId: string) => void;
  onViewAll?: (stageId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `stage:${column.stage.id}` });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex w-72 shrink-0 flex-col rounded-[var(--card-radius)] transition-colors",
        isOver
          ? "bg-[var(--action-primary-bg)]/[0.06] ring-1 ring-[var(--action-primary-bg)]"
          : "bg-transparent",
      )}
    >
      <BoardColumnHeader
        name={column.stage.name}
        count={column.count}
        color={stageColor(column.stage.colorToken)}
        meta={
          column.totalValue > 0 ? (
            <span className="font-mono text-sm text-[var(--text-muted)]">
              {money(column.totalValue, currency)}
            </span>
          ) : null
        }
        onAdd={onAdd ? () => onAdd(column.stage.id) : undefined}
        addLabel={`New deal in ${column.stage.name}`}
        actions={[
          {
            label: "Open this stage as a list",
            onSelect: () => onViewAll?.(column.stage.id),
          },
        ]}
      />

      <div className="flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto px-1 pb-2">
        <SortableContext
          items={column.deals.map((deal) => deal.id)}
          strategy={verticalListSortingStrategy}
        >
          {column.deals.map((deal) => (
            <DealCard key={deal.id} deal={deal} />
          ))}
        </SortableContext>

        {column.deals.length === 0 ? (
          <p
            className={cn(
              "rounded-[var(--radius-md)] border border-dashed px-1 py-6 text-center text-sm transition-colors",
              isOver
                ? "border-[var(--action-primary-bg)] text-[var(--action-primary-bg)]"
                : "border-[var(--border)] text-[var(--text-muted)]",
            )}
          >
            Drop a deal here
          </p>
        ) : null}

        {column.hasMore ? (
          <p className="px-2 py-1.5 text-sm text-[var(--text-muted)]">
            Showing the {column.deals.length} most recently touched of {column.count}.
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** Move a card between columns in the cache, keeping counts and totals in step. */
function moveCardInCache(board: CrmDealBoard, dealId: string, toStageId: string): CrmDealBoard {
  let moved: CrmDealBoardCard | undefined;
  const stripped = board.columns.map((column) => {
    const found = column.deals.find((deal) => deal.id === dealId);
    if (!found) return column;
    moved = found;
    return {
      ...column,
      count: Math.max(0, column.count - 1),
      totalValue: Math.max(0, column.totalValue - (found.value ?? 0)),
      deals: column.deals.filter((deal) => deal.id !== dealId),
    };
  });

  if (!moved) return board;
  const card = { ...moved, stageId: toStageId };

  return {
    ...board,
    columns: stripped.map((column) =>
      column.stage.id === toStageId
        ? {
            ...column,
            count: column.count + 1,
            totalValue: column.totalValue + (card.value ?? 0),
            deals: [card, ...column.deals],
          }
        : column,
    ),
  };
}

/**
 * One pipeline's deals as a board.
 *
 * Which pipeline is the caller's choice, because a board mixing pipelines
 * would have columns meaning different things depending on which card sits in
 * them — and dragging between those columns would be nonsense.
 */
export function DealsBoard({
  pipelineId,
  search,
  className,
  onAdd,
  onViewAll,
}: {
  pipelineId: string | null;
  search?: string;
  className?: string;
  /** Start a deal already in this stage. */
  onAdd?: (stageId: string) => void;
  /** Open one stage as a list, for the columns past the fifty-card cap. */
  onViewAll?: (stageId: string) => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [dragging, setDragging] = useState<CrmDealBoardCard | null>(null);

  const queryKey = useMemo(
    () => ["crm", "deals-board", pipelineId, search ?? ""],
    [pipelineId, search],
  );

  const boardQuery = useQuery({
    queryKey,
    queryFn: () => fetchCrmDealsBoard({ pipelineId, q: search }),
    placeholderData: (previous) => previous,
  });

  const sensors = useSensors(
    // MouseSensor and TouchSensor rather than PointerSensor. PointerSensor
    // answers touch too, and its 6px threshold is crossed long before any
    // long-press delay elapses — so with both registered, every attempt to
    // swipe the board sideways started a drag instead. Splitting them lets a
    // finger scroll immediately and drag only after a deliberate hold.
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const move = useMutation({
    mutationFn: ({ dealId, stageId }: { dealId: string; stageId: string }) =>
      updateCrmDealStage(dealId, stageId),
    onMutate: async ({ dealId, stageId }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<CrmDealBoard>(queryKey);
      if (previous) {
        queryClient.setQueryData(queryKey, moveCardInCache(previous, dealId, stageId));
      }
      return { previous };
    },
    onError: (error, _variables, context) => {
      // Put it back where it was: a card that stayed in the new column after a
      // failed save is a lie the next reader has no way to spot.
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
      toast({
        title: "Could not move the deal",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["crm", "deals-board"] });
      queryClient.invalidateQueries({ queryKey: ["crm", "deals"] });
    },
  });

  const board = boardQuery.data;
  const currency = board?.columns.flatMap((column) => column.deals)[0]?.currency ?? "USD";

  if (boardQuery.isLoading && !board) {
    return (
      // A phone is about to get a list, so it waits for a list — not a strip
      // of column skeletons, of which it can see one and a quarter.
      <div className="space-y-2 lg:flex lg:space-y-0 lg:gap-3" aria-busy="true">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-16 w-full lg:h-96 lg:w-72 lg:shrink-0" />
        ))}
      </div>
    );
  }

  if (boardQuery.error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Unable to load the board</AlertTitle>
        <AlertDescription>{getApiErrorMessage(boardQuery.error)}</AlertDescription>
      </Alert>
    );
  }

  if (!board) return null;

  const handleDragStart = (event: DragStartEvent) => {
    const id = String(event.active.id);
    setDragging(
      board.columns.flatMap((column) => column.deals).find((deal) => deal.id === id) ?? null,
    );
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setDragging(null);
    const over = event.over;
    if (!over) return;

    const dealId = String(event.active.id);
    const overId = String(over.id);
    // A drop lands either on a column or on another card in one.
    const stageId = overId.startsWith("stage:")
      ? overId.slice("stage:".length)
      : board.columns.find((column) => column.deals.some((deal) => deal.id === overId))?.stage.id;

    if (!stageId) return;
    const from = board.columns.find((column) =>
      column.deals.some((deal) => deal.id === dealId),
    );
    if (!from || from.stage.id === stageId) return;

    move.mutate({ dealId, stageId });
  };

  return (
    <>
    {/* A phone gets the stage picker and one list. Restaging lives on the deal
        page's stage bar, so nothing is lost by not dragging here. */}
    <MobileBoard
      className="lg:hidden"
      noun={{ one: "deal", many: "deals" }}
      emptyTitle="No deals in this stage"
      stages={board.columns.map((column) => ({
        id: column.stage.id,
        label: column.stage.name,
        dot: stageColor(column.stage.colorToken).dot,
        count: column.count,
        meta: column.totalValue > 0 ? money(column.totalValue, currency) : undefined,
        rows: column.deals.map((deal) => ({
          id: deal.id,
          href: `/crm/deals/${deal.id}`,
          title: deal.title,
          subtitle: `${deal.dealNo} · ${deal.client?.name ?? "No company"}`,
          facts: [{ value: money(deal.value, deal.currency), mono: true, primary: true }],
        })),
      }))}
    />

    <div className="hidden lg:block">
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setDragging(null)}
    >
      <div className={cn("scroll-rail flex gap-3 overflow-x-auto pb-2", className)}>
        {board.columns.map((column) => (
          <DealColumn
            key={column.stage.id}
            column={column}
            currency={currency}
            onAdd={onAdd}
            onViewAll={onViewAll}
          />
        ))}
      </div>

      <DragOverlay dropAnimation={DROP_ANIMATION}>
        {dragging ? (
          <div className="w-72 rotate-1 rounded-[var(--card-radius)] border border-[var(--border-strong)] bg-[var(--surface)] p-3 shadow-[var(--elevation-3)]">
            <DealCardBody deal={dragging} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
    </div>
    </>
  );
}
