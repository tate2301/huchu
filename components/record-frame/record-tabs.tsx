"use client";

import * as React from "react";
import Link from "next/link";
import { useQueries, useQuery } from "@tanstack/react-query";

import "@/components/list-frame/list-frame.css";
import { exportList } from "@/components/list-frame/actions";
import { ExportItems, type ExportFormat } from "@/components/list-frame/export-menu";
import { ListCell, cellTitle } from "@/components/list-frame/list-cell";
import { alignOf, cellPadding, totalText } from "@/components/list-frame/model";
import { Menu, MenuContent, MenuTrigger } from "@/components/workspace/menu";
import { Tabs } from "@/components/workspace/tabs";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { fillTemplate } from "@/lib/reports/actions";
import type { ListColumn, ListPageResponse } from "@/lib/reports/types";
import { ChevronDown, Download } from "@/lib/icons";
import type { ActivityPage } from "@/lib/retail/record-activity";
import type { RecordTab, SourceTab } from "@/lib/retail/record-kinds/types";
import { formatCount, formatWhen } from "@/lib/workspace/format";

/** A tab shows at most this many rows; the link under it opens the rest. */
const SHOWN = 10;

const isSource = <R,>(tab: RecordTab<R>): tab is SourceTab<R> => tab.key !== "activity";

/** The list query a tab is: the first page of its source, scoped to this record. */
function tabQuery(tab: SourceTab<unknown>, id: string) {
  return { page: 1, size: 25, filters: { [tab.parent]: id } };
}

function tabUrl(tab: SourceTab<unknown>, id: string) {
  const params = new URLSearchParams({ page: "1", size: "25", [tab.parent]: id });
  return `/api/v2/reports/${encodeURIComponent(tab.source)}?${params.toString()}`;
}

/**
 * Tabs and the tab's table (5.6.5 item 3, 5.6.8). Each source tab is its list
 * source's first page with the parent filter set to this record: the ListFrame
 * cells, a totals row over every row, up to ten rows newest first, and the
 * link to everything. Activity reads the record's audit events, ten a page.
 */
export function RecordTabs<R>({
  tabs,
  record,
  recordId,
  type,
  canReadActivity,
}: {
  tabs: RecordTab<R>[];
  record: R;
  recordId: string;
  type: string;
  canReadActivity: boolean;
}) {
  const shown = tabs.filter((tab) => isSource(tab) || canReadActivity);
  const [selected, setSelected] = React.useState(shown[0]?.key ?? "");
  const [activityPage, setActivityPage] = React.useState(1);
  const panelId = React.useId();
  const { toast } = useToast();

  const sources = shown.filter(isSource);
  const pages = useQueries({
    queries: sources.map((tab) => ({
      queryKey: ["reports", tab.source, recordId],
      queryFn: () => fetchJson<ListPageResponse>(tabUrl(tab as SourceTab<unknown>, recordId)),
    })),
  });
  const activity = useQuery({
    queryKey: ["record-activity", type, recordId, activityPage],
    queryFn: () =>
      fetchJson<ActivityPage>(
        `/api/v2/retail/records/${encodeURIComponent(type)}/${recordId}/activity?page=${activityPage}&size=${SHOWN}`,
      ),
    enabled: canReadActivity && shown.some((tab) => tab.key === "activity"),
  });

  if (shown.length === 0) return null;
  const current = shown.find((tab) => tab.key === selected) ?? shown[0]!;
  const sourceIndex = sources.findIndex((tab) => tab.key === current.key);
  const page = sourceIndex >= 0 ? pages[sourceIndex] : null;

  const items = shown.map((tab) => {
    const index = sources.findIndex((source) => source.key === tab.key);
    const total = index >= 0 ? pages[index]?.data?.total : activity.data?.total;
    return { value: tab.key, label: tab.label, count: total === undefined ? undefined : formatCount(total) };
  });

  const onExport = async (format: ExportFormat) => {
    if (!isSource(current)) return;
    const failed = await exportList(current.source, format, tabQuery(current as SourceTab<unknown>, recordId));
    if (failed) toast({ title: failed, variant: "destructive" });
  };

  return (
    <section aria-label={current.label}>
      <div className="cx-rf-tabsrow">
        <Tabs items={items} value={current.key} onValueChange={setSelected} panelId={panelId} aria-label="Tables" />
        {isSource(current) && page?.data && page.data.total > 0 ? (
          <div className="cx-rf-tabsrow__export">
            <Menu>
              <MenuTrigger asChild>
                <button type="button" className="cx-rf-export">
                  <Download aria-hidden="true" />
                  Export
                  <ChevronDown aria-hidden="true" style={{ width: 12, height: 12, color: "var(--ink-3)" }} />
                </button>
              </MenuTrigger>
              <MenuContent align="end" roomy style={{ width: 260 }}>
                <ExportItems
                  caption={`The ${formatCount(page.data.total)} ${page.data.report.list.noun} in this table`}
                  onExport={(format) => void onExport(format)}
                />
              </MenuContent>
            </Menu>
          </div>
        ) : null}
      </div>
      <div id={panelId} role="tabpanel" aria-label={current.label}>
        {isSource(current) ? (
          <SourceTable tab={current} record={record} result={page} />
        ) : (
          <ActivityTable
            result={activity}
            page={activityPage}
            onPage={setActivityPage}
          />
        )}
      </div>
    </section>
  );
}

