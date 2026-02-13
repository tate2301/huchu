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
import { fetchPlantReports, fetchSites } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-client";
import { exportElementToPdf } from "@/lib/pdf";

export default function PlantReportHistoryPage() {
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
  const plantReportPdfRef = useRef<HTMLDivElement>(null);

  const { data: sites, isLoading: sitesLoading, error: sitesError } = useQuery({
    queryKey: ["sites"],
    queryFn: fetchSites,
  });

  const activeListSiteId = listSiteId === "all" ? "" : listSiteId;
  const {
    data: plantReportsData,
    isLoading: plantReportsLoading,
    error: plantReportsError,
  } = useQuery({
    queryKey: ["plant-reports", "list", activeListSiteId || "all", listStartDate, listEndDate],
    queryFn: () =>
      fetchPlantReports({
        siteId: activeListSiteId || undefined,
        startDate: listStartDate,
        endDate: listEndDate,
        limit: 200,
      }),
    enabled: !!listStartDate && !!listEndDate,
  });

  const plantReportRecords = useMemo(() => plantReportsData?.data ?? [], [plantReportsData]);
  const activeListSiteName =
    listSiteId === "all"
      ? "All sites"
      : sites?.find((site) => site.id === listSiteId)?.name ?? "Selected site";
  const columns = useMemo<ColumnDef<(typeof plantReportRecords)[number]>[]>(
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
      { id: "site", header: "Site", accessorFn: (row) => row.site?.name ?? "", cell: ({ row }) => row.original.site?.name ?? "-" },
      {
        id: "tonnes",
        header: "Tonnes Processed",
        accessorFn: (row) => row.tonnesProcessed ?? 0,
        cell: ({ row }) => <NumericCell>{(row.original.tonnesProcessed ?? 0).toFixed(1)}</NumericCell>,
      },
      {
        id: "runHours",
        header: "Run Hours",
        accessorFn: (row) => row.runHours ?? 0,
        cell: ({ row }) => <NumericCell>{(row.original.runHours ?? 0).toFixed(1)}</NumericCell>,
      },
      {
        id: "goldRecovered",
        header: "Gold Recovered",
        accessorFn: (row) => row.goldRecovered ?? 0,
        cell: ({ row }) => <NumericCell>{(row.original.goldRecovered ?? 0).toFixed(2)}</NumericCell>,
      },
      {
        id: "downtime",
        header: "Downtime",
        accessorFn: (row) =>
          row.downtimeEvents?.reduce((sum, event) => sum + event.durationHours, 0) ?? 0,
        cell: ({ row }) => {
          const downtimeHours =
            row.original.downtimeEvents?.reduce((sum, event) => sum + event.durationHours, 0) ?? 0;
          return <NumericCell>{downtimeHours.toFixed(1)}h</NumericCell>;
        },
      },
    ],
    [createdId],
  );

  const handleExport = async () => {
    if (!plantReportPdfRef.current) return;
    try {
      await exportElementToPdf(
        plantReportPdfRef.current,
        `plant-reports-${listStartDate}-to-${listEndDate}.pdf`,
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
        <Button size="sm" asChild variant="outline">
          <Link href="/plant-report">New Plant Report</Link>
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleExport}
          disabled={plantReportsLoading || plantReportRecords.length === 0}
        >
          Export PDF
        </Button>
      </PageActions>

      <PageHeading title="Plant Reports" description="Review submitted plant reports" />
      <RecordSavedBanner entityLabel="plant report" />

      {(sitesError || plantReportsError) && (
        <Alert variant="destructive">
          <AlertTitle>Unable to load plant reports</AlertTitle>
          <AlertDescription>{getApiErrorMessage(sitesError || plantReportsError)}</AlertDescription>
        </Alert>
      )}

      <section className="space-y-3">
        <header className="section-shell space-y-1">
          <h2 className="text-section-title text-foreground font-bold tracking-tight">Submitted Reports</h2>
          <p className="text-sm text-muted-foreground">Filter by site and date range.</p>
        </header>
        {plantReportsLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : plantReportRecords.length === 0 ? (
          <div className="text-sm text-muted-foreground">No plant reports for this range.</div>
        ) : (
          <DataTable
            data={plantReportRecords}
            columns={columns}
            queryState={queryState}
            onQueryStateChange={(next) => setQueryState((prev) => ({ ...prev, ...next }))}
            searchPlaceholder="Search site, shift, status"
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
        <div ref={plantReportPdfRef}>
          <PdfTemplate
            title="Plant Reports"
            subtitle={`${listStartDate} to ${listEndDate}`}
            meta={[
              { label: "Site", value: activeListSiteName },
              { label: "Total reports", value: String(plantReportRecords.length) },
            ]}
          >
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-200 text-left">
                  <th className="py-2">Date</th>
                  <th className="py-2">Site</th>
                  <th className="py-2">Tonnes Processed</th>
                  <th className="py-2">Run Hours</th>
                  <th className="py-2">Gold Recovered</th>
                  <th className="py-2">Downtime</th>
                </tr>
              </thead>
              <tbody>
                {plantReportRecords.map((report) => {
                  const downtimeHours =
                    report.downtimeEvents?.reduce((sum, event) => sum + event.durationHours, 0) ?? 0;
                  return (
                    <tr key={report.id} className="border-b border-gray-100">
                      <td className="py-2">{format(new Date(report.date), "MMM d, yyyy")}</td>
                      <td className="py-2">{report.site?.name}</td>
                      <td className="py-2">{(report.tonnesProcessed ?? 0).toFixed(1)}</td>
                      <td className="py-2">{(report.runHours ?? 0).toFixed(1)}</td>
                      <td className="py-2">{(report.goldRecovered ?? 0).toFixed(2)}</td>
                      <td className="py-2">{downtimeHours.toFixed(1)}h</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </PdfTemplate>
        </div>
      </div>
    </div>
  );
}


