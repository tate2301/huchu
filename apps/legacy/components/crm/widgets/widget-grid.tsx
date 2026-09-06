"use client";

import { useMemo, useState, type ReactNode } from "react";
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
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@corelithzw/ui/components/dropdown-menu";
import { DotsThree, Grid3x3, Plus, Trash2, X } from "@corelithzw/ui/lib/icons";
import {
  WIDGET_SPANS,
  packRows,
  widgetDefinition,
  widgetsForScope,
  type OverviewScope,
  type WidgetInstance,
  type WidgetSpan,
} from "@/lib/crm/widgets";
import { IconButton } from "@corelithzw/ui/components/icon-button";
import { cn } from "@corelithzw/ui/lib/utils";

/**
 * Tailwind cannot see a computed `col-span-${n}`, so the classes are spelled
 * out.
 *
 * A quarter and a third are two-up on a phone rather than stacked. Six metric
 * widgets at full width were six screens of one number each, and you reached
 * the bottom of the overview without ever seeing two figures at once — which
 * is the entire point of an overview. Anything a caller chose to make half the
 * page or wider stays full width: it was sized that way because its contents
 * need the room.
 */
const SPAN_CLASS: Record<WidgetSpan, string> = {
  3: "col-span-6 lg:col-span-3",
  4: "col-span-6 lg:col-span-4",
  6: "col-span-12 sm:col-span-6",
  8: "col-span-12 lg:col-span-8",
  12: "col-span-12",
};

const SPAN_LABEL: Record<WidgetSpan, string> = {
  3: "Quarter",
  4: "Third",
  6: "Half",
  8: "Two thirds",
  12: "Full width",
};

function WidgetFrame({
  instance,
  editing,
  interactiveWhileEditing,
  children,
  onResize,
  onRemove,
}: {
  instance: WidgetInstance;
  editing: boolean;
  /** The widget is written in, not just read — leave it clickable. */
  interactiveWhileEditing?: boolean;
  children: ReactNode;
  onResize: (span: WidgetSpan) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: instance.id,
    disabled: !editing,
  });

  const definition = widgetDefinition(instance.type);

  return (
    <section
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        transition:
          transition ??
          "transform var(--motion-duration-base, 180ms) var(--motion-ease-standard, ease)",
      }}
      className={cn(
        "group/widget relative col-span-12 min-w-0",
        SPAN_CLASS[instance.span],
        isDragging && "opacity-50",
      )}
      aria-label={definition?.label}
    >
      {editing ? (
        <div className="absolute right-2 top-2 z-10 flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton size="sm" aria-label="Widget options">
                <DotsThree />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {WIDGET_SPANS.map((span) => (
                <DropdownMenuItem
                  key={span}
                  onClick={() => onResize(span)}
                  className={span === instance.span ? "font-medium" : undefined}
                >
                  {SPAN_LABEL[span]}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-[var(--status-error-text)]"
                onClick={onRemove}
              >
                <Trash2 className="size-4" />
                Remove
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* The handle is the whole point of edit mode being a mode: a card
              you can accidentally drag while reading it is worse than one you
              have to opt into moving. */}
          <button
            type="button"
            aria-label={`Move ${definition?.label ?? "widget"}`}
            className="flex size-7 cursor-grab touch-manipulation select-none items-center justify-center rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] text-[var(--text-subtle)] active:cursor-grabbing pointer-coarse:size-10"
            {...attributes}
            {...listeners}
          >
            <Grid3x3 className="size-3.5" />
          </button>
        </div>
      ) : null}

      {/* Cards are inert while rearranging so a click lands on the tile rather
          than inside it — except the ones somebody edits in place, which is
          the whole point of being in edit mode. */}
      <div className={cn(editing && !interactiveWhileEditing && "pointer-events-none")}>
        {children}
      </div>
    </section>
  );
}

/**
 * An overview page you can rearrange.
 *
 * Editing is a mode rather than always-on. A dashboard is read far more often
 * than it is rearranged, and a card that moves when you meant to click a
 * number in it is a worse trade than a button you press once a month.
 *
 * Widths come from a five-step scale rather than free resizing. Free widths
 * produce dashboards with a two-pixel gutter down one side and nothing lines
 * up with anything; five steps over twelve columns covers every arrangement
 * anybody actually wants and always tiles.
 */