type PageQuery = { data?: ListPageResponse; isPending: boolean; isError: boolean; error: unknown; refetch: () => unknown };

function SourceTable<R>({ tab, record, result }: { tab: SourceTab<R>; record: R; result: PageQuery | null }) {
  if (!result || result.isPending) return <p className="cx-rf-tablemsg">Loading…</p>;
  if (result.isError || !result.data) {
    return (
      <p className="cx-rf-tablemsg cx-rf-tablemsg__error">
        {getApiErrorMessage(result.error)}{" "}
        <button type="button" className="cx-rf-link" style={{ border: 0, background: "none", font: "inherit", cursor: "pointer" }} onClick={() => void result.refetch()}>
          Try again
        </button>
      </p>
    );
  }
  const data = result.data;
  const spec = data.report.list;
  const columns = spec.columns as ListColumn[];
  const template = columns.map((column) => column.width).join(" ");
  const rows = data.rows.slice(0, SHOWN);
  const last = columns.length - 1;
  const extra = tab.totalsText?.(record) ?? {};
  const allLink = tab.allLink ? { label: tab.allLink.label, href: tab.allLink.href(record) } : null;

  if (data.total === 0) {
    return <p className="cx-rf-tablemsg">{spec.empty.title}.</p>;
  }

  return (
    <>
      <div className="cx-rf-tablebox">
        <div role="table" aria-label={tab.label} aria-rowcount={data.total} className="cx-lf-table cx-rf-table">
          <div role="row" className="cx-lf-g cx-lf-head" style={{ gridTemplateColumns: template, position: "static" }}>
            {columns.map((column, index) => (
              <div
                key={column.key}
                role="columnheader"
                className={`cx-lf-c${alignOf(column) === "end" ? " cx-lf-c--end" : ""}`}
                style={{ padding: cellPadding(column, index === last, false) }}
              >
                {column.label}
              </div>
            ))}
          </div>
          <div role="rowgroup">
            {rows.map((row) => {
              const href = fillTemplate(spec.rowHref, row);
              return (
                <div key={row.id} role="row" className="cx-lf-g cx-lf-row" style={{ gridTemplateColumns: template }}>
                  {columns.map((column, index) => (
                    <div
                      key={column.key}
                      role="cell"
                      title={cellTitle(column, row) || undefined}
                      className={`cx-lf-c${alignOf(column) === "end" ? " cx-lf-c--end" : ""}`}
                      style={{ padding: cellPadding(column, index === last) }}
                    >
                      <ListCell column={column} row={row} rowHref={href} />
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
          <div role="row" className="cx-lf-g cx-rf-totals" style={{ gridTemplateColumns: template }}>
            {columns.map((column, index) => {
              const text =
                index === 0
                  ? `Σ ${formatCount(data.total)} ${spec.noun}`
                  : (extra[column.key] ?? (column.total ? totalText(column, data.totals[column.key]) : ""));
              return (
                <div
                  key={column.key}
                  role="cell"
                  title={text || undefined}
                  className={`cx-lf-c${alignOf(column) === "end" ? " cx-lf-c--end" : ""}${extra[column.key] ? " cx-rf-totals__text" : ""}`}
                  style={{ padding: cellPadding(column, index === last, false) }}
                >
                  {text}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className="cx-rf-tablefoot">
        <span className="cx-rf-tablefoot__count">
          <b>
            1–{formatCount(rows.length)}
          </b>{" "}
          of <b>{formatCount(data.total)}</b>
        </span>
        <span className="cx-rf-tablefoot__spacer" />
        {allLink ? (
          <Link href={allLink.href} className="cx-rf-link">
            {allLink.label}
          </Link>
        ) : null}
      </div>
    </>
  );
}

type ActivityQuery = { data?: ActivityPage; isPending: boolean; isError: boolean; error: unknown; refetch: () => unknown };

const ACTIVITY_TEMPLATE = "150px minmax(0, 1fr) 160px";

/** Activity (5.6.8): When, What with the event's dot, By; ten a page, newest first. */
function ActivityTable({ result, page, onPage }: { result: ActivityQuery; page: number; onPage: (page: number) => void }) {
  if (result.isPending) return <p className="cx-rf-tablemsg">Loading…</p>;
  if (result.isError || !result.data) {
    return <p className="cx-rf-tablemsg cx-rf-tablemsg__error">{getApiErrorMessage(result.error)}</p>;
  }
  const { total, rows } = result.data;
  if (total === 0) return <p className="cx-rf-tablemsg">Nothing has happened to it yet.</p>;
  const first = (page - 1) * SHOWN + 1;
  const lastShown = first + rows.length - 1;
  const pages = Math.max(1, Math.ceil(total / SHOWN));
  return (
    <>
      <div className="cx-rf-tablebox">
        <div role="table" aria-label="Activity" aria-rowcount={total} className="cx-lf-table cx-rf-table">
          <div role="row" className="cx-lf-g cx-lf-head" style={{ gridTemplateColumns: ACTIVITY_TEMPLATE, position: "static" }}>
            <div role="columnheader" className="cx-lf-c">When</div>
            <div role="columnheader" className="cx-lf-c">What</div>
            <div role="columnheader" className="cx-lf-c">By</div>
          </div>
          <div role="rowgroup">
            {rows.map((row) => (
              <div key={row.id} role="row" className="cx-lf-g cx-lf-row" style={{ gridTemplateColumns: ACTIVITY_TEMPLATE }}>
                <div role="cell" className="cx-lf-c">
                  <span className="cx-lf-monocell">{formatWhen(row.at)}</span>
                </div>
                <div role="cell" className="cx-lf-c" title={row.reason ? `${row.what}. ${row.reason}` : row.what}>
                  <span className={`cx-rf-what cx-rf-what--${row.tone}`}>
                    {row.what}
                    {row.reason ? <span className="cx-rf-what__reason"> · {row.reason}</span> : null}
                  </span>
                </div>
                <div role="cell" className="cx-lf-c" title={row.actor.name}>
                  {row.actor.name}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="cx-rf-tablefoot">
        <span className="cx-rf-tablefoot__count">
          <b>
            {formatCount(first)}–{formatCount(lastShown)}
          </b>{" "}
          of <b>{formatCount(total)}</b>
        </span>
        <span className="cx-rf-tablefoot__spacer" />
        {pages > 1 ? (
          <span className="cx-lf-group">
            <button type="button" className="cx-lf-btn" disabled={page <= 1} onClick={() => onPage(page - 1)}>
              Newer
            </button>
            <button type="button" className="cx-lf-btn" disabled={page >= pages} onClick={() => onPage(page + 1)}>
              Older
            </button>
          </span>
        ) : null}
      </div>
    </>
  );
}
