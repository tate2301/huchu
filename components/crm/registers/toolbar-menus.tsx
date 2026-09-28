"use client";

import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { Badge, Switch } from "@corelithzw/react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  ArrowDownward,
  ArrowUpward,
  ChevronDown,
  Columns,
  GripVertical,
  Layers,
  RotateCcw,
  Rows,
  SortAscending,
} from "@/lib/icons";
import type { ColumnDef } from "@/lib/crm/registers/types";
import { cn } from "@/lib/utils";

import type { RegisterHandle } from "./use-register";

/**
 * Which view the list is showing, and the others it could show.
 *
 * The trigger names the view and says when the list has wandered from it —
 * "Modified" — because a list that quietly differs from what its name says
 * is how somebody exports the wrong records.
 */
export function ViewsMenu({ register }: { register: RegisterHandle }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="max-w-[14rem] shrink-0 gap-1.5 max-sm:w-full max-sm:max-w-none max-sm:justify-start"
        >
          <Layers className="size-4 shrink-0" aria-hidden="true" />
          <span className="truncate font-semibold text-[var(--text-strong)]">{register.view.name}</span>
          {register.dirty ? (
            // A dot, and the word for a screen reader: the list has wandered
            // from the view its name promises.
            <span className="flex shrink-0 items-center" title="Changed from the saved view">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-[var(--tone-warn)]" />
              <span className="sr-only">, modified</span>
            </span>
          ) : null}
          <ChevronDown className="size-3 shrink-0 text-[var(--text-subtle)] max-sm:ml-auto" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel>Views</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={register.dirty ? "" : register.view.key}
          onValueChange={(key) => {
            const view = register.views.find((candidate) => candidate.key === key);
            if (view) register.applyView(view);
          }}
        >
          {register.views.map((view) => (
            <DropdownMenuRadioItem key={view.key} value={view.key}>
              {view.name}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        {register.dirty ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => register.resetView()}>
              <RotateCcw className="size-4" aria-hidden="true" />
              Back to “{register.view.name}”
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** How the rows are ordered: one key, one direction. */
export function SortMenu({ register }: { register: RegisterHandle }) {
  const sorts = register.def.sorts;
  const current = register.state.sort ?? { key: sorts[0].key, dir: sorts[0].dir };
  const label = sorts.find((sort) => sort.key === current.key)?.label ?? sorts[0].label;
  const Arrow = current.dir === "asc" ? ArrowUpward : ArrowDownward;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="shrink-0 gap-1.5 whitespace-nowrap">
          {/* The label and the arrow already say it is an order; the mark
              waits for the room 2xl has. */}
          <SortAscending className="size-4 max-2xl:sm:hidden" aria-hidden="true" />
          <span className="max-sm:not-sr-only sr-only 2xl:not-sr-only">Sort</span>
          <span className="font-semibold text-[var(--text-strong)]">{label}</span>
          <Arrow className="size-3 text-[var(--text-subtle)]" aria-label={current.dir === "asc" ? "ascending" : "descending"} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Sort by</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={current.key}
          onValueChange={(key) => {
            const sort = sorts.find((candidate) => candidate.key === key);
            if (sort) register.setSort({ key: sort.key, dir: sort.dir });
          }}
        >
          {sorts.map((sort) => (
            <DropdownMenuRadioItem key={sort.key} value={sort.key}>
              {sort.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          value={current.dir}
          onValueChange={(dir) => register.setSort({ key: current.key, dir: dir === "desc" ? "desc" : "asc" })}
        >
          <DropdownMenuRadioItem value="asc">Ascending</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="desc">Descending</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** A value for "not grouped" that Radix can hold: an empty string is no selection at all. */
const UNGROUPED = "__none";

/**
 * Rows grouped by one field — owner, type, company — each group under a
 * heading with how many it holds in the whole list. Named on the button once
 * it is on ("Owner"), so a grouped list says so without being opened.
 */
export function GroupByMenu({ register }: { register: RegisterHandle }) {
  const options = register.def.groupBys ?? [];
  if (options.length === 0) return null;
  const current = options.find((option) => option.key === register.state.by);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="shrink-0 gap-1.5 whitespace-nowrap">
          <Rows className="size-4" aria-hidden="true" />
          {/* "Group by", not "Group": the Group filter asks which named
              group, and two controls both called Group read as one. */}
          <span className="max-sm:not-sr-only sr-only 2xl:not-sr-only">Group by</span>
          {current ? <span className="font-semibold text-[var(--text-strong)]">{current.label}</span> : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        <DropdownMenuLabel>Group rows by</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={current?.key ?? UNGROUPED}
          onValueChange={(key) => register.setBy(key === UNGROUPED ? undefined : key)}
        >
          <DropdownMenuRadioItem value={UNGROUPED}>Nothing</DropdownMenuRadioItem>
          {options.map((option) => (
            <DropdownMenuRadioItem key={option.key} value={option.key}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SortableColumn({
  column,
  register,
}: {
  column: ColumnDef;
  register: RegisterHandle;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: column.id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex items-center gap-2 rounded-[var(--radius-sm)] px-1.5 py-1",
        isDragging ? "bg-[var(--surface-subtle)] shadow-[var(--shadow-sm)]" : "hover:bg-[var(--surface-subtle)]",
      )}
    >
      <button
        type="button"
        className="flex size-6 shrink-0 cursor-grab items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-subtle)] active:cursor-grabbing"
        aria-label={`Move ${column.label}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" aria-hidden="true" />
      </button>
      <span className="min-w-0 flex-1 truncate text-sm">{column.label}</span>
      <Switch
        checked
        disabled={column.required}
        onChange={() => register.columns.toggle(column.id)}
        aria-label={`Show ${column.label}`}
      />
    </li>
  );
}

/**
 * Which columns, in what order. Shown columns are dragged into order (or
 * moved with the keyboard); the rest wait below, off. The one column a table
 * is not a table without stays on (IDENT-6).
 */
export function ColumnsMenu({ register }: { register: RegisterHandle }) {
  const { columns } = register;
  const byId = new Map(columns.all.map((column) => [column.id, column]));
  const shown = columns.visible.map((id) => byId.get(id)).filter((column): column is ColumnDef => Boolean(column));
  const hidden = columns.all.filter((column) => !columns.visible.includes(column.id));

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    columns.move(String(active.id), columns.visible.indexOf(String(over.id)));
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="shrink-0 gap-1.5">
          <Columns className="size-4" aria-hidden="true" />
          <span className="max-sm:not-sr-only sr-only 2xl:not-sr-only">Columns</span>
          {hidden.length > 0 ? (
            <Badge tone="neutral" size="sm">
              {shown.length}/{columns.all.length}
            </Badge>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <div className="max-h-96 overflow-y-auto p-1.5">
          <p className="px-1.5 pb-1 pt-0.5 acct-col-head">
            Shown, in order
          </p>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={columns.visible} strategy={verticalListSortingStrategy}>
              <ul>
                {shown.map((column) => (
                  <SortableColumn key={column.id} column={column} register={register} />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
          {hidden.length > 0 ? (
            <>
              <p className="mt-2 border-t border-[var(--border-subtle)] px-1.5 pb-1 pt-2 acct-col-head">
                Hidden
              </p>
              <ul>
                {hidden.map((column) => (
                  <li
                    key={column.id}
                    className="flex items-center gap-2 rounded-[var(--radius-sm)] px-1.5 py-1 hover:bg-[var(--surface-subtle)]"
                  >
                    <span className="size-6 shrink-0" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate text-sm text-[var(--text-muted)]">{column.label}</span>
                    <Switch
                      checked={false}
                      onChange={() => columns.toggle(column.id)}
                      aria-label={`Show ${column.label}`}
                    />
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
        {columns.changed ? (
          <div className="flex justify-end border-t border-[var(--border-subtle)] p-1.5">
            <Button type="button" variant="ghost" size="sm" onClick={columns.reset}>
              Reset columns
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
