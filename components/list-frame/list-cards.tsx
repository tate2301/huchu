"use client";

import * as React from "react";
import Link from "next/link";
import * as Dialog from "@radix-ui/react-dialog";

import { StateBadge } from "@/components/workspace/state-badge";
import { CaretLeft, Check, ChevronLeftIcon, ChevronRight, ChevronUpIcon, Search, X } from "@/lib/icons";
import { fillTemplate } from "@/lib/reports/actions";
import { PERIOD_PRESETS, type ListAction, type ListColumn, type ListGroup, type ListSpecPublic, type ReportRow, type ReportValue, type ResolvedListQuery } from "@/lib/reports/types";
import { formatCount } from "@/lib/workspace/format";

import { CountPill } from "@/components/workspace/count-pill";

import { PeriodPicker } from "./filters-popover";
import { PERIOD_LABELS, cellText, countWords, diffTone, drawnFilters, filterValueLabel, groupValue, isBlank, rowMatches, sortLabel, toneOf, totalText, type DrawnFilter } from "./model";

/**
 * A list on a phone (00-foundations 5.4.12, Mobile board): a 52px toolbar of
 * search and Filters, rows as cards that link to the record, the totals on
 * one line and "‹ 1 of 7 ›" with Back to top. Filters opens a bottom sheet
 * holding every filter, the tabs as "Show", Sort and Group. A long press ticks
 * a card and brings the selection bar.
 */

export function PhoneToolbar({
  spec,
  search,
  onSearch,
  filtersOn,
  onOpenFilters,
}: {
  spec: ListSpecPublic;
  search: string;
  onSearch: (value: string) => void;
  filtersOn: number;
  onOpenFilters: () => void;
}) {
  return (
    <div role="toolbar" aria-label={spec.noun} className="cx-lf-mtool">
      <label className="cx-lf-search">
        <Search aria-hidden />
        <input
          aria-label={`Search ${spec.noun}`}
          placeholder={`Search ${spec.noun}`}
          value={search}
          onChange={(event) => onSearch(event.target.value)}
        />
      </label>
      <button type="button" className="cx-lf-mfilters" onClick={onOpenFilters} aria-label={`Filters, ${filtersOn} on`}>
        Filters{filtersOn > 0 ? <span className="mono">{filtersOn}</span> : null}
      </button>
    </div>
  );
}

const LONG_PRESS_MS = 500;

