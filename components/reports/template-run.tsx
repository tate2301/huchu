"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Button, Empty, FigureStrip, Kit, Pill, TableFoot } from "@/components/core";
import { MenuButton, type MenuEntry } from "@/components/core/menu";
import { PageChrome } from "@/components/layout/page-chrome";
import { exportList } from "@/components/list-frame/actions";
import { filterValueLabel, PERIOD_LABELS } from "@/components/list-frame/model";
import { useToast } from "@/components/ui/use-toast";
import { ApiError, fetchJson, getApiErrorMessage } from "@/lib/api-client";
import type { CustomReport } from "@/lib/reports/custom/document";
import type { RunContext } from "@/lib/reports/templates";
import { chipAtRest, footWords, groupTotal, runFigures, runParts, runTrend, shownColumns } from "@/lib/reports/template-run";
import type { ListColumn, ListPageResponse, ReportRow, ReportValue } from "@/lib/reports/types";
import { insightMoney } from "@/lib/reports/week-insights";
import { formatShortDay, formatTime } from "@/lib/workspace/format";

import { Columns, HBars, InsightBlock } from "./insight-page";

/**
 * A shop template, run (PageRetailTemplate): `/retail/reports/{ref}`, the
 * built-in's slug or a saved template's id. The rows are its source's face,
 * rolled up and laid out the way the template says; the chips change what is
 * read and are kept in the address. Opening it counts one more open.
 */

const ROW_LIMIT = 500;
const noop = () => () => {};

function cell(value: ReportValue | undefined, column: ListColumn): string {
  if (value === null || value === undefined || value === "") return "—";
  if (column.kind === "money") return typeof value === "number" && value !== 0 ? insightMoney(value) : "—";
  if (column.kind === "date" && typeof value === "string") return formatShortDay(value);
  if (typeof value === "number") return value.toLocaleString("en-US");
  return String(value);
}

const WEEKDAY = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" });
/** "Sun 11 Oct" for a day's group; any other group by its own label. */
function groupWords(value: string | null, label: string, column: ListColumn | undefined): string {
  if (column?.kind === "date" && value && /^\d{4}-\d{2}-\d{2}$/.test(value)) return `${WEEKDAY.format(new Date(`${value}T12:00:00Z`))} ${formatShortDay(value)}`;
  return label;
}

function Loading() {
  return (
    <div className="kbody" aria-busy="true" aria-label="Loading">
      <div className="ws-tools">
        <div className="skeleton" style={{ height: 32, width: 360 }} />
      </div>
      <div style={{ padding: "16px 24px 8px" }}>
        <div className="skeleton" style={{ height: 76 }} />
      </div>
      {Array.from({ length: 8 }, (_, index) => (
        <div key={index} className="skeleton" style={{ height: 36, margin: "8px 24px 0" }} />
      ))}
    </div>
  );
}

