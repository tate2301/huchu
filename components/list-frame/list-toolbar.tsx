"use client";

import * as React from "react";

import { CountPill } from "@/components/workspace/count-pill";
import { Search } from "@/lib/icons";
import type { ListSpecPublic, ResolvedListQuery } from "@/lib/reports/types";
import { formatCount } from "@/lib/workspace/format";

import { ExportMenu, exportCaption, type ExportFormat } from "./export-menu";
import { FilterChipMenu, FiltersPopover } from "./filters-popover";
import { canClear, drawnFilters, filtersOn, type Fold } from "./model";
import { ViewControls } from "./view-menu";

/**
 * The toolbar (00-foundations 5.4.4): read left to right as one sentence —
 * find, narrow, then the count and Clear, then how the rows are shown, then
 * what leaves the page. Controls never wrap; they fold.
 */
export function ListToolbar({
  title,
  spec,
  query,
  total,
  fold,
  search,
  onSearch,
  searchRef,
  onFilter,
  onFilters,
  onClear,
  onSort,
  onGroup,
  hidden,
  onHidden,
  onExport,
}: {
  title: string;
  spec: ListSpecPublic;
  query: ResolvedListQuery;
  total: number | null;
  fold: Fold;
  search: string;
  onSearch: (value: string) => void;
  searchRef: React.Ref<HTMLInputElement>;
  onFilter: (key: string, value: string) => void;
  /** Sets several filters at once (Clear all). */
  onFilters: (values: Record<string, string>) => void;
  onClear: () => void;
  onSort: (sort: string) => void;
  onGroup: (group: string | null) => void;
  hidden: string[];
  onHidden: (hidden: string[]) => void;
  onExport: (format: ExportFormat) => void;
}) {
  const filters = drawnFilters(spec);
  const primaries = filters.filter((filter) => filter.primary);
  const on = filtersOn(spec, query.filters, fold.chips);

  return (
    <div role="toolbar" aria-label={title} className="cx-lf-toolbar">
      <label className="cx-lf-search">
        <Search aria-hidden />
        <input
          ref={searchRef}
          aria-label={`Search ${spec.noun}`}
          placeholder={spec.search.placeholder}
          value={search}
          onChange={(event) => onSearch(event.target.value)}
        />
        {fold.hints ? null : <span className="cx-lf-key" aria-hidden="true">/</span>}
      </label>
      {fold.chips
        ? null
        : primaries.map((filter) => (
            <FilterChipMenu
              key={filter.key}
              filter={filter}
              value={query.filters[filter.key] ?? "any"}
              onPick={(value) => onFilter(filter.key, value)}
            />
          ))}
      <FiltersPopover
        filters={filters}
        values={query.filters}
        onCount={on}
        folded={fold.chips}
        onPick={onFilter}
        onClearAll={() => onFilters(Object.fromEntries(filters.map((filter) => [filter.key, "any"])))}
      />
      <span className="cx-lf-spacer" />
      {fold.count ? null : (
        <>
          <CountPill aria-label={total === null ? undefined : `${formatCount(total)} ${spec.noun}`}>
            {total === null ? "—" : formatCount(total)}
          </CountPill>
          {canClear(spec, query) ? (
            <button type="button" className="cx-lf-link" onClick={onClear}>
              Clear
            </button>
          ) : null}
          <span className="cx-lf-rule" aria-hidden="true" />
        </>
      )}
      <ViewControls
        spec={spec}
        sort={query.sort}
        group={query.group}
        hidden={hidden}
        onSort={onSort}
        onGroup={onGroup}
        onHidden={onHidden}
        folded={fold.view}
      />
      <ExportMenu caption={exportCaption(total ?? 0, spec.noun)} onExport={onExport} extras={spec.exportExtras} />
    </div>
  );
}
