"use client";

import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { NumericCell } from "@/components/ui/numeric-cell";
import { VerticalDataViews } from "@/components/ui/vertical-data-views";
import { getApiErrorMessage } from "@/lib/api-client";
import { fetchStudentPortalData, type StudentPortalData } from "@/lib/schools/portal-v2";

type StudentPortalView =
  | "enrollments"
  | "attendance"
  | "results"
  | "boarding"
  | "guardians"
  | "fees"
  | "notices";

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toISOString().slice(0, 10);
}

function enrollmentStatusBadge(status: string) {
  if (status === "ACTIVE") return <Badge variant="secondary">Active</Badge>;
  if (status === "COMPLETED") return <Badge variant="outline">Completed</Badge>;
  if (status === "WITHDRAWN") return <Badge variant="destructive">Withdrawn</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}

function boardingStatusBadge(status: string) {
  if (status === "ACTIVE") return <Badge variant="secondary">Active</Badge>;
  if (status === "TRANSFERRED") return <Badge variant="outline">Transferred</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}

export function StudentPortalContent() {
  const [activeView, setActiveView] = useState<StudentPortalView>("enrollments");

  const query = useQuery({
    queryKey: ["schools", "portal", "student"],
    queryFn: () => fetchStudentPortalData(),
  });

  const enrollmentsRows = useMemo(() => query.data?.enrollments ?? [], [query.data]);
  const attendanceRows = useMemo(() => query.data?.attendance ?? [], [query.data]);
  const resultsRows = useMemo(() => query.data?.results ?? [], [query.data]);
  const boardingRows = useMemo(() => query.data?.boarding ?? [], [query.data]);
  const guardiansRows = useMemo(() => query.data?.guardians ?? [], [query.data]);
  const feesRows = useMemo(() => query.data?.fees ?? [], [query.data]);
  const noticesRows = useMemo(() => query.data?.notices ?? [], [query.data]);

  const enrollmentColumns = useMemo<
    ColumnDef<StudentPortalData["enrollments"][number]>[]
  >(
    () => [
      {
        id: "term",
        header: "Term",
        cell: ({ row }) => row.original.term.name,
      },
      {
        id: "class",
        header: "Class / Stream",
        cell: ({ row }) => (
          <div>
            <div>{row.original.class.name}</div>
            <div className="text-xs text-muted-foreground">
              {row.original.stream?.name ?? "No stream"}
            </div>
          </div>
        ),
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => enrollmentStatusBadge(row.original.status),
      },
      {
        id: "start",
        header: "Enrolled",
        cell: ({ row }) => <NumericCell>{formatDate(row.original.enrolledAt)}</NumericCell>,
      },
      {
        id: "end",
        header: "Ended",
        cell: ({ row }) => <NumericCell>{formatDate(row.original.endedAt)}</NumericCell>,
      },
    ],
    [],
  );

  const resultColumns = useMemo<ColumnDef<StudentPortalData["results"][number]>[]>(
    () => [
      {
        id: "published",
        header: "Published",
        cell: ({ row }) => <NumericCell>{formatDate(row.original.sheet.publishedAt)}</NumericCell>,
      },
      {
        id: "sheet",
        header: "Sheet",
        cell: ({ row }) => (
          <div>
            <div>{row.original.sheet.title}</div>
            <div className="text-xs text-muted-foreground">
              {row.original.sheet.term.name} / {row.original.sheet.class.name}
            </div>
          </div>
        ),
      },
      {
        id: "subject",
        header: "Subject",
        cell: ({ row }) => <NumericCell align="left">{row.original.subjectCode}</NumericCell>,
      },
      {
        id: "score",
        header: "Score",
        cell: ({ row }) => <NumericCell>{row.original.score.toFixed(2)}</NumericCell>,
      },
      {
        id: "grade",
        header: "Grade",
        cell: ({ row }) =>
          row.original.grade ? <Badge variant="outline">{row.original.grade}</Badge> : "-",
      },
    ],
    [],
  );

  const attendanceColumns = useMemo<
    ColumnDef<StudentPortalData["attendance"][number]>[]
  >(
    () => [
      {
        id: "student",
        header: "Student",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.studentName}</div>
            <div className="text-xs text-muted-foreground font-mono">
              {row.original.studentNo}
            </div>
          </div>
        ),
      },
      {
        id: "class",
        header: "Class / Stream",
        cell: ({ row }) => (
          <span>
            {row.original.className ?? "-"}
            {row.original.streamName ? ` / ${row.original.streamName}` : ""}
          </span>
        ),
      },
      {
        id: "activeEnrollment",
        header: "Enrollment",
        cell: ({ row }) => (
          <Badge variant={row.original.activeEnrollment ? "secondary" : "outline"}>
            {row.original.activeEnrollment ? "Active" : "Inactive"}
          </Badge>
        ),
      },
      {
        id: "enrollmentRecords",
        header: "Enrollment Rows",
        cell: ({ row }) => <NumericCell>{row.original.enrollmentRecords}</NumericCell>,
      },
      {
        id: "boarding",
        header: "Boarding",
        cell: ({ row }) => (
          <Badge variant={row.original.isBoarding ? "secondary" : "outline"}>
            {row.original.isBoarding ? "Boarder" : "Day Scholar"}
          </Badge>
        ),
      },
      {
        id: "status",
        header: "Student Status",
        cell: ({ row }) => (
          <Badge variant={row.original.studentStatus === "ACTIVE" ? "secondary" : "outline"}>
            {row.original.studentStatus}
          </Badge>
        ),
      },
    ],
    [],
  );

  const boardingColumns = useMemo<ColumnDef<StudentPortalData["boarding"][number]>[]>(
    () => [
      {
        id: "hostel",
        header: "Hostel / Room / Bed",
        cell: ({ row }) => (
          <div>
            <div>{row.original.hostel.name}</div>
            <div className="text-xs text-muted-foreground font-mono">
              {row.original.room?.code ?? "-"} / {row.original.bed?.code ?? "-"}
            </div>
          </div>
        ),
      },
      {
        id: "term",
        header: "Term",
        cell: ({ row }) => row.original.term.name,
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => boardingStatusBadge(row.original.status),
      },
      {
        id: "start",
        header: "Start",
        cell: ({ row }) => <NumericCell>{formatDate(row.original.startDate)}</NumericCell>,
      },
      {
        id: "end",
        header: "End",
        cell: ({ row }) => <NumericCell>{formatDate(row.original.endDate)}</NumericCell>,
      },
    ],
    [],
  );

  const guardianColumns = useMemo<ColumnDef<StudentPortalData["guardians"][number]>[]>(
    () => [
      {
        id: "guardianNo",
        header: "Guardian No",
        cell: ({ row }) => <NumericCell align="left">{row.original.guardian.guardianNo}</NumericCell>,
      },
      {
        id: "guardian",
        header: "Guardian",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">
              {row.original.guardian.firstName} {row.original.guardian.lastName}
            </div>
            <div className="text-xs text-muted-foreground">{row.original.relationship}</div>
          </div>
        ),
      },
      {
        id: "contact",
        header: "Contact",
        cell: ({ row }) => (
          <div>
            <div className="font-mono text-xs">{row.original.guardian.phone}</div>
            <div className="text-xs text-muted-foreground">{row.original.guardian.email ?? "-"}</div>
          </div>
        ),
      },
      {
        id: "flags",
        header: "Portal Scope",
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            {row.original.canReceiveFinancials ? <Badge variant="outline">Finance</Badge> : null}
            {row.original.canReceiveAcademicResults ? (
              <Badge variant="outline">Results</Badge>
            ) : null}
            {row.original.isPrimary ? <Badge variant="secondary">Primary</Badge> : null}
          </div>
        ),
      },
    ],
    [],
  );

  const feesColumns = useMemo<ColumnDef<StudentPortalData["fees"][number]>[]>(
    () => [
      {
        id: "invoiceNo",
        header: "Invoice No",
        cell: ({ row }) => <NumericCell align="left">{row.original.invoiceNo}</NumericCell>,
      },
      {
        id: "term",
        header: "Term",
        cell: ({ row }) => row.original.term.name,
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => (
          <Badge
            variant={
              row.original.status === "PART_PAID" || row.original.status === "ISSUED"
                ? "secondary"
                : row.original.status === "VOIDED"
                  ? "destructive"
                  : "outline"
            }
          >
            {row.original.status}
          </Badge>
        ),
      },
      {
        id: "totalAmount",
        header: "Total",
        cell: ({ row }) => <NumericCell>{row.original.totalAmount.toFixed(2)}</NumericCell>,
      },
      {
        id: "paidAmount",
        header: "Paid",
        cell: ({ row }) => <NumericCell>{row.original.paidAmount.toFixed(2)}</NumericCell>,
      },
      {
        id: "balanceAmount",
        header: "Outstanding",
        cell: ({ row }) => <NumericCell>{row.original.balanceAmount.toFixed(2)}</NumericCell>,
      },
      {
        id: "dueDate",
        header: "Due Date",
        cell: ({ row }) => <NumericCell>{formatDate(row.original.dueDate)}</NumericCell>,
      },
    ],
    [],
  );

  const noticesColumns = useMemo<ColumnDef<StudentPortalData["notices"][number]>[]>(
    () => [
      {
        id: "createdAt",
        header: "Date",
        cell: ({ row }) => <NumericCell>{formatDate(row.original.createdAt)}</NumericCell>,
      },
      {
        id: "title",
        header: "Notice",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.title}</div>
            <div className="text-xs text-muted-foreground">{row.original.summary}</div>
          </div>
        ),
      },
      {
        id: "type",
        header: "Type",
        cell: ({ row }) => <NumericCell align="left">{row.original.type}</NumericCell>,
      },
      {
        id: "severity",
        header: "Severity",
        cell: ({ row }) => (
          <Badge
            variant={
              row.original.severity === "CRITICAL"
                ? "destructive"
                : row.original.severity === "WARNING"
                  ? "secondary"
                  : "outline"
            }
          >
            {row.original.severity}
          </Badge>
        ),
      },
      {
        id: "isRead",
        header: "Read",
        cell: ({ row }) => (
          <Badge variant={row.original.isRead ? "outline" : "secondary"}>
            {row.original.isRead ? "Read" : "Unread"}
          </Badge>
        ),
      },
    ],
    [],
  );

  const student = query.data?.student;
  const summary = query.data?.summary;

  return (
    <div className="space-y-4">
      {query.error ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load student portal</AlertTitle>
          <AlertDescription>{getApiErrorMessage(query.error)}</AlertDescription>
        </Alert>
      ) : null}

      <section className="section-shell grid gap-2 md:grid-cols-7">
        <div>
          <h2 className="text-sm font-semibold">Student</h2>
          <p className="text-sm text-muted-foreground">
            {student
              ? `${student.firstName} ${student.lastName} (${student.studentNo})`
              : "No student linked to the signed-in account."}
          </p>
        </div>
        <div>
          <h2 className="text-sm font-semibold">Enrollments</h2>
          <p className="font-mono tabular-nums">{summary?.enrollmentRecords ?? 0}</p>
        </div>
        <div>
          <h2 className="text-sm font-semibold">Published Results</h2>
          <p className="font-mono tabular-nums">{summary?.publishedResultLines ?? 0}</p>
        </div>
        <div>
          <h2 className="text-sm font-semibold">Attendance Profiles</h2>
          <p className="font-mono tabular-nums">{attendanceRows.length}</p>
        </div>
        <div>
          <h2 className="text-sm font-semibold">Active Boarding</h2>
          <p className="font-mono tabular-nums">{summary?.activeBoardingAllocations ?? 0}</p>
        </div>
        <div>
          <h2 className="text-sm font-semibold">Outstanding Fees</h2>
          <p className="font-mono tabular-nums">{(summary?.outstandingBalance ?? 0).toFixed(2)}</p>
        </div>
        <div>
          <h2 className="text-sm font-semibold">Unread Notices</h2>
          <p className="font-mono tabular-nums">{summary?.unreadNotices ?? 0}</p>
        </div>
      </section>

      <VerticalDataViews
        items={[
          { id: "enrollments", label: "Enrollments", count: enrollmentsRows.length },
          { id: "attendance", label: "Attendance", count: attendanceRows.length },
          { id: "results", label: "Results", count: resultsRows.length },
          { id: "boarding", label: "Boarding", count: boardingRows.length },
          { id: "guardians", label: "Guardians", count: guardiansRows.length },
          { id: "fees", label: "Fees", count: feesRows.length },
          { id: "notices", label: "Notices", count: noticesRows.length },
        ]}
        value={activeView}
        onValueChange={(value) => setActiveView(value as StudentPortalView)}
        railLabel="Student Views"
      >
        <div className={activeView === "enrollments" ? "space-y-2" : "hidden"}>
          <h2 className="text-section-title">Enrollment History</h2>
          <DataTable
            data={enrollmentsRows}
            columns={enrollmentColumns}
            searchPlaceholder="Search enrollments"
            searchSubmitLabel="Search"
            pagination={{ enabled: true }}
            emptyState={query.isLoading ? "Loading enrollments..." : "No enrollments available."}
          />
        </div>

        <div className={activeView === "results" ? "space-y-2" : "hidden"}>
          <h2 className="text-section-title">Published Results</h2>
          <DataTable
            data={resultsRows}
            columns={resultColumns}
            searchPlaceholder="Search result lines"
            searchSubmitLabel="Search"
            pagination={{ enabled: true }}
            emptyState={query.isLoading ? "Loading results..." : "No results available."}
          />
        </div>

        <div className={activeView === "attendance" ? "space-y-2" : "hidden"}>
          <h2 className="text-section-title">Attendance Summary</h2>
          <DataTable
            data={attendanceRows}
            columns={attendanceColumns}
            searchPlaceholder="Search attendance records"
            searchSubmitLabel="Search"
            pagination={{ enabled: true }}
            emptyState={
              query.isLoading ? "Loading attendance..." : "No attendance profile available."
            }
          />
        </div>

        <div className={activeView === "boarding" ? "space-y-2" : "hidden"}>
          <h2 className="text-section-title">Boarding History</h2>
          <DataTable
            data={boardingRows}
            columns={boardingColumns}
            searchPlaceholder="Search boarding records"
            searchSubmitLabel="Search"
            pagination={{ enabled: true }}
            emptyState={
              query.isLoading ? "Loading boarding records..." : "No boarding records available."
            }
          />
        </div>

        <div className={activeView === "guardians" ? "space-y-2" : "hidden"}>
          <h2 className="text-section-title">Guardians</h2>
          <DataTable
            data={guardiansRows}
            columns={guardianColumns}
            searchPlaceholder="Search guardians"
            searchSubmitLabel="Search"
            pagination={{ enabled: true }}
            emptyState={query.isLoading ? "Loading guardians..." : "No guardians available."}
          />
        </div>

        <div className={activeView === "fees" ? "space-y-2" : "hidden"}>
          <h2 className="text-section-title">Fees and Balances</h2>
          <DataTable
            data={feesRows}
            columns={feesColumns}
            searchPlaceholder="Search fee invoices"
            searchSubmitLabel="Search"
            pagination={{ enabled: true }}
            emptyState={query.isLoading ? "Loading fees..." : "No fee invoices available."}
          />
        </div>

        <div className={activeView === "notices" ? "space-y-2" : "hidden"}>
          <h2 className="text-section-title">Portal Notices</h2>
          <DataTable
            data={noticesRows}
            columns={noticesColumns}
            searchPlaceholder="Search notices"
            searchSubmitLabel="Search"
            pagination={{ enabled: true }}
            emptyState={query.isLoading ? "Loading notices..." : "No notices available."}
          />
        </div>
      </VerticalDataViews>
    </div>
  );
}
