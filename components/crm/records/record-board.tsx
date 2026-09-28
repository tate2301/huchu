"use client";

import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import Link from "next/link";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  defaultDropAnimationSideEffects,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
  type DropAnimation,
  type KeyboardCoordinateGetter,
  type UniqueIdentifier,
} from "@dnd-kit/core";

import { EmptyState, Skeleton } from "@corelithzw/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { IconButton } from "@/components/ui/icon-button";
import { DotsThree } from "@/lib/icons";
import { cn } from "@/lib/utils";

import { BoardColumnHeader, type BoardColumnAction } from "./board-column-header";
import { MobileBoard } from "./board-mobile";
import type { RecordListRow } from "@/components/records/record-list";

/**
 * One board, for every record type that has one.
 *
 * Leads, deals, people and companies each carried their own copy of the drag
 * code, and all four had the same two faults. The cards sat in sortable lists
 * that shuffled as you dragged past them, promising an order the board never
 * saves; and a drop animated the card back to where it started, because the
 * move landed in the cache a tick after the animation had already measured
 * where to fly. People and companies were worse — they waited for the refetch,
 * so the card flew home and then jumped.
 *
 * So the rules here are the ones a board actually has. A card changes column
 * and nothing else. While it is over a column that column opens a slot at the
 * top, which is where it will land. On drop the card is placed there at once
 * and the overlay lands on it; the caller's save runs behind, and the card is
 * only put back if the save fails.
 *
 * Built in layers, each one surface higher than the last: the page, a sunken
 * tray per column, cards resting on the tray with a hairline and no shadow,
 * and the card in hand floating above all of it with the only real shadow on
 * the screen.
 */

export type RecordBoardColumn = {
  id: string;
  name: string;
  /** Tailwind background class for the column's dot. */
  dot: string;
  /**
   * How many records the column holds, when the board shows fewer than that.
   * Omitted, the cards on the board are counted.
   */
  count?: number;
  /** The column's total, already formatted. Shown under the name. */
  total?: string;
  onAdd?: () => void;
  addLabel?: string;
  actions?: BoardColumnAction[];
  /** A line under the last card, such as "Showing 50 of 212". */
  footer?: ReactNode;
};

export type RecordBoardCard = {
  id: string;
  columnId: string;
  href: string;
  /** The record's name, for the move menu and for screen readers. */
  label: string;
  /** The card's face. Composed by the caller so each entity keeps its own. */
  content: ReactNode;
  /**
   * The same record as a list row, for the phone board. Callers that already
   * build rows for their list view pass those, so the two views agree.
   * Omitted, the label is used as the row's title.
   */
  row?: Omit<RecordListRow, "id" | "href">;
};

/**
 * The drop, matched to `--dur-base` and `--ease-out`. Literal because the
 * overlay animates through the Web Animations API, which cannot read a custom
 * property. The card under the overlay stays hidden until it lands, so the
 * overlay becomes the card rather than landing on a copy of it.
 */
const DROP_ANIMATION: DropAnimation = {
  duration: 200,
  easing: "cubic-bezier(.22,1,.36,1)",
  sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: "0" } } }),
};

/**
 * The column under the pointer is the column. When the pointer is off every
 * column — in the gutter between two — the card itself decides by what it
 * overlaps, so crossing a gap does not flicker the target off and on. Off the
 * board entirely, nothing is hit and the card goes home.
 */
const pointerFirst: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  return hits.length > 0 ? hits : rectIntersection(args);
};

/**
 * Left and right step a card one column at a time. Up and down do nothing:
 * there is no order within a column to move through, and pretending otherwise
 * is how the old board lied.
 */
const columnKeyboardCoordinates: KeyboardCoordinateGetter = (
  event,
  { context: { collisionRect, droppableRects, droppableContainers, over }, currentCoordinates },
) => {
  const step = event.code === "ArrowRight" ? 1 : event.code === "ArrowLeft" ? -1 : 0;
  if (step === 0) {
    if (event.code === "ArrowUp" || event.code === "ArrowDown") event.preventDefault();
    return undefined;
  }
  event.preventDefault();
  if (!collisionRect) return undefined;

  const lanes = droppableContainers
    .getEnabled()
    .flatMap((container) => {
      const rect = droppableRects.get(container.id);
      return rect ? [{ id: container.id, rect }] : [];
    })
    .sort((a, b) => a.rect.left - b.rect.left);

  // Off every column, the card counts as being in the last one it has passed.
  const passed = lanes.filter((lane) => lane.rect.left <= collisionRect.left).length - 1;
  const here = over ? lanes.findIndex((lane) => lane.id === over.id) : passed;
  const next = lanes[here + step];
  if (!next) return undefined;

  return {
    x: next.rect.left + (next.rect.width - collisionRect.width) / 2,
    y: currentCoordinates.y,
  };
};

