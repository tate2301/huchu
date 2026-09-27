"use client";

import { useMemo, useState, type CSSProperties, type ReactNode } from "react";

import { Alert, Button } from "@corelithzw/react";
import { PageChrome } from "@/components/layout/page-chrome";
import { LayoutSwitch } from "@/components/records/layout-switch";
import { ViewToolbar } from "@/components/records/view-toolbar";
import { ListSearch } from "@/components/crm/records/list-search";
import { getApiErrorMessage } from "@/lib/api-client";
import { activeFilterCount } from "@/lib/crm/registers/codec";
import type { FilterDef } from "@/lib/crm/registers/types";
import { Plus, X } from "@/lib/icons";

import { BulkActions } from "./bulk-actions";
import { RegisterExport } from "./export-control";
import { AddFilterMenu, FilterChip } from "./filter-controls";
import { ColumnsMenu, SortMenu, ViewsMenu } from "./toolbar-menus";
import type { RegisterHandle } from "./use-register";

/**
 * A list's toolbar, the one row under the app bar (PAGE-4):
 *
 *   [View ▾ · Table|List|Board] │ [⌕ search] [Type: Any] [Owner: Me] [+ Filter] ··· 50 of 214 │ [Sort ▾] [Columns] [Export]
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
export function RegisterToolbar({ register }: { register: RegisterHandle }) {
  const { def, state, selection } = register;
  const [pending, setPending] = useState<string | null>(null);

  const shown = useMemo<FilterDef[]>(
    () =>
      def.filters.filter(
        (filter) => filter.pinned || state.filters[filter.key] !== undefined || filter.key === pending,
      ),
    [def.filters, pending, state.filters],
  );
  const shownKeys = useMemo(() => new Set(shown.map((filter) => filter.key)), [shown]);
  const narrowing = activeFilterCount(state);
  const count = register.query.data
    ? `${register.rows.length.toLocaleString("en-US")} of ${register.total.toLocaleString("en-US")}`
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
            register={register}
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
          {/* Order is about how the rows are shown, not which rows are in
              the list, so it sits after the count with the columns (FILT-1). */}
          <SortMenu register={register} />
          {(state.layout ?? def.layouts[0]) === "TABLE" ? <ColumnsMenu register={register} /> : null}
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
  children,
}: {
  register: RegisterHandle;
  title: string;
  /** Omit to draw a list with no create button. */
  createLabel?: string;
  onCreate?: () => void;
  /** A standing instruction about the whole list, above the toolbar. */
  notice?: ReactNode;
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

  return (
    <div
      // The next rung of the sticky stack, for the table header to pin at
      // under the toolbar (PAGE-5).
      style={{ "--stack-next": "calc(var(--stack-top, 0px) + var(--list-toolbar-h))" } as CSSProperties}
    >
      <PageChrome title={title}>{actions}</PageChrome>

      {notice ? <div className="mb-3">{notice}</div> : null}

      <RegisterToolbar register={register} />

      {register.query.error ? (
        <Alert tone="danger" title={`Unable to load ${title.toLowerCase()}`} className="mt-4">
          {getApiErrorMessage(register.query.error)}
        </Alert>
      ) : null}

      <div style={{ "--stack-top": "var(--stack-next)" } as CSSProperties}>{children}</div>
    </div>
  );
}
