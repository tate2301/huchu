"use client";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useId } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DotsSixVertical, TableRows } from "@/lib/icons";
import type { ReportColumn, ReportView } from "@/lib/reports/types";
import { cn } from "@/lib/utils";

/**
 * Which columns a report shows and in what order: drag to move, tick to show.
 * A hidden column keeps its place, so showing it again puts it back where it was.
 */

function ColumnLine({
  column,
  hidden,
  onToggle,
}: {
  column: ReportColumn;
  hidden: boolean;
  onToggle: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: column.key });
  const id = useId();
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      data-dragging={isDragging ? "" : undefined}
      className={cn(
        "flex h-8 items-center gap-2 rounded-[var(--radius-sm)] pr-2 hover:bg-[var(--canvas)]",
        isDragging && "relative z-[1] bg-[var(--surface)] shadow-[var(--shadow-popover)]",
      )}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`Move ${column.label}`}
        className="flex h-8 w-6 cursor-grab touch-none items-center justify-center text-[var(--text-subtle)]"
      >
        <DotsSixVertical className="size-3.5" />
      </button>
      <Checkbox id={id} checked={!hidden} onCheckedChange={onToggle} />
      <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer truncate text-sm text-[var(--text)]">
        {column.label}
      </label>
    </li>
  );
}

export function ReportColumns({
  columns,
  view,
  onViewChange,
}: {
  columns: ReportColumn[];
  view: ReportView;
  onViewChange: (view: ReportView) => void;
}) {
  const dndId = useId();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const byKey = new Map(columns.map((column) => [column.key, column]));
  const keys = view.columns.map((entry) => entry.key);
  const shown = view.columns.filter((entry) => !entry.hidden).length;

  const onDragEnd = (event: DragEndEvent) => {
    const from = keys.indexOf(String(event.active.id));
    const to = event.over ? keys.indexOf(String(event.over.id)) : -1;
    if (from >= 0 && to >= 0 && from !== to) onViewChange({ ...view, columns: arrayMove(view.columns, from, to) });
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="secondary" size="sm">
          <TableRows className="size-4" aria-hidden="true" />
          Columns
          <span className="font-mono text-[11px] tabular-nums text-[var(--text-muted)]">
            {shown}/{view.columns.length}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-1.5">
        <DndContext id={dndId} sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={keys} strategy={verticalListSortingStrategy}>
            <ul className="grid max-h-[22rem] gap-px overflow-y-auto">
              {view.columns.map((entry, index) => {
                const column = byKey.get(entry.key);
                if (!column) return null;
                return (
                  <ColumnLine
                    key={entry.key}
                    column={column}
                    hidden={entry.hidden}
                    onToggle={() => {
                      // The last column showing stays: a table of nothing is not a view.
                      if (!entry.hidden && shown === 1) return;
                      const next = [...view.columns];
                      next[index] = { ...entry, hidden: !entry.hidden };
                      onViewChange({ ...view, columns: next });
                    }}
                  />
                );
              })}
            </ul>
          </SortableContext>
        </DndContext>
      </PopoverContent>
    </Popover>
  );
}
