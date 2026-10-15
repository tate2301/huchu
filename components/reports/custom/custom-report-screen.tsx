"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { Button, ButtonGroup, ButtonLink, Empty, Kit, Pill } from "@/components/core";
import { MenuButton, type MenuEntry } from "@/components/core/menu";
import { PageChrome, type PagePrimary } from "@/components/layout/page-chrome";
import { COMMON_PRESETS, DateRangePicker } from "@/components/ui/date-picker";
import { dsConfirm } from "@/components/ui/ds-confirm";
import { useToast } from "@/components/ui/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { controlsOf, filterParam, periodParams, type CustomBlock, type CustomReport } from "@/lib/reports/custom/document";
import { TEMPLATE_AUDIENCES, type TemplateAudience } from "@/lib/reports/template-access";
import { SEEN_BY_WORDS } from "@/lib/reports/template-words";
import { resolveParams } from "@/lib/reports/params";
import type { ReportParams } from "@/lib/reports/types";
import { dayRangeWords, formatTime, todayIn } from "@/lib/workspace/format";

import { Chip } from "../report-filters";
import { CustomBlockResult, downloadBlockCsv } from "./custom-block";
import { ControlsView, SentenceView } from "./report-controls";
import { useCustomData, useReportSources } from "./use-custom-data";

/**
 * A custom report, read: its dates above, its blocks below, every block run
 * over rows fetched for this person through the reports they can open. A
 * block reading a source they cannot open says so, and the rest still show.
 */

/** Drawing widths: a block beside another, and on a phone. */
const HALF = 520;
const PHONE = 360;

/** Two half blocks side by side; anything else on a row of its own. */
function pageRows(blocks: readonly CustomBlock[]): CustomBlock[][] {
  const rows: CustomBlock[][] = [];
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index]!;
    const next = blocks[index + 1];
    if (block.half && next?.half) {
      rows.push([block, next]);
      index += 1;
    } else rows.push([block]);
  }
  return rows;
}

/** The report's own period, named. */
function periodName(from: string): string | null {
  if (from === "yearStart") return "This year";
  if (from === "monthStart") return "This month";
  const days = /^-(\d+)d$/.exec(from);
  return days ? `Last ${days[1]} days` : null;
}

/**
 * A custom report, read. `builtIn` draws one the product ships
 * (`lib/reports/custom/templates.ts`) the same way: on the reader's own rows,
 * nobody's to change, with "Make it yours" to copy it into the workspace.
 */
