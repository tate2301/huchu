"use client";

import { useId, useState, type ReactNode } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CopySimple, DotsSixVertical, DotsThree, Plus, Trash2, Warning } from "@/lib/icons";

import { KindMenuList, matchKinds, useKindMenu, type EditorKind } from "./kind-menu";
import styles from "./page-editor.module.css";

export type { EditorKind };

export type EditorItemContext = {
  selected: boolean;
  /**
   * Enter on the item's last line: go on to the next item's first input, or
   * to the line for a new one. Pass the element the key was pressed in.
   */
  onEnter: (from: HTMLElement) => void;
};

export type PageEditorProps<T> = {
  items: T[];
  onChange: (items: T[]) => void;
  /** What can be put on the page, offered by `/` and by the `+` beside an item. */
  kinds: readonly EditorKind[];
  /** A new item. `text` is what was typed on the add line before Enter, if anything. */
  create: (kindId: string, text: string, existing: readonly T[]) => T;
  /** The kind plain typing on the add line becomes. */
  defaultKind: string;
  /** The item, edited where it sits. */
  renderItem: (item: T, update: (next: T) => void, context: EditorItemContext) => ReactNode;
  /** The selected item's own controls; duplicate and delete are the row's. */
  renderToolbar?: (item: T, update: (next: T) => void) => ReactNode;
  duplicate: (item: T, existing: readonly T[]) => T;
  /** Adjust an edit against the rest of the page — a key that follows its label. */
  normalize?: (previous: T, next: T, others: readonly T[]) => T;
  /** How an item is named to a screen reader: "Move {name}". */
  itemName: (item: T) => string;
  addPlaceholder: string;
  header?: ReactNode;
  before?: ReactNode;
  after?: ReactNode;
  /** What stands between this page and a save. Shown under the last item. */
  problems?: readonly string[];
};

let uidCounter = 0;
const nextUid = () => `item${(uidCounter += 1)}`;

/**
 * A page that is its own editor, the way Tally and Notion work.
 *
 * Items are edited where they sit. The line under the last item takes typing —
 * Enter makes it an item of the default kind — and `/` there offers every
 * kind, narrowing as you type. `+` beside any item puts a new one under it.
 * The handle beside it drags it, and moves it from the keyboard too (space to
 * lift, arrows, space to drop). Selecting an item shows its toolbar. There is
 * no palette and no inspector: the page is where the work is.
 */
