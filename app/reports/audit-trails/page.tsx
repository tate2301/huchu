"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, startOfYear, subDays } from "date-fns";

import { FormPage, HeaderAction } from "@/components/management/ui";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  fetchGoldCorrections,
  fetchSites,
  fetchStockMovements,
  fetchWorkOrders,
} from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-client";
import { Download } from "@/lib/icons";

import { ANY, AuditFilters, type AuditRange } from "./_components/audit-filters";
import {
  buildAuditEvents,
  toCsv,
  type AuditLogEvent,
  type AuditModule,
} from "./_components/audit-events";
import { AuditLog } from "./_components/audit-log";

/** How many rows the log opens with, and how many each "Show more" adds. */
const PAGE_SIZE = 50;

const MODULES: AuditModule[] = ["GOLD", "STORES", "MAINTENANCE"];

/**
 * The full audit log — `Audit.dc.html`.
 *
 * Ten registers now end their Activity section with a "The full log" link
 * pointing here, and this is where that link lands: the same rows, the same
 * mono event chips and the same payload panel as the trail on a record, on a
 * page of their own.
 *
 * **Presentation only.** All four queries keep their keys, their fetchers and
 * their parameters, and the route keeps its gate — `/reports/audit-trails` is
 * behind the `reports.audit-trails` feature key in
 * `lib/platform/gating/route-registry.ts`, which is a route-level gate this
 * file has never asserted and still does not.
 *
 * What the board draws and this page does not:
 *
 *   - **the green "Chain verified to the first event" shield.** The three
 *     endpoints behind this page return domain rows, not `PlatformAuditEvent`,
 *     so no `prevEventHash` reaches the client and nothing walks one.
 *     `lib/audit/platform.ts` is explicit that arrival order is not the chain.
 *     Asserting tamper evidence off the order rows happened to arrive in is
 *     the one thing that footer must never do, so the footer carries the pager
 *     count alone. See `_components/audit-events.ts`.
 *
 * What the board draws and the old page did not: the title line inside the
 * centred 620 column with its one labelled verb, the subject chip, day
 * grouping, and the payload diff. The `text-sm` `DataTable`, the `Badge`
 * module chips and the "N audit events" helper paragraph are all gone — the
 * count lives on the day headings and in the pager, where the board puts it.
 */
