"use client";

import Link from "next/link";
import { useCallback, useMemo, useRef, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, subDays } from "date-fns";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";

import { PageActions } from "@/components/layout/page-actions";
import { PageHeading } from "@/components/layout/page-heading";
import { PdfTemplate } from "@/components/pdf/pdf-template";
import { RecordSavedBanner } from "@/components/shared/record-saved-banner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  type DataTableQueryState,
} from "@/components/ui/data-table";
import { ExportMenu } from "@/components/ui/export-menu";
import { Input } from "@/components/ui/input";
import { NumericCell } from "@/components/ui/numeric-cell";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import { fetchAttendance, fetchSites, type AttendanceRecord } from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { type DocumentExportFormat } from "@/lib/documents/export-client";
import { exportElementToDocument } from "@/lib/pdf";

export default function AttendanceHistoryPage() {
  const { data: session } = useSession();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const createdId = searchParams.get("createdId");
  const batchDate = searchParams.get("batchDate");
  const batchShift = searchParams.get("batchShift");
  const batchSiteId = searchParams.get("batchSiteId");
  const sessionRole = (session?.user as { role?: string } | undefined)?.role;
  const isSuperAdmin = sessionRole === "SUPERADMIN";

  const [listSiteId, setListSiteId] = useState(
    searchParams.get("siteId") ?? "all",
  );
  const [listStartDate, setListStartDate] = useState(
    searchParams.get("startDate") ??
      format(subDays(new Date(), 6), "yyyy-MM-dd"),
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

  const {
    data: sites,
    isLoading: sitesLoading,
    error: sitesError,
  } = useQuery({
    queryKey: ["sites"],
    queryFn: fetchSites,
  });

  const activeListSiteId = listSiteId === "all" ? undefined : listSiteId;
  const {
    data: attendanceListData,
    isLoading: attendanceListLoading,
    error: attendanceListError,
  } = useQuery({
    queryKey: [
      "attendance",
      "list",
      activeListSiteId ?? "all",
      listStartDate,
      listEndDate,
      queryState.search,
    ],
    queryFn: () =>
      fetchAttendance({
        siteId: activeListSiteId,
        startDate: listStartDate,
        endDate: listEndDate,
        search: queryState.search?.trim() || undefined,
        limit: 200,
      }),
    enabled: !!listStartDate && !!listEndDate,
  });

  const attendanceRecords = useMemo(
    () => attendanceListData?.data ?? [],
    [attendanceListData],
  );

  const updateAttendanceMutation = useMutation({
    mutationFn: (payload: {
      id: string;
      data: {
        status?: "PRESENT" | "ABSENT" | "LATE";
        overtime?: number | null;
        notes?: string | null;
      };
    }) =>
      fetchJson<AttendanceRecord>(`/api/attendance/${payload.id}`, {
        method: "PATCH",
        body: JSON.stringify(payload.data),
      }),
    onSuccess: () => {
      toast({ title: "Attendance updated", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
    },
    onError: (error) =>
      toast({
        title: "Unable to update attendance",
        description: getApiErrorMessage(error),
        variant: "destructive",
      }),
  });

  const deleteAttendanceMutation = useMutation({
    mutationFn: (id: string) =>
      fetchJson<{ success: boolean; deleted?: boolean }>(
        `/api/attendance/${id}`,
        {
          method: "DELETE",
        },
      ),
    onSuccess: () => {
      toast({ title: "Attendance record deleted", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
    },
    onError: (error) =>
      toast({
        title: "Unable to delete attendance",
        description: getApiErrorMessage(error),
        variant: "destructive",
      }),
  });

  const handleEditAttendance = useCallback(
    (record: AttendanceRecord) => {
      const statusInput = window.prompt(
        "Status (PRESENT, ABSENT, LATE)",
        record.status,
      );
      if (statusInput === null) return;
      const normalizedStatus = statusInput.trim().toUpperCase();
      if (!["PRESENT", "ABSENT", "LATE"].includes(normalizedStatus)) {
        toast({
          title: "Invalid status",
          description: "Use PRESENT, ABSENT, or LATE.",
          variant: "destructive",
        });
        return;
      }

      const overtimeInput = window.prompt(
        "Overtime hours (blank to clear)",
        record.overtime == null ? "" : String(record.overtime),
      );
      if (overtimeInput === null) return;
      const overtimeTrimmed = overtimeInput.trim();
      const overtimeValue =
        overtimeTrimmed === "" ? null : Number.parseFloat(overtimeTrimmed);

      if (
        overtimeValue !== null &&
        (!Number.isFinite(overtimeValue) ||
          overtimeValue < 0 ||
          overtimeValue > 24)
      ) {
        toast({
          title: "Invalid overtime",
          description: "Overtime must be a number between 0 and 24.",
          variant: "destructive",
        });
        return;
      }

      const notesInput = window.prompt(
        "Notes (blank to clear)",
        record.notes ?? "",
      );
      if (notesInput === null) return;

      updateAttendanceMutation.mutate({
        id: record.id,
        data: {
          status: normalizedStatus as "PRESENT" | "ABSENT" | "LATE",
          overtime: overtimeValue,
          notes: notesInput.trim() ? notesInput : null,
        },
      });
    },
    [toast, updateAttendanceMutation],
  );

  const handleDeleteAttendance = useCallback(
    (record: AttendanceRecord) => {
      const confirmed = window.confirm(
        `Delete attendance for ${record.employee?.name ?? "employee"} on ${format(
          new Date(record.date),
          "yyyy-MM-dd",
        )}?`,
      );
      if (!confirmed) return;
      deleteAttendanceMutation.mutate(record.id);
    },
    [deleteAttendanceMutation],
  );

  const activeListSiteName =
    listSiteId === "all"
      ? "All sites"
      : (sites?.find((site) => site.id === listSiteId)?.name ??
        "Selected site");
  const columns = useMemo<ColumnDef<AttendanceRecord>[]>(() => {
    const baseColumns: ColumnDef<AttendanceRecord>[] = [
      {
        id: "date",
        header: "Date",
        accessorFn: (row) => row.date,
        cell: ({ row }) => (
          <div>
            <NumericCell align="left">
              {format(new Date(row.original.date), "MMM d, yyyy")}
            </NumericCell>
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
        size: 128,
        minSize: 128,
        maxSize: 128,
      },
      {
        id: "shift",
        header: "Shift",
        accessorFn: (row) => row.shift,
        cell: ({ row }) => row.original.shift,
        size: 280,
        minSize: 220,
        maxSize: 420,
      },
      {
        id: "site",
        header: "Site",
        accessorFn: (row) => row.site?.name ?? "",
        cell: ({ row }) => row.original.site?.name ?? "-",
        size: 160,
        minSize: 160,
        maxSize: 160,
      },
      {
        id: "group",
        header: "Group",
        accessorFn: (row) => row.shiftGroup?.name ?? "",
        cell: ({ row }) => row.original.shiftGroup?.name ?? "-",
        size: 160,
        minSize: 160,
        maxSize: 160,
      },
      {
        id: "leader",
        header: "Shift Leader",
        accessorFn: (row) => row.shiftLeaderName ?? "",
        cell: ({ row }) => row.original.shiftLeaderName ?? "-",
        size: 160,
        minSize: 160,
        maxSize: 160,
      },
      {
        id: "employee",
        header: "Employee",
        accessorFn: (row) =>
          `${row.employee?.name ?? ""} ${row.employee?.employeeId ?? ""}`,
        cell: ({ row }) => (
          <div>
            <div className="font-semibold">{row.original.employee?.name}</div>
            <div className="text-xs text-muted-foreground">
              {row.original.employee?.employeeId}
            </div>
          </div>
        ),
        size: 160,
        minSize: 160,
        maxSize: 160,
      },
      {
        id: "status",
        header: "Status",
        accessorFn: (row) => row.status,
        cell: ({ row }) => row.original.status,
        size: 120,
        minSize: 120,
        maxSize: 120,
      },
      {
        id: "overtime",
        header: "Overtime",
        accessorFn: (row) => row.overtime ?? "",
        cell: ({ row }) => (
          <NumericCell>{row.original.overtime ?? "-"}</NumericCell>
        ),
        size: 160,
        minSize: 160,
        maxSize: 160,
      },
    ];

    if (isSuperAdmin) {
      baseColumns.push({
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleEditAttendance(row.original)}
              disabled={
                updateAttendanceMutation.isPending ||
                deleteAttendanceMutation.isPending
              }
            >
              Edit
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => handleDeleteAttendance(row.original)}
              disabled={
                updateAttendanceMutation.isPending ||
                deleteAttendanceMutation.isPending
              }
            >
              Delete
            </Button>
          </div>
        ),
        size: 160,
        minSize: 160,
        maxSize: 160,
      });
    }

    return baseColumns;
  }, [
    batchDate,
    batchShift,
    batchSiteId,
    createdId,
    isSuperAdmin,
    updateAttendanceMutation.isPending,
    deleteAttendanceMutation.isPending,
    handleEditAttendance,
    handleDeleteAttendance,
  ]);

  const handleExport = async (format: DocumentExportFormat) => {
    if (!attendancePdfRef.current) return;
    try {
      await exportElementToDocument(
        attendancePdfRef.current,
        `attendance-${listStartDate}-to-${listEndDate}.${format}`,
        format,
      );
    } catch (error) {
      toast({
        title: `${format.toUpperCase()} export failed`,
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    }
  };

  return (
    <div className="w-full space-y-6">
      <PageActions>
        {isSuperAdmin ? (
          <Button size="sm" asChild variant="outline">
            <Link href="/attendance">New Attendance Entry</Link>
          </Button>
        ) : null}
        <ExportMenu
          variant="outline"
          size="sm"
          onExport={handleExport}
          disabled={attendanceListLoading || attendanceRecords.length === 0}
        />
      </PageActions>

      <PageHeading
        title="Attendance Records"
        description="Review submitted attendance entries"
      />
      <RecordSavedBanner entityLabel="attendance submission" />
      {!isSuperAdmin ? (
        <Alert>
          <AlertTitle>Read-only access</AlertTitle>
          <AlertDescription>
            Only SUPERADMIN can create, edit, or delete attendance records for
            backfilling.
          </AlertDescription>
        </Alert>
      ) : null}

      {(sitesError || attendanceListError) && (
        <Alert variant="destructive">
          <AlertTitle>Unable to load attendance</AlertTitle>
          <AlertDescription>
            {getApiErrorMessage(sitesError || attendanceListError)}
          </AlertDescription>
        </Alert>
      )}

      <section className="space-y-3">
        <header className="space-y-1">
          <h2 className="text-section-title text-foreground font-bold tracking-tight">
            Submitted Records
          </h2>
          <p className="text-sm text-muted-foreground">
            Filter by site and date range.
          </p>
        </header>
        {attendanceListLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : attendanceRecords.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            No attendance records for this range.
          </div>
        ) : (
          <DataTable
            data={attendanceRecords}
            columns={columns}
            queryState={queryState}
            onQueryStateChange={(next) =>
              setQueryState((prev) => ({ ...prev, ...next }))
            }
            searchPlaceholder="Search employee, group, leader, shift, status"
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
              {
                label: "Total records",
                value: String(attendanceRecords.length),
              },
            ]}
          >
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-200 text-left">
                  <th className="py-2">Date</th>
                  <th className="py-2">Shift</th>
                  <th className="py-2">Site</th>
                  <th className="py-2">Group</th>
                  <th className="py-2">Shift Leader</th>
                  <th className="py-2">Employee</th>
                  <th className="py-2">Status</th>
                  <th className="py-2">Overtime</th>
                </tr>
              </thead>
              <tbody>
                {attendanceRecords.map((record) => (
                  <tr key={record.id} className="border-b border-gray-100">
                    <td className="py-2">
                      {format(new Date(record.date), "MMM d, yyyy")}
                    </td>
                    <td className="py-2">{record.shift}</td>
                    <td className="py-2">{record.site?.name}</td>
                    <td className="py-2">{record.shiftGroup?.name ?? "-"}</td>
                    <td className="py-2">{record.shiftLeaderName ?? "-"}</td>
                    <td className="py-2">
                      <div className="font-semibold">
                        {record.employee?.name}
                      </div>
                      <div className="text-[10px] text-gray-500">
                        {record.employee?.employeeId}
                      </div>
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
