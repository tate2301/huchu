"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { EmptyState, Skeleton } from "@corelithzw/react";
import { PageChrome } from "@/components/layout/page-chrome";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionTab, SectionTabs } from "@/components/ui/section-tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useIsMobile } from "@/hooks/use-mobile";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { ChevronRight, MagnifyingGlass, Plus } from "@/lib/icons";
import type { CatalogArea } from "@/lib/reports/catalog";
import { AUDIENCE_LABELS, type ReportTemplateRecord } from "@/lib/reports/template-access";

import { TemplateSheet } from "./template-sheet";

/**
 * Reports, as templates.
 *
 * Every report the code ships is a built-in template; anything the team saved
 * from one is a template beside it, under the same area. One list, so the
 * question is only which one, never where: tabs say whose, the area filter says
 * about what. Opening one is where the work happens.
 */

type Tab = "all" | "built-in" | "team" | "mine";

type Entry = {
  id: string;
  href: string;
  name: string;
  summary: string | null;
  area: string;
  /** Null for a built-in report. */
  madeBy: string | null;
  seenBy: string;
  tab: Exclude<Tab, "all">;
};

const ANY_AREA = "__any__";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "all", label: "All" },
  { id: "built-in", label: "Built in" },
  { id: "team", label: "Made by your team" },
  { id: "mine", label: "Just yours" },
];

function entries(areas: CatalogArea[], templates: ReportTemplateRecord[]): Entry[] {
  const order = new Map(areas.map((area, index) => [area.area, index]));
  const built: Entry[] = areas.flatMap((area) =>
    area.reports.map((report) => ({
      id: report.key,
      href: `/reports/${report.key}`,
      name: report.title,
      summary: report.summary,
      area: area.area,
      madeBy: null,
      seenBy: "Everyone who opens it",
      tab: "built-in" as const,
    })),
  );
  const saved: Entry[] = templates.map((template) => ({
    id: template.id,
    href: `/reports/${template.reportKey}?template=${template.id}`,
    name: template.name,
    summary: template.description ?? `On ${template.reportTitle}`,
    area: template.area,
    madeBy: template.mine ? "You" : template.madeBy,
    seenBy: AUDIENCE_LABELS[template.audience],
    tab: template.audience === "JUST_ME" ? "mine" : "team",
  }));
  // The industry's areas first, as the catalogue orders them; by name inside each.
  return [...built, ...saved].sort(
    (left, right) =>
      (order.get(left.area) ?? 99) - (order.get(right.area) ?? 99) || left.name.localeCompare(right.name),
  );
}

