"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { EmptyState, Skeleton } from "@corelithzw/react";
import { PageChrome } from "@/components/layout/page-chrome";
import { Button } from "@/components/ui/button";
import { COMMON_PRESETS, DateRangePicker, DayRangeChip } from "@/components/ui/date-picker";
import { dsConfirm } from "@/components/ui/ds-confirm";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { MoreHorizontal, Pencil } from "@/lib/icons";
import { periodParams, type CustomBlock, type CustomReport } from "@/lib/reports/custom/document";
import { resolveParams } from "@/lib/reports/params";
import type { ReportParams } from "@/lib/reports/types";

import { CustomBlockResult } from "./custom-block";
import { useCustomData, useReportSources } from "./use-custom-data";

/**
 * A custom report, read: its dates above, its blocks below, every block run
 * over rows fetched for this person through the reports they can open. A
 * block reading a source they cannot open says so, and the rest still show.
 */

/** Drawing widths: a block beside another, and one across the page. */
const HALF = 520;
const FULL = 1080;
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

export function CustomReportScreen({ id }: { id: string }) {
  const { toast } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  // Charts are drawn at the width they are read at, so a phone gets phone-sized labels.
  const isPhone = useIsMobile();

  const report = useQuery({
    queryKey: ["reports", "custom", id],
    queryFn: () => fetchJson<{ report: CustomReport }>(`/api/v2/reports/custom/${encodeURIComponent(id)}`),
  });
  const sources = useReportSources();
  const document = report.data?.report.document;

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
  const data = useCustomData(blocks, sources.data?.sources, params);

  const copy = async () => {
    const current = report.data?.report;
    if (!current) return;
    setBusy(true);
    try {
      const made = await fetchJson<{ report: CustomReport }>("/api/v2/reports/custom", {
        method: "POST",
        body: JSON.stringify({ title: `${current.title} (copy)`, description: current.description, shared: false, document: current.document }),
      });
      await queryClient.invalidateQueries({ queryKey: ["reports", "catalog"] });
      router.push(`/reports/custom/${made.report.id}/edit`);
    } catch (error) {
      toast({ title: "Not copied", description: getApiErrorMessage(error), variant: "destructive" });
      setBusy(false);
    }
  };

  const remove = async () => {
    const current = report.data?.report;
    if (!current) return;
    const confirmed = await dsConfirm({
      title: `Delete ${current.title}`,
      description: current.shared
        ? "Everyone in the workspace loses it. The reports it reads are not touched."
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
  const chrome = (
    <PageChrome title={current?.title ?? "Report"} backHref="/reports" backLabel="Reports">
      {current ? (
        <>
          {current.editable ? (
            <Button variant="secondary" size="sm" asChild>
              <Link href={`/reports/custom/${id}/edit`}>
                <Pencil className="size-4" aria-hidden="true" />
                Edit
              </Link>
            </Button>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="More" disabled={busy}>
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => void copy()}>Make a copy</DropdownMenuItem>
              {current.editable ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => void remove()}>Delete {current.title}</DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      ) : null}
    </PageChrome>
  );

  // On the server React Query has not started, so no data and no error is still loading.
  if (report.isLoading || sources.isLoading || (!report.data && !report.isError) || (!sources.data && !sources.isError)) {
    return (
      <>
        {chrome}
        <div className="grid gap-3" aria-busy="true" aria-live="polite">
          <Skeleton height={32} width={280} />
          <Skeleton height={120} />
          <Skeleton height={240} />
        </div>
      </>
    );
  }

  if (report.isError || sources.isError || !current || !document) {
    return (
      <>
        {chrome}
        <EmptyState
          title="This report did not open"
          body={getApiErrorMessage(report.error ?? sources.error)}
          action={
            <Button variant="secondary" size="sm" onClick={() => void Promise.all([report.refetch(), sources.refetch()])}>
              Try again
            </Button>
          }
        />
      </>
    );
  }

  const draw = (block: CustomBlock, width: number) => {
    if (block.type === "heading") {
      return block.level === 1 ? (
        <h2 className="text-[17px] leading-[1.25] font-semibold tracking-[-0.012em] text-[var(--text-strong)]">{block.text}</h2>
      ) : (
        <h3 className="text-[15px] leading-[1.35] font-semibold text-[var(--text-strong)]">{block.text}</h3>
      );
    }
    if (block.type === "text") {
      return <p className="max-w-[70ch] text-[13px] leading-[1.5] whitespace-pre-line text-[var(--text-body)]">{block.text}</p>;
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
        width={width}
        truncated={reads.some((table) => data.truncated.has(table))}
      />
    );
  };

  return (
    <>
      {chrome}
      <div className="grid gap-3">
        {current.description ? (
          <p className="max-w-[70ch] text-[13px] leading-[1.5] text-[var(--text-body)]">{current.description}</p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <DateRangePicker
            openEnded
            presets={COMMON_PRESETS}
            title="Dates"
            value={{ from: params.from || null, to: params.to || null }}
            onChange={(next) => setDates({ from: next.from ?? "", to: next.to ?? "" })}
            trigger={<DayRangeChip label="Dates" range={{ from: params.from || null, to: params.to || null }} />}
          />
        </div>

        {blocks.length === 0 ? (
          <EmptyState
            title="Nothing on this report yet"
            body="Add a table, a chart or figures, each from a query over the reports you can open."
            action={
              current.editable ? (
                <Button size="sm" asChild>
                  <Link href={`/reports/custom/${id}/edit`}>Add the first block</Link>
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className={`grid gap-8 pt-3${data.rows.isFetching || data.running ? " opacity-60 transition-opacity" : ""}`}>
            {pageRows(blocks).map((row) =>
              row.length === 2 ? (
                <div key={row[0]!.id} className="grid gap-8 md:grid-cols-2">
                  {row.map((block) => (
                    <div key={block.id} className="min-w-0">
                      {draw(block, isPhone ? PHONE : HALF)}
                    </div>
                  ))}
                </div>
              ) : (
                <div key={row[0]!.id} className="min-w-0">
                  {draw(row[0]!, isPhone ? PHONE : FULL)}
                </div>
              ),
            )}
          </div>
        )}
      </div>
    </>
  );
}
