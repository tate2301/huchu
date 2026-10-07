"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";

import { EmptyState, Skeleton } from "@corelithzw/react";
import { PageChrome } from "@/components/layout/page-chrome";
import { Button } from "@/components/ui/button";
import { DataTableFloatingActions } from "@/components/ui/data-table-floating-actions";
import { COMMON_PRESETS, DateRangePicker, DayRangeChip } from "@/components/ui/date-picker";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { ChevronDown, Download, MagnifyingGlass, MoreHorizontal } from "@/lib/icons";
import {
  EXPORT_TEMPLATE_LABELS,
  EXPORT_TEMPLATES,
  type ExportTemplateId,
} from "@/lib/reports/export-layouts";
import type { CustomReport } from "@/lib/reports/custom/document";
import { formatTotal } from "@/lib/reports/format";
import type { TemplateAudience } from "@/lib/reports/template-access";
import type { ReportColumnKind, ReportParam, ReportRow, ReportView } from "@/lib/reports/types";
import { aggregate, applyView } from "@/lib/reports/view";

import { ReportBlocks } from "./report-blocks";
import { ReportColumns } from "./report-columns";
import { ReportFilters } from "./report-filters";
import { ReportRowActions } from "./report-row-actions";
import { ReportRowList } from "./report-row-list";
import { ReportTable } from "./report-table";
import { TemplateSheet } from "./template-sheet";
import { useReport } from "./use-report";

/**
 * One report, as a worksheet.
 *
 * Two rows above the table, because they are two questions: which records
 * (the dates and choices, which fetch again) and how to look at them (search,
 * filters, grouping and columns, which do not). Export sits with the page's
 * title and writes exactly what the table shows — or just the selected rows.
 *
 * Opened as a template, it starts from the template's view and dates, says
 * whose it is, and can be saved back over it; any report, template or not, can
 * be saved as a new template.
 */

const NO_GROUP = "__none__";

const SEEN_BY: Record<TemplateAudience, string> = {
  JUST_ME: "only its maker sees it",
  MANAGERS: "managers see it",
  EVERYONE: "everyone sees it",
};

/** Kinds that repeat across rows. A reference or a phone number is one group per row. */
const GROUPABLE: ReadonlySet<ReportColumnKind> = new Set(["text", "status", "relation", "date"]);

async function download(key: string, body: unknown) {
  const response = await fetch(`/api/v2/reports/${encodeURIComponent(key)}/export`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error ?? `Export failed (${response.status})`);
  }
  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const name = /filename="([^"]+)"/.exec(disposition)?.[1] ?? "report";
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** The files a report can become: each PDF layout, then the data as a workbook or a CSV. */
function ExportChoices({ onChoose }: { onChoose: (format: "csv" | "xlsx" | "pdf", template?: ExportTemplateId) => void }) {
  return (
    <>
      <DropdownMenuLabel>PDF</DropdownMenuLabel>
      {EXPORT_TEMPLATES.map((template) => (
        <DropdownMenuItem key={template} onSelect={() => onChoose("pdf", template)}>
          {EXPORT_TEMPLATE_LABELS[template]}
        </DropdownMenuItem>
      ))}
      <DropdownMenuSeparator />
      <DropdownMenuLabel>Data</DropdownMenuLabel>
      <DropdownMenuItem onSelect={() => onChoose("xlsx")}>Excel workbook</DropdownMenuItem>
      <DropdownMenuItem onSelect={() => onChoose("csv")}>CSV</DropdownMenuItem>
    </>
  );
}

function SearchBox({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  // The view changed from elsewhere — back, a reset, a link: take its search.
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    setDraft(value);
  }
  useEffect(() => {
    if (draft === value) return;
    const timer = setTimeout(() => onChange(draft), 300);
    return () => clearTimeout(timer);
  }, [draft, value, onChange]);
  return (
    <div className="relative w-full max-w-[16rem]">
      <MagnifyingGlass
        className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-[var(--text-subtle)]"
        aria-hidden="true"
      />
      <Input
        type="search"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder="Search"
        aria-label="Search this report"
        className="h-8 pl-8"
      />
    </div>
  );
}

