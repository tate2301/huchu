"use client";

import * as React from "react";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { Icon, type IconName } from "@/components/core";
import { MenuButton } from "@/components/core/menu";

/** A kind of block the outline can add. */
export type BlockKind = { id: string; label: string; icon: IconName };

/** How a block is listed: its icon, its name, and the question it reads, if any. */
export type OutlineEntry = { id: string; icon: IconName; title: string; question?: string };

function OutlineRow({
  entry,
  selected,
  onSelect,
  onNudge,
}: {
  entry: OutlineEntry;
  selected: boolean;
  onSelect: () => void;
  onNudge: (by: -1 | 1) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: entry.id });
  return (
    <button
      ref={setNodeRef}
      type="button"
      className={["oi", selected && "is-on", isDragging && "is-dragging"].filter(Boolean).join(" ")}
      aria-current={selected ? "true" : undefined}
      aria-roledescription={attributes["aria-roledescription"]}
      aria-describedby={attributes["aria-describedby"]}
      title={`${entry.title}. Drag, or Alt and an arrow, to move it`}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
        event.preventDefault();
        onNudge(event.key === "ArrowUp" ? -1 : 1);
      }}
      {...listeners}
    >
      <Icon name={entry.icon} />
      <span className="oi-t">{entry.title}</span>
      {entry.question ? <span className="oi-q">{entry.question}</span> : null}
    </button>
  );
}

/**
 * The builder's outline: what is on the page, in order, and Add a block (/).
 * A row selects its block; dragging a row (or Alt and an arrow) moves it.
 * `head` is the outline's top (the name and the way back); `catalogue`
 * lists kinds again under Add, as the page arranger draws it; `after`
 * is anything else the builder lists (the sources a query can read).
 */
export function BuilderOutline({
  head,
  heading,
  entries,
  selected,
  onSelect,
  onMove,
  kinds,
  onAdd,
  catalogue,
  after,
}: {
  head?: React.ReactNode;
  /** Over the blocks: "On the board", "The page". */
  heading: string;
  entries: OutlineEntry[];
  selected: string | null;
  onSelect: (id: string) => void;
  onMove: (from: number, to: number) => void;
  kinds: readonly BlockKind[];
  onAdd: (kindId: string) => void;
  /** Kinds listed again under Add, one click each (the page arranger). */
  catalogue?: readonly BlockKind[];
  after?: React.ReactNode;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const ids = entries.map((entry) => entry.id);
  const onDragEnd = (event: DragEndEvent) => {
    const from = ids.indexOf(String(event.active.id));
    const to = event.over ? ids.indexOf(String(event.over.id)) : -1;
    if (from >= 0 && to >= 0 && from !== to) onMove(from, to);
  };
  const domId = React.useId();

  return (
    <>
      {head}
      <div className="rb-add">
        <MenuButton
          icon="plus"
          iconEnd={undefined}
          shortcut="/"
          label="Add a block"
          items={kinds.map((kind) => ({ key: kind.id, label: kind.label, icon: kind.icon, onSelect: () => onAdd(kind.id) }))}
        >
          Add a block
        </MenuButton>
      </div>
      <div className="pm-body">
        <div className={catalogue ? "oh" : "pg-h"}>
          {catalogue ? null : <Icon name="down" />}
          {heading}
        </div>
        <DndContext id={domId} sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            {entries.map((entry, index) => (
              <OutlineRow
                key={entry.id}
                entry={entry}
                selected={selected === entry.id}
                onSelect={() => onSelect(entry.id)}
                onNudge={(by) => {
                  const to = index + by;
                  if (to >= 0 && to < entries.length) onMove(index, to);
                }}
              />
            ))}
          </SortableContext>
        </DndContext>
        {entries.length === 0 ? <p className="muted" style={{ padding: "4px 8px", fontSize: 13 }}>Nothing yet. Add a block, or press /.</p> : null}
        {catalogue?.length ? (
          <>
            <div className="oh">Add</div>
            {catalogue.map((kind) => (
              <button key={kind.id} type="button" className="oi" onClick={() => onAdd(kind.id)}>
                <Icon name={kind.icon} />
                <span className="oi-t">{kind.label}</span>
              </button>
            ))}
          </>
        ) : null}
        {after}
      </div>
    </>
  );
}
