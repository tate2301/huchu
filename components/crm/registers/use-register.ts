"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useToast } from "@/components/ui/use-toast";
import { useDebounced } from "@/hooks/use-debounced";
import { fetchCrmSavedViews, type CrmSavedViewRecord } from "@/lib/crm/collections-client";
import { fetchRegisterBoard, fetchRegisterPage } from "@/lib/crm/crm-v2";
import { narrowingKey, readState, sameState, writeState } from "@/lib/crm/registers/codec";
import type {
  BuiltInView,
  ColumnDef,
  FilterValue,
  Layout,
  RegisterDef,
  SortDir,
  ViewState,
} from "@/lib/crm/registers/types";

import { rememberListQuery } from "./list-href";

/** A view the list can open: one it comes with, or one somebody saved. */
export type RegisterView = BuiltInView & {
  /** Present on a view somebody saved; its key is the saved view's id. */
  saved?: {
    id: string;
    isShared: boolean;
    /** Whether the reader may change or delete it: whoever made it, or a manager. */
    canEdit: boolean;
    author: string | null;
  };
};

/** Where one list's saved views are cached. Under the prefix every saved view is refreshed by. */
export function savedViewsKey(def: RegisterDef) {
  return ["crm", "saved-views", def.key] as const;
}

function toRegisterView(view: CrmSavedViewRecord): RegisterView {
  return {
    key: view.id,
    name: view.name,
    state: view.state,
    saved: { id: view.id, isShared: view.isShared, canEdit: view.canEdit, author: view.createdBy?.name ?? null },
  };
}

/** Rows per page on every list the engine draws. */
export const REGISTER_PAGE_SIZE = 50;

/** How many rows a selection may hold — what one bulk request takes. */
export const MAX_SELECTION = 500;

function columnsKey(def: RegisterDef, view: string) {
  return `huchu.register.${def.key}.${view}.columns`;
}

/** The columns a list shows before anybody has chosen: every one not hidden by default. */
export function defaultColumns(def: RegisterDef): string[] {
  return def.columns.filter((column) => !column.hiddenByDefault && !column.exportOnly).map((column) => column.id);
}

/**
 * The reader's working columns live in local storage, read through
 * `useSyncExternalStore` so the server and the first client render agree
 * (no storage on the server) and every list on the page hears a change.
 */
const COLUMNS_EVENT = "huchu:register-columns";

