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
import { fetchAttendance, fetchSites } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-client";
import { exportElementToPdf } from "@/lib/pdf";

export default function AttendanceHistoryPage() {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const createdId = searchParams.get("createdId");
  const batchDate = searchParams.get("batchDate");
  const batchShift = searchParams.get("batchShift");
  const batchSiteId = searchParams.get("batchSiteId");

  const [listSiteId, setListSiteId] = useState(searchParams.get("siteId") ?? "all");
  const [listStartDate, setListStartDate] = useState(
    searchParams.get("startDate") ?? format(subDays(new Date(), 6), "yyyy-MM-dd"),
  );
  const [listEndDate, setListEndDate] = useState(
    searchParams.get("endDate") ?? format(new Date(), "yyyy-MM-dd"),
  );
  const attendancePdfRef = useRef<HTMLDivElement>(null);

  const { data: sites, isLoading: sitesLoading, error: sitesError } = useQuery({
    queryKey: ["sites"],
    queryFn: fetchSites,
  });

  const activeListSiteId = listSiteId === "all" ? undefined : listSiteId;
  const {
    data: attendanceListData,
    isLoading: attendanceListLoading,
    error: attendanceListError,
  } = useQuery({
    queryKey: ["attendance", "list", activeListSiteId ?? "all", listStartDate, listEndDate],
    queryFn: () =>
      fetchAttendance({
        siteId: activeListSiteId,
        startDate: listStartDate,
        endDate: listEndDate,
        limit: 200,
      }),
    enabled: !!listStartDate && !!listEndDate,
  });

  const attendanceRecords = useMemo(() => attendanceListData?.data ?? [], [attendanceListData]);
  const activeListSiteName =
    listSiteId === "all"
      ? "All sites"
      : sites?.find((site) => site.id === listSiteId)?.name ?? "Selected site";

  const handleExport = async () => {
    if (!attendancePdfRef.current) return;
    try {
      await exportElementToPdf(
        attendancePdfRef.current,
        `attendance-${listStartDate}-to-${listEndDate}.pdf`,
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
        <Button size="sm" asChild variant="outline">
          <Link href="/attendance">New Attendance Entry</Link>
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleExport}
          disabled={attendanceListLoading || attendanceRecords.length === 0}
        >
          Export PDF
        </Button>
      </PageActions>

      <PageHeading title="Attendance Records" description="Review submitted attendance entries" />
      <RecordSavedBanner entityLabel="attendance submission" />

      {(sitesError || attendanceListError) && (
        <Alert variant="destructive">
          <AlertTitle>Unable to load attendance</AlertTitle>
          <AlertDescription>{getApiErrorMessage(sitesError || attendanceListError)}</AlertDescription>
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
          <CardTitle>Submitted Records</CardTitle>
        </CardHeader>
        <CardContent>
          {attendanceListLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : attendanceRecords.length === 0 ? (
            <div className="text-sm text-muted-foreground">No attendance records for this range.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="p-3 text-left font-semibold">Date</th>
                    <th className="p-3 text-left font-semibold">Shift</th>
                    <th className="p-3 text-left font-semibold">Site</th>
                    <th className="p-3 text-left font-semibold">Employee</th>
                    <th className="p-3 text-left font-semibold">Status</th>
                    <th className="p-3 text-left font-semibold">Overtime</th>
                  </tr>
                </thead>
                <tbody>
                  {attendanceRecords.map((record) => (
                    <tr
                      key={record.id}
                      className={`border-b ${
                        createdId &&
                        batchDate &&
                        batchShift &&
                        batchSiteId &&
                        format(new Date(record.date), "yyyy-MM-dd") === batchDate &&
                        record.shift === batchShift &&
                        record.site?.id === batchSiteId
                          ? "bg-[var(--status-success-bg)]"
                          : ""
                      }`}
                    >
                      <td className="p-3">{format(new Date(record.date), "MMM d, yyyy")}</td>
                      <td className="p-3">{record.shift}</td>
                      <td className="p-3">{record.site?.name}</td>
                      <td className="p-3">
                        <div className="font-semibold">{record.employee?.name}</div>
                        <div className="text-xs text-muted-foreground">{record.employee?.employeeId}</div>
                      </td>
                      <td className="p-3">{record.status}</td>
                      <td className="p-3">{record.overtime ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="absolute left-[-9999px] top-0">
        <div ref={attendancePdfRef}>
          <PdfTemplate
            title="Attendance Records"
            subtitle={`${listStartDate} to ${listEndDate}`}
            meta={[
              { label: "Site", value: activeListSiteName },
              { label: "Total records", value: String(attendanceRecords.length) },
            ]}
          >
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-200 text-left">
                  <th className="py-2">Date</th>
                  <th className="py-2">Shift</th>
                  <th className="py-2">Site</th>
                  <th className="py-2">Employee</th>
                  <th className="py-2">Status</th>
                  <th className="py-2">Overtime</th>
                </tr>
              </thead>
              <tbody>
                {attendanceRecords.map((record) => (
                  <tr key={record.id} className="border-b border-gray-100">
                    <td className="py-2">{format(new Date(record.date), "MMM d, yyyy")}</td>
                    <td className="py-2">{record.shift}</td>
                    <td className="py-2">{record.site?.name}</td>
                    <td className="py-2">
                      <div className="font-semibold">{record.employee?.name}</div>
                      <div className="text-[10px] text-gray-500">{record.employee?.employeeId}</div>
                    </td>
                    <td className="py-2">{record.status}</td>
                    <td className="py-2">{record.overtime ?? "-"}</td>
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
