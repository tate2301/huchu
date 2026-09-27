"use client";

import type { RecordTableColumn, RecordTableSort } from "@/components/records/record-table";
import { activeFilterCount } from "@/lib/crm/registers/codec";

import type { RegisterHandle } from "./use-register";

/** How a list draws one of its columns: everything but its name and its sort, which the list's definition owns. */
export type ColumnRenderer<T> = Omit<RecordTableColumn<T>, "id" | "label" | "sortKey">;

/**
 * The table's columns, in the reader's order, named and made sortable by the
 * list's definition. A column the screen has no way to draw is left out
 * rather than drawn blank.
 */
export function registerColumns<T>(
  register: RegisterHandle,
  renderers: Record<string, ColumnRenderer<T>>,
): RecordTableColumn<T>[] {
  const defs = new Map(register.def.columns.map((column) => [column.id, column]));
  return register.columns.visible.flatMap((id) => {
    const def = defs.get(id);
    const renderer = renderers[id];
    if (!def || !renderer) return [];
    return [{ ...renderer, id, label: def.label, sortKey: def.sort }];
  });
}

/** Clicking a sorted header turns the order round; clicking another sorts by it in its natural direction. */
export function tableSort(register: RegisterHandle): RecordTableSort {
  const sorts = register.def.sorts;
  const current = register.state.sort ?? { key: sorts[0].key, dir: sorts[0].dir };
  return {
    ...current,
    onSort: (key) =>
      register.setSort(
        key === current.key
          ? { key, dir: current.dir === "asc" ? "desc" : "asc" }
          : { key, dir: sorts.find((sort) => sort.key === key)?.dir ?? "asc" },
      ),
  };
}

/**
 * The three reasons a list is empty, and a sentence each (STATE-1). "No
 * people yet" over a list a filter has emptied sends somebody off to add a
 * person they already have.
 */
export function emptyState(
  register: RegisterHandle,
  copy: { none: string; noneBody?: string },
): { title: string; body?: string; kind: "search" | "filtered" | "archived" | "none" } {
  const { state, def } = register;
  if (state.q?.trim()) return { title: `No ${def.noun.many} match that search`, kind: "search" };
  if (state.filters.archived === true && activeFilterCount(state) === 1) {
    return { title: `No archived ${def.noun.many}`, kind: "archived" };
  }
  if (activeFilterCount(state) > 0) return { title: `No ${def.noun.many} match these filters`, kind: "filtered" };
  return { title: copy.none, body: copy.noneBody, kind: "none" };
}