export default function AuditTrailsReportPage() {
  const queryClient = useQueryClient();

  const [siteId, setSiteId] = useState(ANY);
  const [actorFilter, setActorFilter] = useState(ANY);
  const [eventFilter, setEventFilter] = useState(ANY);
  const [range, setRange] = useState<AuditRange>("30");
  const [visible, setVisible] = useState(PAGE_SIZE);

  const {
    data: sites,
    isLoading: sitesLoading,
    error: sitesError,
  } = useQuery({
    queryKey: ["sites"],
    queryFn: fetchSites,
  });

  const activeSiteId = siteId === ANY ? undefined : siteId;

  const {
    data: correctionsData,
    isLoading: correctionsLoading,
    error: correctionsError,
  } = useQuery({
    queryKey: ["gold-corrections", "audit-reports", activeSiteId ?? "all"],
    queryFn: () => fetchGoldCorrections({ siteId: activeSiteId, limit: 500 }),
  });
  const {
    data: movementsData,
    isLoading: movementsLoading,
    error: movementsError,
  } = useQuery({
    queryKey: ["stock-movements", "audit-reports", activeSiteId ?? "all"],
    queryFn: () => fetchStockMovements({ siteId: activeSiteId, limit: 500 }),
  });
  const {
    data: workOrdersData,
    isLoading: workOrdersLoading,
    error: workOrdersError,
  } = useQuery({
    queryKey: ["work-orders", "audit-reports", activeSiteId ?? "all"],
    queryFn: () => fetchWorkOrders({ siteId: activeSiteId, limit: 500 }),
  });

  const rows = useMemo<AuditLogEvent[]>(
    () =>
      buildAuditEvents({
        corrections: correctionsData?.data ?? [],
        movements: movementsData?.data ?? [],
        workOrders: workOrdersData?.data ?? [],
      }),
    [correctionsData, movementsData, workOrdersData],
  );

  const bounds = useMemo(() => {
    const now = new Date();
    const end = format(now, "yyyy-MM-dd");
    if (range === "all") return { start: null as string | null, end };
    if (range === "year") return { start: format(startOfYear(now), "yyyy-MM-dd"), end };
    return { start: format(subDays(now, Number(range)), "yyyy-MM-dd"), end };
  }, [range]);

  const filteredRows = useMemo(
    () =>
      rows.filter((row) => {
        const day = format(new Date(row.createdAt), "yyyy-MM-dd");
        if (bounds.start && day < bounds.start) return false;
        if (day > bounds.end) return false;
        if (actorFilter !== ANY && row.actor !== actorFilter) return false;
        // One control, two questions: a module matches every row from that
        // register, a full event type matches only its own.
        if (
          eventFilter !== ANY &&
          eventFilter !== row.module &&
          eventFilter !== row.eventType
        ) {
          return false;
        }
        return true;
      }),
    [rows, bounds, actorFilter, eventFilter],
  );

  const actorOptions = useMemo(
    () =>
      Array.from(
        new Set(rows.map((row) => row.actor).filter((actor): actor is string => Boolean(actor))),
      ).sort((a, b) => a.localeCompare(b)),
    [rows],
  );

  const moduleOptions = useMemo(
    () => MODULES.filter((module) => rows.some((row) => row.module === module)),
    [rows],
  );

  const eventTypeOptions = useMemo(
    () => Array.from(new Set(rows.map((row) => row.eventType))).sort((a, b) => a.localeCompare(b)),
    [rows],
  );

  const isLoading = correctionsLoading || movementsLoading || workOrdersLoading;
  const pageError = sitesError || correctionsError || movementsError || workOrdersError;

  /** Every filter change rewinds the pager; a stale offset reads as missing rows. */
  function rewind<T>(set: (value: T) => void) {
    return (value: T) => {
      set(value);
      setVisible(PAGE_SIZE);
    };
  }

  function download(contents: string, type: string, extension: string) {
    const blob = new Blob([contents], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `audit-log-${format(new Date(), "yyyy-MM-dd")}.${extension}`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  // Rule 9: hide an invalid action, never disable it. With nothing in the
  // window there is nothing to export, so neither export verb is drawn.
  const exportable = filteredRows.length > 0;

  return (
    <FormPage
      width={620}
      title="Activity"
      action={
        exportable ? (
          <HeaderAction
            icon={Download}
            onClick={() => download(toCsv(filteredRows), "text/csv;charset=utf-8", "csv")}
          >
            Export
          </HeaderAction>
        ) : undefined
      }
      overflow={
        <>
          {exportable ? (
            <DropdownMenuItem
              onSelect={() =>
                download(
                  JSON.stringify(filteredRows, null, 2),
                  "application/json;charset=utf-8",
                  "json",
                )
              }
            >
              Export as JSON
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem
            onSelect={() => {
              void queryClient.invalidateQueries({ queryKey: ["gold-corrections"] });
              void queryClient.invalidateQueries({ queryKey: ["stock-movements"] });
              void queryClient.invalidateQueries({ queryKey: ["work-orders"] });
            }}
          >
            Refresh
          </DropdownMenuItem>
        </>
      }
    >
      {pageError ? (
        <Alert variant="destructive" className="mt-5">
          <AlertTitle>Unable to load the audit log</AlertTitle>
          <AlertDescription>{getApiErrorMessage(pageError)}</AlertDescription>
        </Alert>
      ) : null}

      <AuditFilters
        sites={sites}
        sitesLoading={sitesLoading}
        siteId={siteId}
        onSiteChange={rewind(setSiteId)}
        actor={actorFilter}
        actorOptions={actorOptions}
        onActorChange={rewind(setActorFilter)}
        event={eventFilter}
        moduleOptions={moduleOptions}
        eventTypeOptions={eventTypeOptions}
        onEventChange={rewind(setEventFilter)}
        range={range}
        onRangeChange={rewind(setRange)}
      />

      {isLoading ? (
        <div className="mt-[22px] space-y-4" aria-busy="true">
          {[0, 1, 2, 3, 4].map((row) => (
            <div key={row} className="flex gap-3">
              <Skeleton className="size-7 shrink-0 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-1/2" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredRows.length === 0 ? (
        <p className="mt-[22px] text-[13px] leading-[1.5] text-[#5E6573]">
          Nothing in this window.
        </p>
      ) : (
        <AuditLog
          events={filteredRows.slice(0, visible)}
          total={filteredRows.length}
          showSite={siteId === ANY}
          onShowMore={
            visible < filteredRows.length
              ? () => setVisible((current) => current + PAGE_SIZE)
              : undefined
          }
        />
      )}
    </FormPage>
  );
}
