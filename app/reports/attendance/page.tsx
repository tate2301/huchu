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
  const [queryState, setQueryState] = useState<DataTableQueryState>({
    mode: "paginated",
    page: 1,
    pageSize: 25,
    search: "",
  });
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
  const columns = useMemo<ColumnDef<(typeof attendanceRecords)[number]>[]>(
    () => [
      {
        id: "date",
        header: "Date",
        accessorFn: (row) => row.date,
        cell: ({ row }) => (
          <div>
            <NumericCell>{format(new Date(row.original.date), "MMM d, yyyy")}</NumericCell>
            {createdId &&
            batchDate &&
            batchShift &&
            batchSiteId &&
            format(new Date(row.original.date), "yyyy-MM-dd") === batchDate &&
            row.original.shift === batchShift &&
            row.original.site?.id === batchSiteId ? (
              <Badge variant="secondary">Saved</Badge>
            ) : null}
          </div>
        ),
      },
      {
        id: "shift",
        header: "Shift",
        accessorFn: (row) => row.shift,
        cell: ({ row }) => row.original.shift,
      },
      {
        id: "site",
        header: "Site",
        accessorFn: (row) => row.site?.name ?? "",
        cell: ({ row }) => row.original.site?.name ?? "-",
      },
      {
        id: "employee",
        header: "Employee",
        accessorFn: (row) => `${row.employee?.name ?? ""} ${row.employee?.employeeId ?? ""}`,
        cell: ({ row }) => (
          <div>
            <div className="font-semibold">{row.original.employee?.name}</div>
            <div className="text-xs text-muted-foreground">{row.original.employee?.employeeId}</div>
          </div>
        ),
      },
      {
        id: "status",
        header: "Status",
        accessorFn: (row) => row.status,
        cell: ({ row }) => row.original.status,
      },
      {
        id: "overtime",
        header: "Overtime",
        accessorFn: (row) => row.overtime ?? "",
        cell: ({ row }) => <NumericCell>{row.original.overtime ?? "-"}</NumericCell>,
      },
    ],
    [batchDate, batchShift, batchSiteId, createdId],
  );

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
    <div className="w-full space-y-6">
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

      <section className="space-y-3">
        <header className="section-shell space-y-1">
          <h2 className="text-section-title text-foreground font-bold tracking-tight">Submitted Records</h2>
          <p className="text-sm text-muted-foreground">Filter by site and date range.</p>
        </header>
        {attendanceListLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : attendanceRecords.length === 0 ? (
          <div className="text-sm text-muted-foreground">No attendance records for this range.</div>
        ) : (
          <DataTable
            data={attendanceRecords}
            columns={columns}
            queryState={queryState}
            onQueryStateChange={(next) => setQueryState((prev) => ({ ...prev, ...next }))}
            searchPlaceholder="Search employee, shift, status"
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


