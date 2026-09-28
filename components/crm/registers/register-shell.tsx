"use client";

import { useEffect, useEffectEvent, useMemo, useState, type CSSProperties, type ReactNode } from "react";

import { Alert, Button } from "@corelithzw/react";
import { PageChrome } from "@/components/layout/page-chrome";
import { LayoutSwitch } from "@/components/records/layout-switch";
import { ViewToolbar } from "@/components/records/view-toolbar";
import { ListSearch } from "@/components/crm/records/list-search";
import { getApiErrorMessage } from "@/lib/api-client";
import { activeFilterCount } from "@/lib/crm/registers/codec";
import { CUSTOM_FIELD_PREFIX, isCustomFieldKey, type FilterDef, type RegisterDef } from "@/lib/crm/registers/types";
import { Plus, X } from "@/lib/icons";

import { BulkActions } from "./bulk-actions";
import { useCustomFieldFilters, usePipelines } from "./register-data";
import { RegisterExport } from "./export-control";
import { AddFilterMenu, FilterChip } from "./filter-controls";
import { ColumnsMenu, GroupByMenu, SortMenu, ViewsMenu } from "./toolbar-menus";
import type { RegisterHandle } from "./use-register";

/** The list's search box, for `/` to find. */
function searchInputId(def: RegisterDef): string {
  return `${def.key.toLowerCase()}-search`;
}

/**
 * A list's toolbar, the one row under the app bar (PAGE-4):
 *
 *   [View ▾ · Table|List|Board] │ [⌕ search] [+ Filter] [Type: Any] [Owner: Me] ··· 50 of 214 │ [Sort ▾] [Group ▾] [Columns] [Export]
 *
 * With rows ticked the same row turns into the selection's actions — it does
 * not grow a second one:
 *
 *   [✕ 12 selected] │ [Assign ▾] [Status ▾] [Add to group ▾] [Archive] ··· │ [Export 12]
 *
 * Pinned filters are always on the row, answered or not — the questions the
 * list is opened to answer. The rest wait behind "+ Filter" until they are
 * used, and stay on the row while they narrow anything.
 */
export function RegisterToolbar({ register, display }: { register: RegisterHandle; display?: ReactNode }) {
  const { def, state, selection } = register;
  const [pending, setPending] = useState<string | null>(null);

  // A company with one pipeline has no pipeline question to ask.
  const pipelines = usePipelines(def.filters.some((filter) => filter.source === "pipelines"));
  const pipelineCount = pipelines.data?.filter((pipeline) => pipeline.isActive).length ?? 0;

  // Every question the list can be asked: its own, the company's own fields,
  // and a field filter in the address whose field is gone — kept on the row,
  // named by its key, so it can still be seen and cleared.
  const custom = useCustomFieldFilters(def);
  const filters = useMemo<FilterDef[]>(() => {
    const known = new Set(custom.map((filter) => filter.key));
    const orphans = Object.keys(state.filters)
      .filter((key) => isCustomFieldKey(key) && !known.has(key))
      .map((key) => ({ key, label: key.slice(CUSTOM_FIELD_PREFIX.length), kind: "enum" as const, offer: false as const }));
    return [...def.filters, ...custom, ...orphans];
  }, [custom, def.filters, state.filters]);

  // The chips that narrow the list come first, then the pinned questions not
  // yet answered: when the row runs out of room it is an unanswered chip that
  // scrolls out of sight, never one that is hiding records.
  const shown = useMemo<FilterDef[]>(() => {
    const on = filters.filter((filter) => state.filters[filter.key] !== undefined || filter.key === pending);
    const waiting = filters.filter(
      (filter) => filter.pinned && !on.includes(filter) && (filter.source !== "pipelines" || pipelineCount > 1),
    );
    return [...on, ...waiting];
  }, [filters, pending, pipelineCount, state.filters]);
  const shownKeys = useMemo(() => new Set(shown.map((filter) => filter.key)), [shown]);
  const narrowing = activeFilterCount(state);
  const count = register.count
    ? `${register.count.shown.toLocaleString("en-US")} of ${register.count.total.toLocaleString("en-US")}`
    : null;

  if (selection.ids.length > 0) {
    return (
      <ViewToolbar
        layout={
          <Button
            variant="ghost"
            size="sm"
            startIcon={<X className="size-4" />}
            onClick={selection.clear}
            aria-label="Clear the selection"
          >
            <span className="font-mono tabular-nums">{selection.ids.length}</span>&nbsp;selected
          </Button>
        }
        start={<BulkActions register={register} />}
        end={<RegisterExport register={register} />}
        sheetLabel={`${selection.ids.length} selected`}
      />
    );
  }

  return (
    <ViewToolbar
      layout={
        // Side by side on the toolbar; stacked in the phone's sheet, where each
        // control gets a line of its own.
        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:gap-[7px]">
          <ViewsMenu register={register} />
          {def.layouts.length > 1 ? (
            <LayoutSwitch
              value={state.layout ?? def.layouts[0]}
              onChange={register.setLayout}
              options={def.layouts}
              compact
            />
          ) : null}
        </div>
      }
      search={
        <ListSearch
          id={searchInputId(def)}
          value={register.search.draft}
          onChange={register.search.setDraft}
          placeholder={def.search.placeholder}
          noun={def.noun.many}
          narrow
        />
      }
      start={
        <>
          {/* First, so it is never the control scrolled out of reach when
              the chips outgrow the row. */}
          <AddFilterMenu
            filters={filters}
            hidden={shownKeys}
            onPick={(filter) => {
              if (filter.kind === "boolean") register.setFilter(filter.key, true);
              else setPending(filter.key);
            }}
          />
          {shown.map((filter) => (
            <FilterChip
              key={filter.key}
              register={register}
              filter={filter}
              defaultOpen={filter.key === pending}
              onClosedEmpty={() => setPending(null)}
            />
          ))}
        </>
      }
      count={
        count ? (
          <span className="flex items-center gap-2">
            {count}
            {/* Beside the answer it resets: "8 of 214 · Clear". */}
            {narrowing > 0 ? (
              <button
                type="button"
                onClick={register.clearFilters}
                className="font-sans text-sm text-[var(--text-muted)] underline decoration-[var(--border)] underline-offset-2 hover:text-[var(--text-strong)]"
              >
                Clear
              </button>
            ) : null}
          </span>
        ) : null
      }
      end={
        <>
          {/* Order and grouping are about how the rows are shown, not which
              rows are in the list, so they sit after the count with the
              columns (FILT-1). A board is already grouped, by its columns. */}
          <SortMenu register={register} />
          {register.layout !== "BOARD" ? <GroupByMenu register={register} /> : null}
          {register.layout === "TABLE" ? <ColumnsMenu register={register} /> : null}
          {display}
          <RegisterExport register={register} />
        </>
      }
      filterCount={narrowing}
    />
  );
}

