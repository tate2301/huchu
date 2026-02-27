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
import { fetchParentPortalData, type ParentPortalData } from "@/lib/schools/portal-v2";

type ParentPortalView =
  | "children"
  | "attendance"
  | "results"
  | "boarding"
  | "fees"
  | "notices";

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toISOString().slice(0, 10);
}

function studentStatusBadge(status: string) {
  if (status === "ACTIVE") return <Badge variant="secondary">Active</Badge>;
  if (status === "SUSPENDED") return <Badge variant="destructive">Suspended</Badge>;
  if (status === "GRADUATED") return <Badge variant="outline">Graduated</Badge>;
  if (status === "WITHDRAWN") return <Badge variant="outline">Withdrawn</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}

function boardingStatusBadge(status: string) {
  if (status === "ACTIVE") return <Badge variant="secondary">Active</Badge>;
  if (status === "TRANSFERRED") return <Badge variant="outline">Transferred</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}

function resultGradeBadge(grade?: string | null) {
  if (!grade) return <Badge variant="outline">-</Badge>;
  if (grade === "A" || grade === "A+") return <Badge variant="secondary">{grade}</Badge>;
  if (grade === "E" || grade === "U") return <Badge variant="destructive">{grade}</Badge>;
  return <Badge variant="outline">{grade}</Badge>;
}

