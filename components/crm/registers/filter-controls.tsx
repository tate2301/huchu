"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ResponsivePopover } from "@/components/ui/responsive-popover";
import { ViewToolbarChip } from "@/components/records/view-toolbar";
import { Check, Plus, X } from "@/lib/icons";
import {
  DATE_PRESETS,
  DATE_PRESET_LABELS,
  isCustomFieldKey,
  type DatePreset,
  type FilterDef,
  type FilterOption,
  type FilterValue,
} from "@/lib/crm/registers/types";
import { cn } from "@/lib/utils";

import {
  configOptions,
  useFacetOptions,
  useGroups,
  usePipelines,
  useRecordNames,
  useRelationSearch,
  useTeamMembers,
} from "./register-data";
import type { RegisterHandle } from "./use-register";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** `2026-09-01` as "1 Sep 2026", without a `Date` — a day has no time zone to be wrong in. */
export function formatDay(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  return `${date} ${MONTHS[month - 1] ?? ""} ${year}`;
}

function formatNumber(value: number): string {
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

/** The answers a list-type filter offers, in the order they are offered. */
function useFilterOptions(
  register: RegisterHandle,
  filter: FilterDef,
  open: boolean,
  query: string,
): { options: FilterOption[]; loading: boolean } {
  const team = useTeamMembers(filter.kind === "person");
  const groups = useGroups(register.def.entity, filter.kind === "group");
  const facet = useFacetOptions(register.def, filter, register.state, open);
  const search = useRelationSearch(filter.relation, query, open && filter.kind === "relation");
  const pipelines = usePipelines(Boolean(filter.source));

  if (filter.source) {
    return {
      options: configOptions(filter, pipelines.data ?? [], register.state, register.layout === "BOARD"),
      loading: pipelines.isLoading,
    };
  }

  switch (filter.kind) {
    case "person":
      // "Me" and "Nobody" first (FILT-5): a record nobody owns is the one a
      // list is most often opened to find.
      return {
        options: [
          { value: "me", label: "Me" },
          { value: "none", label: "Nobody" },
          ...(team.data ?? []).map((member) => ({ value: member.id, label: member.name ?? "Unnamed" })),
        ],
        loading: team.isLoading,
      };
    case "group":
      return {
        options: (groups.data ?? []).map((group) => ({ value: group.id, label: group.name })),
        loading: groups.isLoading,
      };
    case "relation":
      return { options: search.data ?? [], loading: search.isFetching };
    default:
      return filter.facet
        ? { options: facet.data ?? [], loading: facet.isLoading }
        : { options: [...(filter.options ?? [])], loading: false };
  }
}

/** The names a chip shows for the values it holds. */
function useValueLabels(register: RegisterHandle, filter: FilterDef, values: readonly string[]) {
  const team = useTeamMembers(filter.kind === "person" && values.length > 0);
  const groups = useGroups(register.def.entity, filter.kind === "group" && values.length > 0);
  const names = useRecordNames(filter.kind === "relation" ? filter.relation : undefined, values);
  const pipelines = usePipelines(Boolean(filter.source) && values.length > 0);

  return (value: string): string => {
    if (filter.source === "pipelines") return pipelines.data?.find((pipeline) => pipeline.id === value)?.name ?? "…";
    if (filter.source === "stages") {
      return pipelines.data?.flatMap((pipeline) => pipeline.stages).find((stage) => stage.id === value)?.name ?? "…";
    }
    if (filter.kind === "person") {
      if (value === "me") return "Me";
      if (value === "none") return "Nobody";
      return team.data?.find((member) => member.id === value)?.name ?? "Someone";
    }
    if (filter.kind === "group") return groups.data?.find((group) => group.id === value)?.name ?? "A group";
    if (filter.kind === "relation") return names.get(value) ?? "…";
    return filter.options?.find((option) => option.value === value)?.label ?? value;
  };
}

/**
 * What a board shows while a single-choice filter is left alone: the default
 * pipeline. A table spans every pipeline; a board is one at a time, so on a
 * board the chip names the one it is showing rather than "All pipelines".
 */
function useBoardDefault(register: RegisterHandle, filter: FilterDef): FilterOption | undefined {
  const applies = register.layout === "BOARD" && Boolean(register.def.boardEndpoint) && filter.source === "pipelines";
  const pipelines = usePipelines(applies);
  if (!applies) return undefined;
  return configOptions(filter, pipelines.data ?? [], register.state, true).find((option) => option.isDefault);
}

/** What a chip says it is filtered to: "Customer", "Me, +2", "This month", "1,000 – 5,000". */
function summarize(
  filter: FilterDef,
  value: FilterValue | undefined,
  label: (value: string) => string,
  fallback?: string,
): string {
  if (value === undefined) return fallback ?? filter.anyLabel ?? "Any";
  if (value === true) return filter.onLabel ?? "Yes";
  if (Array.isArray(value)) {
    const values = value as readonly string[];
    if (values.length === 0) return filter.anyLabel ?? "Any";
    return values.length === 1 ? label(values[0]) : `${label(values[0])}, +${values.length - 1}`;
  }
  if ("preset" in value) return DATE_PRESET_LABELS[value.preset];
  if ("from" in value || "to" in value) {
    const range = value as { from?: string; to?: string };
    if (range.from && range.to) return range.from === range.to ? formatDay(range.from) : `${formatDay(range.from)} – ${formatDay(range.to)}`;
    return range.from ? `From ${formatDay(range.from)}` : `Until ${formatDay(range.to!)}`;
  }
  const range = value as { min?: number; max?: number };
  if (range.min !== undefined && range.max !== undefined) return `${formatNumber(range.min)} – ${formatNumber(range.max)}`;
  return range.min !== undefined ? `≥ ${formatNumber(range.min)}` : `≤ ${formatNumber(range.max!)}`;
}

function Tick({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-4 shrink-0 items-center justify-center rounded-[var(--radius-xs,3px)] border",
        on ? "border-[var(--brand-strong)] bg-[var(--brand-strong)] text-[var(--surface)]" : "border-[var(--border-strong,var(--border))]",
      )}
    >
      {on ? <Check className="size-3" /> : null}
    </span>
  );
}

