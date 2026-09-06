"use client";

import { useEffect, useMemo, useState } from "react";
import type { CrmLeadStage } from "@corelithzw/db";

import { Badge } from "@corelithzw/react";
import { Button } from "@corelithzw/ui/components/button";
import { Checkbox } from "@corelithzw/ui/components/checkbox";
import { Input } from "@corelithzw/ui/components/input";
import { Label } from "@corelithzw/ui/components/label";
import { Popover, PopoverContent, PopoverTrigger } from "@corelithzw/ui/components/popover";
import { ChevronDown, Funnel, SortAscending, X } from "@corelithzw/ui/lib/icons";
import { LEAD_STAGE_DOT } from "@/lib/crm/tones";
import { ToneSelect } from "@/components/crm/records/tone-select";
import type { LeadSort, LeadViewFilters } from "@/lib/crm/views";
import { cn } from "@corelithzw/ui/lib/utils";

import {
  CRM_CHANNEL_LABELS,
  CRM_LEAD_CHANNELS,
  CRM_LEAD_STAGES,
  CRM_STAGE_LABELS,
} from "./stage-config";

export type LeadFilterOwner = { id: string; name: string | null };

type MultiFilterProps = {
  label: string;
  options: Array<{ value: string; label: string }>;
  selected: string[];
  onChange: (next: string[]) => void;
  extra?: { label: string; checked: boolean; onChange: (checked: boolean) => void };
};

