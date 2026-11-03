"use client";

import { useEffect, useEffectEvent, useMemo, useState, type CSSProperties, type ReactNode } from "react";

import { Alert, Button } from "@corelithzw/react";
import { PageChrome, type PagePrimary } from "@/components/layout/page-chrome";
import { LayoutSwitch } from "@/components/records/layout-switch";
import { ListSearch } from "@/components/crm/records/list-search";
import { getApiErrorMessage } from "@/lib/api-client";
import { activeFilterCount } from "@/lib/crm/registers/codec";
import { CUSTOM_FIELD_PREFIX, isCustomFieldKey, type FilterDef, type RegisterDef } from "@/lib/crm/registers/types";
import { X } from "@/lib/icons";

import { BulkActions } from "./bulk-actions";
import { useCustomFieldFilters, usePipelines } from "./register-data";
import { RegisterExport } from "./export-control";
import { AddFilterMenu, FilterChip } from "./filter-controls";
import { ColumnsMenu, GroupByMenu, SortMenu } from "./toolbar-menus";
import type { RegisterHandle } from "./use-register";
import { ViewsMenu } from "./views-menu";
import { CrmFinding } from "@/components/crm/crm-finding";
import {
  ci_alert,
  ci_apps,
  ci_calendar_clock,
  ci_check_circle,
  ci_pipeline,
  ci_table,
  ci_user,
  ci_x_circle,
} from "@/components/books/icons/glyphs";
import { CiGlyphIcon } from "@/components/books/icons/glyph-icon";

function getViewGlyph(name: string) {
  const lower = name.toLowerCase();
  if (lower.includes("all")) return ci_apps;
  if (lower.includes("my") || lower.includes("mine")) return ci_user;
  if (lower.includes("won") || lower.includes("done") || lower.includes("complete")) return ci_check_circle;
  if (lower.includes("lost") || lower.includes("archived")) return ci_x_circle;
  if (lower.includes("pipeline") || lower.includes("open") || lower.includes("deal")) return ci_pipeline;
  if (lower.includes("scheduled") || lower.includes("upcoming")) return ci_calendar_clock;
  if (lower.includes("urgent") || lower.includes("overdue") || lower.includes("attention")) return ci_alert;
  return ci_table;
}

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
export type RegisterFinding =
  | ReactNode
  | {
      fact: ReactNode;
      rest?: ReactNode;
      end?: ReactNode;
    }
  | {
      tone?: string;
      children?: ReactNode;
      action?: ReactNode | { label: string; onClick: () => void };
    }
  | {
      label?: string;
      text?: ReactNode;
      action?: ReactNode;
    };

export type RegisterKpi = {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  sub?: ReactNode;
  tone?: "ink" | "ok" | "warn" | "bad" | "neutral" | string;
};

/**
 * Books-style two-row worksheet header for CRM registers:
 *
 * Row 1 (`.crm-bk-tabs-bar`): Built-in and saved views as horizontal tabs on
 * their own hairline row, with the Views manager menu and Table/Board switch
 * at the right end.
 *
 * Row 2 (`.crm-bk-tools`): Search box (220px), `+ Filter` and filter chips,
 * mono record count (`50 of 214`), and right-aligned quiet tools (`Sort`,
 * `Group`, `Columns`, `Export`) after a vertical hairline separator.
 *
 * When rows are ticked, Row 2 becomes the Books selection bar (`.crm-bk-sel`).
 */
