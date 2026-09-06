"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  DndContext,
  DragOverlay,
  defaultDropAnimationSideEffects,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCorners,
  useDroppable,
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
import { CSS } from "@dnd-kit/utilities";

import { EmptyState, Skeleton } from "@corelithzw/react";
import { cn } from "@corelithzw/ui/lib/utils";

import { BoardColumnHeader } from "./board-column-header";
import { MobileBoard } from "./board-mobile";
import type { RecordListRow } from "./record-list";

const DROP_ANIMATION: DropAnimation = {
  duration: 220,
  easing: "cubic-bezier(0.2, 0, 0, 1)",
  sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: "0.4" } } }),
};

export type RecordBoardColumn = {
  id: string;
  name: string;
  color: { dot: string; band: string };
};

export type RecordBoardCard = {
  id: string;
  columnId: string;
  href: string;
  /** The card's face. Composed by the caller so each entity keeps its own. */
  content: ReactNode;
  /**
   * The same record as a list row, for the phone board. A card face is two or
   * three stacked lines because a column is 288px of vertical space; a list
   * row is a title, one supporting line and a fact on the right. Callers that
   * already build rows for their list view pass those, so the two views of the
   * same records agree. Omitted, the card face is reused as-is.
   */
  row?: Omit<RecordListRow, "id" | "href">;
};

function BoardCard({ card }: { card: RecordBoardCard }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
    data: { columnId: card.columnId },
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
        href={card.href}
        className="block focus:outline-none focus-visible:underline"
        onClick={(event) => event.stopPropagation()}
      >
        {card.content}
      </Link>
    </div>
  );
}

function BoardLane({
  column,
  cards,
  emptyLabel,
}: {
  column: RecordBoardColumn;
  cards: RecordBoardCard[];
  emptyLabel: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `column:${column.id}` });

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
      <BoardColumnHeader name={column.name} count={cards.length} color={column.color} />

      <div className="flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto px-1 pb-2">
        <SortableContext
          items={cards.map((card) => card.id)}
          strategy={verticalListSortingStrategy}
        >
          {cards.map((card) => (
            <BoardCard key={card.id} card={card} />
          ))}
        </SortableContext>

        {cards.length === 0 ? (
          <p
            className={cn(
              "rounded-[var(--radius-md)] border border-dashed px-1 py-6 text-center text-sm transition-colors",
              isOver
                ? "border-[var(--action-primary-bg)] text-[var(--action-primary-bg)]"
                : "border-[var(--border)] text-[var(--text-muted)]",
            )}
          >
            {emptyLabel}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * A board over any record type, grouped by any single-valued field.
 *
 * The pipeline boards stay separate because a pipeline is not just a grouping
 * — it has an order, terminal stages, SLAs and a promotion rule, and folding
 * those into a generic component would make it worse at both jobs. This is
 * the other case: a set of records and one attribute worth arranging them by,
 * where moving a card means "change that attribute" and nothing more.
 *
 * Grouping happens here rather than server-side. These are directories of a
 * few hundred rows that the page has already fetched to list them; a second
 * grouped endpoint would be a second source of truth for the same records.
 */
export function RecordBoard({
  columns,
  cards,
  isLoading,
  emptyLabel = "Drop one here",
  noun,
  onMove,
  className,
}: {
  columns: RecordBoardColumn[];
  cards: RecordBoardCard[];
  isLoading?: boolean;
  emptyLabel?: string;
  /** What the cards are, for the phone board's summary line. */
  noun?: { one: string; many: string };
  /** Called when a card lands in a different column. */
  onMove?: (cardId: string, columnId: string) => void;
  className?: string;
}) {
  const [dragging, setDragging] = useState<RecordBoardCard | null>(null);

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

  const byColumn = useMemo(() => {
    const map = new Map<string, RecordBoardCard[]>();
    for (const column of columns) map.set(column.id, []);
    for (const card of cards) {
      // A record whose value is not one of the columns would otherwise vanish
      // from a board that claims to show everything.
      const bucket = map.get(card.columnId) ?? map.get(columns[0]?.id ?? "");
      bucket?.push(card);
    }
    return map;
  }, [columns, cards]);

  if (isLoading) {
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

  if (columns.length === 0) {
    return <EmptyState title="Nothing to group by" />;
  }

  const handleDragEnd = (event: DragEndEvent) => {
    setDragging(null);
    const over = event.over;
    if (!over || !onMove) return;

    const cardId = String(event.active.id);
    const overId = String(over.id);
    const columnId = overId.startsWith("column:")
      ? overId.slice("column:".length)
      : cards.find((card) => card.id === overId)?.columnId;

    if (!columnId) return;
    const from = cards.find((card) => card.id === cardId);
    if (!from || from.columnId === columnId) return;

    onMove(cardId, columnId);
  };

  return (
    <>
    <MobileBoard
      className="lg:hidden"
      noun={noun}
      emptyTitle={emptyLabel}
      stages={columns.map((column) => ({
        id: column.id,
        label: column.name,
        dot: column.color.dot,
        count: (byColumn.get(column.id) ?? []).length,
        rows: (byColumn.get(column.id) ?? []).map((card) => ({
          id: card.id,
          href: card.href,
          ...(card.row ?? { title: card.content }),
        })),
      }))}
    />

    {/* The board itself is desktop-only. Rendered rather than unmounted so the
        two views cannot drift apart in behaviour; the drag sensors below never
        see a touch because nothing here is on screen at phone width. */}
    <div className="hidden lg:block">
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={(event: DragStartEvent) =>
        setDragging(cards.find((card) => card.id === String(event.active.id)) ?? null)
      }
      onDragEnd={handleDragEnd}
      onDragCancel={() => setDragging(null)}
    >
      <div className={cn("scroll-rail flex gap-3 overflow-x-auto pb-2", className)}>
        {columns.map((column) => (
          <BoardLane
            key={column.id}
            column={column}
            cards={byColumn.get(column.id) ?? []}
            emptyLabel={emptyLabel}
          />
        ))}
      </div>

      <DragOverlay dropAnimation={DROP_ANIMATION}>
        {dragging ? (
          <div className="w-72 rotate-1 rounded-[var(--card-radius)] border border-[var(--border-strong)] bg-[var(--surface)] p-3 shadow-[var(--elevation-3)]">
            {dragging.content}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
    </div>
    </>
  );
}
