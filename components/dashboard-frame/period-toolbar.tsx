"use client";

import * as React from "react";

import { DateRangePicker, type DayPreset } from "@/components/ui/date-picker";
import { Button } from "@/components/workspace/button";
import { FilterChip } from "@/components/workspace/filter-chip";
import { Menu, MenuContent, MenuRadioGroup, MenuRadioItem, MenuTrigger } from "@/components/workspace/menu";
import { Segmented, type SegmentedItem } from "@/components/workspace/segmented";
import { Calendar } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { dayRangeWords, todayIn } from "@/lib/workspace/format";

const ZONE = "Africa/Harare";
const CLOCK = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: ZONE });
const LONG_DAY = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: ZONE,
});

/** "14:42" in the shop's time. */
export function shopTime(at: string | Date) {
  return CLOCK.format(new Date(at));
}

/** "Saturday 3 October 2026" in the shop's time. */
export function shopLongDay(at: string | Date) {
  return LONG_DAY.format(new Date(at)).replace(",", "");
}

export type SiteChoice = {
  /** "all" or a site's id. */
  value: string;
  label: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  onChange: (value: string) => void;
};

export type RangeChoice = {
  /** The days chosen, or null while a preset period is pressed. */
  value: { from: string; to: string } | null;
  onChange: (range: { from: string; to: string }) => void;
  /** × on the chip: back to the default period. */
  onClear: () => void;
  presets: ReadonlyArray<DayPreset>;
};

/** The longest range the picker lets through, in days. */
const MAX_RANGE_DAYS = 366;

/**
 * "Choose dates" after the period segments, or, once days are chosen, the
 * chip "1 to 3 October ×" in its place. Both open the range picker; on a
 * phone it is a bottom sheet.
 */
function RangeControl({ range }: { range: RangeChoice }) {
  const value = range.value;
  const trigger = value ? (
    <FilterChip value={dayRangeWords(value, todayIn(ZONE))} isSet onClear={range.onClear} />
  ) : (
    <Button icon={<Calendar aria-hidden="true" />}>Choose dates</Button>
  );
  return (
    <DateRangePicker
      value={value ?? { from: null, to: null }}
      onChange={(next) => {
        if (next.from && next.to) range.onChange({ from: next.from, to: next.to });
      }}
      presets={range.presets}
      maxDays={MAX_RANGE_DAYS}
      title="Choose dates"
      timeZone={ZONE}
      trigger={trigger}
    />
  );
}

/**
 * The dashboard toolbar (48px): the period as a `Segmented` (none pressed
 * while a range of days is chosen), "Choose dates" or the chosen days' chip,
 * the site as a `FilterChip` menu, what the figures are compared with, then on the right
 * either the live line (Overview: a green dot, the day and the time) or when
 * the figures were worked out (Insights: "Updated 14:42").
 */
export function PeriodToolbar<P extends string>({
  periods,
  period,
  onPeriodChange,
  site,
  compare,
  live,
  updatedAt,
  range = null,
  ground = false,
  wrap = false,
}: {
  periods: ReadonlyArray<SegmentedItem<P>>;
  /** Null while a range of days is chosen instead. */
  period: P | null;
  onPeriodChange: (value: P) => void;
  site?: SiteChoice | null;
  /** "Compared with the 30 days before". */
  compare?: string | null;
  /** Overview: the moment the tiles show, as a live line. */
  live?: string | Date | null;
  /** Insights: when the figures were worked out. */
  updatedAt?: string | Date | null;
  /** Insights: choose any days, not only the periods. */
  range?: RangeChoice | null;
  /** The insight variant's toolbar sits on `--ground`. */
  ground?: boolean;
  /** On a phone the controls wrap: the period full width, the site under it (Overview). */
  wrap?: boolean;
}) {
  const updated = updatedAt ? `Updated ${shopTime(updatedAt)}` : null;
  return (
    <>
      <div role="toolbar" aria-label="Period" className={cn("cx-df-toolbar", ground && "cx-df-toolbar--ground", wrap && "cx-df-toolbar--wrap")}>
        <Segmented aria-label="Period" items={periods} value={period} onValueChange={onPeriodChange} />
        {range ? <RangeControl range={range} /> : null}
        {site ? (
          <Menu>
            <MenuTrigger asChild>
              <FilterChip label="Site" value={site.label} isSet={site.value !== "all"} />
            </MenuTrigger>
            <MenuContent>
              <MenuRadioGroup value={site.value} onValueChange={site.onChange}>
                {site.options.map((option) => (
                  <MenuRadioItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuRadioItem>
                ))}
              </MenuRadioGroup>
            </MenuContent>
          </Menu>
        ) : null}
        {compare ? <span className="cx-df-toolbar__quiet cx-df-toolbar__wide">{compare}</span> : null}
        <span className="cx-df-toolbar__spacer" />
        {live ? (
          <span className="cx-df-live cx-df-toolbar__wide">
            <span className="cx-df-live__dot" aria-hidden="true" />
            Live · {shopLongDay(live)} · <span className="cx-df-mono">{shopTime(live)}</span>
          </span>
        ) : null}
        {updated ? <span className="cx-df-toolbar__quiet cx-df-toolbar__wide">{updated}</span> : null}
      </div>
      {compare || updated ? (
        <div className="cx-df-toolbar__under">{[compare, updated].filter(Boolean).join(" · ")}</div>
      ) : null}
    </>
  );
}