/** Ticks answers on and off, applying each at once. */
function OptionsEditor({
  register,
  filter,
  open,
}: {
  register: RegisterHandle;
  filter: FilterDef;
  open: boolean;
}) {
  const [query, setQuery] = useState("");
  const value = register.state.filters[filter.key];
  const selected = useMemo(() => (Array.isArray(value) ? [...(value as readonly string[])] : []), [value]);
  const { options, loading } = useFilterOptions(register, filter, open, query);
  const label = useValueLabels(register, filter, selected);
  const fallback = useBoardDefault(register, filter);
  // Left alone on a board, the pipeline filter is the default pipeline, and
  // says so with its tick.
  const ticked = selected.length > 0 ? selected : fallback ? [fallback.value] : [];

  // Relation answers come from a search, so the ones already chosen may not be
  // among the results; they stay at the top where they can be unticked.
  const shown = useMemo<FilterOption[]>(() => {
    if (filter.kind !== "relation") return options;
    const found = new Set(options.map((option) => option.value));
    return [...selected.filter((id) => !found.has(id)).map((id) => ({ value: id, label: label(id) })), ...options];
  }, [filter.kind, label, options, selected]);

  const toggle = (answer: string) => {
    if (filter.single) {
      register.setFilter(filter.key, selected[0] === answer ? undefined : [answer]);
      return;
    }
    const next = selected.includes(answer) ? selected.filter((entry) => entry !== answer) : [...selected, answer];
    register.setFilter(filter.key, next.length > 0 ? next : undefined);
  };

  const searchable = filter.kind === "relation" || shown.length > 7;

  // Answers under headings when they carry one — stages under their pipeline.
  const sections = useMemo(() => {
    const byHeading = new Map<string, FilterOption[]>();
    for (const option of shown) {
      const heading = option.group ?? "";
      byHeading.set(heading, [...(byHeading.get(heading) ?? []), option]);
    }
    return [...byHeading.entries()];
  }, [shown]);

  return (
    <Command shouldFilter={filter.kind !== "relation"} className="bg-transparent">
      {searchable ? (
        <CommandInput
          placeholder={filter.kind === "relation" ? `Search ${filter.label.toLowerCase()}` : `Find a ${filter.label.toLowerCase()}`}
          value={query}
          onValueChange={setQuery}
        />
      ) : null}
      <CommandList className="max-h-72">
        <CommandEmpty>{loading ? "Loading…" : filter.kind === "relation" && !query ? "Type to search" : "Nothing matches"}</CommandEmpty>
        {sections.map(([heading, answers]) => (
          <CommandGroup key={heading || "answers"} heading={heading || undefined}>
            {answers.map((option) => {
              const on = ticked.includes(option.value);
              return (
                <CommandItem
                  key={option.value}
                  value={`${option.label} ${option.group ?? ""} ${option.value}`}
                  onSelect={() => toggle(option.value)}
                  aria-checked={on}
                  role="menuitemcheckbox"
                  className="gap-2"
                >
                  <Tick on={on} />
                  <span className="min-w-0 flex-1 truncate">{option.label}</span>
                  {option.isDefault ? <span className="text-sm text-[var(--text-subtle)]">default</span> : null}
                </CommandItem>
              );
            })}
          </CommandGroup>
        ))}
      </CommandList>
    </Command>
  );
}