function subscribeColumns(onChange: () => void) {
  window.addEventListener(COLUMNS_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(COLUMNS_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function readStoredColumns(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function parseColumns(def: RegisterDef, raw: string | null): string[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    const known = new Set(def.columns.map((column) => column.id));
    const ids = parsed.filter((id): id is string => typeof id === "string" && known.has(id));
    return ids.length > 0 ? ids : null;
  } catch {
    return null;
  }
}

function storeColumns(key: string, ids: string[] | null) {
  try {
    if (ids) window.localStorage.setItem(key, JSON.stringify(ids));
    else window.localStorage.removeItem(key);
  } catch {
    // Storage refused (a private window, a full quota): the choice lasts the visit.
  }
  window.dispatchEvent(new Event(COLUMNS_EVENT));
}

/** The reader's time zone, for what "today" means on the server. */
function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch {
    return "";
  }
}

export type RegisterColumns = {
  /** Visible column ids, in order. The required column is always among them. */
  visible: string[];
  all: readonly ColumnDef[];
  isVisible(id: string): boolean;
  toggle(id: string): void;
  /** Move a visible column to a new position among the visible ones. */
  move(id: string, toIndex: number): void;
  reset(): void;
  /** Changed from the view's own columns. */
  changed: boolean;
};

export type RegisterSelection = {
  ids: string[];
  set(ids: string[]): void;
  clear(): void;
};

/**
 * A list's state, where it lives, and the rows it selects.
 *
 * The address bar is the state: every filter, the search, the sort and the
 * layout are read from it and written back to it, so a link is the list as
 * somebody saw it and the back button returns to the same slice after a
 * record is opened. It is written with `history.replaceState` rather than
 * the router, which would re-run the page's server component on every
 * keystroke in the search box.
 *
 * `views` are the list's own views and the ones saved of it; the one the URL
 * names (or the first, when it names none) is what an empty address means,
 * and `modified` says whether the list has wandered from it.
 */
export function useRegister<Row extends { id: string }>(def: RegisterDef) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const saved = useQuery({
    queryKey: savedViewsKey(def),
    queryFn: () => fetchCrmSavedViews(def.key),
    staleTime: 60_000,
  });
  const views = useMemo<RegisterView[]>(
    () => [...def.views, ...(saved.data?.data ?? []).map(toRegisterView)],
    [def.views, saved.data],
  );

  const url = useMemo(() => readState(def, searchParams), [def, searchParams]);
  // A saved view's id in the address means nothing until the saved views
  // are in: the list waits for them rather than drawing its first view and
  // then swapping, which is a list that shows the wrong records first.
  const viewPending = url.view !== null && saved.isPending && !def.views.some((view) => view.key === url.view);
  const named = views.find((view) => view.key === url.view);
  const activeView: RegisterView = named ?? def.views[0];

  // The address says "the view, as saved" when it carries nothing but a view
  // — or nothing at all, which is the list's first view.
  const state: ViewState = url.asSaved ? activeView.state : url.state;
  const page = url.page;
  const dirty = !sameState(def, { ...state, columns: undefined }, { ...activeView.state, columns: undefined });

  // The list as it is now, in its canonical form, for its records' back links
  // — only the keys the list reads, so a `?new=1` does not come back with it.
  const remembered = writeState(def, url.state, { view: url.view, page, asSaved: url.asSaved });
  useEffect(() => rememberListQuery(def.key, remembered), [def.key, remembered]);

  const write = useCallback(
    (next: ViewState, opts: { page?: number; view?: string | null; asSaved?: boolean } = {}) => {
      const query = writeState(def, next, {
        view: opts.view === undefined ? url.view : opts.view,
        page: opts.page,
        asSaved: opts.asSaved,
      });
      window.history.replaceState(null, "", query ? `${pathname}?${query}` : pathname);
    },
    [def, pathname, url.view],
  );

  // A saved view that has since been deleted, or is no longer shared: the
  // address stops naming it, and the list opens as it would with none named.
  const { toast } = useToast();
  const missing = url.view !== null && !named && saved.isSuccess;
  useEffect(() => {
    if (!missing) return;
    toast({ title: "That view is no longer there", description: "It was deleted, or is no longer shared with you." });
    write(url.state, { view: null, page, asSaved: url.asSaved });
  }, [missing, page, toast, url.asSaved, url.state, write]);

  /** Change the state. Anything that narrows the list goes back to page 1. */
  const set = useCallback(
    (update: ViewState | ((previous: ViewState) => ViewState)) => {
      const next = typeof update === "function" ? update(state) : update;
      const narrowed = narrowingKey(def, next) !== narrowingKey(def, state);
      write(next, { page: narrowed ? 1 : page });
    },
    [def, page, state, write],
  );

  const setFilter = useCallback(
    (key: string, value: FilterValue | undefined) =>
      set((previous) => {
        const filters = { ...previous.filters };
        if (value === undefined) delete filters[key];
        else filters[key] = value;
        // A stage belongs to one pipeline: another pipeline lets go of it.
        for (const filter of def.filters) if (filter.follows === key) delete filters[filter.key];
        return { ...previous, filters };
      }),
    [def.filters, set],
  );

  const clearFilters = useCallback(() => set((previous) => ({ ...previous, q: undefined, filters: {} })), [set]);
  const setSort = useCallback(
    (sort: { key: string; dir: SortDir }) => set((previous) => ({ ...previous, sort })),
    [set],
  );
  const setLayout = useCallback((layout: Layout) => set((previous) => ({ ...previous, layout })), [set]);
  /** Group the rows by one of the list's `groupBys`, or not at all. Back to page 1: the order changes. */
  const setBy = useCallback(
    (by: string | undefined) => write({ ...state, by }, { page: 1 }),
    [state, write],
  );
  const setPage = useCallback((next: number) => write(state, { page: next, asSaved: url.asSaved }), [state, url.asSaved, write]);

  /** Open a view as it was saved. */
  const applyView = useCallback(
    (view: BuiltInView) => {
      window.history.replaceState(null, "", `${pathname}?${writeState(def, view.state, { view: view.key, asSaved: true })}`);
    },
    [def, pathname],
  );

  /** Put the current view back the way it was saved, its columns too. */
  const resetView = useCallback(() => {
    storeColumns(columnsKey(def, activeView.key), null);
    applyView(activeView);
  }, [activeView, applyView, def]);

  // ── Saved views: what the Views menu changes, kept in step here. ──
  type SavedViews = Awaited<ReturnType<typeof fetchCrmSavedViews>>;
  /** A saved view changed — renamed, shared, made private: the menus hear it now, the sidebar next. */
  const updateSaved = useCallback(
    (record: CrmSavedViewRecord) => {
      queryClient.setQueryData<SavedViews>(savedViewsKey(def), (previous) =>
        previous ? { ...previous, data: [...previous.data.filter((view) => view.id !== record.id), record] } : previous,
      );
      void queryClient.invalidateQueries({ queryKey: ["crm", "saved-views"] });
    },
    [def, queryClient],
  );
  /**
   * A view was saved — this one, or a new one — and opens as saved. When what
   * was on screen went into it (`carried`), the working columns it came from
   * are in the view now, so they go from the view they were made on.
   */
  const openSaved = useCallback(
    (record: CrmSavedViewRecord, { carried }: { carried: boolean }) => {
      updateSaved(record);
      if (carried) storeColumns(columnsKey(def, activeView.key), null);
      storeColumns(columnsKey(def, record.id), null);
      applyView(toRegisterView(record));
    },
    [activeView.key, applyView, def, updateSaved],
  );
  /**
   * A saved view was deleted: the list goes back to its first view, if that
   * was the one open. The address moves before the view leaves the menus, so
   * the list never names a view that is gone.
   */
  const dropSaved = useCallback(
    (id: string) => {
      storeColumns(columnsKey(def, id), null);
      if (activeView.key === id) applyView(def.views[0]);
      void queryClient.invalidateQueries({ queryKey: ["crm", "saved-views"] });
    },
    [activeView.key, applyView, def, queryClient],
  );

  // ── Search: typed text waits 300ms; everything else applies at once. ──
  const urlQ = state.q ?? "";
  const [draft, setDraft] = useState(urlQ);
  const [seenQ, setSeenQ] = useState(urlQ);
  if (urlQ !== seenQ) {
    // The address changed under the box — a view was opened, the filters
    // cleared. What the box says follows it, unless it is what was typed.
    setSeenQ(urlQ);
    if (urlQ !== draft.trim()) setDraft(urlQ);
  }
  const debounced = useDebounced(draft, 300);
  // Only a change in what was typed is written. The address changing under
  // the box (a view opened) must not re-send the last thing typed, which is
  // still sitting in the debounce.
  const handled = useRef(debounced);
  useEffect(() => {
    if (debounced === handled.current) return;
    handled.current = debounced;
    const next = debounced.trim();
    if (next === (state.q ?? "")) return;
    set((previous) => ({ ...previous, q: next || undefined }));
  }, [debounced, set, state.q]);

  // ── Columns: the view's own, or the reader's working copy of them. ──
  const viewColumns = useMemo(
    () => (activeView.state.columns ? [...activeView.state.columns] : defaultColumns(def)),
    [activeView, def],
  );
  const storageKey = columnsKey(def, activeView.key);
  const stored = useSyncExternalStore(
    subscribeColumns,
    () => readStoredColumns(storageKey),
    () => null,
  );
  const working = useMemo(() => parseColumns(def, stored), [def, stored]);

  const required = useMemo(() => def.columns.find((column) => column.required)?.id, [def]);
  const visibleColumns = useMemo(() => {
    const ids = working ?? viewColumns;
    return required && !ids.includes(required) ? [required, ...ids] : ids;
  }, [required, viewColumns, working]);

  const updateColumns = useCallback((ids: string[] | null) => storeColumns(storageKey, ids), [storageKey]);

  const columns: RegisterColumns = {
    visible: visibleColumns,
    all: def.columns.filter((column) => !column.exportOnly),
    isVisible: (id) => visibleColumns.includes(id),
    toggle: (id) => {
      if (id === required) return;
      updateColumns(
        visibleColumns.includes(id)
          ? visibleColumns.filter((entry) => entry !== id)
          : [...visibleColumns, id],
      );
    },
    move: (id, toIndex) => {
      const from = visibleColumns.indexOf(id);
      if (from === -1) return;
      const next = [...visibleColumns];
      next.splice(from, 1);
      next.splice(Math.max(0, Math.min(toIndex, next.length)), 0, id);
      updateColumns(next);
    },
    reset: () => updateColumns(null),
    changed: visibleColumns.join(",") !== viewColumns.join(","),
  };

  /** Anything on screen differs from the view as it was saved — its columns included. */
  const modified = dirty || columns.changed;

  /** The list as it is now, columns included: what Save and Save as write. */
  const snapshot = useCallback((): ViewState => {
    const own = visibleColumns.join(",") !== defaultColumns(def).join(",");
    return { ...state, columns: own ? visibleColumns : undefined };
  }, [def, state, visibleColumns]);

  // ── Selection: kept across pages and sorts, dropped when the list changes. ──
  const narrowing = narrowingKey(def, state);
  const [picked, setPicked] = useState<{ narrowing: string; ids: string[] }>({ narrowing, ids: [] });
  const selection: RegisterSelection = {
    ids: picked.narrowing === narrowing ? picked.ids : [],
    set: (ids) => setPicked({ narrowing, ids: ids.slice(0, MAX_SELECTION) }),
    clear: () => setPicked({ narrowing, ids: [] }),
  };

  // ── The rows. The query key keeps the list's own prefix, which is what
  //    every form that changes one of its records refreshes by. A board is
  //    already arranged in columns, so it is never also grouped; a list with
  //    a board of its own reads it instead of a page. ──
  const layout = state.layout ?? def.layouts[0];
  const onBoard = layout === "BOARD" && Boolean(def.boardEndpoint);
  const by = layout === "BOARD" ? undefined : state.by;
  const apiState: ViewState = { q: state.q, filters: state.filters, sort: state.sort, by };
  const apiKey = writeState(def, apiState);
  // Nothing is read while the view the address names is still on its way:
  // until then the list does not know which records it is.
  const waiting = viewPending && url.asSaved;
  const query = useQuery({
    queryKey: [...def.queryKey, "register", apiKey, page],
    queryFn: () => fetchRegisterPage<Row>(def, { state: apiState, page, limit: REGISTER_PAGE_SIZE }),
    placeholderData: (previous) => previous,
    enabled: !onBoard && !waiting,
  });
  const boardKey = [...def.queryKey, "board", apiKey];
  const board = useQuery({
    queryKey: boardKey,
    queryFn: () => fetchRegisterBoard<Row>(def, apiState),
    placeholderData: (previous) => previous,
    enabled: onBoard && !waiting,
  });

  const rows = useMemo(() => query.data?.data ?? [], [query.data]);
  const boardColumns = onBoard ? board.data?.columns : undefined;
  /** How many rows are drawn, and how many the list holds — a board's across its columns. */
  const count = boardColumns
    ? {
        shown: boardColumns.reduce((sum, column) => sum + column.cards.length, 0),
        total: boardColumns.reduce((sum, column) => sum + column.count, 0),
      }
    : !onBoard && query.data
      ? { shown: rows.length, total: query.data.pagination?.total ?? rows.length }
      : null;
  const total = count?.total ?? 0;
  /** This page's rows by group, when the list is grouped — each with its count across the whole list. */
  const groups = by ? (query.data?.groups ?? null) : null;

  /**
   * The list's state as the export reads it: the same query string the rows
   * were fetched with, plus the reader's time zone. A board is one pipeline
   * even while the pipeline filter is left to the default, and exports that one.
   */
  const pipelineFilter = def.filters.find((filter) => filter.source === "pipelines")?.key;
  const boardPipeline = onBoard ? board.data?.pipeline?.id : undefined;
  const exportQuery =
    pipelineFilter && boardPipeline && !state.filters[pipelineFilter]
      ? writeState(def, { ...apiState, filters: { ...apiState.filters, [pipelineFilter]: [boardPipeline] } })
      : apiKey;
  const exportFilters = useCallback((): Record<string, string> => {
    const params = Object.fromEntries(new URLSearchParams(exportQuery));
    const tz = browserTimeZone();
    return tz ? { ...params, tz } : params;
  }, [exportQuery]);

  return {
    def,
    state,
    page,
    view: activeView,
    views,
    modified,
    set,
    setFilter,
    clearFilters,
    setSort,
    setLayout,
    setBy,
    setPage,
    applyView,
    resetView,
    saved: {
      /** Whether the reader may share a view with the team. */
      canShare: saved.data?.canShare ?? false,
      snapshot,
      update: updateSaved,
      open: openSaved,
      drop: dropSaved,
    },
    search: { draft, setDraft },
    columns,
    selection,
    layout,
    query,
    rows,
    total,
    count,
    groups,
    board: { query: board, queryKey: boardKey },
    /** What went wrong loading whichever the layout reads. */
    error: onBoard ? board.error : query.error,
    isLoading: waiting || (onBoard ? board.isLoading : query.isLoading),
    exportFilters,
  };
}

export type RegisterHandle<Row extends { id: string } = { id: string }> = ReturnType<typeof useRegister<Row>>;