export function ListCards({
  spec,
  rows,
  groups,
  groupKey,
  ticked,
  selecting,
  onTick,
  onAction,
  scrollRef,
  onScroll,
}: {
  spec: ListSpecPublic;
  rows: ReportRow[];
  /** The page's groups and the column they group by: a heading with the count opens each run of cards. */
  groups: ListGroup[] | null;
  groupKey: string | null;
  ticked: (id: string) => boolean;
  /** While anything is ticked, a tap ticks rather than opens. */
  selecting: boolean;
  onTick: (row: ReportRow) => void;
  /** The card's own button (`card.action`), doing that row menu action. */
  onAction: (action: ListAction, row: ReportRow) => void;
  scrollRef: React.Ref<HTMLDivElement>;
  onScroll: () => void;
}) {
  const press = React.useRef<{ timer: number | null; fired: boolean }>({ timer: null, fired: false });
  const column = (key: string | undefined): ListColumn | undefined =>
    key ? spec.columns.find((candidate) => candidate.key === key) : undefined;
  const titleColumn = column(spec.card.title);
  const badgeColumn = column(spec.card.badge);
  const figureColumn = column(spec.card.figure);
  const figure2Column = column(spec.card.figure2);

  const groupByValue = new Map((groups ?? []).map((group) => [group.value ?? "", group]));

  const start = (row: ReportRow) => {
    press.current.fired = false;
    press.current.timer = window.setTimeout(() => {
      press.current.fired = true;
      onTick(row);
    }, LONG_PRESS_MS);
  };
  const cancel = () => {
    if (press.current.timer) window.clearTimeout(press.current.timer);
    press.current.timer = null;
  };

  return (
    <div className="cx-lf-cards" ref={scrollRef} onScroll={onScroll}>
      {rows.map((row, index) => {
        let heading: React.ReactNode = null;
        if (groupKey && groups) {
          const value = groupValue(row, groupKey);
          if (index === 0 || value !== groupValue(rows[index - 1]!, groupKey)) {
            const group = groupByValue.get(value);
            if (group) {
              heading = (
                <div key={`group-${value}`} className="cx-lf-cards__head">
                  <span>{group.label}</span>
                  <CountPill aria-label={`${formatCount(group.count)} in ${group.label}`}>{formatCount(group.count)}</CountPill>
                </div>
              );
            }
          }
        }
        // A row with nothing to open for this viewer is a card, not a link.
        const href = fillTemplate(spec.rowHref, row);
        const badge = badgeColumn ? row[badgeColumn.key] : null;
        const cardAction = spec.card.action
          ? (spec.rowMenu ?? []).find((action) => action.key === spec.card.action && rowMatches(row, spec.columns, action.when))
          : undefined;
        const figure2 = figure2Column ? row[figure2Column.key] : null;
        const badgeEl =
          badgeColumn && !isBlank(badge) ? (
            <StateBadge tone={toneOf(badgeColumn, row) ?? "neutral"}>{String(badge)}</StateBadge>
          ) : null;
        const cardProps = {
          className: "cx-lf-card",
          "aria-selected": ticked(row.id),
          onPointerDown: () => start(row),
          onPointerUp: cancel,
          onPointerLeave: cancel,
          onPointerCancel: cancel,
          onContextMenu: (event: React.MouseEvent) => event.preventDefault(),
          onClick: (event: React.MouseEvent) => {
            if (press.current.fired || selecting) {
              event.preventDefault();
              if (!press.current.fired) onTick(row);
              press.current.fired = false;
            }
          },
        };
        const body = (
          <>
            <span className="cx-lf-card__top">
              <span className="cx-lf-card__title">{titleColumn ? cellText(titleColumn, row) : row.id}</span>
              {figureColumn ? badgeEl : null}
            </span>
            {/* A card without a figure carries its badge at the right instead (People, Tills). */}
            <span className="cx-lf-card__fig">{figureColumn ? cellText(figureColumn, row) : badgeEl}</span>
            <span className="cx-lf-card__meta">{fillTemplate(spec.card.meta, row, false) ?? ""}</span>
            <span className="cx-lf-card__fig2">
              {figure2Column ? (
                isBlank(figure2) ? (
                  <span className="cx-lf-none mono" style={{ fontSize: 12 }}>
                    —
                  </span>
                ) : figure2Column.cell === "diff" ? (
                  <span className={`cx-lf-pill cx-lf-pill--${diffTone(figure2Column, figure2)}`}>{cellText(figure2Column, row)}</span>
                ) : (
                  <span className="mono" style={{ fontSize: 12 }}>
                    {cellText(figure2Column, row)}
                  </span>
                )
              ) : null}
            </span>
            {spec.card.meta2 ? (
              <span className="cx-lf-card__meta cx-lf-card__meta--2">{fillTemplate(spec.card.meta2, row, false) ?? ""}</span>
            ) : null}
            {cardAction && !selecting ? (
              <button
                type="button"
                className="cx-lf-card__action"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onAction(cardAction, row);
                }}
              >
                {cardAction.label}
              </button>
            ) : null}
          </>
        );
        const card = href ? (
          <Link key={row.id} href={href} {...cardProps}>
            {body}
          </Link>
        ) : (
          <div key={row.id} {...cardProps}>
            {body}
          </div>
        );
        return heading ? [heading, card] : card;
      })}
    </div>
  );
}