export function CustomReportScreen({ id, builtIn }: { id: string; builtIn?: string }) {
  const { toast } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  // Charts are drawn at the width they are read at, so a phone gets phone-sized labels.
  const isPhone = useIsMobile();

  const report = useQuery({
    queryKey: builtIn ? ["reports", "built", builtIn] : ["reports", "custom", id],
    queryFn: () =>
      fetchJson<{ report: CustomReport }>(
        builtIn ? `/api/v2/reports/built/${encodeURIComponent(builtIn)}` : `/api/v2/reports/custom/${encodeURIComponent(id)}`,
      ),
  });
  const sources = useReportSources();
  const document = report.data?.report.document;

  // A question saved in Explore over the real tables runs only through Explore's own login: it opens there.
  const inExplore = document?.reads === "tables" ? report.data!.report.id : null;
  useEffect(() => {
    if (inExplore) router.replace(`/explore/q/${inExplore}`);
  }, [inExplore, router]);

  // The dates are in the URL, so a report is linked as it was seen; absent, the report's own.
  const given = useMemo(() => {
    const params: ReportParams = {};
    for (const key of ["from", "to"]) {
      const value = search.get(key);
      if (value !== null) params[key] = value;
    }
    return params;
  }, [search]);
  const params = useMemo(() => (document ? resolveParams(periodParams(document.period), given) : {}), [document, given]);
  const setDates = useCallback(
    (next: { from: string; to: string }) => {
      const query = new URLSearchParams(search);
      query.set("from", next.from);
      query.set("to", next.to);
      window.history.replaceState(null, "", `${pathname}?${query.toString()}`);
    },
    [pathname, search],
  );

  const blocks = useMemo(() => document?.blocks ?? [], [document]);
  // The report's own controls (ReportMonday): its filters' values are in the address too.
  const controls = document ? controlsOf(document) : null;
  const filters = useMemo(() => {
    const chosen: Record<string, string> = {};
    for (const filter of controls?.filters ?? []) {
      const value = search.get(filterParam(filter));
      if (value) chosen[filter.column] = value;
    }
    return chosen;
  }, [controls, search]);
  const setFilter = useCallback(
    (column: string, value: string | null) => {
      const query = new URLSearchParams(search);
      if (value === null) query.delete(`f.${column}`);
      else query.set(`f.${column}`, value);
      const text = query.toString();
      window.history.replaceState(null, "", text ? `${pathname}?${text}` : pathname);
    },
    [pathname, search],
  );
  const data = useCustomData(blocks, sources.data?.sources, params, filters);

  const copy = async () => {
    const current = report.data?.report;
    if (!current) return;
    setBusy(true);
    try {
      const made = await fetchJson<{ report: CustomReport }>("/api/v2/reports/custom", {
        method: "POST",
        body: JSON.stringify(builtIn ? { fromTemplate: builtIn } : { copyOf: current.id }),
      });
      await queryClient.invalidateQueries({ queryKey: ["reports", "catalog"] });
      router.push(`/reports/c/${made.report.id}/edit`);
    } catch (error) {
      toast({ title: "Not copied", description: getApiErrorMessage(error), variant: "destructive" });
      setBusy(false);
    }
  };

  // The primary is kept by value; it calls the copy of this render.
  const copyRef = useRef(copy);
  useEffect(() => {
    copyRef.current = copy;
  });

  const remove = async () => {
    const current = report.data?.report;
    if (!current) return;
    const confirmed = await dsConfirm({
      title: `Delete ${current.title}`,
      description: current.audience !== "JUST_ME"
        ? `${current.audience === "EVERYONE" ? "Everyone in the workspace" : "The managers"} lose it. The reports it reads are not touched.`
        : "The reports it reads are not touched.",
      confirmLabel: "Delete the report",
      variant: "danger",
    });
    if (!confirmed) return;
    setBusy(true);
    try {
      await fetchJson(`/api/v2/reports/custom/${encodeURIComponent(id)}`, { method: "DELETE" });
      await queryClient.invalidateQueries({ queryKey: ["reports", "catalog"] });
      toast({ title: `${current.title} deleted`, variant: "success" });
      router.push("/reports");
    } catch (error) {
      toast({ title: "Not deleted", description: getApiErrorMessage(error), variant: "destructive" });
      setBusy(false);
    }
  };

  const current = report.data?.report;
  const editable = Boolean(current?.editable && !builtIn);

  /** Share: who sees it besides its maker. Wider than just them is a manager's call, as for a template. */
  const share = async (audience: TemplateAudience) => {
    if (!current || audience === current.audience) return;
    setBusy(true);
    try {
      await fetchJson(`/api/v2/reports/custom/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ audience }) });
      await queryClient.invalidateQueries({ queryKey: ["reports"] });
      toast({ title: `${current.title}: ${SEEN_BY_WORDS[audience].toLowerCase()}`, variant: "success" });
    } catch (error) {
      toast({ title: "Not shared", description: getApiErrorMessage(error), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };
  const shareItems: MenuEntry[] = current
    ? [
        { heading: "Seen by" },
        ...TEMPLATE_AUDIENCES.filter((audience) => audience === "JUST_ME" || current.canShare || audience === current.audience).map((audience) => ({
          key: audience,
          label: SEEN_BY_WORDS[audience],
          checked: current.audience === audience,
          onSelect: () => void share(audience),
        })),
      ]
    : [];

  /** Export: every table on the page, each as its CSV, as it first shows. */
  const exportTables = () => {
    let files = 0;
    for (const block of blocks) {
      if (block.type !== "query" || block.display.type !== "table") continue;
      const result = data.results.get(block.id);
      if (!result?.ok) continue;
      downloadBlockCsv(block, result.columns, result.rows);
      files += 1;
    }
    if (files === 0) toast({ title: "Nothing to export yet", description: "This report has no table with rows in these dates." });
  };

  const primary = useMemo<PagePrimary | null>(() => {
    if (!current) return null;
    if (builtIn) return { label: "Make it yours", icon: "file" as const, shortcut: "M", onClick: () => void copyRef.current(), disabled: busy ? "Copying it" : undefined };
    if (editable) return { label: "Edit", icon: "edit" as const, shortcut: "E", href: `/reports/c/${id}/edit` };
    return { label: "Make a copy", icon: "file" as const, shortcut: "M", onClick: () => void copyRef.current(), disabled: busy ? "Copying it" : undefined };
  }, [current, builtIn, editable, id, busy]);

  const more: MenuEntry[] = [];
  if (current && !builtIn && editable) {
    more.push({ key: "copy", label: "Make a copy", onSelect: () => void copy() });
    more.push({ separator: true });
    more.push({ key: "delete", label: `Delete ${current.title}`, danger: true, onSelect: () => void remove() });
  }

  const chrome = (
    <PageChrome title={current?.title ?? "Report"} primary={primary}>
      {current ? (
        <Kit contents>
          <ButtonGroup aria-label="This report">
            {editable ? (
              <MenuButton icon="share" iconEnd={undefined} label="Share" items={shareItems} disabled={busy}>
                Share
              </MenuButton>
            ) : null}
            <Button icon="export" onClick={exportTables}>
              Export
            </Button>
          </ButtonGroup>
          {more.length ? (
            <MenuButton variant="quiet" iconOnly icon="more" iconEnd={undefined} align="end" aria-label="More" label="More" items={more} disabled={busy}>
              More
            </MenuButton>
          ) : null}
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

  // On the server React Query has not started, so no data and no error is still loading.
  if (report.isLoading || sources.isLoading || (!report.data && !report.isError) || (!sources.data && !sources.isError)) {
    return frame(
      <div className="kbody" aria-busy="true" aria-label="Loading">
        <div className="rp-head">
          <div className="skeleton" style={{ height: 20, width: 360 }} />
        </div>
        <div className="rp-figs">
          <div className="skeleton" style={{ height: 76 }} />
        </div>
        <div className="rp-pad">
          <div className="skeleton" style={{ height: 220 }} />
        </div>
      </div>,
    );
  }

  if (report.isError || sources.isError || !current || !document) {
    return frame(
      <Empty
        icon="warn"
        title={typeof navigator !== "undefined" && !navigator.onLine ? "You are offline" : "This report did not open"}
        action={
          <Button icon="history" onClick={() => void Promise.all([report.refetch(), sources.refetch()])}>
            Try again
          </Button>
        }
      >
        {getApiErrorMessage(report.error ?? sources.error, "Check the connection and try again.")} A report is offered to whoever can open every report it reads.
      </Empty>,
    );
  }

  const draw = (block: CustomBlock) => {
    if (block.type === "heading") return <h2 className="rp-heading">{block.text}</h2>;
    if (block.type === "text") return <p className="rp-text">{block.text}</p>;
    // The controls are the page's tools, above it.
    if (block.type === "controls") return null;
    if (block.type === "sentence") {
      const from = blocks.find((candidate) => candidate.type === "query" && candidate.name === block.from);
      const result = from ? data.results.get(from.id) : undefined;
      return <SentenceView block={block} result={result} loading={Boolean(from) && (data.pending || (data.running && !result))} />;
    }
    const check = data.checks.get(block.id);
    const reads = check?.ok ? check.checked.tables : [];
    const result = data.results.get(block.id);
    return (
      <CustomBlockResult
        block={block}
        check={check}
        result={result}
        loading={data.pending || (data.running && !result)}
        params={params}
        width={isPhone ? PHONE : HALF}
        truncated={reads.some((table) => data.truncated.has(table))}
      />
    );
  };

  const range = { from: params.from || null, to: params.to || null };
  const spelled = dayRangeWords(range, todayIn()) || "Any time";
  // On the report's own period, the chip names it first: "Last 180 days, 16 April to 13 October".
  const own = Object.keys(given).length === 0 && document.period.from ? periodName(document.period.from) : null;
  const words = own ? `${own}, ${spelled}` : spelled;

  const asOf = data.rows.dataUpdatedAt ? formatTime(new Date(data.rows.dataUpdatedAt)) : null;

  return frame(
    <div className="kbody">
      <div className="ws-tools rp-tools">
        {controls ? (
          <ControlsView
            block={controls}
            dates={range}
            datesWords={words}
            onDates={setDates}
            values={filters}
            options={data.options}
            onFilter={setFilter}
          />
        ) : (
          <DateRangePicker
            openEnded
            presets={COMMON_PRESETS}
            title="Dates"
            value={range}
            onChange={(next) => setDates({ from: next.from ?? "", to: next.to ?? "" })}
            trigger={
              <Chip set icon="calendar" aria-label={`Dates: ${words}`}>
                {words}
              </Chip>
            }
          />
        )}
        {asOf ? (
          <div className="end">
            <span className="ws-n">As of {asOf}</span>
          </div>
        ) : null}
      </div>
      {builtIn || current.description ? (
        <div className="rp-head">
          {builtIn ? <Pill tone="info">From Corelith</Pill> : null}
          {current.description ? <span className="rp-desc">{current.description}</span> : <span className="rp-desc" />}
        </div>
      ) : null}

      {blocks.length === 0 ? (
        <Empty
          icon="reports"
          title="Nothing on this report yet"
          action={
            editable ? (
              <ButtonLink href={`/reports/c/${id}/edit`} icon="plus">
                Add the first block
              </ButtonLink>
            ) : undefined
          }
        >
          Add a table, a chart or figures, each from a query over the reports you can open.
        </Empty>
      ) : (
        <div className={data.rows.isFetching || data.running ? "rp-blocks is-fetching" : "rp-blocks"}>
          {pageRows(blocks.filter((block) => block.type !== "controls")).map((row) =>
            row.length === 2 ? (
              <div key={row[0]!.id} className="cm-grid2 rp-grid2">
                {row.map((block) => (
                  <div key={block.id}>{draw(block)}</div>
                ))}
              </div>
            ) : (
              <div key={row[0]!.id} className="rp-row">
                {draw(row[0]!)}
              </div>
            ),
          )}
        </div>
      )}
    </div>,
  );
}