export function PageEditor<T>({
  items,
  onChange,
  kinds,
  create,
  defaultKind,
  renderItem,
  renderToolbar,
  duplicate,
  normalize,
  itemName,
  addPlaceholder,
  header,
  before,
  after,
  problems = [],
}: PageEditorProps<T>) {
  // Focus moves by the page's own markup — each row is marked with its id and
  // the add line with `data-editor-add` — so no element registry is kept.
  const pageId = useId();
  // Ids that survive reordering and edits, which nothing on an item can. The
  // first ones are named after the page so the server and the browser agree;
  // later ones only ever exist in the browser.
  const [uids, setUids] = useState<string[]>(() => items.map((_, index) => `${pageId}:${index}`));
  const [selected, setSelected] = useState<string | null>(null);

  // The parent replaced the list (a load, a reset): re-align the ids to it.
  if (uids.length !== items.length) {
    setUids(items.map((_, index) => uids[index] ?? nextUid()));
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const within = (selector: string) =>
    document.querySelector<HTMLElement>(`[data-editor-page="${window.CSS.escape(pageId)}"] ${selector}`);

  // The item's own first text field — never a control in its toolbar, which
  // sits ahead of it in the row and would otherwise take a new item's focus.
  const focusFirstIn = (row: Element | null) => {
    const input = [...(row?.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea") ?? [])].find(
      (candidate) =>
        !candidate.closest('[role="toolbar"]') && candidate.type !== "checkbox" && candidate.type !== "radio",
    );
    input?.focus();
    if (input?.value) input.select();
  };

  const focusItem = (uid: string) =>
    requestAnimationFrame(() => focusFirstIn(within(`[data-editor-row="${window.CSS.escape(uid)}"]`)));

  const focusAddLine = () => requestAnimationFrame(() => within("[data-editor-add]")?.focus());

  const onEnter = (from: HTMLElement) => {
    const next = from.closest("[data-editor-row]")?.nextElementSibling ?? null;
    if (next) focusFirstIn(next);
    else within("[data-editor-add]")?.focus();
  };

  function insert(kindId: string, at: number, text = "") {
    const item = create(kindId, text, items);
    const uid = nextUid();
    onChange([...items.slice(0, at), item, ...items.slice(at)]);
    setUids([...uids.slice(0, at), uid, ...uids.slice(at)]);
    setSelected(uid);
    focusItem(uid);
  }

  function update(index: number, next: T) {
    const others = items.filter((_, at) => at !== index);
    const adjusted = normalize ? normalize(items[index], next, others) : next;
    onChange(items.map((existing, at) => (at === index ? adjusted : existing)));
  }

  function copy(index: number) {
    const item = duplicate(items[index], items);
    const uid = nextUid();
    onChange([...items.slice(0, index + 1), item, ...items.slice(index + 1)]);
    setUids([...uids.slice(0, index + 1), uid, ...uids.slice(index + 1)]);
    setSelected(uid);
    focusItem(uid);
  }

  function remove(index: number) {
    onChange(items.filter((_, at) => at !== index));
    setUids(uids.filter((_, at) => at !== index));
    const next = uids[index + 1] ?? uids[index - 1] ?? null;
    setSelected(next);
    if (next) focusItem(next);
    else focusAddLine();
  }

  function onDragEnd(event: DragEndEvent) {
    const from = uids.indexOf(String(event.active.id));
    const to = event.over ? uids.indexOf(String(event.over.id)) : -1;
    if (from < 0 || to < 0 || from === to) return;
    onChange(arrayMove(items, from, to));
    setUids(arrayMove(uids, from, to));
  }

  return (
    <div
      className={styles.canvas}
      data-editor-page={pageId}
      onKeyDown={(event) => {
        if (event.key === "Escape" && selected) {
          setSelected(null);
          (document.activeElement as HTMLElement | null)?.blur();
        }
      }}
    >
      <div className={styles.page}>
        {header}
        {before}

        <DndContext id={pageId} sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={uids} strategy={verticalListSortingStrategy}>
            <div className={styles.items}>
              {items.map((item, index) => {
                const uid = uids[index];
                const isSelected = selected === uid;
                const set = (next: T) => update(index, next);
                return (
                  <Row
                    key={uid}
                    uid={uid}
                    name={itemName(item)}
                    selected={isSelected}
                    kinds={kinds}
                    onSelect={() => setSelected(uid)}
                    onInsertBelow={(kindId) => insert(kindId, index + 1)}
                    onDuplicate={() => copy(index)}
                    onRemove={() => remove(index)}
                    toolbar={renderToolbar ? renderToolbar(item, set) : null}
                  >
                    {renderItem(item, set, { selected: isSelected, onEnter })}
                  </Row>
                );
              })}
            </div>
          </SortableContext>
        </DndContext>

        <AddLine
          kinds={kinds}
          placeholder={addPlaceholder}
          onAdd={(kindId, text) => insert(kindId || defaultKind, items.length, text)}
        />

        {problems.length > 0 ? (
          <ul className={styles.problems} aria-label="Before this can be saved">
            {problems.map((problem) => (
              <li key={problem}>
                <Warning aria-hidden="true" />
                {problem}
              </li>
            ))}
          </ul>
        ) : null}

        {after}
      </div>
    </div>
  );
}

function Row({
  uid,
  name,
  selected,
  kinds,
  toolbar,
  onSelect,
  onInsertBelow,
  onDuplicate,
  onRemove,
  children,
}: {
  uid: string;
  name: string;
  selected: boolean;
  kinds: readonly EditorKind[];
  toolbar: ReactNode;
  onSelect: () => void;
  onInsertBelow: (kindId: string) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: uid });

  return (
    <div
      ref={setNodeRef}
      className={styles.row}
      data-editor-row={uid}
      data-selected={selected || undefined}
      data-dragging={isDragging || undefined}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      // Focus is what selects an item — tabbing into it or clicking an input —
      // so the keyboard path and the pointer path are one path. Clicking a
      // drawn part (a rule, a scale) selects it too.
      onFocusCapture={onSelect}
      onPointerDown={onSelect}
    >
      <div className={styles.gutter}>
        <GutterInsert kinds={kinds} onPick={onInsertBelow} />
        <button
          type="button"
          ref={setActivatorNodeRef}
          className={styles.handle}
          aria-label={`Move ${name}`}
          {...attributes}
          {...listeners}
        >
          <DotsSixVertical aria-hidden="true" />
        </button>
      </div>

      {selected ? (
        <div className={styles.toolbar} role="toolbar" aria-label={name}>
          {toolbar}
          {toolbar ? <span className={styles.toolbarRule} aria-hidden="true" /> : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className={styles.toolbarButton} aria-label="More">
                <DotsThree aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={onDuplicate}>
                <CopySimple aria-hidden="true" />
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onRemove}>
                <Trash2 aria-hidden="true" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : null}

      {children}
    </div>
  );
}

/**
 * The line under the last item. Type and press Enter for an item of the
 * default kind; type `/` for every kind, narrowing as you type.
 */
function AddLine({
  kinds,
  placeholder,
  onAdd,
}: {
  kinds: readonly EditorKind[];
  placeholder: string;
  /** A kind id ("" for the default) and the words typed. */
  onAdd: (kindId: string, text: string) => void;
}) {
  const listId = useId();
  const [text, setText] = useState("");
  const slash = text.startsWith("/");
  const options = slash ? matchKinds(kinds, text.slice(1)) : [];
  const pick = (kind: EditorKind) => {
    onAdd(kind.id, "");
    setText("");
  };
  const menu = useKindMenu(options, pick, () => setText(""));

  return (
    <Popover open={slash} onOpenChange={(open) => (open ? null : setText(""))}>
      <PopoverAnchor asChild>
        <div className={styles.addLine}>
          <Plus className={styles.addLineIcon} aria-hidden="true" />
          <input
            data-editor-add=""
            className={styles.addLineInput}
            value={text}
            placeholder={placeholder}
            aria-label={placeholder}
            role="combobox"
            aria-expanded={slash}
            aria-controls={slash ? listId : undefined}
            aria-activedescendant={slash && options[menu.active] ? `${listId}-${options[menu.active].id}` : undefined}
            onChange={(event) => {
              setText(event.target.value);
              menu.setActive(0);
            }}
            onKeyDown={(event) => {
              if (slash) {
                menu.onKeyDown(event);
                return;
              }
              if (event.key === "Enter" && text.trim() && !event.nativeEvent.isComposing) {
                event.preventDefault();
                onAdd("", text.trim());
                setText("");
              }
            }}
          />
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        className={`${styles.menu} w-64 p-1.5`}
        // The author is still typing the filter; the menu must not take focus.
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <KindMenuList id={listId} options={options} active={menu.active} onHover={menu.setActive} onPick={pick} />
      </PopoverContent>
    </Popover>
  );
}

/** The + beside an item: a new item directly beneath it. */
function GutterInsert({
  kinds,
  onPick,
}: {
  kinds: readonly EditorKind[];
  onPick: (kindId: string) => void;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const options = matchKinds(kinds, query);
  const close = () => {
    setOpen(false);
    setQuery("");
  };
  const pick = (kind: EditorKind) => {
    onPick(kind.id);
    close();
  };
  const menu = useKindMenu(options, pick, close);

  return (
    <Popover open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
      <PopoverTrigger asChild>
        <button type="button" className={styles.handle} aria-label="Add below">
          <Plus aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className={`${styles.menu} w-64 p-1.5`}>
        <input
          ref={(element) => element?.focus()}
          className={styles.menuSearch}
          value={query}
          placeholder="Search"
          aria-label="Search"
          role="combobox"
          aria-expanded
          aria-controls={listId}
          aria-activedescendant={options[menu.active] ? `${listId}-${options[menu.active].id}` : undefined}
          onChange={(event) => {
            setQuery(event.target.value);
            menu.setActive(0);
          }}
          onKeyDown={menu.onKeyDown}
        />
        <KindMenuList id={listId} options={options} active={menu.active} onHover={menu.setActive} onPick={pick} />
      </PopoverContent>
    </Popover>
  );
}