/** Totals on one line, then "‹ 1 of 7 ›" and Back to top. */
export function PhoneFooter({
  spec,
  total,
  totals,
  page,
  pages,
  onPage,
  onTop,
}: {
  spec: ListSpecPublic;
  total: number | null;
  totals: Record<string, ReportValue>;
  page: number;
  pages: number;
  onPage: (page: number) => void;
  onTop: () => void;
}) {
  const money = spec.columns.filter((column) => column.total && (column.cell === "money" || column.cell === "diff"));
  return (
    <div className="cx-lf-mfoot" data-toast-floor="">
      <div className="cx-lf-mtotals" aria-label={`Totals for every ${spec.noun.replace(/s$/, "")} the filters let through`}>
        {/* The count alone beside money totals ("312"); with none, it carries its noun ("7 people"). */}
        <span>{total === null ? "—" : money.length > 0 ? formatCount(total) : countWords(total, spec.noun)}</span>
        <span style={{ flex: 1 }} />
        {money.map((column) => {
          const tone = column.cell === "diff" ? diffTone(column, totals[column.key]) : "zero";
          return (
            <span key={column.key} style={tone === "zero" ? undefined : { color: `var(--${tone})` }}>
              {totalText(column, totals[column.key])}
            </span>
          );
        })}
      </div>
      <nav aria-label="Pages" className="cx-lf-mpager">
        <button type="button" className="cx-lf-mpager__arrow" aria-label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeftIcon aria-hidden />
        </button>
        <span className="cx-lf-mpager__where">
          <span className="mono" style={{ color: "var(--ink)" }}>
            {total ? page : 0}
          </span>{" "}
          of <span className="mono">{total ? pages : 0}</span>
        </span>
        <button type="button" className="cx-lf-mpager__arrow" aria-label="Next page" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          <ChevronRight aria-hidden />
        </button>
        <button type="button" className="cx-lf-mpager__top" aria-label="Back to top" onClick={onTop}>
          <ChevronUpIcon aria-hidden />
        </button>
      </nav>
    </div>
  );
}

type SheetRow = {
  key: string;
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  pick: (value: string) => void;
  /** A period filter: its options end with "Choose dates…". */
  period?: DrawnFilter;
};