function ParamControls({
  params,
  values,
  onChange,
}: {
  params: ReportParam[];
  values: Record<string, string>;
  onChange: (patch: Record<string, string>) => void;
}) {
  const from = params.find((param) => param.key === "from" && param.type === "date");
  const to = params.find((param) => param.key === "to" && param.type === "date");
  const choices = params.filter((param): param is Extract<ReportParam, { type: "choice" }> => param.type === "choice");
  const range = { from: values.from || null, to: to ? values.to || null : null };
  return (
    <div className="flex flex-wrap items-center gap-2">
      {from ? (
        <DateRangePicker
          openEnded
          presets={COMMON_PRESETS}
          title={from.label}
          value={range}
          onChange={(next) => onChange({ from: next.from ?? "", ...(to ? { to: next.to ?? "" } : {}) })}
          trigger={<DayRangeChip label={from.label} range={range} />}
        />
      ) : null}
      {choices.map((param) => (
        <Select
          key={param.key}
          value={values[param.key] ?? param.options[0]?.value ?? ""}
          onValueChange={(value) => onChange({ [param.key]: value })}
        >
          <SelectTrigger size="sm" className="w-auto" aria-label={param.label}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {param.options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ))}
    </div>
  );
}

export function ReportScreen({ reportKey }: { reportKey: string }) {
  const { toast } = useToast();
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const { query, meta, template, view, params, setView, resetView, setParams, customised } = useReport(reportKey);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [sheet, setSheet] = useState<"save" | "edit" | null>(null);
  const [exporting, setExporting] = useState(false);
  const isPhone = useIsMobile();

  const rows = useMemo<ReportRow[]>(() => query.data?.rows ?? [], [query.data]);
  const applied = useMemo(
    () => (meta && view ? applyView(rows, meta.columns, view) : null),
    [rows, meta, view],
  );

  // A selection survives a filter only for the rows still on screen.
  const visibleSelection = useMemo(() => {
    if (!applied) return new Set<string>();
    const shown = new Set(applied.rows.map((row) => row.id));
    return new Set([...selected].filter((id) => shown.has(id)));
  }, [applied, selected]);

  const runExport = async (format: "csv" | "xlsx" | "pdf", onlySelected: boolean, template: ExportTemplateId = "layout") => {
    if (!view) return;
    setExporting(true);
    try {
      await download(reportKey, {
        format,
        template,
        params,
        view,
        ...(onlySelected ? { rowIds: [...visibleSelection] } : {}),
      });
    } catch (error) {
      toast({ title: "Export failed", description: getApiErrorMessage(error), variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["reports", reportKey] });

  const router = useRouter();
  /** This report's page as a report of one's own, every block a query to take further. */
  const buildOn = async () => {
    try {
      const made = await fetchJson<{ report: CustomReport }>("/api/v2/reports/custom", {
        method: "POST",
        body: JSON.stringify({ fromReport: reportKey }),
      });
      router.push(`/reports/custom/${made.report.id}/edit`);
    } catch (error) {
      toast({ title: "Report not created", description: getApiErrorMessage(error), variant: "destructive" });
    }
  };

  // Managers set up reports for everybody; the API checks this again.
  const role = (session?.user as { role?: string } | undefined)?.role;
  const manager = role === "SUPERADMIN" || role === "MANAGER";

  /** Everyone's starting view: this one, or (null) the report's own again. */
  const saveStartingView = async (next: ReportView | null) => {
    try {
      await fetchJson(`/api/v2/reports/${encodeURIComponent(reportKey)}/settings`, {
        method: "PATCH",
        body: JSON.stringify({ view: next }),
      });
      toast({ title: next ? "Everyone now starts from this view" : "Back to the report's own view", variant: "success" });
      // The saved view is now the default, so this one no longer needs the URL.
      resetView();
      refresh();
    } catch (error) {
      toast({ title: "Not saved", description: getApiErrorMessage(error), variant: "destructive" });
    }
  };

  /** The view on screen becomes the template's own. */
  const saveTemplateView = async () => {
    if (!template || !view) return;
    try {
      await fetchJson(`/api/v2/reports/templates/${template.id}`, { method: "PATCH", body: JSON.stringify({ view }) });
      toast({ title: `${template.name} saved`, variant: "success" });
      resetView();
      refresh();
    } catch (error) {
      toast({ title: "Not saved", description: getApiErrorMessage(error), variant: "destructive" });
    }
  };

  const chrome = (
    <PageChrome title={template?.name ?? meta?.title ?? "Report"} backHref="/reports" backLabel="Reports">
      {meta && applied ? (
        <>
          {template?.canChange && customised ? (
            <Button variant="secondary" size="sm" onClick={() => void saveTemplateView()}>
              Save
            </Button>
          ) : null}
          <Button variant="secondary" size="sm" onClick={() => setSheet("save")}>
            Save as a template
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" disabled={exporting}>
                <Download className="size-4" aria-hidden="true" />
                Export
                <ChevronDown className="size-3.5" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <ExportChoices onChoose={(format, template) => void runExport(format, false, template)} />
            </DropdownMenuContent>
          </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="More">
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {template?.canChange ? (
                  <DropdownMenuItem onSelect={() => setSheet("edit")}>Change the template</DropdownMenuItem>
                ) : null}
                {customised ? <DropdownMenuItem onSelect={resetView}>Reset the view</DropdownMenuItem> : null}
                <DropdownMenuItem onSelect={() => void buildOn()}>Build a report from this one</DropdownMenuItem>
                {manager && !template ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link href={`/reports/${reportKey}/arrange`}>Arrange the page</Link>
                    </DropdownMenuItem>
                    {customised && view ? (
                      <DropdownMenuItem onSelect={() => void saveStartingView(view)}>
                        Make this everyone&apos;s starting view
                      </DropdownMenuItem>
                    ) : null}
                    {meta.defaultView ? (
                      <DropdownMenuItem onSelect={() => void saveStartingView(null)}>
                        Clear the starting view
                      </DropdownMenuItem>
                    ) : null}
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
        </>
      ) : null}
    </PageChrome>
  );

  if (query.isLoading || (!meta && !query.isError)) {
    return (
      <>
        {chrome}
        <div className="grid gap-1.5" aria-busy="true" aria-live="polite">
          <Skeleton height={32} width={280} />
          <Skeleton height={32} />
          {Array.from({ length: 8 }, (_, index) => (
            <Skeleton key={index} height={36} />
          ))}
        </div>
      </>
    );
  }

  if (query.isError && !query.data) {
    return (
      <>
        {chrome}
        <EmptyState
          title="This report did not load"
          body={getApiErrorMessage(query.error)}
          action={
            <Button variant="secondary" size="sm" onClick={() => void query.refetch()}>
              Try again
            </Button>
          }
        />
      </>
    );
  }

  if (!meta || !view || !applied) return chrome;

  const selectedRows = applied.rows.filter((row) => visibleSelection.has(row.id));
  const rowActionsFor = meta.rowActions?.length
    ? (row: ReportRow) => <ReportRowActions row={row} actions={meta.rowActions!} onChanged={refresh} />
    : null;
  const worksheet = isPhone ? (
    <ReportRowList
      applied={applied}
      view={view}
      selectedIds={visibleSelection}
      onSelect={setSelected}
      rowActions={rowActionsFor}
    />
  ) : (
    <ReportTable
      applied={applied}
      view={view}
      onViewChange={setView}
      selectedIds={visibleSelection}
      onSelect={setSelected}
      rowActions={rowActionsFor}
    />
  );

  const figures = applied.columns.filter((column) => column.kind === "money");

  return (
    <>
      {chrome}

      <div className="grid gap-3">
        {template ? (
          <p className="text-[13px] text-[var(--text-muted)]">
            {template.mine ? "Your template" : `${template.madeBy}’s template`} on {template.reportTitle} ·{" "}
            {SEEN_BY[template.audience]}
            {template.description ? <> · {template.description}</> : null}
          </p>
        ) : null}
        <ParamControls params={meta.params} values={params} onChange={setParams} />

        <div className="flex flex-wrap items-center gap-2">
          <SearchBox value={view.search} onChange={(search) => setView({ ...view, search })} />
          <ReportFilters columns={meta.columns} rows={rows} view={view} onViewChange={setView} />
          <div className="ml-auto flex items-center gap-2">
            <Select
              value={view.groupBy ?? NO_GROUP}
              onValueChange={(value) => setView({ ...view, groupBy: value === NO_GROUP ? null : value })}
            >
              <SelectTrigger size="sm" className="w-auto" aria-label="Group by">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_GROUP}>No grouping</SelectItem>
                {meta.columns
                  .filter((column) => GROUPABLE.has(column.kind))
                  .map((column) => (
                    <SelectItem key={column.key} value={column.key}>
                      Group by {column.label.toLowerCase()}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <ReportColumns columns={meta.columns} view={view} onViewChange={setView} />
          </div>
        </div>

        {query.data?.truncated ? (
          <p className="text-[12px] font-medium text-[var(--status-warning-text)]">
            The first {rows.length.toLocaleString()} rows are shown. Narrow the dates to see the rest.
          </p>
        ) : null}

        <div className={query.isFetching ? "opacity-60 transition-opacity" : undefined}>
          {rows.length === 0 ? (
            <EmptyState title="Nothing in these dates" body="Widen the dates to find more." />
          ) : applied.rows.length === 0 ? (
            <EmptyState
              title="No rows match"
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setView({ ...view, search: "", conditions: [] })}
                >
                  Clear the filters
                </Button>
              }
            />
          ) : (
            <ReportBlocks
              blocks={meta.layout?.blocks ?? [{ id: "table", type: "table" }]}
              table={worksheet}
              meta={meta}
              view={view}
              params={params}
              applied={applied}
            />
          )}
        </div>
      </div>

      {visibleSelection.size > 0 ? (
        <DataTableFloatingActions count={visibleSelection.size} onClear={() => setSelected(new Set())}>
          {figures.map((column) => (
            <span key={column.key} className="text-sm text-[var(--text-muted)]">
              {column.label}{" "}
              <span className="font-mono font-medium tabular-nums text-[var(--text-strong)]">
                {formatTotal(aggregate(selectedRows, column, "sum"), column, "sum")}
              </span>
            </span>
          ))}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" size="sm" disabled={exporting}>
                Export selected
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <ExportChoices onChoose={(format, template) => void runExport(format, true, template)} />
            </DropdownMenuContent>
          </DropdownMenu>
        </DataTableFloatingActions>
      ) : null}

      {sheet === "save" ? (
        <TemplateSheet mode={{ kind: "save", meta, view, params }} open onOpenChange={(open) => setSheet(open ? "save" : null)} />
      ) : null}
      {sheet === "edit" && template ? (
        <TemplateSheet mode={{ kind: "edit", template }} open onOpenChange={(open) => setSheet(open ? "edit" : null)} />
      ) : null}
    </>
  );
}