/** Presets first — "This month" stays this month — then a range of days. */
function DateEditor({ register, filter }: { register: RegisterHandle; filter: FilterDef }) {
  const value = register.state.filters[filter.key];
  const preset = value && typeof value === "object" && "preset" in value ? value.preset : null;
  const range = value && typeof value === "object" && !Array.isArray(value) && !("preset" in value)
    ? (value as { from?: string; to?: string })
    : {};
  const presets = (filter.presets ?? DATE_PRESETS) as readonly DatePreset[];

  const setRange = (from: string, to: string) =>
    register.setFilter(filter.key, from || to ? { ...(from ? { from } : {}), ...(to ? { to } : {}) } : undefined);

  return (
    <div className="flex flex-col gap-1 p-1">
      <div role="radiogroup" aria-label={filter.label} className="flex flex-col">
        {presets.map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={preset === option}
            onClick={() => register.setFilter(filter.key, preset === option ? undefined : { preset: option })}
            className="flex items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-sm hover:bg-[var(--surface-subtle)]"
          >
            <Tick on={preset === option} />
            {DATE_PRESET_LABELS[option]}
          </button>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-2 gap-2 border-t border-[var(--border-subtle)] px-1 pt-2">
        <label className="flex flex-col gap-1 text-sm text-[var(--text-muted)]">
          From
          <Input
            type="date"
            value={range.from ?? ""}
            onChange={(event) => setRange(event.target.value, range.to ?? "")}
            className="h-8 font-mono"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-[var(--text-muted)]">
          To
          <Input
            type="date"
            value={range.to ?? ""}
            onChange={(event) => setRange(range.from ?? "", event.target.value)}
            className="h-8 font-mono"
          />
        </label>
      </div>
    </div>
  );
}

/** Low and high, either left open. Applied when the box is left or Enter is pressed. */
function NumberEditor({ register, filter }: { register: RegisterHandle; filter: FilterDef }) {
  const value = register.state.filters[filter.key] as { min?: number; max?: number } | undefined;
  const [min, setMin] = useState(value?.min?.toString() ?? "");
  const [max, setMax] = useState(value?.max?.toString() ?? "");

  const apply = () => {
    const low = min.trim() === "" ? undefined : Number(min);
    const high = max.trim() === "" ? undefined : Number(max);
    const next = {
      ...(low !== undefined && Number.isFinite(low) ? { min: low } : {}),
      ...(high !== undefined && Number.isFinite(high) ? { max: high } : {}),
    };
    register.setFilter(filter.key, next.min !== undefined || next.max !== undefined ? next : undefined);
  };

  return (
    <form
      className="grid grid-cols-2 gap-2 p-2"
      onSubmit={(event) => {
        event.preventDefault();
        apply();
      }}
    >
      <label className="flex flex-col gap-1 text-sm text-[var(--text-muted)]">
        At least
        <Input inputMode="decimal" value={min} onChange={(e) => setMin(e.target.value)} onBlur={apply} className="h-8 font-mono" />
      </label>
      <label className="flex flex-col gap-1 text-sm text-[var(--text-muted)]">
        At most
        <Input inputMode="decimal" value={max} onChange={(e) => setMax(e.target.value)} onBlur={apply} className="h-8 font-mono" />
      </label>
    </form>
  );
}

/**
 * What a filter can be narrowed to: its answers to tick, its presets and
 * days, or its low and high. The same editor behind a toolbar chip and a
 * column's header menu, so a filter works one way wherever it is opened.
 * An on/off filter has none — it is its own chip.
 */
export function FilterEditor({
  register,
  filter,
  open,
}: {
  register: RegisterHandle;
  filter: FilterDef;
  /** Whether the surface holding it is open — answers read from the records load then. */
  open: boolean;
}) {
  if (filter.kind === "boolean") return null;
  if (filter.kind === "date") return <DateEditor register={register} filter={filter} />;
  if (filter.kind === "number") return <NumberEditor register={register} filter={filter} />;
  return <OptionsEditor register={register} filter={filter} open={open} />;
}

/**
 * One filter on the toolbar: a chip that says what it is filtered to, and
 * opens what it can be filtered to. Every change applies at once — there is
 * no Apply button to forget.
 */
export function FilterChip({
  register,
  filter,
  defaultOpen = false,
  onClosedEmpty,
}: {
  register: RegisterHandle;
  filter: FilterDef;
  /** Open on arrival — a filter just picked from "+ Filter". */
  defaultOpen?: boolean;
  /** Closed without an answer: a chip that was only just added goes away again. */
  onClosedEmpty?: () => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const value = register.state.filters[filter.key];
  const values = Array.isArray(value) ? (value as readonly string[]) : [];
  const label = useValueLabels(register, filter, values);
  const fallback = useBoardDefault(register, filter);

  if (filter.kind === "boolean") {
    // An on/off filter is its own chip: pressed, it narrows; the cross takes
    // it off. A popover holding one switch is a control inside a control.
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-pressed={value === true}
        onClick={() => register.setFilter(filter.key, value === true ? undefined : true)}
        className="shrink-0 gap-1.5 whitespace-nowrap"
      >
        <span className="font-semibold text-[var(--text-strong)]">{filter.onLabel ?? filter.label}</span>
        {value === true ? <X className="size-3 text-[var(--text-subtle)]" aria-hidden="true" /> : null}
      </Button>
    );
  }

  return (
    <ResponsivePopover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next && register.state.filters[filter.key] === undefined) onClosedEmpty?.();
      }}
      title={filter.label}
      className="w-72 p-0"
      trigger={<ViewToolbarChip label={filter.label} value={summarize(filter, value, label, fallback?.label)} />}
    >
      <FilterEditor register={register} filter={filter} open={open} />
      {filter.source === "pipelines" ? <PipelineLinks /> : null}
      {value !== undefined ? (
        <div className="flex justify-end border-t border-[var(--border-subtle)] p-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              register.setFilter(filter.key, undefined);
              setOpen(false);
            }}
          >
            Clear {filter.label.toLowerCase()}
          </Button>
        </div>
      ) : null}
    </ResponsivePopover>
  );
}