function MultiFilter({ label, options, selected, onChange, extra }: MultiFilterProps) {
  const activeCount = selected.length + (extra?.checked ? 1 : 0);

  const toggle = (value: string) => {
    onChange(
      selected.includes(value)
        ? selected.filter((entry) => entry !== value)
        : [...selected, value],
    );
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          {label}
          {activeCount > 0 ? (
            <Badge tone="info" size="sm">
              {activeCount}
            </Badge>
          ) : null}
          <ChevronDown className="size-3 text-[var(--text-muted)]" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-2">
        <div className="max-h-72 space-y-0.5 overflow-y-auto">
          {extra ? (
            <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-[var(--surface-hover)]">
              <Checkbox
                checked={extra.checked}
                onCheckedChange={(checked) => extra.onChange(checked === true)}
              />
              <span>{extra.label}</span>
            </label>
          ) : null}
          {options.map((option) => (
            <label
              key={option.value}
              className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-[var(--surface-hover)]"
            >
              <Checkbox
                checked={selected.includes(option.value)}
                onCheckedChange={() => toggle(option.value)}
              />
              <span className="truncate">{option.label}</span>
            </label>
          ))}
          {options.length === 0 ? (
            <p className="px-2 py-1.5 text-sm text-[var(--text-muted)]">Nothing to filter by yet.</p>
          ) : null}
        </div>
        {activeCount > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            className="mt-1 w-full justify-center"
            onClick={() => {
              onChange([]);
              extra?.onChange(false);
            }}
          >
            Clear
          </Button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

function ValueRangeFilter({
  valueMin,
  valueMax,
  onChange,
}: {
  valueMin?: number;
  valueMax?: number;
  onChange: (next: { valueMin?: number; valueMax?: number }) => void;
}) {
  const active = valueMin !== undefined || valueMax !== undefined;
  const toNumber = (raw: string) => {
    const trimmed = raw.trim();
    if (trimmed === "") return undefined;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          Value
          {active ? <Badge tone="info" size="sm">1</Badge> : null}
          <ChevronDown className="size-3 text-[var(--text-muted)]" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 space-y-3 p-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="value-min" className="text-sm">
              Min
            </Label>
            <Input
              id="value-min"
              inputMode="decimal"
              className="font-mono"
              defaultValue={valueMin ?? ""}
              onBlur={(event) => onChange({ valueMin: toNumber(event.target.value), valueMax })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="value-max" className="text-sm">
              Max
            </Label>
            <Input
              id="value-max"
              inputMode="decimal"
              className="font-mono"
              defaultValue={valueMax ?? ""}
              onBlur={(event) => onChange({ valueMin, valueMax: toNumber(event.target.value) })}
            />
          </div>
        </div>
        {active ? (
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-center"
            onClick={() => onChange({ valueMin: undefined, valueMax: undefined })}
          >
            Clear
          </Button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

function DateRangeFilter({
  createdFrom,
  createdTo,
  onChange,
}: {
  createdFrom?: string;
  createdTo?: string;
  onChange: (next: { createdFrom?: string; createdTo?: string }) => void;
}) {
  const active = Boolean(createdFrom || createdTo);
  const toIso = (raw: string, endOfDay: boolean) => {
    if (!raw) return undefined;
    const date = new Date(`${raw}T${endOfDay ? "23:59:59" : "00:00:00"}`);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  };
  const toInputValue = (iso?: string) => (iso ? iso.slice(0, 10) : "");

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          Created
          {active ? <Badge tone="info" size="sm">1</Badge> : null}
          <ChevronDown className="size-3 text-[var(--text-muted)]" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 space-y-3 p-3">
        <div className="space-y-1.5">
          <Label htmlFor="created-from" className="text-sm">
            From
          </Label>
          <Input
            id="created-from"
            type="date"
            value={toInputValue(createdFrom)}
            onChange={(event) =>
              onChange({ createdFrom: toIso(event.target.value, false), createdTo })
            }
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="created-to" className="text-sm">
            To
          </Label>
          <Input
            id="created-to"
            type="date"
            value={toInputValue(createdTo)}
            onChange={(event) =>
              onChange({ createdFrom, createdTo: toIso(event.target.value, true) })
            }
          />
        </div>
        {active ? (
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-center"
            onClick={() => onChange({ createdFrom: undefined, createdTo: undefined })}
          >
            Clear
          </Button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

/**
 * Stage, on its own.
 *
 * It sits in the top row beside the saved views rather than down in the filter
 * row, because on the board it is not a filter so much as which columns exist
 * — and that belongs next to the thing that says which slice of the pipeline
 * you are looking at.
 */
export function LeadStageFilter({
  filters,
  onChange,
}: {
  filters: LeadViewFilters;
  onChange: (next: LeadViewFilters) => void;
}) {
  const stageOptions = useMemo(
    () =>
      CRM_LEAD_STAGES.map((stage: CrmLeadStage) => ({
        value: stage,
        label: CRM_STAGE_LABELS[stage],
        dot: LEAD_STAGE_DOT[stage],
      })),
    [],
  );

  return (
    <ToneSelect
      label="Stage"
      placeholder="All stages"
      options={stageOptions}
      selected={filters.stages ?? []}
      onChange={(next) =>
        onChange({ ...filters, stages: next.length ? (next as CrmLeadStage[]) : undefined })
      }
    />
  );
}

/**
 * The workspace filter row. Emits the same serialisable shape that gets stored
 * in a saved view, so "what I'm looking at" and "what I saved" are one object.
 */
export function LeadsFilters({
  filters,
  onChange,
  owners,
  sources,
  className,
}: {
  filters: LeadViewFilters;
  onChange: (next: LeadViewFilters) => void;
  owners: LeadFilterOwner[];
  sources: string[];
  className?: string;
}) {
  const [searchDraft, setSearchDraft] = useState(filters.q ?? "");

  // Keep the box in step when a saved view swaps the filters out from under it.
  useEffect(() => {
    setSearchDraft(filters.q ?? "");
  }, [filters.q]);

  // Debounce typing so the list doesn't refetch on every keystroke.
  useEffect(() => {
    const current = filters.q ?? "";
    if (searchDraft === current) return;
    const timer = setTimeout(() => {
      onChange({ ...filters, q: searchDraft.trim() || undefined });
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchDraft]);

  const patch = (next: Partial<LeadViewFilters>) => onChange({ ...filters, ...next });

  const ownerOptions = useMemo(
    () => owners.map((owner) => ({ value: owner.id, label: owner.name ?? "Unnamed" })),
    [owners],
  );
  const channelOptions = useMemo(
    () =>
      CRM_LEAD_CHANNELS.map((channel) => ({
        value: channel,
        label: CRM_CHANNEL_LABELS[channel] ?? channel,
      })),
    [],
  );
  const sourceOptions = useMemo(
    () => sources.map((source) => ({ value: source, label: source })),
    [sources],
  );

  const activeCount = [
    filters.stages?.length,
    filters.assignedToIds?.length,
    filters.unassigned ? 1 : 0,
    filters.mineOnly ? 1 : 0,
    filters.channels?.length,
    filters.sources?.length,
    filters.valueMin !== undefined || filters.valueMax !== undefined ? 1 : 0,
    filters.createdFrom || filters.createdTo ? 1 : 0,
    filters.overdueOnly ? 1 : 0,
    filters.q ? 1 : 0,
  ].reduce<number>((sum, entry) => sum + (entry ?? 0), 0);

  // Every narrowing control lives behind one button, the way the reference
  // does it. Nine controls strung across a row read as nine decisions to make
  // before you can look at anything; one button with a count reads as "seven
  // things are hidden from you right now", which is the fact that matters.
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn(className)}>
          <Funnel className="size-4 opacity-70" />
          Filter
          {activeCount > 0 ? (
            <Badge tone="info" size="sm">
              {activeCount}
            </Badge>
          ) : null}
        </Button>
      </PopoverTrigger>

      {/* 22rem is 352px — wider than a 390px phone once the viewport's own
          gutters are taken off, so the panel used to hang off the edge. */}
      <PopoverContent
        align="start"
        className="w-[min(22rem,calc(100vw-2rem))] space-y-3 p-3"
      >
        <Input
          value={searchDraft}
          onChange={(event) => setSearchDraft(event.target.value)}
          placeholder="Search leads, contacts, clients…"
          className="h-9 w-full"
          aria-label="Search leads"
        />

        <div className="flex flex-wrap items-center gap-2">
          <MultiFilter
            label="Owner"
            options={ownerOptions}
            selected={filters.assignedToIds ?? []}
            onChange={(next) => patch({ assignedToIds: next.length ? next : undefined })}
            extra={{
              label: "Unassigned",
              checked: Boolean(filters.unassigned),
              onChange: (checked) => patch({ unassigned: checked || undefined }),
            }}
          />

          <MultiFilter
            label="Channel"
            options={channelOptions}
            selected={filters.channels ?? []}
            onChange={(next) =>
              patch({ channels: next.length ? (next as LeadViewFilters["channels"]) : undefined })
            }
          />

          {sourceOptions.length > 0 ? (
            <MultiFilter
              label="Source"
              options={sourceOptions}
              selected={filters.sources ?? []}
              onChange={(next) => patch({ sources: next.length ? next : undefined })}
            />
          ) : null}

          <ValueRangeFilter
            valueMin={filters.valueMin}
            valueMax={filters.valueMax}
            onChange={(next) => patch(next)}
          />

          <DateRangeFilter
            createdFrom={filters.createdFrom}
            createdTo={filters.createdTo}
            onChange={(next) => patch(next)}
          />

          <Button
            variant={filters.mineOnly ? "default" : "outline"}
            size="sm"
            onClick={() => patch({ mineOnly: filters.mineOnly ? undefined : true })}
          >
            My leads
          </Button>

          <Button
            variant={filters.overdueOnly ? "default" : "outline"}
            size="sm"
            onClick={() => patch({ overdueOnly: filters.overdueOnly ? undefined : true })}
          >
            Overdue
          </Button>

          {/* Without this, archiving is a one-way trip: the lead leaves every
              list and there is no door back to it. Not counted as an active
              filter, because it swaps which set is being looked at rather than
              narrowing the live one — and "Clear all" should not silently drag
              somebody out of the archive they went to on purpose. */}
          <Button
            variant={filters.archived ? "default" : "outline"}
            size="sm"
            onClick={() => patch({ archived: filters.archived ? undefined : true })}
          >
            Archived
          </Button>
        </div>

        {activeCount > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-center gap-1"
            onClick={() => onChange({})}
          >
            <X className="h-3.5 w-3.5" />
            Clear all
          </Button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

/**
 * Sort, beside the filter button.
 *
 * Only meaningful on a list — a board is already ordered by stage, and the
 * cards inside a column carry their own order — so the workspace hides it
 * when a board view is showing rather than offering a control that does
 * nothing.
 */
const SORT_FIELDS: Array<{ value: LeadSort["field"]; label: string }> = [
  { value: "updatedAt", label: "Last touched" },
  { value: "createdAt", label: "When it came in" },
  { value: "estimatedValue", label: "Value" },
  { value: "stage", label: "Stage" },
  { value: "title", label: "Title" },
  { value: "leadNo", label: "Reference" },
];

export function LeadsSortButton({
  sort,
  onChange,
  className,
}: {
  sort: LeadSort;
  onChange: (next: LeadSort) => void;
  className?: string;
}) {
  const current = SORT_FIELDS.find((field) => field.value === sort.field);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn(className)}>
          <SortAscending className="size-4 opacity-70" />
          Sort
          <span className="text-[var(--text-muted)]">{current?.label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-2">
        <div className="space-y-0.5">
          {SORT_FIELDS.map((field) => (
            <button
              key={field.value}
              type="button"
              onClick={() => onChange({ ...sort, field: field.value })}
              className={cn(
                "flex w-full items-center rounded px-2 py-1.5 text-left text-sm hover:bg-[var(--surface-hover)]",
                field.value === sort.field && "font-medium text-[var(--interactive-primary)]",
              )}
            >
              {field.label}
            </button>
          ))}
        </div>

        <div className="mt-2 flex gap-1 border-t border-[var(--border-subtle)] pt-2">
          {(["desc", "asc"] as const).map((direction) => (
            <Button
              key={direction}
              variant={sort.direction === direction ? "default" : "ghost"}
              size="sm"
              className="flex-1"
              onClick={() => onChange({ ...sort, direction })}
            >
              {direction === "desc" ? "Newest first" : "Oldest first"}
            </Button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
