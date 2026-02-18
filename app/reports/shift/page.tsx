"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import { format, subDays } from "date-fns";
import { useSearchParams } from "next/navigation";

import { PageActions } from "@/components/layout/page-actions";
import { PageHeading } from "@/components/layout/page-heading";
import { PdfTemplate } from "@/components/pdf/pdf-template";
import { RecordSavedBanner } from "@/components/shared/record-saved-banner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableQueryState } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { NumericCell } from "@/components/ui/numeric-cell";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import { fetchShiftReports, fetchSites } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-client";
import { exportElementToPdf } from "@/lib/pdf";

export default function ShiftReportHistoryPage() {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const createdId = searchParams.get("createdId");
  const [listSiteId, setListSiteId] = useState(searchParams.get("siteId") ?? "all");
  const [listStartDate, setListStartDate] = useState(
    searchParams.get("startDate") ?? format(subDays(new Date(), 6), "yyyy-MM-dd"),
  );
  const [listEndDate, setListEndDate] = useState(
    searchParams.get("endDate") ?? format(new Date(), "yyyy-MM-dd"),
  );
  const [queryState, setQueryState] = useState<DataTableQueryState>({
    mode: "paginated",
    page: 1,
    pageSize: 25,
    search: "",
  });
  const shiftReportPdfRef = useRef<HTMLDivElement>(null);

  const {
    data: sites,
    isLoading: sitesLoading,
    error: sitesError,
  } = useQuery({
    queryKey: ["sites"],
    queryFn: fetchSites,
  });

  const activeListSiteId = listSiteId === "all" ? "" : listSiteId;
  const {
    data: shiftReportsData,
    isLoading: shiftReportsLoading,
    error: shiftReportsError,
  } = useQuery({
    queryKey: [
      "shift-reports",
      "list",
      activeListSiteId || "all",
      listStartDate,
      listEndDate,
      queryState.search,
    ],
    queryFn: () =>
      fetchShiftReports({
        siteId: activeListSiteId || undefined,
        startDate: listStartDate,
        endDate: listEndDate,
        search: queryState.search?.trim() || undefined,
        limit: 200,
      }),
    enabled: !!listStartDate && !!listEndDate,
  });

  const shiftReportRecords = useMemo(() => shiftReportsData?.data ?? [], [shiftReportsData]);
  const activeListSiteName =
    listSiteId === "all"
      ? "All sites"
      : sites?.find((site) => site.id === listSiteId)?.name ?? "Selected site";
  const columns = useMemo<ColumnDef<(typeof shiftReportRecords)[number]>[]>(
    () => [
      {
        id: "date",
        header: "Date",
        accessorFn: (row) => row.date,
        cell: ({ row }) => (
          <div>
            <NumericCell align="left">{format(new Date(row.original.date), "MMM d, yyyy")}</NumericCell>
            {createdId === row.original.id ? <Badge variant="secondary">Saved</Badge> : null}
          </div>
        ),
      },
      { id: "shift", header: "Shift", accessorFn: (row) => row.shift, cell: ({ row }) => row.original.shift },
      { id: "site", header: "Site", accessorFn: (row) => row.site?.name ?? "", cell: ({ row }) => row.original.site?.name ?? "-" },
      { id: "workType", header: "Work Type", accessorFn: (row) => row.workType, cell: ({ row }) => row.original.workType },
      { id: "crew", header: "Crew", accessorFn: (row) => row.crewCount, cell: ({ row }) => <NumericCell>{row.original.crewCount}</NumericCell> },
      { id: "status", header: "Status", accessorFn: (row) => row.status, cell: ({ row }) => row.original.status },
    ],
    [createdId],
  );

  const handleExport = async () => {
    if (!shiftReportPdfRef.current) return;
    try {
      await exportElementToPdf(
        shiftReportPdfRef.current,
        `shift-reports-${listStartDate}-to-${listEndDate}.pdf`,
      );
    } catch (error) {
      toast({
        title: "PDF export failed",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    }
  };

  return (
    <div className="w-full space-y-6">
      <PageActions>
        <Button asChild size="sm" variant="outline">
          <Link href="/shift-report">New Shift Report</Link>
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleExport}
          disabled={shiftReportsLoading || shiftReportRecords.length === 0}
        >
          Export PDF
        </Button>
      </PageActions>

      <PageHeading title="Shift Reports" description="Review submitted shift reports" />
      <RecordSavedBanner entityLabel="shift report" />

      {(sitesError || shiftReportsError) && (
        <Alert variant="destructive">
          <AlertTitle>Unable to load shift reports</AlertTitle>
          <AlertDescription>{getApiErrorMessage(sitesError || shiftReportsError)}</AlertDescription>
        </Alert>
      )}

      <section className="space-y-3">
        <header className="section-shell space-y-1">
          <h2 className="text-section-title text-foreground font-bold tracking-tight">Submitted Reports</h2>
          <p className="text-sm text-muted-foreground">Filter by site and date range.</p>
        </header>
        {shiftReportsLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : shiftReportRecords.length === 0 ? (
          <div className="text-sm text-muted-foreground">No shift reports for this range.</div>
        ) : (
          <DataTable
            data={shiftReportRecords}
            columns={columns}
            queryState={queryState}
            onQueryStateChange={(next) => setQueryState((prev) => ({ ...prev, ...next }))}
            searchPlaceholder="Search site, work type, status"
            searchSubmitLabel="Search"
            tableClassName="text-sm"
            pagination={{ enabled: true }}
            toolbar={
              <>
                {sitesLoading ? (
                  <Skeleton className="h-8 w-[180px]" />
                ) : (
                  <Select
                    value={listSiteId}
                    onValueChange={(value) => {
                      setListSiteId(value);
                      setQueryState((prev) => ({ ...prev, page: 1 }));
                    }}
                  >
                    <SelectTrigger className="h-8 w-[180px]">
                      <SelectValue placeholder="Select site" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All sites</SelectItem>
                      {sites?.length ? (
                        sites.map((site) => (
                          <SelectItem key={site.id} value={site.id}>
                            {site.name}
                          </SelectItem>
                        ))
                      ) : (
                        <SelectItem value="no-sites" disabled>
                          No sites available
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                )}
                <Input
                  type="date"
                  value={listStartDate}
                  onChange={(event) => {
                    setListStartDate(event.target.value);
                    setQueryState((prev) => ({ ...prev, page: 1 }));
                  }}
                  className="h-8 w-[155px]"
                />
                <Input
                  type="date"
                  value={listEndDate}
                  onChange={(event) => {
                    setListEndDate(event.target.value);
                    setQueryState((prev) => ({ ...prev, page: 1 }));
                  }}
                  className="h-8 w-[155px]"
                />
              </>
            }
          />
        )}
      </section>

      <div className="absolute left-[-9999px] top-0">
        <div ref={shiftReportPdfRef}>
          <PdfTemplate
            title="Shift Reports"
            subtitle={`${listStartDate} to ${listEndDate}`}
            meta={[
              { label: "Site", value: activeListSiteName },
              { label: "Total reports", value: String(shiftReportRecords.length) },
            ]}
          >
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-200 text-left">
                  <th className="py-2">Date</th>
                  <th className="py-2">Shift</th>
                  <th className="py-2">Site</th>
                  <th className="py-2">Work Type</th>
                  <th className="py-2">Crew</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {shiftReportRecords.map((report) => (
                  <tr key={report.id} className="border-b border-gray-100">
                    <td className="py-2">{format(new Date(report.date), "MMM d, yyyy")}</td>
                    <td className="py-2">{report.shift}</td>
                    <td className="py-2">{report.site?.name}</td>
                    <td className="py-2">{report.workType}</td>
                    <td className="py-2">{report.crewCount}</td>
                    <td className="py-2">{report.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </PdfTemplate>
        </div>
      </div>
    </div>
  );
}