export function RegisterToolbar({ register, display }: { register: RegisterHandle; display?: ReactNode }) {
  const { def, state, selection } = register;
  const [pending, setPending] = useState<string | null>(null);

  // A company with one pipeline has no pipeline question to ask.
  const pipelines = usePipelines(def.filters.some((filter) => filter.source === "pipelines"));
  const pipelineCount = pipelines.data?.filter((pipeline) => pipeline.isActive).length ?? 0;

  const custom = useCustomFieldFilters(def);
  const filters = useMemo<FilterDef[]>(() => {
    const known = new Set(custom.map((filter) => filter.key));
    const orphans = Object.keys(state.filters)
      .filter((key) => isCustomFieldKey(key) && !known.has(key))
      .map((key) => ({ key, label: key.slice(CUSTOM_FIELD_PREFIX.length), kind: "enum" as const, offer: false as const }));
    return [...def.filters, ...custom, ...orphans];
  }, [custom, def.filters, state.filters]);

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

  return (
    <div>
      {/* Row 1: View Tabs on their own hairline row */}
      <div className="crm-bk-tabs-bar">
        <div className="crm-bk-tabs" role="tablist" aria-label={`${def.noun.many} views`}>
          {register.views.map((v) => {
            const active = register.view.key === v.key;
            const glyph = getViewGlyph(v.name);
            return (
              <button
                key={v.key}
                type="button"
                role="tab"
                aria-selected={active}
                className="crm-bk-tab"
                onClick={() => register.applyView(v)}
              >
                <CiGlyphIcon glyph={glyph} size={16} className="shrink-0" />
                <span>{v.name}</span>
                {active && register.count ? (
                  <span className="n">{register.count.total.toLocaleString("en-US")}</span>
                ) : null}
                {active && register.modified ? (
                  <span className="crm-bk-tab-dot" title="Modified from saved view" />
                ) : null}
              </button>
            );
          })}
        </div>
        <div className="crm-bk-tabs-end">
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
      </div>

      {/* Row 2: Selection bar when rows are ticked, else Worksheet Tools row */}
      {selection.ids.length > 0 ? (
        <div className="crm-bk-sel" role="region" aria-label="Selected rows">
          <span className="crm-bk-sel-count">
            <b>{selection.ids.length}</b> selected
          </span>
          <BulkActions register={register} />
          <Button
            variant="ghost"
            size="sm"
            startIcon={<X className="size-3.5" />}
            onClick={selection.clear}
            aria-label="Clear selection"
          >
            Clear
          </Button>
          <div className="crm-bk-tools-end">
            <RegisterExport register={register} />
          </div>
        </div>
      ) : (
        <div className="crm-bk-tools">
          <div className="crm-bk-tools-start">
            <ListSearch
              id={searchInputId(def)}
              value={register.search.draft}
              onChange={register.search.setDraft}
              placeholder={def.search.placeholder}
              noun={def.noun.many}
              narrow
            />
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
            {count ? (
              <span className="crm-bk-count">
                {count}
                {narrowing > 0 ? (
                  <>
                    {" · "}
                    <button
                      type="button"
                      onClick={register.clearFilters}
                      className="font-sans text-sm text-[var(--color-ink-2)] underline decoration-[var(--color-line)] underline-offset-2 hover:text-[var(--color-ink)]"
                    >
                      Clear
                    </button>
                  </>
                ) : null}
              </span>
            ) : null}
          </div>
          <div className="crm-bk-tools-end">
            <span className="crm-bk-sepv" aria-hidden="true" />
            <SortMenu register={register} />
            {register.layout !== "BOARD" ? <GroupByMenu register={register} /> : null}
            {register.layout === "TABLE" ? <ColumnsMenu register={register} /> : null}
            {display}
            <RegisterExport register={register} />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The frame a list engine page is drawn in: the page's name and its one
 * create button in the app bar (PAGE-3), the Books finding banner, optional
 * KPI strip, two-row Books toolbar, and the records flush under the toolbar.
 */
export function RegisterShell({
  register,
  title,
  createLabel,
  onCreate,
  notice,
  finding,
  kpis,
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
  /** Books finding sentence shown across the top of the worksheet. */
  finding?: RegisterFinding | null;
  /** Optional Books KPI strip cells shown above the tabs. */
  kpis?: RegisterKpi[];
  /** How this layout draws its records, where the engine does not own it — a board's card fields. */
  display?: ReactNode;
  children: ReactNode;
}) {
  const primary = useMemo<PagePrimary | null>(
    () =>
      createLabel && onCreate
        ? {
            label: createLabel,
            icon: "plus" as const,
            shortcut: "N",
            onClick: onCreate,
          }
        : null,
    [createLabel, onCreate],
  );

  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target instanceof HTMLElement ? event.target : null;
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
      className="crm-bk-worksheet"
      style={{ "--stack-next": "calc(var(--stack-top, 0px) + var(--list-toolbar-h))" } as CSSProperties}
    >
      <PageChrome title={title} primary={primary} />

      {finding ? <CrmFinding finding={finding} /> : null}

      {kpis && kpis.length > 0 ? (
        <div className="crm-bk-strip">
          <div
            className="crm-bk-kstrip"
            style={{ gridTemplateColumns: `repeat(${kpis.length}, minmax(0, 1fr))` }}
          >
            {kpis.map((kpi) => (
              <div className="crm-bk-kt" key={kpi.label} data-tone={kpi.tone || undefined}>
                <span className="crm-bk-kt-l">{kpi.label}</span>
                <span className="crm-bk-kt-v">{kpi.value}</span>
                {kpi.note || kpi.sub ? <span className="crm-bk-kt-n">{kpi.note ?? kpi.sub}</span> : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {notice ? <div className="px-6 py-2 border-b border-[var(--color-line)] bg-[var(--color-ground)]">{notice}</div> : null}

      <RegisterToolbar register={register} display={display} />

      {register.error ? (
        <div className="p-6">
          <Alert tone="danger" title={`Unable to load ${title.toLowerCase()}`}>
            {getApiErrorMessage(register.error)}
          </Alert>
        </div>
      ) : null}

      <div className="crm-bk-bleed-reset" style={{ "--stack-top": "var(--stack-next)" } as CSSProperties}>
        {children}
      </div>
    </div>
  );
}
