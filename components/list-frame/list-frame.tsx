"use client";

import "./list-frame.css";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";

import { PageChrome, type PagePrimary } from "@/components/layout/page-chrome";
import { useHomeLink } from "@/components/layout/role-refusal";
import { useShell } from "@/components/layout/shell-state";
import { useToast } from "@/components/ui/use-toast";
import { ConfirmDialog } from "@/components/workspace/confirm-dialog";
import { EmptyGuide } from "@/components/workspace/empty-guide";
import { ApiError, fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { fillTemplate } from "@/lib/reports/actions";
import { getReportDefinition } from "@/lib/reports/registry";
import type {
  ListAction,
  ListColumn,
  ListIdsResponse,
  ListPageResponse,
  ListSpec,
  ListSpecPublic,
  ReportRow,
  ReportValue,
} from "@/lib/reports/types";
import { LIST_ACTION_RUNS } from "@/lib/retail/asks";
import type { Ask } from "@/lib/workspace/ask";
import { formatCount } from "@/lib/workspace/format";

import { exportList, runAction, sheetHref } from "./actions";
import type { ExportFormat } from "./export-menu";
import { ListCards, PhoneFiltersSheet, PhoneFooter, PhoneToolbar } from "./list-cards";
import { ListPager } from "./list-pager";
import { LoadError, NoMatch, Refusal, SkeletonRows } from "./list-states";
import { ListTable } from "./list-table";
import { ListTabs } from "./list-tabs";
import { ListToolbar } from "./list-toolbar";
import {
  bulkKeys,
  rowMatches,
  defaultFilters,
  filtersOn,
  foldAt,
  gridMinWidth,
  gridTemplate,
  impliedColumns,
  nextColumnSort,
  pageSpec,
  runEndpoint,
  selectionTotals,
  shownColumns,
} from "./model";
import { fillFromFilters, leaveAsk, typedRow } from "./model";
import { SaveBar } from "./save-bar";
import { SelectionBar } from "./selection-bar";
import { TotalsBand } from "./totals-band";
import { useListAddress } from "./use-list-query";

/**
 * ListFrame — every working list (00-foundations 5.4).
 *
 *   <ListFrame source="retail-shifts" title="Shifts" />
 *
 * The list is a report source (`lib/reports/definitions/**`); this frame asks
 * `GET /api/v2/reports/<source>?page=` for one page of it, with the totals over
 * every filtered row, and draws the bands: tabs, toolbar or selection bar,
 * the table with its pinned head, group headings and totals, and the pager —
 * or, under 720px, cards with the totals on one line. Everything it shows
 * comes from the response; everything a person changes goes into the address.
 */

/** Ticks survive page changes, up to this many (rule 6). */
const TICK_CAP = 500;
const SEARCH_IDLE_MS = 250;

function useElementWidth(ref: React.RefObject<HTMLElement | null>): number | null {
  const [width, setWidth] = React.useState<number | null>(null);
  React.useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const next = Math.round(entries[0]?.contentRect.width ?? 0);
      setWidth((current) => (current === next ? current : next));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest("input, textarea, select, [contenteditable='true'], [role='menu'], [role='dialog']"));
}

type AllSelected = { key: string; ids: string[]; rows: ReportRow[] };

export type ListFrameProps = {
  source: string;
  title: string;
  /** The header's sub, where the page says it rather than the source ("Templates that read stock …"). */
  sub?: string;
  /** The filters on the toolbar row, in place of the source's `primary`; the others sit inside Filters. */
  rowFilters?: readonly string[];
  /** This page's sort before anyone picks one, in place of the source's first. */
  defaultSort?: string;
  /** This page's grouping before anyone picks one (`null`: none), in place of the source's. */
  defaultGroup?: string | null;
  /** The header's back link, for a list under another page ("‹ End of day / Past days"). */
  back?: { href: string; label: string };
  /**
   * A page about one record (a price list's worksheet): the list is scoped to it by this parent
   * filter, and the header reads the record's name as the title and its words as the sub.
   */
  parent?: { key: string; value: string };
};