type BoardActions = {
  columns: RecordBoardColumn[];
  columnOf: (cardId: string) => string | undefined;
  move: (cardId: string, toColumnId: string) => void;
};

const BoardActionsContext = createContext<BoardActions | null>(null);

/**
 * "Move to…" on every card, so the board works without dragging: from the
 * keyboard, on a touch screen, and for anyone who finds a long drag across
 * eight columns harder than two clicks.
 */
const CardMenu = memo(function CardMenu({ card }: { card: RecordBoardCard }) {
  const board = useContext(BoardActionsContext);
  if (!board) return null;
  const current = board.columnOf(card.id);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton
          size="sm"
          aria-label={`Move ${card.label}`}
          // The card's own face shows through until the pointer arrives; the
          // button sits on a surface of its own so it never overprints text.
          className={cn(
            "absolute right-1.5 top-1.5 bg-[var(--surface)] opacity-0 transition-opacity duration-[var(--dur-fast)]",
            "focus-visible:opacity-100 group-hover/card:opacity-100 data-[state=open]:opacity-100 pointer-coarse:opacity-100",
          )}
        >
          <DotsThree />
        </IconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuLabel>Move to</DropdownMenuLabel>
        {board.columns.map((column) => (
          <DropdownMenuItem
            key={column.id}
            disabled={column.id === current}
            onSelect={() => board.move(card.id, column.id)}
          >
            <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", column.dot)} />
            {column.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
});

const BoardCard = memo(function BoardCard({ card }: { card: RecordBoardCard }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: card.id });

  return (
    // The menu is a sibling of the draggable surface, not a child: its key
    // presses and clicks would otherwise bubble into the drag sensors, and a
    // Space in the menu would pick the card up.
    <div role="listitem" className="group/card relative">
      <div
        ref={setNodeRef}
        {...listeners}
        data-board-card=""
        className={cn(
          "rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-3",
          // `touch-manipulation` keeps the board scrollable under a finger
          // until the long-press fires; `select-none` stops the hold raising a
          // text-selection callout over the card it is about to move.
          "cursor-grab touch-manipulation select-none active:cursor-grabbing",
          "transition-[border-color,box-shadow] duration-[var(--dur-fast)] ease-[var(--ease-out)]",
          "hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-hover)]",
          "has-[a:focus-visible]:border-[var(--focus-ring)] has-[a:focus-visible]:shadow-[0_0_0_3px_var(--focus-ring-soft)]",
          // What stays behind is the shape of the card, not a ghost of it —
          // the card itself is under the pointer.
          isDragging &&
            "border-dashed border-[var(--border-strong)] bg-transparent shadow-none hover:shadow-none [&>*]:invisible",
        )}
      >
        <Link
          href={card.href}
          // An anchor is natively draggable; left alone, the browser starts
          // its own drag of the URL and the board never sees the gesture.
          draggable={false}
          aria-roledescription={attributes["aria-roledescription"]}
          aria-describedby={attributes["aria-describedby"]}
          className="block outline-none"
        >
          {card.content}
        </Link>
      </div>
      {isDragging ? null : <CardMenu card={card} />}
    </div>
  );
});

const BoardLane = memo(function BoardLane({
  column,
  cards,
  count,
  emptyLabel,
  dragging,
}: {
  column: RecordBoardColumn;
  cards: RecordBoardCard[];
  count: number;
  emptyLabel: string;
  /** The card in hand and its height, while there is one. */
  dragging: { card: RecordBoardCard; from: string; height: number } | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const bodyRef = useRef<HTMLDivElement>(null);
  const headingId = `board-lane-${column.id}`;

  // Over its own column the card is simply being put back; nothing opens.
  const receiving = isOver && dragging !== null && dragging.from !== column.id;

  // The slot opens at the top, so the top has to be on screen for the reader
  // to see where the card will go.
  useEffect(() => {
    if (!receiving) return;
    const body = bodyRef.current;
    if (body && body.scrollTop > 0) body.scrollTo({ top: 0, behavior: "smooth" });
  }, [receiving]);

  return (
    <section
      ref={setNodeRef}
      aria-labelledby={headingId}
      className={cn(
        "flex h-full w-72 shrink-0 flex-col rounded-[var(--radius-lg)] bg-[var(--surface-muted)]",
        "transition-[background-color,box-shadow] duration-[var(--dur-fast)] ease-[var(--ease-out)]",
        receiving && "bg-[var(--brand-tint)] shadow-[inset_0_0_0_1px_var(--focus-ring-soft)]",
      )}
    >
      <BoardColumnHeader
        id={headingId}
        name={column.name}
        dot={column.dot}
        count={count}
        total={column.total}
        onAdd={column.onAdd}
        addLabel={column.addLabel}
        actions={column.actions}
      />

      <div
        ref={bodyRef}
        className="scroll-rail flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-2 pb-2"
      >
        {/* The slot is mounted, collapsed, in every column for as long as a
            card is in hand, and opens in the one under it. Collapsing rather
            than unmounting is what lets it close smoothly when the pointer
            moves on; unmounting the instant the card drops is what lets the
            card take its place without the column jumping. */}
        {dragging ? (
          <div
            aria-hidden="true"
            className={cn(
              "grid transition-[grid-template-rows] duration-[var(--dur-base)] ease-[var(--ease-out)] motion-reduce:transition-none",
              receiving ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
            )}
          >
            <div className="min-h-0 overflow-hidden">
              <div className="pb-2">
                <div
                  style={{ height: dragging.height }}
                  className="rounded-[var(--radius-md)] border border-dashed border-[var(--brand)] bg-[var(--surface)]"
                />
              </div>
            </div>
          </div>
        ) : null}

        <div role="list" aria-labelledby={headingId} className="flex flex-col gap-2">
          {cards.map((card) => (
            <BoardCard key={card.id} card={card} />
          ))}
        </div>

        {cards.length === 0 && !receiving ? (
          <p className="rounded-[var(--radius-md)] border border-dashed border-[var(--border-strong)] px-3 py-6 text-center text-sm text-[var(--text-subtle)]">
            {emptyLabel}
          </p>
        ) : null}

        {column.footer ? (
          <div className="px-1 pt-2 text-sm text-[var(--text-subtle)]">{column.footer}</div>
        ) : null}
      </div>
    </section>
  );
});

/**
 * Size the board to the screen left below it, so every column scrolls on its
 * own and the page itself never has to.
 *
 * Measured rather than written as a `calc()`: the board sits under a page
 * band, a toolbar, the page's own top padding and whatever notice a page puts
 * above it, and a formula that knows about some of those ran the columns off
 * the bottom of the screen by the ones it did not. The offset is taken from
 * the top of the scroll container, not the viewport, so it is the same at any
 * scroll position.
 */
function useFillScrollport(ref: RefObject<HTMLElement | null>, active: boolean) {
  useLayoutEffect(() => {
    const board = ref.current;
    if (!active || !board) return;

    let port = board.parentElement;
    while (port && !/(auto|scroll)/.test(getComputedStyle(port).overflowY)) {
      port = port.parentElement;
    }
    const container = port ?? document.documentElement;

    const fit = () => {
      const offset =
        board.getBoundingClientRect().top -
        (port ? port.getBoundingClientRect().top : 0) +
        container.scrollTop;
      board.style.height = `${Math.max(container.clientHeight - offset, 0)}px`;
    };

    fit();
    // The container resizing, or anything above the board growing or
    // shrinking, moves the space the board has.
    const observer = new ResizeObserver(fit);
    observer.observe(container);
    if (container.firstElementChild) observer.observe(container.firstElementChild);
    return () => observer.disconnect();
  }, [ref, active]);
}

/**
 * A board over any record type, grouped by any single-valued field.
 *
 * Grouping happens here rather than server-side: the caller hands over the
 * records it already has and says which column each belongs in. Moving a card
 * means "change that one field", and `onMove` is where the caller does it.
 */
export function RecordBoard({
  columns,
  cards,
  isLoading,
  emptyLabel = "Nothing here yet",
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
  /**
   * Save a card's new column. The board shows the card in its new column
   * until the returned promise settles, by which point the caller's own data
   * says where it is; a rejection puts it back. Reporting the failure is the
   * caller's job — the board swallows the rejection.
   */
  onMove?: (cardId: string, toColumnId: string) => Promise<unknown>;
  className?: string;
}) {
  const [dragging, setDragging] = useState<{
    card: RecordBoardCard;
    from: string;
    height: number;
  } | null>(null);
  // Moves the board is showing ahead of the caller's data: card → column.
  const [pending, setPending] = useState<ReadonlyMap<string, string>>(() => new Map());
  const droppedAt = useRef(0);
  const railRef = useRef<HTMLDivElement>(null);
  useFillScrollport(railRef, !isLoading && columns.length > 0);

  const sensors = useSensors(
    // MouseSensor and TouchSensor rather than PointerSensor. PointerSensor
    // answers touch too, and its distance threshold is crossed long before a
    // long-press delay elapses — so a swipe to scroll the board started a drag
    // instead. Split, a finger scrolls at once and drags after a hold.
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: columnKeyboardCoordinates,
      // Space picks up; Enter is left to the card's link, so it still opens
      // the record.
      keyboardCodes: {
        start: ["Space"],
        cancel: ["Escape"],
        end: ["Space", "Enter", "Tab"],
      },
    }),
  );

  const { byColumn, counts } = useMemo(() => {
    const map = new Map<string, RecordBoardCard[]>(columns.map((column) => [column.id, []]));
    const fallback = columns[0]?.id ?? "";
    const arrived: RecordBoardCard[] = [];
    // A caller's count describes its own data. A move the board is showing
    // ahead of that data has to be counted where the card now sits.
    const shift = new Map<string, number>();
    for (const card of cards) {
      const to = pending.get(card.id);
      if (to && to !== card.columnId && map.has(to)) {
        arrived.push({ ...card, columnId: to });
        shift.set(to, (shift.get(to) ?? 0) + 1);
        shift.set(card.columnId, (shift.get(card.columnId) ?? 0) - 1);
        continue;
      }
      // A record whose value is not one of the columns would otherwise vanish
      // from a board that claims to show everything.
      (map.get(card.columnId) ?? map.get(fallback))?.push(card);
    }
    // A moved card lands at the top of its new column, where the slot was.
    for (const card of arrived) map.get(card.columnId)?.unshift(card);

    const counts = new Map(
      columns.map((column) => [
        column.id,
        column.count === undefined
          ? (map.get(column.id)?.length ?? 0)
          : column.count + (shift.get(column.id) ?? 0),
      ]),
    );
    return { byColumn: map, counts };
  }, [columns, cards, pending]);

  // Read through refs so the handlers below stay stable and the memoised
  // cards and columns are not re-rendered by every move.
  const latest = useRef({ byColumn, cards, columns, onMove });
  useEffect(() => {
    latest.current = { byColumn, cards, columns, onMove };
  });

  const columnOf = useCallback((cardId: string) => {
    for (const [columnId, list] of latest.current.byColumn) {
      if (list.some((card) => card.id === cardId)) return columnId;
    }
    return undefined;
  }, []);

  const move = useCallback(
    (cardId: string, toColumnId: string) => {
      const save = latest.current.onMove;
      if (!save || columnOf(cardId) === toColumnId) return;

      setPending((previous) => new Map(previous).set(cardId, toColumnId));
      const settle = () =>
        setPending((previous) => {
          if (previous.get(cardId) !== toColumnId) return previous;
          const next = new Map(previous);
          next.delete(cardId);
          return next;
        });
      save(cardId, toColumnId).then(settle, settle);
    },
    [columnOf],
  );

  const actions = useMemo<BoardActions>(
    () => ({ columns, columnOf, move }),
    [columns, columnOf, move],
  );

  const nameOf = useCallback(
    (id: UniqueIdentifier | undefined) =>
      latest.current.columns.find((column) => column.id === id)?.name ?? "no column",
    [],
  );
  const labelOf = useCallback(
    (id: UniqueIdentifier) =>
      latest.current.cards.find((card) => card.id === id)?.label ?? "the card",
    [],
  );

  const announcements = useMemo<Announcements>(
    () => ({
      onDragStart: ({ active }) =>
        `Picked up ${labelOf(active.id)} from ${nameOf(columnOf(String(active.id)))}.`,
      onDragOver: ({ over }) => (over ? `Over ${nameOf(over.id)}.` : "Not over a column."),
      onDragEnd: ({ active, over }) =>
        over
          ? `Moved ${labelOf(active.id)} to ${nameOf(over.id)}.`
          : `Put ${labelOf(active.id)} back.`,
      onDragCancel: ({ active }) => `Put ${labelOf(active.id)} back.`,
    }),
    [columnOf, labelOf, nameOf],
  );

  if (isLoading) {
    return (
      // A phone is about to get a list, so it waits for a list — not a strip
      // of column skeletons, of which it can see one and a quarter.
      <div className="space-y-2 pt-3 lg:flex lg:gap-3 lg:space-y-0" aria-busy="true">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton
            key={index}
            className="h-16 w-full rounded-[var(--radius-lg)] lg:h-96 lg:w-72 lg:shrink-0"
          />
        ))}
      </div>
    );
  }

  if (columns.length === 0) {
    return <EmptyState title="Nothing to group by" />;
  }

  const handleDragStart = ({ active, activatorEvent }: DragStartEvent) => {
    const id = String(active.id);
    const from = columnOf(id);
    const card = latest.current.cards.find((candidate) => candidate.id === id);
    if (!card || !from) return;
    // Measured off the card that was grabbed. dnd-kit has not measured it yet
    // when this fires, and a slot sized from that is a slot zero pixels tall.
    const grabbed =
      activatorEvent.target instanceof Element
        ? activatorEvent.target.closest("[data-board-card]")
        : null;
    setDragging({ card, from, height: grabbed?.getBoundingClientRect().height ?? 0 });
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setDragging(null);
    droppedAt.current = performance.now();
    if (over) move(String(active.id), String(over.id));
  };

  return (
    <>
      <MobileBoard
        className="lg:hidden"
        noun={noun}
        emptyTitle={emptyLabel}
        stages={columns.map((column) => {
          const list = byColumn.get(column.id) ?? [];
          return {
            id: column.id,
            label: column.name,
            dot: column.dot,
            count: counts.get(column.id) ?? list.length,
            meta: column.total,
            rows: list.map((card) => ({
              id: card.id,
              href: card.href,
              ...(card.row ?? { title: card.label }),
            })),
          };
        })}
      />

      {/* The board itself is desktop-only. A phone gets the list above, and
          restaging there happens on the record, where the stage control is. */}
      <BoardActionsContext.Provider value={actions}>
        <DndContext
          sensors={sensors}
          collisionDetection={pointerFirst}
          // Sideways only. A column never needs scrolling to find a place for
          // the card — it always lands at the top.
          autoScroll={{ threshold: { x: 0.12, y: 0 } }}
          accessibility={{
            announcements,
            screenReaderInstructions: {
              draggable:
                "Press space to pick up the card. Use the left and right arrow keys to move it between columns, then press space to drop it or escape to put it back.",
            },
          }}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setDragging(null)}
        >
          <div
            ref={railRef}
            className={cn(
              "scroll-rail hidden min-h-96 gap-3 overflow-x-auto pb-3 pt-3 lg:flex",
              dragging && "cursor-grabbing",
              className,
            )}
            // A drag that ends over a card's link would otherwise also click
            // it and open the record the reader was only moving.
            onClickCapture={(event) => {
              if (performance.now() - droppedAt.current < 300) {
                event.preventDefault();
                event.stopPropagation();
              }
            }}
          >
            {columns.map((column) => (
              <BoardLane
                key={column.id}
                column={column}
                cards={byColumn.get(column.id) ?? []}
                count={counts.get(column.id) ?? 0}
                emptyLabel={emptyLabel}
                dragging={dragging}
              />
            ))}
          </div>

          <DragOverlay dropAnimation={DROP_ANIMATION}>
            {dragging ? (
              <div
                className={cn(
                  "cursor-grabbing rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--surface)] p-3",
                  "shadow-[var(--shadow-popover)] transition-[scale,box-shadow] duration-[var(--dur-fast)] ease-[var(--ease-out)]",
                  // Lifts off the tray as it is picked up.
                  "scale-[1.02] starting:scale-100 starting:shadow-none motion-reduce:scale-100",
                )}
              >
                {dragging.card.content}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </BoardActionsContext.Provider>
    </>
  );
}
