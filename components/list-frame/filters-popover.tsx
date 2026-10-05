"use client";

import * as React from "react";
import * as Popover from "@radix-ui/react-popover";

import { OnBadge } from "@/components/workspace/count-pill";
import { FilterChip } from "@/components/workspace/filter-chip";
import { Menu, MenuContent, MenuRadioGroup, MenuRadioItem, MenuSeparator, MenuTrigger } from "@/components/workspace/menu";
import { ChevronRight, Funnel } from "@/lib/icons";
import { isPeriodValue } from "@/lib/reports/list-query";
import { PERIOD_PRESETS } from "@/lib/reports/types";

import { PERIOD_LABELS, filterValueLabel, type DrawnFilter } from "./model";

/**
 * Filters (00-foundations 5.4.4 items 2 and 3): the primary chips on the
 * toolbar, and the Filters button with its popover of every other filter. A
 * row in the popover opens the same option menu as its chip, nested. The
 * primary filters join the popover only once they have folded off the row.
 */

/** The option list of one filter: `any` first, a check on the current one; a period adds "Choose dates…". */
export function FilterOptions({
  filter,
  value,
  onPick,
}: {
  filter: DrawnFilter;
  value: string;
  onPick: (value: string) => void;
}) {
  const [choosing, setChoosing] = React.useState(false);
  const range = filter.type === "period" && value.includes("..") ? value.split("..") : ["", ""];
  const [from, setFrom] = React.useState(range[0] ?? "");
  const [to, setTo] = React.useState(range[1] ?? "");

  const options =
    filter.type === "period"
      ? [
          ...PERIOD_PRESETS.filter((preset) => preset !== "any").map((preset) => ({
            value: preset,
            label: PERIOD_LABELS[preset]!,
          })),
          { value: "any", label: filter.any },
        ]
      : [{ value: "any", label: filter.any }, ...(filter.options ?? []).map(({ value: v, label }) => ({ value: v, label }))];

  const custom = filter.type === "period" && value.includes("..") ? value : null;

  return (
    <>
      <MenuRadioGroup value={custom ? "" : value} onValueChange={onPick}>
        {options.map((option) => (
          <MenuRadioItem key={option.value} value={option.value}>
            {option.label}
          </MenuRadioItem>
        ))}
      </MenuRadioGroup>
      {filter.type === "period" ? (
        <>
          <MenuSeparator />
          {choosing || custom ? (
            <form
              className="cx-lf-dates"
              onKeyDown={(event) => event.stopPropagation()}
              onSubmit={(event) => {
                event.preventDefault();
                const next = `${from}..${to}`;
                if (isPeriodValue(next)) onPick(next);
              }}
            >
              <label>
                <span>From</span>
                <input type="date" value={from} max={to || undefined} onChange={(event) => setFrom(event.target.value)} />
              </label>
              <label>
                <span>To</span>
                <input type="date" value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} />
              </label>
              <button type="submit" className="cx-btn cx-btn--primary" disabled={!isPeriodValue(`${from}..${to}`)}>
                Apply
              </button>
            </form>
          ) : (
            <button type="button" className="cx-menu__item" onClick={() => setChoosing(true)}>
              <span className="cx-menu__mark" />
              <span style={{ flex: 1 }}>Choose dates…</span>
            </button>
          )}
        </>
      ) : null}
    </>
  );
}

/** A primary filter on the toolbar: "Till Any ⌄". */
export function FilterChipMenu({
  filter,
  value,
  onPick,
}: {
  filter: DrawnFilter;
  value: string;
  onPick: (value: string) => void;
}) {
  return (
    <Menu>
      <MenuTrigger asChild>
        <FilterChip label={filter.label} value={filterValueLabel(filter, value)} isSet={value !== "any"} />
      </MenuTrigger>
      <MenuContent roomy style={{ minWidth: 200, maxHeight: 420, overflowY: "auto" }}>
        <FilterOptions filter={filter} value={value} onPick={onPick} />
      </MenuContent>
    </Menu>
  );
}

export function FiltersPopover({
  filters,
  values,
  onCount,
  folded,
  onPick,
  onClearAll,
}: {
  filters: DrawnFilter[];
  values: Record<string, string>;
  /** Filters not at their `any`, as the badge counts them. */
  onCount: number;
  /** The primary chips have folded off the row and live here too. */
  folded: boolean;
  onPick: (key: string, value: string) => void;
  onClearAll: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const rows = filters.filter((filter) => folded || !filter.primary);
  if (rows.length === 0) return null;
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="cx-lf-btn cx-lf-btn--strong"
          aria-label={`More filters, ${onCount} on`}
          aria-expanded={open}
        >
          <Funnel aria-hidden />
          Filters
          {onCount > 0 ? <OnBadge>{onCount}</OnBadge> : null}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          role="dialog"
          aria-label="Filters"
          className="cx-lf-pop"
          side="bottom"
          align="start"
          sideOffset={8}
        >
          <div className="cx-lf-pop__head">
            <span className="cx-lf-pop__title">Filters</span>
            <button type="button" className="cx-lf-link" style={{ height: "auto", padding: 0 }} onClick={onClearAll}>
              Clear all
            </button>
          </div>
          {rows.map((filter) => {
            const value = values[filter.key] ?? "any";
            const on = value !== "any";
            return (
              <Menu key={filter.key}>
                <MenuTrigger asChild>
                  <button type="button" className={`cx-lf-pop__row${on ? " is-on" : ""}`}>
                    <span className="cx-lf-pop__label">{filter.label}</span>
                    <span className="cx-lf-pop__value">{filterValueLabel(filter, value)}</span>
                    <ChevronRight aria-hidden />
                  </button>
                </MenuTrigger>
                <MenuContent side="right" align="start" roomy style={{ minWidth: 220, maxHeight: 420, overflowY: "auto" }}>
                  <FilterOptions filter={filter} value={value} onPick={(next) => onPick(filter.key, next)} />
                </MenuContent>
              </Menu>
            );
          })}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