/** Every filter, the tabs as "Show", Sort and Group, in a bottom sheet. */
export function PhoneFiltersSheet({
  open,
  onOpenChange,
  spec,
  query,
  tabCounts,
  onTab,
  onFilter,
  onSort,
  onGroup,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spec: ListSpecPublic;
  query: ResolvedListQuery;
  tabCounts: Record<string, number> | null;
  onTab: (tab: string) => void;
  onFilter: (key: string, value: string) => void;
  onSort: (sort: string) => void;
  onGroup: (group: string | null) => void;
}) {
  const [picking, setPicking] = React.useState<string | null>(null);
  // "Choose dates…" closes this sheet and opens the range picker's own sheet, titled by the filter.
  const [dates, setDates] = React.useState<{ filter: DrawnFilter; open: boolean } | null>(null);
  const rows: SheetRow[] = [];
  if (spec.tabs?.length) {
    rows.push({
      key: "tab",
      label: "Show",
      value: spec.tabs.find((tab) => tab.key === query.tab)?.label ?? spec.tabs[0]!.label,
      options: spec.tabs.map((tab) => ({
        value: tab.key,
        label: tabCounts ? `${tab.label} · ${formatCount(tabCounts[tab.key] ?? 0)}` : tab.label,
      })),
      pick: onTab,
    });
  }
  for (const filter of drawnFilters(spec)) {
    const value = query.filters[filter.key] ?? "any";
    rows.push({
      key: filter.key,
      label: filter.label,
      value: filterValueLabel(filter, value),
      options:
        filter.type === "period"
          ? [
              ...PERIOD_PRESETS.filter((preset) => preset !== "any").map((preset) => ({ value: preset, label: PERIOD_LABELS[preset]! })),
              { value: "any", label: filter.any },
            ]
          : [{ value: "any", label: filter.any }, ...(filter.options ?? []).map(({ value: v, label }) => ({ value: v, label }))],
      pick: (next) => onFilter(filter.key, next),
      period: filter.type === "period" ? filter : undefined,
    });
  }
  rows.push({
    key: "sort",
    label: "Sort",
    value: sortLabel(spec, query.sort),
    options: spec.sorts.map((sort) => ({ value: sort.key, label: sort.label })),
    pick: onSort,
  });
  if (spec.groups?.length) {
    rows.push({
      key: "group",
      label: "Group",
      value: spec.columns.find((column) => column.key === query.group)?.label ?? "None",
      options: [
        { value: "none", label: "None" },
        ...spec.groups.map((key) => ({ value: key, label: spec.columns.find((column) => column.key === key)?.label ?? key })),
      ],
      pick: (value) => onGroup(value === "none" ? null : value),
    });
  }
  const current = (row: SheetRow): string =>
    row.key === "tab"
      ? (query.tab ?? "")
      : row.key === "sort"
        ? query.sort
        : row.key === "group"
          ? (query.group ?? "none")
          : (query.filters[row.key] ?? "any");
  const active = rows.find((row) => row.key === picking) ?? null;
  const custom = active?.period && current(active).includes("..") ? current(active) : null;
  const option = (key: string, chosen: boolean, label: string, onClick: () => void) => (
    <button key={key} type="button" role="menuitemradio" aria-checked={chosen} className="cx-lf-option" onClick={onClick}>
      <span className="cx-lf-option__mark">{chosen ? <Check aria-hidden /> : null}</span>
      {label}
    </button>
  );
  const chooseDates = (filter: DrawnFilter) => {
    onOpenChange(false);
    setPicking(null);
    setDates({ filter, open: true });
  };

  return (
    <>
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setPicking(null);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="cx-scrim" />
        <Dialog.Content className="cx-lf-msheet" aria-describedby={undefined}>
          <div className="cx-lf-msheet__head">
            {active ? (
              <button type="button" className="cx-lf-mpager__arrow" aria-label="Back to the filters" onClick={() => setPicking(null)}>
                <CaretLeft aria-hidden />
              </button>
            ) : null}
            <Dialog.Title className="cx-lf-msheet__title">{active ? active.label : "Filters"}</Dialog.Title>
            <Dialog.Close className="cx-lf-mpager__arrow" aria-label="Close">
              <X aria-hidden />
            </Dialog.Close>
          </div>
          <div className="cx-lf-msheet__body">
            {active
              ? [
                  ...active.options.map((entry) =>
                    option(entry.value, current(active) === entry.value, entry.label, () => {
                      active.pick(entry.value);
                      setPicking(null);
                    }),
                  ),
                  ...(active.period
                    ? [
                        ...(custom
                          ? [option("custom", true, `${filterValueLabel(active.period, custom)} …`, () => chooseDates(active.period!))]
                          : []),
                        option("choose", false, "Choose dates…", () => chooseDates(active.period!)),
                      ]
                    : []),
                ]
              : rows.map((row) => (
                  <button key={row.key} type="button" className="cx-lf-pop__row" onClick={() => setPicking(row.key)}>
                    <span className="cx-lf-pop__label">{row.label}</span>
                    <span className="cx-lf-pop__value">{row.value}</span>
                    <ChevronRight aria-hidden />
                  </button>
                ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
    {dates ? (
      <PeriodPicker
        filter={dates.filter}
        value={query.filters[dates.filter.key] ?? "any"}
        open={dates.open}
        onOpenChange={(next) => setDates((now) => now && { ...now, open: next })}
        onPick={(next) => onFilter(dates.filter.key, next)}
      />
    ) : null}
    </>
  );
}
