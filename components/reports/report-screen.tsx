"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";

import { Button, Empty, InputWithIcon, Kit, Pill, TableFoot, type FootSum } from "@/components/core";
import { MenuButton, type MenuEntry } from "@/components/core/menu";
import { PageChrome, type PageMenuItem, type PagePrimary } from "@/components/layout/page-chrome";
import { COMMON_PRESETS, DateRangePicker } from "@/components/ui/date-picker";
import { useToast } from "@/components/ui/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import type { ExportTemplateId } from "@/lib/reports/export-layouts";
import type { CustomReport } from "@/lib/reports/custom/document";
import { formatTotal } from "@/lib/reports/format";
import { defaultLayout } from "@/lib/reports/layout";
import { scheduleQuery } from "@/lib/reports/schedule";
import type { TemplateAudience } from "@/lib/reports/template-access";
import type { ReportColumnKind, ReportParam, ReportRow, ReportView } from "@/lib/reports/types";
import { aggregate, applyView, encodeView } from "@/lib/reports/view";
import { dayRangeWords, formatTime, todayIn } from "@/lib/workspace/format";

import { ExplainProvider, ReportBlocks, type ExplainFigure } from "./report-blocks";
import { ReportColumns } from "./report-columns";
import { Chip, FilterChips, FiltersButton, QuickChips } from "./report-filters";
import { ReportOutDrawer, type DownloadFormat, type OutTab } from "./report-out-drawer";
import { ReportRowActions } from "./report-row-actions";
import { ReportRowList } from "./report-row-list";
import { ReportTable } from "./report-table";
import { TemplateSheet } from "./template-sheet";
import { useReport } from "./use-report";

/**
 * One report, as the kit draws it (PageReport): where it comes from, the
 * chips that choose which records (the dates and choices, which fetch again)
 * and how to look at them (search, filters, grouping, columns, which do not),
 * the key figures and charts, then the table with its footer. Selecting rows
 * raises the selection into the footer.
 *
 * Export (E) and Send it open one drawer with Download and Send it; Save as a
 * template opens its own. Opened as a template, the page starts from the
 * template's view and dates and says whose it is.
 */

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

/** Search: a button until it is pressed or holds words, then the box. */
function SearchBox({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  const [opened, setOpened] = useState(Boolean(value));
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
  if (!opened && !draft) {
    return (
      <Button icon="search" onClick={() => setOpened(true)}>
        Search
      </Button>
    );
  }
  return (
    <InputWithIcon
      wrapClassName="ws-find"
      type="search"
      autoFocus={!value}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => setOpened(Boolean(draft))}
      placeholder="Search this report"
      aria-label="Search this report"
    />
  );
}