export function ReportCatalog() {
  const isPhone = useIsMobile();
  const [tab, setTab] = useState<Tab>("all");
  const [area, setArea] = useState(ANY_AREA);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);

  const catalog = useQuery({
    queryKey: ["reports", "catalog"],
    queryFn: () => fetchJson<{ areas: CatalogArea[] }>("/api/v2/reports"),
  });
  const templates = useQuery({
    queryKey: ["reports", "templates"],
    queryFn: () => fetchJson<{ templates: ReportTemplateRecord[] }>("/api/v2/reports/templates"),
  });

  const areas = useMemo(() => catalog.data?.areas ?? [], [catalog.data]);
  const all = useMemo(() => entries(areas, templates.data?.templates ?? []), [areas, templates.data]);
  const needle = search.trim().toLowerCase();
  const shown = all.filter(
    (entry) =>
      (tab === "all" || entry.tab === tab) &&
      (area === ANY_AREA || entry.area === area) &&
      (!needle || `${entry.name} ${entry.summary ?? ""}`.toLowerCase().includes(needle)),
  );

  const chrome = (
    <PageChrome title="Reports">
      {areas.length ? (
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="size-4" aria-hidden="true" />
          New template
        </Button>
      ) : null}
    </PageChrome>
  );

  if (catalog.isLoading || templates.isLoading) {
    return (
      <>
        {chrome}
        <div className="grid gap-1.5" aria-busy="true" aria-live="polite">
          <Skeleton height={36} width={420} />
          <Skeleton height={32} width={320} />
          {Array.from({ length: 8 }, (_, index) => (
            <Skeleton key={index} height={40} />
          ))}
        </div>
      </>
    );
  }

  const failed = catalog.error ?? templates.error;
  if (failed) {
    return (
      <>
        {chrome}
        <EmptyState
          title="Reports did not load"
          body={getApiErrorMessage(failed)}
          action={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                void catalog.refetch();
                void templates.refetch();
              }}
            >
              Try again
            </Button>
          }
        />
      </>
    );
  }

  if (areas.length === 0) {
    return (
      <>
        {chrome}
        <EmptyState title="No reports yet" body="Reports appear here for the modules this workspace runs." />
      </>
    );
  }

  const counts = (id: Tab) => (id === "all" ? all.length : all.filter((entry) => entry.tab === id).length);

  return (
    <>
      {chrome}

      <div className="grid gap-3">
        <SectionTabs label="Whose templates">
          {TABS.map((item) => (
            <SectionTab key={item.id} active={tab === item.id} count={counts(item.id)} onClick={() => setTab(item.id)}>
              {item.label}
            </SectionTab>
          ))}
        </SectionTabs>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full max-w-[16rem]">
            <MagnifyingGlass
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-[var(--text-subtle)]"
              aria-hidden="true"
            />
            <Input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Template, or what it shows"
              aria-label="Search templates"
              className="h-8 pl-8"
            />
          </div>
          <Select value={area} onValueChange={setArea}>
            <SelectTrigger size="sm" className="w-auto" aria-label="Area">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY_AREA}>Every area</SelectItem>
              {areas.map((item) => (
                <SelectItem key={item.area} value={item.area}>
                  {item.area}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {shown.length === 0 ? (
          tab === "mine" && !needle && area === ANY_AREA ? (
            <EmptyState
              title="Nothing of yours yet"
              body="Open any report, shape it the way you read it, then choose Save as a template."
            />
          ) : (
            <EmptyState
              title="No templates match"
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setSearch("");
                    setArea(ANY_AREA);
                  }}
                >
                  Clear the filters
                </Button>
              }
            />
          )
        ) : isPhone ? (
          <ul className="border-t border-[var(--table-divider)]">
            {shown.map((entry) => (
              <li key={entry.id} className="border-b border-[var(--table-divider)]">
                <Link href={entry.href} className="flex min-h-[56px] items-center gap-3 px-1 py-2 hover:bg-[var(--canvas)]">
                  <span className="grid min-w-0 flex-1 gap-0.5">
                    <span className="truncate text-[13px] font-semibold text-[var(--text-strong)]">{entry.name}</span>
                    <span className="truncate text-[12.5px] text-[var(--text-muted)]">
                      {entry.area} · {entry.madeBy ?? "Built in"}
                    </span>
                  </span>
                  <ChevronRight className="size-3.5 shrink-0 text-[var(--text-disabled)]" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <Table edgeToEdge>
            <TableHeader>
              <TableRow>
                <TableHead>Template</TableHead>
                <TableHead>What it shows</TableHead>
                <TableHead>Area</TableHead>
                <TableHead>Made by</TableHead>
                <TableHead>Seen by</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="font-semibold">
                    <Link
                      href={entry.href}
                      className="text-[var(--text-strong)] underline decoration-[var(--border-strong)] underline-offset-[3px] hover:decoration-[var(--text-strong)]"
                    >
                      {entry.name}
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-[28rem] truncate text-[var(--text-body)]">{entry.summary ?? ""}</TableCell>
                  <TableCell className="text-[var(--text-muted)]">{entry.area}</TableCell>
                  <TableCell className={entry.madeBy ? undefined : "text-[var(--text-subtle)]"}>
                    {entry.madeBy ?? "Built in"}
                  </TableCell>
                  <TableCell className="text-[var(--text-muted)]">{entry.seenBy}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {creating ? (
        <TemplateSheet mode={{ kind: "new", areas }} open onOpenChange={setCreating} />
      ) : null}
    </>
  );
}