export function ParentPortalContent() {
  const [activeView, setActiveView] = useState<ParentPortalView>("children");

  const query = useQuery({
    queryKey: ["schools", "portal", "parent"],
    queryFn: () => fetchParentPortalData(),
  });

  const childrenRows = useMemo(() => query.data?.children ?? [], [query.data]);
  const attendanceRows = useMemo(() => query.data?.attendance ?? [], [query.data]);
  const resultsRows = useMemo(() => query.data?.results ?? [], [query.data]);
  const boardingRows = useMemo(() => query.data?.boarding ?? [], [query.data]);
  const feesRows = useMemo(() => query.data?.fees ?? [], [query.data]);
  const noticesRows = useMemo(() => query.data?.notices ?? [], [query.data]);

  const childrenColumns = useMemo<
    ColumnDef<ParentPortalData["children"][number]>[]
  >(
    () => [
      {
        id: "studentNo",
        header: "Student No",
        cell: ({ row }) => <NumericCell align="left">{row.original.student.studentNo}</NumericCell>,
      },
      {
        id: "student",
        header: "Student",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">
              {row.original.student.firstName} {row.original.student.lastName}
            </div>
            <div className="text-xs text-muted-foreground">{row.original.relationship}</div>
          </div>
        ),
      },
      {
        id: "class",
        header: "Class / Stream",
        cell: ({ row }) => (
          <div>
            <div>{row.original.student.currentClass?.name ?? "-"}</div>
            <div className="text-xs text-muted-foreground">
              {row.original.student.currentStream?.name ?? "No stream"}
            </div>
          </div>
        ),
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => studentStatusBadge(row.original.student.status),
      },
      {
        id: "boarding",
        header: "Boarding",
        cell: ({ row }) =>
          row.original.student.isBoarding ? (
            <Badge variant="secondary">Boarding</Badge>
          ) : (
            <Badge variant="outline">Day Scholar</Badge>
          ),
      },
      {
        id: "activeEnrollment",
        header: "Active Enrollment",
        cell: ({ row }) => {
          const enrollment = row.original.student.enrollments[0];
          if (!enrollment) return <span className="text-muted-foreground">-</span>;
          return (
            <div>
              <div>{enrollment.term.name}</div>
              <div className="text-xs text-muted-foreground">
                {enrollment.class.name}
                {enrollment.stream ? ` / ${enrollment.stream.name}` : ""}
              </div>
            </div>
          );
        },
      },
    ],
    [],
  );

  const resultsColumns = useMemo<ColumnDef<ParentPortalData["results"][number]>[]>(
    () => [
      {
        id: "published",
        header: "Published",
        cell: ({ row }) => (
          <NumericCell align="left">{formatDate(row.original.sheet.publishedAt)}</NumericCell>
        ),
      },
      {
        id: "student",
        header: "Student",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">
              {row.original.student.firstName} {row.original.student.lastName}
            </div>
            <div className="text-xs text-muted-foreground font-mono">
              {row.original.student.studentNo}
            </div>
          </div>
        ),
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
        id: "subjectCode",
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
        cell: ({ row }) => resultGradeBadge(row.original.grade),
      },
    ],
    [],
  );

  const attendanceColumns = useMemo<
    ColumnDef<ParentPortalData["attendance"][number]>[]
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
        id: "activeTermName",
        header: "Current Term",
        cell: ({ row }) => row.original.activeTermName || "-",
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
        cell: ({ row }) => studentStatusBadge(row.original.studentStatus),
      },
    ],
    [],
  );

  const boardingColumns = useMemo<ColumnDef<ParentPortalData["boarding"][number]>[]>(
    () => [
      {
        id: "student",
        header: "Student",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">
              {row.original.student.firstName} {row.original.student.lastName}
            </div>
            <div className="text-xs text-muted-foreground font-mono">
              {row.original.student.studentNo}
            </div>
          </div>
        ),
      },
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

  const feesColumns = useMemo<ColumnDef<ParentPortalData["fees"][number]>[]>(
    () => [
      {
        id: "invoiceNo",
        header: "Invoice No",
        cell: ({ row }) => <NumericCell align="left">{row.original.invoiceNo}</NumericCell>,
      },
      {
        id: "student",
        header: "Student",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">
              {row.original.student.firstName} {row.original.student.lastName}
            </div>
            <div className="text-xs text-muted-foreground font-mono">
              {row.original.student.studentNo}
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
        cell: ({ row }) => (
          <Badge variant={row.original.status === "PART_PAID" || row.original.status === "ISSUED" ? "secondary" : "outline"}>
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

  const noticesColumns = useMemo<ColumnDef<ParentPortalData["notices"][number]>[]>(
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

  const guardian = query.data?.guardian;
  const summary = query.data?.summary;

  return (
    <div className="space-y-4">
      {query.error ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load parent portal</AlertTitle>
          <AlertDescription>{getApiErrorMessage(query.error)}</AlertDescription>
        </Alert>
      ) : null}

      <section className="section-shell grid gap-2 md:grid-cols-7">
        <div>
          <h2 className="text-sm font-semibold">Linked Guardian</h2>
          <p className="text-sm text-muted-foreground">
            {guardian
              ? `${guardian.firstName} ${guardian.lastName}`
              : "No guardian linked to the signed-in account."}
          </p>
        </div>
        <div>
          <h2 className="text-sm font-semibold">Children</h2>
          <p className="font-mono tabular-nums">{summary?.linkedChildren ?? 0}</p>
        </div>
        <div>
          <h2 className="text-sm font-semibold">Published Results</h2>
          <p className="font-mono tabular-nums">{summary?.publishedResultLines ?? 0}</p>
        </div>
        <div>
          <h2 className="text-sm font-semibold">Attendance Profiles</h2>
          <p className="font-mono tabular-nums">{summary?.attendanceProfiles ?? 0}</p>
        </div>
        <div>
          <h2 className="text-sm font-semibold">Active Boarding</h2>
          <p className="font-mono tabular-nums">
            {summary?.activeBoardingAllocations ?? 0}
          </p>
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
          { id: "children", label: "Children", count: childrenRows.length },
          { id: "attendance", label: "Attendance", count: attendanceRows.length },
          { id: "results", label: "Published Results", count: resultsRows.length },
          { id: "boarding", label: "Boarding", count: boardingRows.length },
          { id: "fees", label: "Fees", count: feesRows.length },
          { id: "notices", label: "Notices", count: noticesRows.length },
        ]}
        value={activeView}
        onValueChange={(value) => setActiveView(value as ParentPortalView)}
        railLabel="Parent Views"
      >
        <div className={activeView === "children" ? "space-y-2" : "hidden"}>
          <h2 className="text-section-title">Linked Children</h2>
          <DataTable
            data={childrenRows}
            columns={childrenColumns}
            searchPlaceholder="Search children"
            searchSubmitLabel="Search"
            pagination={{ enabled: true }}
            emptyState={query.isLoading ? "Loading children..." : "No linked children found."}
          />
        </div>

        <div className={activeView === "results" ? "space-y-2" : "hidden"}>
          <h2 className="text-section-title">Published Results</h2>
          <DataTable
            data={resultsRows}
            columns={resultsColumns}
            searchPlaceholder="Search result lines"
            searchSubmitLabel="Search"
            pagination={{ enabled: true }}
            emptyState={query.isLoading ? "Loading results..." : "No published results available."}
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
              query.isLoading ? "Loading attendance..." : "No attendance profiles available."
            }
          />
        </div>

        <div className={activeView === "boarding" ? "space-y-2" : "hidden"}>
          <h2 className="text-section-title">Boarding Allocations</h2>
          <DataTable
            data={boardingRows}
            columns={boardingColumns}
            searchPlaceholder="Search boarding records"
            searchSubmitLabel="Search"
            pagination={{ enabled: true }}
            emptyState={
              query.isLoading ? "Loading boarding allocations..." : "No boarding records available."
            }
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