export function ListFrame({ source, title, sub, rowFilters, defaultSort, defaultGroup, back, parent: scope }: ListFrameProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const shell = useShell();
  const home = useHomeLink();
  const phone = shell.width === "phone";

  const scopeKey = scope?.key;
  const scopeValue = scope?.value;
  const fixed = React.useMemo(() => (scopeKey && scopeValue ? { [scopeKey]: scopeValue } : undefined), [scopeKey, scopeValue]);
  const address = useListAddress(source, { sort: defaultSort, group: defaultGroup, fixed });
  const apiQuery = address.listParams.toString();
  const listQuery = useQuery({
    queryKey: ["list", source, apiQuery],
    queryFn: () => fetchJson<ListPageResponse>(`/api/v2/reports/${encodeURIComponent(source)}?${apiQuery}`),
    placeholderData: keepPreviousData,
    enabled: address.ready,
    retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 2,
    // A list whose rows change on their own (tills' states) asks again on its own.
    refetchInterval: (query) => {
      const seconds = query.state.data?.report.list.refreshSeconds;
      return seconds ? seconds * 1000 : false;
    },
  });
  // Nothing from a cache until mounted, so the first render matches the server's.
  const data = address.ready ? listQuery.data : undefined;
  const resolved = data?.query ?? null;
  const parentFacts = data?.parent?.facts;
  const spec = React.useMemo(() => {
    const page = pageSpec(data?.report.list ?? null, rowFilters);
    if (!page) return page;
    // Actions offered only while the record the list is scoped to matches (not on the default price list).
    const facts: ReportRow = { id: "parent", ...(parentFacts ?? {}) };
    const fits = (action: { whenParent?: ListAction["whenParent"] } | { key: "export" }) =>
      !("whenParent" in action) || !action.whenParent || rowMatches(facts, [], action.whenParent);
    return { ...page, rowMenu: page.rowMenu?.filter(fits), bulk: page.bulk?.filter(fits) };
  }, [data?.report.list, parentFacts, rowFilters]);
  // Columns the page already says (the area of an area page, the grouped column) are not drawn on every row.
  const implied = React.useMemo(() => impliedColumns(spec, resolved), [resolved, spec]);
  const definition = React.useMemo(() => getReportDefinition(source), [source]);

  const [phoneFilters, setPhoneFilters] = React.useState(false);

  // ── Width: what folds and which columns fit ──────────────────────────
  const rootRef = React.useRef<HTMLDivElement>(null);
  const width = useElementWidth(rootRef);
  const fold = foldAt(phone ? 390 : width);
  // Before the first answer, the source's own folded columns stay folded.
  const hidden = React.useMemo(
    () =>
      resolved?.hidden ??
      address.hidden ??
      (definition?.list?.columns ?? []).filter((column) => column.hidden).map((column) => column.key),
    [address.hidden, definition, resolved?.hidden],
  );
  const columns = React.useMemo(() => {
    const all = spec?.columns ?? (definition?.list?.columns ?? []).filter((column) => column.requires !== "view-cost");
    return shownColumns(all, [...hidden, ...implied], width);
  }, [definition, hidden, implied, spec?.columns, width]);
  const template = gridTemplate(columns);
  const minWidth = gridMinWidth(columns);

  // ── The address ──────────────────────────────────────────────────────
  const defaults = React.useMemo(
    () => ({
      tab: spec?.tabs?.[0]?.key ?? null,
      sort: defaultSort ?? spec?.sorts[0]?.key,
      group: defaultGroup !== undefined ? defaultGroup : (spec?.defaultGroup ?? null),
      // Against the choices made, so a period picked under "Needs sign-off" stays on the address.
      filters: spec ? defaultFilters(spec, resolved?.filters) : {},
    }),
    [defaultGroup, defaultSort, resolved?.filters, spec],
  );
  const write = React.useCallback(
    (patch: Parameters<typeof address.write>[0]) => address.write(patch, defaults),
    [address, defaults],
  );

  // Search: typed here, written to the address after 250ms of quiet.
  const urlQ = searchParams.get("q") ?? "";
  const [search, setSearch] = React.useState(urlQ);
  const sentQ = React.useRef(urlQ);
  React.useEffect(() => {
    if (urlQ === sentQ.current) return;
    sentQ.current = urlQ;
    // Back or forward moved the address under the box.
    setSearch(urlQ);
  }, [urlQ]);
  React.useEffect(() => {
    if (search === sentQ.current) return;
    const timer = window.setTimeout(() => {
      sentQ.current = search;
      write({ q: search || null });
    }, SEARCH_IDLE_MS);
    return () => window.clearTimeout(timer);
  }, [search, write]);
  const searchRef = React.useRef<HTMLInputElement>(null);

  // ── Selection (F-2) ──────────────────────────────────────────────────
  const [picked, setPicked] = React.useState<Map<string, ReportRow>>(() => new Map());
  const [allSelected, setAllSelected] = React.useState<AllSelected | null>(null);
  const [selectingAll, setSelectingAll] = React.useState(false);
  const lastTick = React.useRef<number | null>(null);
  const filterKey = React.useMemo(() => {
    const params = new URLSearchParams(apiQuery);
    params.delete("page");
    params.delete("size");
    return params.toString();
  }, [apiQuery]);
  const all = allSelected && allSelected.key === filterKey ? allSelected : null;
  const allIds = React.useMemo(() => new Set(all?.ids ?? []), [all]);
  const ticked = React.useCallback((id: string) => (all ? allIds.has(id) : picked.has(id)), [all, allIds, picked]);
  const tickCount = all ? all.ids.length : picked.size;
  const rows = React.useMemo(() => data?.rows ?? [], [data?.rows]);

  const clearSelection = React.useCallback(() => {
    setPicked(new Map());
    setAllSelected(null);
    lastTick.current = null;
  }, []);

  const tooMany = React.useCallback(
    () =>
      toast({
        title: `You can tick up to ${TICK_CAP} rows. Use Select all to take every row the filters show.`,
        variant: "warning",
      }),
    [toast],
  );

  const setTicks = React.useCallback(
    (targets: ReportRow[], on: boolean) => {
      setAllSelected(null);
      setPicked((current) => {
        // Leaving "all" keeps what is on this page, ticked as it was.
        const base = all ? new Map(rows.filter((row) => allIds.has(row.id)).map((row) => [row.id, row])) : current;
        const next = new Map(base);
        for (const row of targets) {
          if (!on) next.delete(row.id);
          else if (!next.has(row.id)) {
            if (next.size >= TICK_CAP) {
              tooMany();
              break;
            }
            next.set(row.id, row);
          }
        }
        return next;
      });
    },
    [all, allIds, rows, tooMany],
  );

  const onTick = React.useCallback(
    (row: ReportRow, index: number, range: boolean) => {
      const on = !ticked(row.id);
      if (range && lastTick.current !== null) {
        const [from, to] = [Math.min(lastTick.current, index), Math.max(lastTick.current, index)];
        setTicks(rows.slice(from, to + 1), on);
      } else {
        setTicks([row], on);
      }
      lastTick.current = index;
    },
    [rows, setTicks, ticked],
  );

  const pageTicked = rows.length > 0 && rows.every((row) => ticked(row.id));

  const selectAll = async () => {
    if (!spec) return;
    setSelectingAll(true);
    try {
      const params = new URLSearchParams(apiQuery);
      params.set("page", "1");
      params.set("idsOnly", "1");
      const keys = bulkKeys(spec);
      if (keys.length) params.set("pick", keys.join(","));
      const answer = await fetchJson<ListIdsResponse>(`/api/v2/reports/${encodeURIComponent(source)}?${params.toString()}`);
      const picks = answer.picked ?? {};
      setAllSelected({
        key: filterKey,
        ids: answer.ids,
        rows: answer.ids.map((id, index) => {
          const row: ReportRow = { id };
          for (const [key, values] of Object.entries(picks)) row[key] = (values[index] ?? null) as ReportValue;
          return row;
        }),
      });
      if (answer.capped) {
        toast({ title: `Only the first ${formatCount(answer.ids.length)} ${spec.noun} were selected.`, variant: "warning" });
      }
    } catch (error) {
      toast({ title: getApiErrorMessage(error), variant: "destructive" });
    } finally {
      setSelectingAll(false);
    }
  };

  const selectedRows = React.useMemo(() => (all ? all.rows : [...picked.values()]), [all, picked]);
  const selectedIds = React.useMemo(() => (all ? all.ids : [...picked.keys()]), [all, picked]);

  // ── Scrolling ────────────────────────────────────────────────────────
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = React.useState(false);
  const onScroll = React.useCallback(() => {
    const box = scrollRef.current;
    if (box) setScrolled(box.scrollTop > box.clientHeight);
  }, []);
  const toTop = React.useCallback(() => scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" }), []);
  const shownPage = data?.page;
  React.useEffect(() => {
    // Changing page scrolls the table, not the window, back to its first row (rule 4).
    scrollRef.current?.scrollTo({ top: 0 });
  }, [shownPage]);

  // ── Group folding ────────────────────────────────────────────────────
  const [folded, setFolded] = React.useState<Set<string>>(() => new Set());
  const groupKey = resolved?.group ?? null;
  const [foldedFor, setFoldedFor] = React.useState(groupKey);
  if (foldedFor !== groupKey) {
    setFoldedFor(groupKey);
    setFolded(new Set());
  }

  // ── Editable cells (5.4.10) ─────────────────────────────────────────
  const [edits, setEdits] = React.useState<Map<string, string>>(() => new Map());
  // What each typed cell held when the typing began, sent as `was` so a row someone else changed meanwhile is refused.
  const editedFrom = React.useRef(new Map<string, string>());
  const [refusedEdits, setRefusedEdits] = React.useState<Map<string, string>>(() => new Map());
  const [saving, setSaving] = React.useState(false);
  const [leaveTo, setLeaveTo] = React.useState<string | null>(null);
  const editSpec = spec?.edit ?? null;
  const dirty = edits.size > 0;
  // The rows as typed: the figure, its derived margin and pill, and "Not saved", until saved or discarded.
  const shownRows = React.useMemo(
    () => (editSpec && edits.size ? rows.map((row) => typedRow(row, edits.get(row.id), spec?.columns ?? [], editSpec)) : rows),
    [editSpec, edits, rows, spec?.columns],
  );
  const originalRow = React.useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows]);
  React.useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    const intercept = (event: MouseEvent) => {
      const anchor = (event.target as HTMLElement | null)?.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank" || event.metaKey || event.ctrlKey) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname === pathname) return;
      event.preventDefault();
      event.stopPropagation();
      setLeaveTo(url.pathname + url.search);
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", intercept, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", intercept, true);
    };
  }, [dirty, pathname]);

  const saveEdits = async () => {
    if (!editSpec) return;
    const endpoint = fillFromFilters(editSpec.endpoint, resolved?.filters ?? {});
    if (!endpoint) return;
    setSaving(true);
    try {
      const response = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          changes: [...edits].map(([id, value]) => ({
            id,
            value,
            was: editedFrom.current.get(id) ?? (originalRow.has(id) ? savedValue(originalRow.get(id)!, editSpec.column) : ""),
          })),
        }),
      });
      if (!response.ok) {
        // 400 `{ error, details: { rows: [{ id, message }] } }`: the refused rows keep their pills.
        const body = (await response.json().catch(() => null)) as { error?: string; details?: { rows?: Array<{ id: string; message: string }> } } | null;
        const refused = body?.details?.rows ?? [];
        setRefusedEdits(new Map(refused.map((entry) => [entry.id, entry.message])));
        // A refused row is read again, so saving it once more is over what is there now ("Changed by someone else …").
        for (const entry of refused) editedFrom.current.delete(entry.id);
        // The server's sentence: "1 price was not saved."
        toast({ title: body?.error ?? "Nothing was saved.", variant: "destructive" });
        await queryClient.invalidateQueries({ queryKey: ["list", source] });
        return;
      }
      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      setEdits(new Map());
      editedFrom.current.clear();
      setRefusedEdits(new Map());
      // The server's sentence: "3 prices saved. The till has them now."
      toast({ title: body?.message ?? "Saved.", variant: "success" });
      await queryClient.invalidateQueries({ queryKey: ["list", source] });
    } finally {
      setSaving(false);
    }
  };

  // ── Actions ──────────────────────────────────────────────────────────
  const [confirming, setConfirming] = React.useState<{ action: ListAction; ids: string[]; rows: ReportRow[] } | null>(
    null,
  );
  // What a run shows once done (the PINs WhatsApp did not take): only its "keep".
  const [afterAsk, setAfterAsk] = React.useState<Ask | null>(null);
  /** A `run` action's POST, its done toast, and the list (and nav badges) read again. */
  const post = async (action: ListAction, ids: string[], targetRows: ReportRow[]) => {
    const how = action.do;
    if (!("endpoint" in how)) return;
    const run = "run" in how ? LIST_ACTION_RUNS[how.run] : undefined;
    const endpoint = runEndpoint(fillFromFilters(how.endpoint, resolved?.filters ?? {}) ?? how.endpoint, targetRows);
    if (!endpoint) throw new Error("That did not work. Nothing was changed; try again.");
    const response = await fetch(endpoint, {
      method: run?.method ?? "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(run?.body ? run.body(ids, targetRows) : { ids }),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(body?.error ?? "That did not work. Nothing was changed; try again.");
    }
    const answer: unknown = await response.json().catch(() => null);
    clearSelection();
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["list", source] }),
      queryClient.invalidateQueries({ queryKey: ["nav-badges"] }),
    ]);
    if (run) {
      const done = run.done(ids.length, targetRows, answer);
      toast(typeof done === "string" ? { title: done, variant: "success" } : done);
      const next = run.after?.(answer) ?? null;
      if (next) setAfterAsk(next);
    }
  };
  const act = async (action: ListAction, ids: string[], targetRows: ReportRow[]) => {
    if ("export" in action.do) {
      await doExport(action.do.export, ids);
      return;
    }
    const run = "run" in action.do ? LIST_ACTION_RUNS[action.do.run] : undefined;
    if ("confirm" in action.do || run?.ask) {
      setConfirming({ action, ids, rows: targetRows });
      return;
    }
    if (run) {
      try {
        await post(action, ids, targetRows);
      } catch (error) {
        toast({ title: getApiErrorMessage(error, "That did not work. Try again."), variant: "destructive" });
      }
      return;
    }
    try {
      const outcome = await runAction(action, ids, targetRows, {
        pathname,
        search: searchParams.toString(),
        filters: resolved?.filters ?? {},
      });
      if (outcome.kind === "navigate") router.push(outcome.href);
      else if (outcome.kind === "done" && outcome.toast) toast(outcome.toast);
    } catch (error) {
      toast({ title: getApiErrorMessage(error, "That did not work. Try again."), variant: "destructive" });
    }
  };

  const doExport = async (format: ExportFormat, rowIds?: string[]) => {
    if (!resolved) return;
    const query = { ...resolved, tab: resolved.tab ?? undefined, group: resolved.group ?? "none", page: 1 };
    const said = await exportList(source, format, query, rowIds);
    if (said) toast(said);
  };

  // ── Keyboard (5.4.13) ────────────────────────────────────────────────
  const [focus, setFocus] = React.useState<number | null>(null);
  const keyState = React.useRef({ rows, focus, tickCount, search, spec });
  keyState.current = { rows, focus, tickCount, search, spec };
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      const state = keyState.current;
      if (event.key === "Escape") {
        if (state.tickCount > 0) clearSelection();
        else if (state.search) setSearch("");
        return;
      }
      if (isTyping(event.target)) return;
      if (event.key === "/") {
        event.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (!state.rows.length) return;
      const at = state.focus ?? -1;
      const move = (next: number) => {
        const clamped = Math.max(0, Math.min(state.rows.length - 1, next));
        setFocus(clamped);
        scrollRef.current?.querySelector(`[data-row-index="${clamped}"]`)?.scrollIntoView({ block: "nearest" });
      };
      if (event.key === "j" || event.key === "J") move(at + 1);
      else if (event.key === "k" || event.key === "K") move(at - 1);
      else if (event.key === " " && state.focus !== null) {
        event.preventDefault();
        const row = state.rows[state.focus];
        if (row) onTick(row, state.focus, false);
      } else if (event.key === "Enter" && state.focus !== null && state.spec) {
        const row = state.rows[state.focus];
        const href = row ? fillTemplate(state.spec.rowHref, row) : null;
        if (href) router.push(href);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [clearSelection, onTick, router]);

  // ── The header ───────────────────────────────────────────────────────
  const primarySpec = spec?.primary ?? null;
  // A primary about the record the list is scoped to opens its sheet on it (Add products to this list).
  const primaryId = primarySpec?.idFrom ? (resolved?.filters[primarySpec.idFrom] ?? null) : null;
  const addressSearch = searchParams.toString();
  const primary = React.useMemo<PagePrimary | null>(
    () =>
      primarySpec
        ? {
            label: primarySpec.label,
            ...(primarySpec.icon ? { icon: primarySpec.icon } : {}),
            ...(primarySpec.sheet && primaryId
              ? { href: sheetHref(pathname, addressSearch, primarySpec.sheet, [primaryId]) }
              : primarySpec.sheet
                ? { sheet: primarySpec.sheet }
                : {}),
            ...(primarySpec.href ? { href: primarySpec.href } : {}),
          }
        : null,
    [addressSearch, pathname, primaryId, primarySpec],
  );

  const refusal = listQuery.error instanceof ApiError && listQuery.error.status === 403;
  // Scoped to one record ("?product="): its name as the sub, and the link that clears it.
  const parent = data?.parent ?? null;
  const clearParent = React.useMemo(() => {
    if (!parent?.all) return null;
    const params = new URLSearchParams(searchParams.toString());
    params.delete(parent.key);
    params.delete("page");
    const query = params.toString();
    return { href: query ? `${pathname}?${query}` : pathname, label: parent.all };
  }, [parent, pathname, searchParams]);
  // The source's own sub link opens a sheet over the list ("Who can do what"), for a caller it is drawn for.
  const listSubLink = data?.report.list.subLink ?? null;
  const subLinkId = listSubLink?.idFrom ? (resolved?.filters[listSubLink.idFrom] ?? null) : null;
  const sheetLink = listSubLink
    ? { href: sheetHref(pathname, searchParams.toString(), listSubLink.sheet, subLinkId ? [subLinkId] : []), label: listSubLink.label }
    : null;
  const chrome = (
    <PageChrome
      title={scope ? (parent?.label ?? title) : title}
      backHref={back?.href}
      backLabel={back?.label}
      sub={sub ?? (scope ? parent?.sub : parent?.label) ?? definition?.list?.sub ?? null}
      subLink={clearParent ?? (refusal ? null : sheetLink)}
      primary={refusal ? null : primary}
    />
  );

  if (refusal) {
    const noun = definition?.list?.noun ?? title.toLowerCase();
    return (
      <>
        {chrome}
        <Refusal noun={noun} back={home.href && home.href !== pathname ? home : null} />
      </>
    );
  }

  const total = data?.total ?? null;
  const everEmpty = Boolean(data?.everEmpty);
  const noMatch = Boolean(data && !everEmpty && data.total === 0);
  // A tab that holds nothing at all says so in its own words ("Nothing of yours yet. …").
  const tabEmpty =
    noMatch && resolved?.tab && data?.tabs?.[resolved.tab] === 0
      ? (spec?.tabs?.find((tab) => tab.key === resolved.tab)?.empty ?? null)
      : null;
  const firstLoad = !data && !listQuery.error;
  const loadError = !data && listQuery.error ? getApiErrorMessage(listQuery.error, "") : null;
  const stale = listQuery.isPlaceholderData || (listQuery.isFetching && !listQuery.isPending);
  const emptyPrimary = spec?.empty.primary;
  const emptyId = emptyPrimary?.idFrom ? (resolved?.filters[emptyPrimary.idFrom] ?? null) : null;
  const emptyHref = emptyPrimary?.sheet
    ? sheetHref(pathname, searchParams.toString(), emptyPrimary.sheet, emptyId ? [emptyId] : [])
    : (emptyPrimary?.href ?? null);
  // "Nothing is on Wholesale yet": the guide names the record the list is scoped to.
  const named = (words: string) => words.replace(/\{parent\}/g, parent?.label ?? "this list");
  const emptyGuide = spec ? { ...spec.empty, title: named(spec.empty.title), line: named(spec.empty.line) } : null;
  const selectedTotals =
    tickCount > 0
      ? { count: tickCount, totals: all ? (data?.totals ?? {}) : selectionTotals(spec?.columns ?? [], selectedRows) }
      : null;
  const clearAll = () =>
    write({ q: null, filters: Object.fromEntries(Object.keys(defaults.filters).map((key) => [key, "any"])) });
  const resetToDefaults = () => {
    setSearch("");
    sentQ.current = "";
    write({ q: null, filters: Object.fromEntries(Object.keys(defaults.filters).map((key) => [key, null])) });
  };
  // Bulk actions that belong to other tabs ("Sell them again" on Archived) are not offered here.
  // And those whose rows are not the ones ticked ("Switch on" while every ticked list is paused).
  const tickedRows = all ? all.rows : [...picked.values()];
  const bulk = (spec?.bulk ?? []).filter(
    (action) =>
      (!("tabs" in action) || !action.tabs || action.tabs.includes(resolved?.tab ?? "")) &&
      (!("when" in action) || !action.when || tickedRows.every((row) => rowMatches(row, spec?.columns ?? [], action.when))),
  );
  const selectionFold = phone ? bulk.length : fold.hints ? 2 : fold.chips ? 1 : 0;

  const selectionBar =
    spec && tickCount > 0 ? (
      <SelectionBar
        noun={spec.noun}
        count={tickCount}
        total={total ?? 0}
        allSelected={Boolean(all) || tickCount === total}
        selectingAll={selectingAll}
        bulk={bulk}
        foldCount={selectionFold}
        hideSelectAll={fold.count}
        onClear={clearSelection}
        onSelectAll={selectAll}
        onAction={(action) => act(action, selectedIds, selectedRows)}
        onExport={(format) => doExport(format, selectedIds)}
      />
    ) : null;

  const confirmRun = confirming && "run" in confirming.action.do ? LIST_ACTION_RUNS[confirming.action.do.run] : undefined;
  const confirmAsk: Ask | null =
    confirming && "confirm" in confirming.action.do
      ? {
          title: confirming.action.do.confirm.title,
          body: confirming.action.do.confirm.body,
          keep: "Keep",
          go: confirming.action.do.confirm.confirm,
          fill: confirming.action.do.confirm.tone === "bad" ? "bad" : "action",
        }
      : confirming && confirmRun?.ask
        ? confirmRun.ask(confirming.ids.length, confirming.rows)
        : null;

  const dialogs = (
    <>
      {confirmAsk && confirming ? (
        <ConfirmDialog
          ask={confirmAsk}
          open
          onOpenChange={(open) => !open && setConfirming(null)}
          onConfirm={async () => {
            const how = confirming.action.do;
            if ("run" in how) {
              await post(confirming.action, confirming.ids, confirming.rows);
              return;
            }
            if (!("endpoint" in how)) return;
            const response = await fetch(how.endpoint, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ids: confirming.ids }),
            });
            if (!response.ok) {
              const body = (await response.json().catch(() => null)) as { error?: string } | null;
              throw new Error(body?.error ?? "That did not work. Nothing was changed; try again.");
            }
            clearSelection();
            await queryClient.invalidateQueries({ queryKey: ["list", source] });
          }}
        />
      ) : null}
      {afterAsk ? (
        <ConfirmDialog ask={afterAsk} open onOpenChange={(open) => !open && setAfterAsk(null)} onConfirm={() => setAfterAsk(null)} />
      ) : null}
      {leaveTo ? (
        <ConfirmDialog
          ask={leaveAsk(edits.size, scope ? (parent?.label ?? title) : title)}
          open
          onOpenChange={(open) => !open && setLeaveTo(null)}
          onConfirm={() => {
            const href = leaveTo;
            setEdits(new Map());
            editedFrom.current.clear();
            setLeaveTo(null);
            router.push(href);
          }}
        />
      ) : null}
    </>
  );

  // ── On a phone ───────────────────────────────────────────────────────
  if (phone) {
    return (
      <div ref={rootRef} className="cx-lf">
        {chrome}
        {dialogs}
        {spec && !everEmpty ? (
          selectionBar ?? (
            <PhoneToolbar
              spec={spec}
              search={search}
              onSearch={setSearch}
              filtersOn={filtersOn(spec, resolved?.filters ?? {}, true)}
              onOpenFilters={() => setPhoneFilters(true)}
            />
          )
        ) : null}
        {spec && resolved ? (
          <PhoneFiltersSheet
            open={phoneFilters}
            onOpenChange={setPhoneFilters}
            spec={spec}
            query={resolved}
            tabCounts={data?.tabs ?? null}
            onTab={(tab) => write({ tab })}
            onFilter={(key, value) => write({ filters: { [key]: value } })}
            onSort={(sort) => write({ sort })}
            onGroup={(group) => write({ group })}
          />
        ) : null}
        {everEmpty && spec ? (
          <div className="cx-lf-cards">
            <EmptyGuide guide={emptyGuide ?? spec.empty} primaryHref={emptyHref} />
          </div>
        ) : loadError !== null ? (
          <LoadError noun={definition?.list?.noun ?? "rows"} message={loadError} onRetry={() => listQuery.refetch()} />
        ) : noMatch && spec ? (
          <NoMatch noun={spec.noun} line={tabEmpty} onClear={clearAll} />
        ) : spec ? (
          <ListCards
            spec={spec}
            rows={shownRows}
            groups={data?.groups ?? null}
            groupKey={groupKey}
            ticked={ticked}
            selecting={tickCount > 0}
            onTick={(row) => setTicks([row], !ticked(row.id))}
            onAction={(action, row) => act(action, [row.id], [row])}
            onFigure={
              editSpec?.sheet
                ? (row) => {
                    // The one-field sheet, on the record the list is scoped to (the price list).
                    const href = sheetHref(pathname, searchParams.toString(), editSpec.sheet!, [row.id]);
                    router.push(scope ? `${href}&${scope.key}=${encodeURIComponent(scope.value)}` : href);
                  }
                : undefined
            }
            scrollRef={scrollRef}
            onScroll={onScroll}
          />
        ) : (
          <div className="cx-lf-cards" aria-busy="true" />
        )}
        {spec && !everEmpty ? (
          <PhoneFooter
            spec={spec}
            total={total}
            totals={data?.totals ?? {}}
            page={data?.page ?? 1}
            pages={data?.pages ?? 1}
            onPage={(page) => write({ page })}
            onTop={toTop}
          />
        ) : null}
      </div>
    );
  }

  // ── At a desk ────────────────────────────────────────────────────────
  const headOnlyBody = firstLoad ? (
    <SkeletonRows columns={columns} template={template} />
  ) : loadError !== null ? (
    <LoadError noun={definition?.list?.noun ?? "rows"} message={loadError} onRetry={() => listQuery.refetch()} />
  ) : noMatch && spec ? (
    <NoMatch noun={spec.noun} line={tabEmpty} onClear={clearAll} />
  ) : undefined;

  return (
    <div ref={rootRef} className="cx-lf">
      {chrome}
      {dialogs}
      {spec && !everEmpty ? <ListTabs spec={spec} tab={resolved?.tab ?? null} counts={data?.tabs ?? null} onTab={(tab) => write({ tab })} /> : null}
      {everEmpty ? null : (
        <div className="cx-lf-bar">
          {selectionBar ??
            (spec && resolved ? (
              <ListToolbar
                title={title}
                spec={spec}
                query={resolved}
                total={total}
                fold={fold}
                search={search}
                onSearch={setSearch}
                searchRef={searchRef}
                onFilter={(key, value) => write({ filters: { [key]: value } })}
                onFilters={(values) => write({ filters: values })}
                onClear={resetToDefaults}
                onSort={(sort) => write({ sort })}
                onGroup={(group) => write({ group })}
                hidden={hidden}
                implied={implied}
                onHidden={(next) => address.setHidden(next)}
                onExport={(format) => doExport(format)}
              />
            ) : (
              <div role="toolbar" aria-label={title} className="cx-lf-toolbar" aria-busy="true">
                <span className="cx-lf-search" aria-hidden="true" />
                <span className="cx-lf-spacer" />
                <span className="cx-count">—</span>
              </div>
            ))}
        </div>
      )}
      <div className="cx-lf-box">
        {stale && !firstLoad ? <div className="cx-lf-progress" aria-hidden="true" /> : null}
        <div className="cx-lf-scroll" ref={scrollRef} onScroll={onScroll}>
          {everEmpty && spec ? (
            <EmptyGuide guide={emptyGuide ?? spec.empty} primaryHref={emptyHref} />
          ) : (
            <ListTable
              title={title}
              spec={spec ?? skeletonSpec(definition?.list, columns)}
              columns={columns}
              template={template}
              minWidth={minWidth}
              total={total ?? 0}
              sort={resolved?.sort ?? ""}
              rows={shownRows}
              groups={data?.groups ?? null}
              groupKey={groupKey}
              folded={folded}
              onFold={(value) =>
                setFolded((current) => {
                  const next = new Set(current);
                  if (next.has(value)) next.delete(value);
                  else next.add(value);
                  return next;
                })
              }
              ticked={ticked}
              pageTicked={pageTicked}
              onTick={onTick}
              onTickPage={(on) => setTicks(rows, on)}
              onSortColumn={(column: ListColumn) => spec && resolved && write({ sort: nextColumnSort(spec, resolved.sort, column) })}
              focus={focus}
              onRowAction={(action, row) => act(action, [row.id], [row])}
              edit={
                editSpec
                  ? {
                      value: (row) => edits.get(row.id) ?? savedValue(originalRow.get(row.id) ?? row, editSpec.column),
                      changed: (row) => edits.has(row.id),
                      refused: (row) => refusedEdits.get(row.id) ?? null,
                      changedColumn: editSpec.changedColumn,
                      onChange: (row, value) => {
                        const saved = savedValue(originalRow.get(row.id) ?? row, editSpec.column);
                        if (value === saved) editedFrom.current.delete(row.id);
                        else if (!editedFrom.current.has(row.id)) editedFrom.current.set(row.id, saved);
                        setEdits((current) => {
                          const next = new Map(current);
                          if (value === saved) next.delete(row.id);
                          else next.set(row.id, value);
                          return next;
                        });
                      },
                    }
                  : undefined
              }
              stale={stale && !firstLoad}
              body={headOnlyBody}
              totals={
                data && spec && !noMatch && loadError === null ? (
                  <>
                    {data.truncated ? (
                      <div className="cx-lf-truncated" role="status">
                        Showing the first 5,000 {spec.noun}. Narrow the dates to see the rest.
                      </div>
                    ) : null}
                    <TotalsBand
                      noun={spec.noun}
                      columns={columns}
                      template={template}
                      total={data.total}
                      totals={data.totals}
                      summary={data.summary}
                      selected={selectedTotals}
                    />
                  </>
                ) : firstLoad ? (
                  <div role="rowgroup" className="cx-lf-totals">
                    <div role="row" className="cx-lf-g cx-lf-totline" style={{ gridTemplateColumns: template }}>
                      <div role="cell" className="cx-lf-tick cx-lf-sigma" aria-hidden="true">
                        Σ
                      </div>
                      <div role="cell" className="cx-lf-c">
                        —
                      </div>
                    </div>
                  </div>
                ) : null
              }
            />
          )}
        </div>
      </div>
      {editSpec && dirty ? (
        <SaveBar
          count={edits.size}
          changedLabel={editSpec.changedLabel}
          note={editSpec.note}
          save={editSpec.save}
          saving={saving}
          onDiscard={() => {
            setEdits(new Map());
            editedFrom.current.clear();
            setRefusedEdits(new Map());
          }}
          onSave={saveEdits}
        />
      ) : null}
      {everEmpty ? null : (
        <ListPager
          page={data?.page ?? 1}
          pages={data?.pages ?? 1}
          size={data?.size ?? 50}
          total={firstLoad ? null : (total ?? 0)}
          shown={rows.length}
          hints={fold.hints}
          scrolled={scrolled}
          onPage={(page) => write({ page })}
          onSize={(size) => write({ size })}
          onTop={toTop}
        />
      )}
    </div>
  );
}

/** A saved figure as its input shows it: "18.25", two decimals for money. */
function savedValue(row: ReportRow, key: string): string {
  const value = row[key];
  return typeof value === "number" ? value.toFixed(2) : String(value ?? "");
}

/** Before the first answer: the source's own columns, nothing a role might not have. */
function skeletonSpec(list: ListSpec | undefined, columns: ListColumn[]): ListSpecPublic {
  return {
    noun: list?.noun ?? "rows",
    search: list?.search ?? { placeholder: "", keys: [] },
    filters: [],
    sorts: list?.sorts ?? [],
    columns,
    rowHref: list?.rowHref ?? "",
    card: list?.card ?? { title: "", figure: "", meta: "" },
    empty: list?.empty ?? { title: "", line: "" },
    primary: null,
  };
}
