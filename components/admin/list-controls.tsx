"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { TableSearch } from "@/components/records/table-controls";
import { FILTER_ANY, ViewToolbar, ViewToolbarFilter } from "@/components/records/view-toolbar";
import { SectionTab, SectionTabs } from "@/components/ui/section-tabs";

/**
 * A list page's two rows of questions, kept in the URL so a filtered list can
 * be linked to and survives a reload: the tabs ("which ones"), then search and
 * filters ("narrowed how").
 */

function useParamWriter() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === "" || value === FILTER_ANY) next.delete(key);
      else next.set(key, value);
    }
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };
}

export function UrlTabs({
  label,
  tabs,
  param = "tab",
}: {
  label: string;
  tabs: Array<{ value: string | null; label: string; count?: number }>;
  param?: string;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const current = params.get(param);
  return (
    <SectionTabs label={label} className="mx-[calc(-1*var(--content-gutter-x))] px-[var(--content-gutter-x)]">
      {tabs.map((tab) => {
        const next = new URLSearchParams(params.toString());
        if (tab.value) next.set(param, tab.value);
        else next.delete(param);
        const query = next.toString();
        return (
          <SectionTab key={tab.label} to={query ? `${pathname}?${query}` : pathname} active={current === tab.value} count={tab.count}>
            {tab.label}
          </SectionTab>
        );
      })}
    </SectionTabs>
  );
}

export type UrlFilter = { param: string; label: string; anyLabel: string; options: Array<[string, string]> };

export function UrlToolbar({
  searchPlaceholder,
  filters = [],
  count,
}: {
  searchPlaceholder: string;
  filters?: UrlFilter[];
  count?: string;
}) {
  const params = useSearchParams();
  const write = useParamWriter();
  const [q, setQ] = useState(params.get("q") ?? "");

  // Typing writes the URL a beat after the last key, not on every key.
  useEffect(() => {
    if (q === (params.get("q") ?? "")) return;
    const timer = setTimeout(() => write({ q }), 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <ViewToolbar
      search={<TableSearch value={q} onChange={setQ} placeholder={searchPlaceholder} />}
      start={filters.map((filter) => (
        <ViewToolbarFilter
          key={filter.param}
          label={filter.label}
          anyLabel={filter.anyLabel}
          value={params.get(filter.param) ?? FILTER_ANY}
          options={new Map(filter.options)}
          onChange={(value) => write({ [filter.param]: value })}
        />
      ))}
      count={count ? <span className="font-mono text-xs tabular-nums text-[var(--text-subtle)]">{count}</span> : undefined}
      filterCount={filters.filter((filter) => params.get(filter.param)).length}
      className="bg-[var(--surface)] before:bg-[var(--surface)]"
    />
  );
}
