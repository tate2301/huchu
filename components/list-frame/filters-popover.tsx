"use client";

import * as React from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Popover from "@radix-ui/react-popover";

import { OnBadge } from "@/components/workspace/count-pill";
import { DateRangePicker, type DayRange } from "@/components/ui/date-picker";
import { FilterChip } from "@/components/workspace/filter-chip";
import { Menu, MenuContent, MenuRadioGroup, MenuRadioItem, MenuSeparator, MenuTrigger } from "@/components/workspace/menu";
import { ChevronRight, Funnel } from "@/lib/icons";
import { PERIOD_PRESETS } from "@/lib/reports/types";

import { PERIOD_LABELS, filterValueLabel, heldFilters, type DrawnFilter } from "./model";

/**
 * Filters (00-foundations 5.4.4 items 2 and 3): the primary chips on the
 * toolbar, and the Filters button with its popover of every other filter. A
 * row in the popover opens the same option menu as its chip, nested. The
 * primary filters join the popover once they have folded off the row, or
 * always when the list has no other filters.
 */

/** The option list of one filter: `any` first, a check on the current one; a period adds "Choose dates…". */
export function FilterOptions({
  filter,
  value,
  onPick,
  onChooseDates,
}: {
  filter: DrawnFilter;
  value: string;
  onPick: (value: string) => void;
  /** "Choose dates…": the menu closes and the range picker opens in its place. */
  onChooseDates?: () => void;
}) {
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
      <MenuRadioGroup value={value} onValueChange={(next) => next !== custom && onPick(next)}>
        {options.map((option) => (
          <MenuRadioItem key={option.value} value={option.value}>
            {option.label}
          </MenuRadioItem>
        ))}
      </MenuRadioGroup>
      {filter.type === "period" && onChooseDates ? (
        <>
          <MenuSeparator />
          <MenuRadioGroup value={value}>
            {custom ? (
              <MenuRadioItem value={custom} onSelect={onChooseDates}>
                {filterValueLabel(filter, custom)} …
              </MenuRadioItem>
            ) : null}
          </MenuRadioGroup>
          <DropdownMenu.Item className="cx-menu__item" onSelect={onChooseDates}>
            <span className="cx-menu__mark" />
            <span style={{ flex: 1 }}>Choose dates…</span>
          </DropdownMenu.Item>
        </>
      ) : null}
    </>
  );
}

/** A period's "from..to" as the range picker holds it. */
export function periodDays(value: string): DayRange {
  if (!value.includes("..")) return { from: null, to: null };
  const [from, to] = value.split("..");
  return { from: from || null, to: to || null };
}

/**
 * The range picker a period's "Choose dates…" opens, under the element that
 * held the menu. No presets (the menu is the preset list) and no latest day:
 * a list may show dates still to come.
 */
export function PeriodPicker({
  filter,
  value,
  open,
  onOpenChange,
  anchor,
  onPick,
}: {
  filter: DrawnFilter;
  value: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anchor?: React.RefObject<HTMLElement | null>;
  onPick: (value: string) => void;
}) {
  return (
    <DateRangePicker
      value={periodDays(value)}
      onChange={(range) => {
        if (range.from && range.to) onPick(`${range.from}..${range.to}`);
      }}
      latest={null}
      title={filter.label}
      open={open}
      onOpenChange={onOpenChange}
      anchor={anchor}
    />
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
  const chip = React.useRef<HTMLButtonElement>(null);
  const [picking, setPicking] = React.useState(false);
  // The picker takes focus as the menu closes; the menu must not hand it back to the chip.
  const keepFocus = React.useRef(false);
  return (
    <>
      <Menu>
        <MenuTrigger asChild>
          <FilterChip ref={chip} label={filter.label} value={filterValueLabel(filter, value)} isSet={value !== "any"} />
        </MenuTrigger>
        <MenuContent
          roomy
          style={{ minWidth: 200, maxHeight: 420, overflowY: "auto" }}
          onCloseAutoFocus={(event) => {
            if (!keepFocus.current) return;
            keepFocus.current = false;
            event.preventDefault();
          }}
        >
          <FilterOptions
            filter={filter}
            value={value}
            onPick={onPick}
            onChooseDates={() => {
              keepFocus.current = true;
              setPicking(true);
            }}
          />
        </MenuContent>
      </Menu>
      {filter.type === "period" ? (
        <PeriodPicker filter={filter} value={value} open={picking} onOpenChange={setPicking} anchor={chip} onPick={onPick} />
      ) : null}
    </>
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
  const button = React.useRef<HTMLButtonElement>(null);
  // A period's "Choose dates…" closes the popover and opens the picker under the Filters button.
  const [picking, setPicking] = React.useState<{ key: string; open: boolean } | null>(null);
  const keepFocus = React.useRef(false);
  const holdFocus = (event: Event) => {
    if (keepFocus.current) event.preventDefault();
  };
  const rows = heldFilters(filters, folded);
  if (rows.length === 0) return null;
  const pickingFilter = picking ? (filters.find((filter) => filter.key === picking.key) ?? null) : null;
  return (
    <>
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          ref={button}
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
          onCloseAutoFocus={(event) => {
            holdFocus(event);
            keepFocus.current = false;
          }}
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
                <MenuContent
                  side="right"
                  align="start"
                  roomy
                  style={{ minWidth: 220, maxHeight: 420, overflowY: "auto" }}
                  onCloseAutoFocus={holdFocus}
                >
                  <FilterOptions
                    filter={filter}
                    value={value}
                    onPick={(next) => onPick(filter.key, next)}
                    onChooseDates={() => {
                      keepFocus.current = true;
                      setOpen(false);
                      setPicking({ key: filter.key, open: true });
                    }}
                  />
                </MenuContent>
              </Menu>
            );
          })}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
    {pickingFilter ? (
      <PeriodPicker
        filter={pickingFilter}
        value={values[pickingFilter.key] ?? "any"}
        open={picking?.open ?? false}
        onOpenChange={(next) => setPicking((current) => current && { ...current, open: next })}
        anchor={button}
        onPick={(next) => onPick(pickingFilter.key, next)}
      />
    ) : null}
    </>
  );
}