export function TemplateRun({ templateRef }: { templateRef: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const { toast } = useToast();

  const context = useQuery({
    queryKey: ["retail-template", templateRef],
    queryFn: () => fetchJson<RunContext>(`/api/v2/retail/reports/${encodeURIComponent(templateRef)}`),
    retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 2,
  });
  // The query cache is persisted for offline use: nothing from it until mounted, so the first render matches the server's.
  const mounted = React.useSyncExternalStore(noop, () => true, () => false);
  const ctx = mounted ? (context.data ?? null) : null;

  // What the address asks of the rows, over the template's own query.
  const apiQuery = React.useMemo(() => {
    const params = new URLSearchParams(search.toString());
    params.set("face", "report");
    params.set("template", templateRef);
    params.set("page", "1");
    params.set("size", String(ROW_LIMIT));
    return params.toString();
  }, [search, templateRef]);
  const list = useQuery({
    queryKey: ["retail-template-rows", ctx?.source, apiQuery],
    queryFn: () => fetchJson<ListPageResponse>(`/api/v2/reports/${encodeURIComponent(ctx!.source)}?${apiQuery}`),
    enabled: Boolean(ctx),
    placeholderData: (previous) => previous,
  });

  // One more open, once a page.
  const counted = React.useRef(false);
  React.useEffect(() => {
    if (!ctx || counted.current) return;
    counted.current = true;
    void fetch(`/api/v2/retail/reports/${encodeURIComponent(ctx.ref)}/opened`, { method: "POST", credentials: "include" }).catch(() => {});
  }, [ctx]);

  const setAddress = React.useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(search.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value === null) next.delete(key);
        else next.set(key, value);
      }
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, search],
  );

  const [copying, setCopying] = React.useState(false);
  const makeItYours = async () => {
    if (!ctx) return;
    setCopying(true);
    try {
      const made = await fetchJson<{ report: CustomReport }>("/api/v2/reports/custom", {
        method: "POST",
        body: JSON.stringify({ fromReport: ctx.source, title: ctx.name }),
      });
      router.push(`/reports/c/${made.report.id}/edit`);
    } catch (error) {
      toast({ title: "Not copied", description: getApiErrorMessage(error), variant: "destructive" });
      setCopying(false);
    }
  };

  const data = mounted ? (list.data ?? null) : null;
  const [exporting, setExporting] = React.useState(false);
  const runExport = React.useCallback(async () => {
    if (!ctx || !data) return;
    setExporting(true);
    const said = await exportList(ctx.source, "xlsx", { ...data.query, group: data.query.group ?? "none", page: 1 });
    if (said) toast(said);
    setExporting(false);
  }, [ctx, data, toast]);

  const primary = React.useMemo(
    () =>
      data
        ? { label: "Export", icon: "export" as const, shortcut: "E", onClick: () => void runExport(), disabled: exporting ? "Exporting" : undefined }
        : null,
    [data, exporting, runExport],
  );

  const chrome = (
    <PageChrome title={ctx?.name ?? "Report"} primary={primary}>
      {ctx ? (
        <Kit contents>
          {ctx.canSave ? (
            <Button icon="docs" onClick={() => void makeItYours()} disabled={copying}>
              Make it yours
            </Button>
          ) : null}
        </Kit>
      ) : null}
    </PageChrome>
  );

  const frame = (body: React.ReactNode) => (
    <>
      {chrome}
      <Kit className="kit-main">
        <div className="mn" style={{ flex: 1, minHeight: 0 }}>
          {body}
        </div>
      </Kit>
    </>
  );

  const failed = mounted ? (context.error ?? (!data ? list.error : null)) : null;
  if (failed) {
    const missing = failed instanceof ApiError && failed.status === 404;
    return frame(
      <Empty
        icon={missing ? "reports" : "warn"}
        title={missing ? "That template is not here" : typeof navigator !== "undefined" && !navigator.onLine ? "You are offline" : "This report did not load"}
        action={
          missing ? (
            <Link className="btn" href="/retail/reports?view=all">
              All reports
            </Link>
          ) : (
            <Button icon="history" onClick={() => void (context.error ? context.refetch() : list.refetch())}>
              Try again
            </Button>
          )
        }
      >
        {missing
          ? "It may have been deleted, or it reads a report your role does not open. The owner, managers and the bookkeeper open Reports."
          : getApiErrorMessage(failed, "Check the connection and try again.")}
      </Empty>,
    );
  }
  if (!ctx || !data) return frame(<Loading />);

  // The report face: the list's spec, and how its rows roll up ("One row for each").
  const spec = data.report.list as typeof data.report.list & { rollups: Array<{ key: string; label: string }> };
  const columns = spec.columns as ListColumn[];
  const shown = shownColumns(columns, data.query);
  const rows: ReportRow[] = data.rows;
  const figures = runFigures(columns, data.totals, ctx.run, shown);
  const whole = figures[0] ?? null;
  const groupColumn = data.query.group ? columns.find((column) => column.key === data.query.group) : undefined;
  const rolled = spec.rollups.filter((rollup) => data.query.rows.includes(rollup.key));
  const parts = ctx.run?.parts ? runParts(columns, data.totals, ctx.run.parts.columns) : [];
  const partsTop = Math.max(1, ...parts.map((part) => part.value));
  const trend = ctx.run?.trend ? runTrend(rows, ctx.run.trend.by, ctx.run.trend.column) : [];
  const countColumn = columns.find((column) => column.key === "payments");

  // The chips: what is read (each filter), then how the rows are rolled up, then the columns.
  const filters = spec.filters.filter((filter) => filter.type !== "parent" && !(filter.type === "choice" && (filter.options?.length ?? 0) < 2 && filter.key === "site"));
  const chips = filters.map((filter) => {
    if (filter.type === "parent") return null;
    const value = data.query.filters[filter.key] ?? "any";
    const set = value !== "any";
    const words = set ? filterValueLabel(filter, value) : filter.type === "period" ? filter.any : chipAtRest(filter);
    const items: MenuEntry[] =
      filter.type === "period"
        ? [...Object.entries(PERIOD_LABELS), ["any", filter.any] as const].map(([key, label]) => ({
            key,
            label,
            checked: key === value,
            onSelect: () => setAddress({ [filter.key]: key }),
          }))
        : [
            { key: "any", label: chipAtRest(filter), checked: !set, onSelect: () => setAddress({ [filter.key]: "any" }) },
            ...(filter.options ?? []).map((option) => ({
              key: option.value,
              label: option.label,
              checked: option.value === value,
              onSelect: () => setAddress({ [filter.key]: option.value }),
            })),
          ];
    return (
      <MenuButton key={filter.key} className={set ? "chipsel is-set" : "chipsel"} icon={filter.type === "period" ? "calendar" : "filter"} label={filter.label} items={items}>
        {words}
      </MenuButton>
    );
  });
  const rollupItems: MenuEntry[] = spec.rollups
    .filter((rollup) => rollup.key !== "none")
    .map((rollup) => {
      const on = data.query.rows.includes(rollup.key);
      return {
        key: rollup.key,
        label: rollup.label,
        checked: on,
        onSelect: () => {
          const next = on ? data.query.rows.filter((key) => key !== rollup.key) : [...data.query.rows, rollup.key];
          setAddress({ rows: next.length ? next.join(",") : "none" });
        },
      };
    });
  const columnItems: MenuEntry[] = columns.map((column) => {
    const on = shown.some((entry) => entry.key === column.key);
    return {
      key: column.key,
      label: column.label,
      checked: on,
      onSelect: () => {
        const next = on ? shown.filter((entry) => entry.key !== column.key).map((entry) => entry.key) : [...shown.map((entry) => entry.key), column.key];
        if (next.length) setAddress({ cols: next.join(",") });
      },
    };
  });

  // This visit is one of them: it is counted as the page opens.
  const opens = ctx.opens + 1;
  const sums = whole ? [{ label: whole.label, value: insightMoney(whole.value) }] : [];

  return frame(
    <div className="kbody">
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, padding: "14px 28px 0", color: "var(--color-muted)", fontSize: 12.5 }}>
        <Pill tone="info">{ctx.builtIn ? "From Corelith" : "Made here"}</Pill>
        <span>
          {ctx.sub} · opened {opens === 1 ? "once" : `${opens.toLocaleString("en-US")} times`}
        </span>
      </div>
      <div className="ws-tools" style={{ flexWrap: "wrap" }}>
        {chips}
        <span className="sepv" />
        <MenuButton className={rolled.length ? "chipsel is-set" : "chipsel"} icon="list" label="One row for each" items={rollupItems}>
          {rolled.length ? `One row for each: ${rolled.map((rollup) => rollup.label).join(" and ")}` : `One row for each ${spec.rollups[0]?.label.toLowerCase() ?? "row"}`}
        </MenuButton>
        <MenuButton icon="columns" label="Columns" items={columnItems}>
          Columns
        </MenuButton>
        <div className="end">
          <span className="ws-n" style={{ fontFamily: "var(--font-sans)" }}>
            As of {formatTime(new Date(list.dataUpdatedAt))}
          </span>
        </div>
      </div>
      {figures.length ? (
        <div style={{ padding: "16px 24px 8px" }}>
          <FigureStrip
            figures={figures.map((figure, index) => ({
              label: figure.label,
              value: figure.kind === "money" ? insightMoney(figure.value) : figure.value.toLocaleString("en-US"),
              note:
                index === 0 && countColumn
                  ? `${Math.round(Number(data.totals[countColumn.key] ?? 0)).toLocaleString("en-US")} ${countColumn.label.toLowerCase()}`
                  : figure.share !== null
                    ? `${Math.round(figure.share * 100)}%`
                    : undefined,
            }))}
          />
        </div>
      ) : null}
      {parts.length || trend.length ? (
        <div className="cm-grid2 rp-grid2" style={{ boxShadow: "inset 0 1px 0 var(--color-line)" }}>
          {ctx.run?.parts ? (
            <div>
              <InsightBlock title={ctx.run.parts.title}>
                <HBars
                  rows={parts.map((part, index) => ({
                    id: part.key,
                    label: part.label,
                    share: part.value / partsTop,
                    text: insightMoney(part.value),
                    tone: index === 0 ? "key" : null,
                  }))}
                  empty="Nothing was taken in these dates."
                />
              </InsightBlock>
            </div>
          ) : null}
          {ctx.run?.trend ? (
            <div>
              <InsightBlock title={ctx.run.trend.title} sum={ctx.run.trend.sum}>
                <Columns
                  columns={trend.map((point) => ({
                    label: formatShortDay(point.label),
                    parts: [{ value: point.value, color: "var(--color-accent)", title: `${formatShortDay(point.label)}, ${insightMoney(point.value)}` }],
                  }))}
                  labels={trend.map((point) => formatShortDay(point.label))}
                  empty="Nothing was taken in these dates."
                />
              </InsightBlock>
            </div>
          ) : null}
        </div>
      ) : null}
      {rows.length === 0 ? (
        <Empty icon="reports" title="Nothing in these dates">
          Widen the dates, or set a chip back to every one.
        </Empty>
      ) : (
        <div className="wt" style={{ flex: "none", overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                {shown.map((column) => (
                  <th key={column.key} className={column.kind === "money" || column.kind === "number" ? "num" : undefined}>
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(() => {
                const out: React.ReactNode[] = [];
                let last: string | null | undefined;
                for (const row of rows) {
                  const key = groupColumn ? ((row[groupColumn.key] as string | null) ?? null) : undefined;
                  if (groupColumn && key !== last) {
                    last = key;
                    const group = data.groups?.find((entry) => entry.value === key);
                    const total = group ? groupTotal(group, whole?.key ?? null) : null;
                    out.push(
                      <tr key={`group-${key}`} className="grp">
                        <td colSpan={shown.length}>
                          {groupWords(key ?? null, group?.label ?? String(key ?? "None"), groupColumn)}
                          {total !== null ? (
                            <span className="num" style={{ float: "right" }}>
                              {insightMoney(total)}
                            </span>
                          ) : null}
                        </td>
                      </tr>,
                    );
                  }
                  out.push(
                    <tr key={row.id}>
                      {shown.map((column, index) => {
                        const text = cell(row[column.key], column);
                        const numeric = column.kind === "money" || column.kind === "number";
                        const isWhole = column.key === whole?.key;
                        return (
                          <td
                            key={column.key}
                            className={numeric ? "num" : index === 0 && column.kind === "date" ? "muted" : index === 1 ? "fill" : undefined}
                            style={text === "—" && numeric ? { color: "var(--color-faint)" } : isWhole ? { fontWeight: 600, color: "var(--color-ink)" } : undefined}
                          >
                            {index === 1 && !numeric ? <span className="cell-lead truncate">{text}</span> : text}
                          </td>
                        );
                      })}
                    </tr>,
                  );
                }
                return out;
              })()}
            </tbody>
          </table>
        </div>
      )}
      <TableFoot range={footWords(rows, rolled, data.total)} sums={sums} />
    </div>,
  );
}