/** The chips that choose which records: the dates, then each choice. */
function ParamChips({
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
  // Joined to the chip's label the range reads on in sentence case: "Closing from 1 January".
  const said = dayRangeWords(range, todayIn()) || "any time";
  const words = /^(January|February|March|April|May|June|July|August|September|October|November|December)\b/.test(said) ? said : `${said.charAt(0).toLowerCase()}${said.slice(1)}`;
  return (
    <>
      {from ? (
        <DateRangePicker
          openEnded
          presets={COMMON_PRESETS}
          title={from.label}
          value={range}
          onChange={(next) => onChange({ from: next.from ?? "", ...(to ? { to: next.to ?? "" } : {}) })}
          trigger={
            <Chip set={Boolean(range.from || range.to)} icon="calendar" aria-label={`${from.label}: ${words}`}>
              {from.label} {words}
            </Chip>
          }
        />
      ) : null}
      {choices.map((param) => {
        const current = values[param.key] ?? param.options[0]?.value ?? "";
        const option = param.options.find((candidate) => candidate.value === current);
        return (
          <MenuButton
            key={param.key}
            className={current === param.options[0]?.value ? "chipsel" : "chipsel is-set"}
            icon="filter"
            label={param.label}
            items={param.options.map((candidate) => ({
              key: candidate.value,
              label: candidate.label,
              checked: candidate.value === current,
              onSelect: () => onChange({ [param.key]: candidate.value }),
            }))}
          >
            {option?.label ?? param.label}
          </MenuButton>
        );
      })}
    </>
  );
}

/** What each send reads, from the report's own first date: "the year so far". */
function periodOf(param: ReportParam | undefined): string | null {
  if (!param || param.type !== "date") return null;
  const start = param.default;
  if (start === "yearStart") return "the year so far";
  if (start === "monthStart") return "the month so far";
  if (start === "today") return "that day";
  if (start) return `the last ${start.slice(1, -1)} days`;
  return "every date";
}

function Loading() {
  return (
    <div className="kbody" aria-busy="true" aria-label="Loading">
      <div className="rp-src">
        <div className="skeleton" style={{ height: 16, width: 320 }} />
      </div>
      <div className="ws-tools">
        <div className="skeleton" style={{ height: 32, width: 220 }} />
        <div className="skeleton" style={{ height: 32, width: 120 }} />
      </div>
      <div className="rp-figs">
        <div className="skeleton" style={{ height: 76 }} />
      </div>
      <div style={{ padding: "var(--space-16) var(--space-24)", display: "flex", flexDirection: "column", gap: 8 }}>
        {Array.from({ length: 8 }, (_, index) => (
          <div key={index} className="skeleton" style={{ height: 36 }} />
        ))}
      </div>
    </div>
  );
}

export function ReportScreen({ reportKey }: { reportKey: string }) {
  const { toast } = useToast();
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const router = useRouter();
  const search = useSearchParams();
  const { query, meta, template, view, params, setView, resetView, setParams, customised } = useReport(reportKey);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  // `?save=1` opens Save as a template, as a card of Vane's ("Let's keep this view") leads to it.
  const [sheet, setSheet] = useState<"save" | "edit" | null>(() => (search.get("save") ? "save" : null));
  // `?send=1` opens Send it, so a link can lead straight to it.
  const [out, setOut] = useState<OutTab | null>(() => (search.get("send") ? "send" : null));
  const [exporting, setExporting] = useState(false);
  const isPhone = useIsMobile();

  const rows = useMemo<ReportRow[]>(() => query.data?.rows ?? [], [query.data]);
  const applied = useMemo(() => (meta && view ? applyView(rows, meta.columns, view) : null), [rows, meta, view]);

  // A selection survives a filter only for the rows still on screen.
  const visibleSelection = useMemo(() => {
    if (!applied) return new Set<string>();
    const shown = new Set(applied.rows.map((row) => row.id));
    return new Set([...selected].filter((id) => shown.has(id)));
  }, [applied, selected]);

  const closeOut = useCallback(() => {
    setOut(null);
    if (new URLSearchParams(window.location.search).has("send")) {
      const next = new URLSearchParams(window.location.search);
      next.delete("send");
      const qs = next.toString();
      window.history.replaceState(null, "", qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
    }
  }, []);

  const runExport = async (format: DownloadFormat, template: ExportTemplateId, onlySelected: boolean) => {
    if (!view) return;
    setExporting(true);
    try {
      await download(reportKey, { format, template, params, view, ...(onlySelected ? { rowIds: [...visibleSelection] } : {}) });
      closeOut();
    } catch (error) {
      toast({ title: "Export failed", description: getApiErrorMessage(error), variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["reports", reportKey] });

  /**
   * Explain a figure (PageVaneReport): the press gives Vane the question as a job of
   * its own, and the answer opens beside the report (`?explain=<job>`).
   */
  const explain = useCallback<ExplainFigure>(
    (figure, value) => {
      const title = template?.name ?? meta?.title ?? reportKey;
      const about = { report: reportKey, title, figure, value, params: Object.fromEntries(Object.entries(params).filter(([, given]) => given)) };
      void fetchJson<{ id: string }>("/api/vane/jobs", { method: "POST", body: JSON.stringify({ about }) })
        .then((job) => {
          const next = new URLSearchParams(window.location.search);
          next.set("explain", job.id);
          router.replace(`${window.location.pathname}?${next.toString()}`, { scroll: false });
        })
        .catch((error) => toast({ title: "Vane did not get the question", description: getApiErrorMessage(error), variant: "destructive" }));
    },
    [meta?.title, params, reportKey, router, template?.name, toast],
  );

  /** This report's page as a report of one's own, every block a query to take further. */
  const buildOn = async () => {
    try {
      const made = await fetchJson<{ report: CustomReport }>("/api/v2/reports/custom", {
        method: "POST",
        body: JSON.stringify({ fromReport: reportKey }),
      });
      router.push(`/reports/c/${made.report.id}/edit`);
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

  const more: MenuEntry[] = [];
  if (template?.canChange && customised) more.push({ key: "save", label: `Save over ${template.name}`, onSelect: () => void saveTemplateView() });
  if (template?.canChange) more.push({ key: "edit", label: "Change the template", onSelect: () => setSheet("edit") });
  if (customised) more.push({ key: "reset", label: "Reset the view", onSelect: resetView });
  more.push({ key: "build", label: "Build a report from this one", onSelect: () => void buildOn() });
  if (manager && !template && meta) {
    more.push({ separator: true });
    more.push({ key: "arrange", label: "Arrange the page", onSelect: () => router.push(`/reports/${reportKey}/arrange`) });
    if (customised && view) more.push({ key: "start", label: "Make this everyone’s starting view", onSelect: () => void saveStartingView(view) });
    if (meta.defaultView) more.push({ key: "clear", label: "Clear the starting view", onSelect: () => void saveStartingView(null) });
  }
  const moreItems = more.filter((entry): entry is Extract<MenuEntry, { key: string }> => "key" in entry);
  const moreKey = moreItems.map((item) => item.key).join(",");

  const ready = Boolean(meta && applied);
  const primary = useMemo<PagePrimary | null>(
    () => (ready ? { label: "Export", icon: "export", shortcut: "E", onClick: () => setOut("download") } : null),
    [ready],
  );
  const phoneMenu = useMemo<PageMenuItem[] | null>(
    () =>
      ready
        ? [
            { key: "save-as", label: "Save as a template", onSelect: () => setSheet("save") },
            { key: "send", label: "Send it", onSelect: () => setOut("send") },
            ...moreItems.map((item) => ({ key: item.key, label: String(item.label), onSelect: item.onSelect })),
          ]
        : null,
    // The items are rebuilt each render; which ones there are is what changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready, moreKey],
  );

  const chrome = (
    <PageChrome title={template?.name ?? meta?.title ?? "Report"} primary={primary} phoneMenu={phoneMenu}>
      {ready ? (
        <Kit contents>
          <Button icon="docs" onClick={() => setSheet("save")}>
            Save as a template
          </Button>
          <Button icon="send" onClick={() => setOut("send")}>
            Send it
          </Button>
          <MenuButton variant="quiet" iconOnly icon="more" iconEnd={undefined} align="end" aria-label="More" label="More" items={more}>
            More
          </MenuButton>
        </Kit>
      ) : null}
    </PageChrome>
  );

  const frame = (body: React.ReactNode) => (
    <>
      {chrome}
      <Kit className="kit-main">
        <div className="mn rp-page">
          {body}
        </div>
      </Kit>
    </>
  );

  if (query.isLoading || (!meta && !query.isError)) return frame(<Loading />);

  if (query.isError && !query.data) {
    return frame(
      <Empty
        icon="warn"
        title={typeof navigator !== "undefined" && !navigator.onLine ? "You are offline" : "This report did not load"}
        action={
          <Button icon="history" onClick={() => void query.refetch()}>
            Try again
          </Button>
        }
      >
        {getApiErrorMessage(query.error, "Check the connection and try again.")} Reports open to the people who can open the page they are about; a manager can tell you who that is.
      </Empty>,
    );
  }

  if (!meta || !view || !applied) return frame(<Loading />);

  const selectedRows = applied.rows.filter((row) => visibleSelection.has(row.id));
  const rowActionsFor = meta.rowActions?.length
    ? (row: ReportRow) => <ReportRowActions row={row} actions={meta.rowActions!} onChanged={refresh} />
    : null;
  const groupColumn = view.groupBy ? meta.columns.find((column) => column.key === view.groupBy) ?? null : null;
  const totalled = applied.columns.filter((column) => view.totals[column.key]);
  const money = totalled.find((column) => column.kind === "money") ?? totalled[0] ?? null;
  const count = applied.rows.length;

  const sums: FootSum[] = totalled.map((column) => ({
    label: column.label,
    value: formatTotal(applied.totals[column.key], column, view.totals[column.key]!),
  }));
  const selectedSum = money
    ? { label: money.label, value: formatTotal(aggregate(selectedRows, money, "sum"), money, "sum") }
    : undefined;
  const code = applied.columns.find((column) => column.kind === "code");
  const selectedWords = (() => {
    const refs = code ? selectedRows.slice(0, 3).map((row) => String(row[code.key] ?? "")).filter(Boolean) : [];
    const list =
      refs.length === 0
        ? `${selectedRows.length} rows`
        : selectedRows.length > 3
          ? `${refs.join(", ")} and ${selectedRows.length - 3} more`
          : refs.length > 1
            ? `${refs.slice(0, -1).join(", ")} and ${refs[refs.length - 1]}`
            : refs[0]!;
    return selectedSum ? `${list}, ${selectedSum.value}` : list;
  })();

  const dateParams = meta.params.filter((param) => param.type === "date");
  const range = dayRangeWords({ from: params.from || null, to: params.to || null }, todayIn());
  const dateLabel = dateParams[0]?.label ?? null;
  const grouping = groupColumn ? `grouped by ${groupColumn.label.toLowerCase()}` : null;
  const narrowed = view.conditions.length
    ? `${view.conditions.length === 1 ? "1 filter" : `${view.conditions.length} filters`}`
    : "every row";
  const exportSub = [dateLabel && range ? `${dateLabel} ${range}` : null, grouping].filter(Boolean).join(", ");
  const sendSub = [grouping ? grouping[0]!.toUpperCase() + grouping.slice(1) : "Not grouped", narrowed].join(", ");

  const worksheet = isPhone ? (
    <ReportRowList applied={applied} view={view} selectedIds={visibleSelection} onSelect={setSelected} rowActions={rowActionsFor} />
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

  const table = (
    <>
      {rows.length === 0 ? (
        <Empty icon="calendar" title="Nothing in these dates">
          Widen the dates to find more.
        </Empty>
      ) : count === 0 ? (
        <Empty
          icon="search"
          title="No rows match"
          action={
            <Button icon="x" onClick={() => setView({ ...view, search: "", conditions: [] })}>
              Clear the filters
            </Button>
          }
        >
          Nothing here matches the search and filters.
        </Empty>
      ) : (
        worksheet
      )}
      <TableFoot
        range={count === 0 ? "No rows" : `1 to ${count.toLocaleString("en-US")}${grouping ? `, ${grouping}` : ""}`}
        sums={sums}
        selection={{
          count: visibleSelection.size,
          sum: selectedSum,
          onClear: () => setSelected(new Set()),
          actions: (
            <>
              <Button icon="export" onClick={() => setOut("download")}>
                Export
              </Button>
            </>
          ),
        }}
      />
    </>
  );

  const groupItems: MenuEntry[] = [
    { key: "none", label: "No grouping", checked: !view.groupBy, onSelect: () => setView({ ...view, groupBy: null }) },
    ...meta.columns
      .filter((column) => GROUPABLE.has(column.kind))
      .map((column) => ({
        key: column.key,
        label: column.label,
        checked: view.groupBy === column.key,
        onSelect: () => setView({ ...view, groupBy: column.key }),
      })),
  ];

  const asOf = query.dataUpdatedAt ? formatTime(new Date(query.dataUpdatedAt)) : null;
  const periodWords = periodOf(dateParams[0]);

  return (
    <>
      {frame(
        <div className="kbody">
          <div className="rp-src">
            {template ? (
              <span>
                {template.mine ? "Your template" : `${template.madeBy}’s template`} on{" "}
                <Link href={`/reports/${reportKey}`}>{template.reportTitle}</Link>, {SEEN_BY[template.audience]}
                {template.description ? <>. {template.description}</> : null}
              </span>
            ) : (
              <>
                <Pill tone="info">From Corelith</Pill>
                <span>{meta.summary ?? `${meta.title}, from ${meta.area}`}</span>
              </>
            )}
          </div>

          <div className="ws-tools rp-tools">
            <ParamChips params={meta.params} values={params} onChange={setParams} />
            <QuickChips columns={meta.columns} rows={rows} view={view} onViewChange={setView} />
            <FilterChips columns={meta.columns} rows={rows} view={view} onViewChange={setView} />
            <span className="sepv" aria-hidden="true" />
            <SearchBox value={view.search} onChange={(next) => setView({ ...view, search: next })} />
            <FiltersButton columns={meta.columns} rows={rows} view={view} onViewChange={setView} />
            <MenuButton className={groupColumn ? "chipsel is-set" : "chipsel"} icon="list" label="Group by" items={groupItems}>
              {groupColumn ? `Group by: ${groupColumn.label}` : "Group by"}
            </MenuButton>
            <ReportColumns columns={meta.columns} view={view} onViewChange={setView} />
            {asOf ? (
              <div className="end">
                <span className="ws-n">As of {asOf}</span>
              </div>
            ) : null}
          </div>

          {query.data?.truncated ? (
            <p className="rp-warn" role="status">
              The first {rows.length.toLocaleString()} rows are shown. Narrow the dates to see the rest.
            </p>
          ) : null}

          <div className={query.isFetching ? "rp-blocks is-fetching" : "rp-blocks"}>
            {count === 0 ? (
              table
            ) : (
              <ExplainProvider value={explain}>
                <ReportBlocks
                  blocks={meta.layout?.blocks ?? defaultLayout(meta).blocks}
                  table={table}
                  meta={meta}
                  view={view}
                  params={params}
                  applied={applied}
                />
              </ExplainProvider>
            )}
          </div>
        </div>,
      )}

      {sheet === "save" ? (
        <TemplateSheet
          mode={{ kind: "save", meta, view, params, blocks: meta.layout?.blocks ?? defaultLayout(meta).blocks }}
          open
          onOpenChange={(open) => setSheet(open ? "save" : null)}
        />
      ) : null}
      {sheet === "edit" && template ? (
        <TemplateSheet mode={{ kind: "edit", template }} open onOpenChange={(open) => setSheet(open ? "edit" : null)} />
      ) : null}

      <ReportOutDrawer
        open={out !== null}
        onOpenChange={(open) => (open ? undefined : closeOut())}
        tab={out ?? "download"}
        onTab={setOut}
        reportKey={reportKey}
        reportTitle={template?.name ?? meta.title}
        exportSub={exportSub ? `${exportSub}.` : `${count.toLocaleString("en-US")} rows.`}
        sendSub={`${sendSub}.`}
        groupLabel={groupColumn ? groupColumn.label.toLowerCase() : null}
        selected={visibleSelection.size ? { count: visibleSelection.size, words: selectedWords } : null}
        total={count}
        periodWords={periodWords}
        query={scheduleQuery(params, dateParams.map((param) => param.key), encodeView(view))}
        exporting={exporting}
        onDownload={(format, layout, onlySelected) => void runExport(format, layout, onlySelected)}
      />
    </>
  );
}

