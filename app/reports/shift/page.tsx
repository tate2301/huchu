"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, subDays } from "date-fns";
import { useSearchParams } from "next/navigation";

import { PageActions } from "@/components/layout/page-actions";
import { PageHeading } from "@/components/layout/page-heading";
import { PdfTemplate } from "@/components/pdf/pdf-template";
import { RecordSavedBanner } from "@/components/shared/record-saved-banner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import { fetchShiftReports, fetchSites } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-client";
import { exportElementToPdf } from "@/lib/pdf";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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
    queryKey: ["shift-reports", "list", activeListSiteId || "all", listStartDate, listEndDate],
    queryFn: () =>
      fetchShiftReports({
        siteId: activeListSiteId || undefined,
        startDate: listStartDate,
        endDate: listEndDate,
        limit: 200,
      }),
    enabled: !!listStartDate && !!listEndDate,
  });

  const shiftReportRecords = useMemo(() => shiftReportsData?.data ?? [], [shiftReportsData]);
  const activeListSiteName =
    listSiteId === "all"
      ? "All sites"
      : sites?.find((site) => site.id === listSiteId)?.name ?? "Selected site";

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
    <div className="mx-auto w-full max-w-6xl space-y-6">
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

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Filter by site and date range</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div className="md:col-span-2">
            <label className="mb-2 block text-sm font-semibold">Site</label>
            {sitesLoading ? (
              <Skeleton className="h-9 w-full" />
            ) : (
              <Select value={listSiteId} onValueChange={setListSiteId}>
                <SelectTrigger className="w-full">
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
          </div>
          <div>
            <label className="mb-2 block text-sm font-semibold">Start Date</label>
            <Input type="date" value={listStartDate} onChange={(event) => setListStartDate(event.target.value)} />
          </div>
          <div>
            <label className="mb-2 block text-sm font-semibold">End Date</label>
            <Input type="date" value={listEndDate} onChange={(event) => setListEndDate(event.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Submitted Reports</CardTitle>
        </CardHeader>
        <CardContent>
          {shiftReportsLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : shiftReportRecords.length === 0 ? (
            <div className="text-sm text-muted-foreground">No shift reports for this range.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="w-full text-sm">
                <TableHeader className="bg-muted">
                  <TableRow>
                    <TableHead className="p-3 text-left font-semibold">Date</TableHead>
                    <TableHead className="p-3 text-left font-semibold">Shift</TableHead>
                    <TableHead className="p-3 text-left font-semibold">Site</TableHead>
                    <TableHead className="p-3 text-left font-semibold">Work Type</TableHead>
                    <TableHead className="p-3 text-left font-semibold">Crew</TableHead>
                    <TableHead className="p-3 text-left font-semibold">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shiftReportRecords.map((report) => (
                    <TableRow
                      key={report.id}
                      className={`border-b ${createdId === report.id ? "bg-[var(--status-success-bg)]" : ""}`}
                    >
                      <TableCell className="p-3">{format(new Date(report.date), "MMM d, yyyy")}</TableCell>
                      <TableCell className="p-3">{report.shift}</TableCell>
                      <TableCell className="p-3">{report.site?.name}</TableCell>
                      <TableCell className="p-3">{report.workType}</TableCell>
                      <TableCell className="p-3">{report.crewCount}</TableCell>
                      <TableCell className="p-3">{report.status}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

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


