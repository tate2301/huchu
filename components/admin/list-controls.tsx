"use client";

import { usePathname, useSearchParams } from "next/navigation";

import { SectionTab, SectionTabs } from "@/components/ui/section-tabs";

/** Tabs kept in the URL, so a tab can be linked to and survives a reload. */
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