/**
 * The frame a list engine page is drawn in: the page's name and its one
 * create button in the app bar (PAGE-3), the toolbar, a load error, and the
 * records flush under the toolbar (PAGE-6).
 */
export function RegisterShell({
  register,
  title,
  createLabel,
  onCreate,
  notice,
  display,
  children,
}: {
  register: RegisterHandle;
  title: string;
  /** Omit to draw a list with no create button. */
  createLabel?: string;
  onCreate?: () => void;
  /** A standing instruction about the whole list, above the toolbar. */
  notice?: ReactNode;
  /** How this layout draws its records, where the engine does not own it — a board's card fields. */
  display?: ReactNode;
  children: ReactNode;
}) {
  const actions = useMemo(
    () =>
      createLabel && onCreate ? (
        <Button variant="primary" startIcon={<Plus className="h-4 w-4" />} onClick={onCreate}>
          {createLabel}
        </Button>
      ) : null,
    [createLabel, onCreate],
  );

  // A spreadsheet's two reflexes: `/` goes to the search box, Esc lets go of
  // the ticked rows. Neither fires while something is being typed, and Esc
  // leaves the selection alone when it has just closed a popover or dialog —
  // they claim the key first and mark it handled.
  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target instanceof HTMLElement ? event.target : null;
    // A row's checkbox is an input too, and Esc from one should let go of the rows.
    const typing = "input:not([type='checkbox']):not([type='radio']), textarea, select, [role='dialog']";
    if (target && (target.isContentEditable || target.closest(typing))) return;
    if (event.key === "/") {
      const search = document.getElementById(searchInputId(register.def));
      if (!search) return;
      event.preventDefault();
      search.focus();
    } else if (event.key === "Escape" && register.selection.ids.length > 0) {
      register.selection.clear();
    }
  });
  useEffect(() => {
    const listener = (event: KeyboardEvent) => onKeyDown(event);
    document.addEventListener("keydown", listener);
    return () => document.removeEventListener("keydown", listener);
  }, []);

  return (
    <div
      // The next rung of the sticky stack, for the table header to pin at
      // under the toolbar (PAGE-5).
      style={{ "--stack-next": "calc(var(--stack-top, 0px) + var(--list-toolbar-h))" } as CSSProperties}
    >
      <PageChrome title={title}>{actions}</PageChrome>

      {notice ? <div className="mb-3">{notice}</div> : null}

      <RegisterToolbar register={register} display={display} />

      {register.error ? (
        <Alert tone="danger" title={`Unable to load ${title.toLowerCase()}`} className="mt-4">
          {getApiErrorMessage(register.error)}
        </Alert>
      ) : null}

      <div style={{ "--stack-top": "var(--stack-next)" } as CSSProperties}>{children}</div>
    </div>
  );
}
