"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { fetchJson } from "@/lib/api-client";
import { Search, X } from "@/lib/icons";
import { cn } from "@/lib/utils";

import { RecordMark, type RecordKind } from "@/components/records/record-mark";

/**
 * "What is this about?"
 *
 * A follow-up nobody can trace back to a deal is a reminder to do something
 * unspecified, and a site visit with no deal is a van going somewhere for
 * reasons the office cannot reconstruct. Anything raised outside a record page
 * has to be able to name its record, and this is the control that asks.
 *
 * Searches the same index the command bar does, so what somebody can find here
 * is what they can find anywhere.
 */

export type PickedRecord = {
  type: PickableType;
  id: string;
  title: string;
  subtitle: string | null;
};

/** The record types a task or a visit can hang off. */
export const PICKABLE_TYPES = ["LEAD", "DEAL", "COMPANY", "PERSON", "SITE"] as const;
export type PickableType = (typeof PICKABLE_TYPES)[number];

const KIND: Record<PickableType, RecordKind> = {
  LEAD: "lead",
  DEAL: "deal",
  COMPANY: "company",
  PERSON: "person",
  SITE: "site",
};

export const PICKABLE_LABELS: Record<PickableType, string> = {
  LEAD: "Lead",
  DEAL: "Deal",
  COMPANY: "Company",
  PERSON: "Person",
  SITE: "Site",
};

/** The foreign keys a picked record turns into on the way to the API. */
export function recordRefFor(record: PickedRecord | null): {
  leadId?: string;
  dealId?: string;
  clientId?: string;
  personId?: string;
  siteId?: string;
} {
  if (!record) return {};
  switch (record.type) {
    case "LEAD":
      return { leadId: record.id };
    case "DEAL":
      return { dealId: record.id };
    case "COMPANY":
      return { clientId: record.id };
    case "PERSON":
      return { personId: record.id };
    case "SITE":
      return { siteId: record.id };
  }
}

type SearchResponse = {
  groups: Array<{
    type: string;
    label: string;
    results: Array<{
      id: string;
      title: string;
      reference: string | null;
      subtitle: string | null;
    }>;
  }>;
};

function isPickable(type: string): type is PickableType {
  return (PICKABLE_TYPES as readonly string[]).includes(type);
}

export function RecordPicker({
  value,
  onChange,
  types = PICKABLE_TYPES,
  placeholder = "Search leads, deals, companies…",
  id,
}: {
  value: PickedRecord | null;
  onChange: (next: PickedRecord | null) => void;
  /** Narrow the search — a site visit is about a deal, not about a person. */
  types?: readonly PickableType[];
  placeholder?: string;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const search = useQuery({
    queryKey: ["crm-record-picker", query],
    queryFn: () =>
      fetchJson<SearchResponse>(
        `/api/v2/records/search?q=${encodeURIComponent(query.trim())}&limit=5`,
      ),
    enabled: open && query.trim().length >= 2,
    staleTime: 30_000,
  });

  const groups = (search.data?.groups ?? []).filter(
    (group) => isPickable(group.type) && types.includes(group.type),
  );
  const found = groups.reduce((count, group) => count + group.results.length, 0);

  if (value) {
    return (
      <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border)] px-2 py-1.5">
        <RecordMark kind={KIND[value.type]} name={value.title} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{value.title}</p>
          <p className="truncate text-sm text-[var(--text-muted)]">
            {PICKABLE_LABELS[value.type]}
            {value.subtitle ? ` · ${value.subtitle}` : ""}
          </p>
        </div>
        <button
          type="button"
          aria-label="Clear"
          className="rounded-[var(--radius-sm)] p-1 text-[var(--text-muted)] hover:bg-[var(--surface-subtle)]"
          onClick={() => onChange(null)}
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          id={id}
          className={cn(
            "flex w-full items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border)] px-2.5 py-2 text-left text-sm",
            "text-[var(--text-muted)] hover:border-[var(--border-strong)]",
          )}
        >
          <Search className="size-4" aria-hidden="true" />
          {placeholder}
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
        <div className="border-b border-[var(--border-subtle)] p-2">
          <Input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name or number"
            aria-label="Search records"
            className="h-8"
          />
        </div>

        <div className="max-h-72 overflow-y-auto p-1">
          {query.trim().length < 2 ? (
            <p className="px-2 py-3 text-sm text-[var(--text-muted)]">
              Type a name or a reference number.
            </p>
          ) : search.isLoading ? (
            <p className="px-2 py-3 text-sm text-[var(--text-muted)]">Searching…</p>
          ) : found === 0 ? (
            <p className="px-2 py-3 text-sm text-[var(--text-muted)]">
              Nothing matches “{query.trim()}”.
            </p>
          ) : (
            groups.map((group) => (
              <div key={group.type}>
                <p className="px-2 pb-0.5 pt-2 text-sm font-medium text-[var(--text-subtle)]">
                  {group.label}
                </p>
                {group.results.map((result) => (
                  <button
                    key={`${group.type}-${result.id}`}
                    type="button"
                    className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-left hover:bg-[var(--surface-subtle)]"
                    onClick={() => {
                      onChange({
                        type: group.type as PickableType,
                        id: result.id,
                        title: result.title,
                        subtitle: result.subtitle ?? result.reference,
                      });
                      setOpen(false);
                      setQuery("");
                    }}
                  >
                    <RecordMark
                      kind={KIND[group.type as PickableType]}
                      name={result.title}
                      size="sm"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{result.title}</span>
                      {result.subtitle || result.reference ? (
                        <span className="block truncate text-sm text-[var(--text-muted)]">
                          {result.subtitle ?? result.reference}
                        </span>
                      ) : null}
                    </span>
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