/**
 * Under the pipelines: leads, which are the intake pipeline and live on a
 * page of their own, and where pipelines are set up.
 */
function PipelineLinks() {
  const item =
    "flex items-center rounded-[var(--radius-sm)] px-2 py-1.5 text-sm text-[var(--text-strong)] hover:bg-[var(--surface-subtle)]";
  return (
    <nav aria-label="Other pipelines" className="flex flex-col border-t border-[var(--border-subtle)] p-1">
      <Link href="/crm/leads" className={item}>
        Leads
        <span className="ml-auto text-sm text-[var(--text-subtle)]">intake</span>
      </Link>
      <Link href="/crm/settings?tab=pipelines" className={item}>
        Manage pipelines
      </Link>
    </nav>
  );
}

/**
 * "+ Filter": the questions this list can be asked that are not on the row
 * yet — its own first, then the company's own fields under their heading.
 */
export function AddFilterMenu({
  filters,
  hidden,
  onPick,
}: {
  /** Every filter the list has, the company's own fields among them. */
  filters: readonly FilterDef[];
  /** Filters already on the row. */
  hidden: ReadonlySet<string>;
  onPick: (filter: FilterDef) => void;
}) {
  const [open, setOpen] = useState(false);
  const offered = filters.filter((filter) => filter.offer !== false && !hidden.has(filter.key));
  if (offered.length === 0) return null;
  const sections = [
    { heading: "Filter by", filters: offered.filter((filter) => !isCustomFieldKey(filter.key)) },
    { heading: "Your fields", filters: offered.filter((filter) => isCustomFieldKey(filter.key)) },
  ].filter((section) => section.filters.length > 0);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="shrink-0 gap-1">
          <Plus className="size-3.5" aria-hidden="true" />
          Filter
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-60 p-0">
        <Command>
          {offered.length > 7 ? <CommandInput placeholder="Filter by…" /> : null}
          <CommandList>
            <CommandEmpty>No such filter</CommandEmpty>
            {sections.map((section) => (
              <CommandGroup key={section.heading} heading={section.heading}>
                {section.filters.map((filter) => (
                  <CommandItem
                    key={filter.key}
                    value={`${filter.label} ${filter.key}`}
                    onSelect={() => {
                      setOpen(false);
                      onPick(filter);
                    }}
                  >
                    {filter.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