export function WidgetGrid({
  scope,
  widgets,
  editing,
  onChange,
  renderWidget,
  noun = "widget",
  adding: controlledAdding,
  onAddingChange,
}: {
  scope: OverviewScope;
  widgets: WidgetInstance[];
  editing: boolean;
  onChange: (next: WidgetInstance[]) => void;
  renderWidget: (instance: WidgetInstance) => ReactNode;
  /** What one of these is called here — "widget" on an overview, "report" on reports. */
  noun?: string;
  /** Controlled when the page has its own "Add …" button in the app bar. */
  adding?: boolean;
  onAddingChange?: (open: boolean) => void;
}) {
  const [uncontrolledAdding, setUncontrolledAdding] = useState(false);
  const adding = controlledAdding ?? uncontrolledAdding;
  const setAdding = (next: boolean) => {
    setUncontrolledAdding(next);
    onAddingChange?.(next);
  };

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

  const available = useMemo(() => {
    const used = new Set(widgets.map((widget) => widget.type));
    return widgetsForScope(scope).filter((definition) => !used.has(definition.type));
  }, [scope, widgets]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = widgets.findIndex((widget) => widget.id === active.id);
    const to = widgets.findIndex((widget) => widget.id === over.id);
    if (from === -1 || to === -1) return;
    // Packed rather than left where it landed: order is what somebody is
    // choosing, and widths follow from it so a row is never left ragged.
    onChange(packRows(arrayMove(widgets, from, to)));
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={widgets.map((widget) => widget.id)} strategy={rectSortingStrategy}>
        <div className="grid grid-cols-12 gap-4">
          {widgets.map((instance) => (
            <WidgetFrame
              key={instance.id}
              instance={instance}
              editing={editing}
              interactiveWhileEditing={instance.type === "custom-note"}
              onResize={(span) =>
                onChange(
                  packRows(
                    widgets.map((widget) =>
                      widget.id === instance.id ? { ...widget, span } : widget,
                    ),
                  ),
                )
              }
              onRemove={() =>
                onChange(packRows(widgets.filter((widget) => widget.id !== instance.id)))
              }
            >
              {renderWidget(instance)}
            </WidgetFrame>
          ))}

          {editing ? (
            <div className="col-span-12 lg:col-span-4">
              <button
                type="button"
                onClick={() => setAdding(!adding)}
                className="flex h-full min-h-32 w-full flex-col items-center justify-center gap-1 rounded-[var(--card-radius)] border border-dashed border-[var(--border)] text-sm text-[var(--text-muted)] hover:border-[var(--interactive-primary)] hover:text-[var(--text)]"
              >
                <Plus className="size-5" />
                Add a {noun}
              </button>
            </div>
          ) : null}
        </div>
      </SortableContext>

      {editing && adding ? (
        <div className="mt-4 rounded-[var(--card-radius)] border border-[var(--border)] p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-base font-semibold text-[var(--text-strong)]">Add a widget</h3>
            <button
              type="button"
              onClick={() => setAdding(false)}
              aria-label="Close"
              className="flex size-6 items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-subtle)] hover:bg-[var(--surface-muted)]"
            >
              <X className="size-4" />
            </button>
          </div>

          {available.length === 0 ? (
            <p className="py-3 text-center text-sm text-[var(--text-muted)]">
              Everything that fits this page is already on it.
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {available.map((definition) => (
                <button
                  key={definition.type}
                  type="button"
                  onClick={() => {
                    onChange(
                      packRows([
                        ...widgets,
                        {
                          // Unique within the layout — the id is the drag key,
                          // and two widgets of one type would otherwise collide.
                          id: `${definition.type}-${widgets.length + 1}`,
                          type: definition.type,
                          span: definition.defaultSpan,
                        },
                      ]),
                    );
                    setAdding(false);
                  }}
                  className="rounded-[var(--radius-md)] border border-[var(--border)] p-2.5 text-left hover:border-[var(--interactive-primary)] hover:bg-[var(--surface-hover)]"
                >
                  <span className="block text-sm font-medium">{definition.label}</span>
                  <span className="mt-0.5 block text-sm text-[var(--text-muted)]">
                    {definition.description}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </DndContext>
  );
}
