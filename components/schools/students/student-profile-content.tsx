"use client";

import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { NumericCell } from "@/components/ui/numeric-cell";
import { VerticalDataViews } from "@/components/ui/vertical-data-views";
import { getApiErrorMessage } from "@/lib/api-client";
import { fetchStudentProfile } from "@/lib/schools/admin-v2";

type ProfileView =
  | "overview"
  | "enrollments"
  | "results"
  | "fees"
  | "attendance"
  | "boarding";

/* eslint-disable @typescript-eslint/no-explicit-any */

function statusBadge(status: string) {
  if (status === "ACTIVE") return <Badge variant="secondary">Active</Badge>;
  if (status === "APPLICANT") return <Badge variant="outline">Applicant</Badge>;
  if (status === "SUSPENDED") return <Badge variant="destructive">Suspended</Badge>;
  if (status === "GRADUATED") return <Badge variant="outline">Graduated</Badge>;
  return <Badge variant="destructive">Withdrawn</Badge>;
}

function fmtDate(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString();
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b py-2 last:border-b-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{children}</span>
    </div>
  );
}

export function StudentProfileContent({ studentId }: { studentId: string }) {
  const [activeView, setActiveView] = useState<ProfileView>("overview");

  const profileQuery = useQuery({
    queryKey: ["schools", "students", "profile", studentId],
    queryFn: () => fetchStudentProfile(studentId),
  });

  const student: any = profileQuery.data ?? null;

  const enrollmentColumns = useMemo<ColumnDef<any>[]>(
    () => [
      {
        id: "term",
        header: "Term",
        cell: ({ row }) => row.original.term?.name ?? "-",
      },
      {
        id: "class",
        header: "Class",
        cell: ({ row }) => row.original.class?.name ?? "-",
      },
      {
        id: "stream",
        header: "Stream",
        cell: ({ row }) => row.original.stream?.name ?? "-",
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => <Badge variant="outline">{row.original.status}</Badge>,
      },
      {
        id: "enrolledAt",
        header: "Enrolled At",
        cell: ({ row }) => (
          <span className="font-mono text-sm">{fmtDate(row.original.enrolledAt)}</span>
        ),
      },
    ],
    [],
  );

  const resultColumns = useMemo<ColumnDef<any>[]>(
    () => [
      {
        id: "subject",
        header: "Subject",
        cell: ({ row }) => row.original.subjectCode ?? "-",
      },
      {
        id: "score",
        header: "Score",
        cell: ({ row }) => <NumericCell>{row.original.score}</NumericCell>,
      },
      {
        id: "grade",
        header: "Grade",
        cell: ({ row }) => row.original.grade ?? "-",
      },
      {
        id: "term",
        header: "Term",
        cell: ({ row }) => row.original.sheet?.term?.name ?? "-",
      },
    ],
    [],
  );

  const feeColumns = useMemo<ColumnDef<any>[]>(
    () => [
      {
        id: "reference",
        header: "Reference",
        cell: ({ row }) => row.original.invoiceNo ?? "-",
      },
      {
        id: "amount",
        header: "Amount",
        cell: ({ row }) => <NumericCell>{row.original.totalAmount}</NumericCell>,
      },
      {
        id: "paid",
        header: "Paid",
        cell: ({ row }) => <NumericCell>{row.original.paidAmount}</NumericCell>,
      },
      {
        id: "balance",
        header: "Balance",
        cell: ({ row }) => <NumericCell>{row.original.balanceAmount}</NumericCell>,
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => <Badge variant="outline">{row.original.status}</Badge>,
      },
      {
        id: "issuedAt",
        header: "Issue Date",
        cell: ({ row }) => (
          <span className="font-mono text-sm">{fmtDate(row.original.issueDate)}</span>
        ),
      },
    ],
    [],
  );

  const boardingColumns = useMemo<ColumnDef<any>[]>(
    () => [
      {
        id: "hostel",
        header: "Hostel",
        cell: ({ row }) => row.original.hostel?.name ?? "-",
      },
      {
        id: "room",
        header: "Room",
        cell: ({ row }) => row.original.room?.name ?? "-",
      },
      {
        id: "bed",
        header: "Bed",
        cell: ({ row }) => row.original.bed?.name ?? "-",
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => <Badge variant="outline">{row.original.status}</Badge>,
      },
      {
        id: "startDate",
        header: "Start Date",
        cell: ({ row }) => (
          <span className="font-mono text-sm">{fmtDate(row.original.startDate)}</span>
        ),
      },
      {
        id: "endDate",
        header: "End Date",
        cell: ({ row }) => (
          <span className="font-mono text-sm">{fmtDate(row.original.endDate)}</span>
        ),
      },
    ],
    [],
  );

  if (profileQuery.error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Unable to load student profile</AlertTitle>
        <AlertDescription>{getApiErrorMessage(profileQuery.error)}</AlertDescription>
      </Alert>
    );
  }

  const counts = student?._count ?? {};

  return (
    <VerticalDataViews
      items={[
        { id: "overview", label: "Overview" },
        { id: "enrollments", label: "Enrollments", count: counts.enrollments },
        { id: "results", label: "Results", count: counts.resultLines },
        { id: "fees", label: "Fees", count: counts.feeInvoices },
        { id: "attendance", label: "Attendance" },
        { id: "boarding", label: "Boarding", count: counts.boardingAllocations },
      ]}
      value={activeView}
      onValueChange={(value) => setActiveView(value as ProfileView)}
      railLabel="Profile"
    >
      {/* Overview */}
      <div className={activeView === "overview" ? "space-y-4" : "hidden"}>
        {student ? (
          <>
            <Card>
              <CardHeader>
                <CardTitle>
                  {student.firstName} {student.lastName}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-0">
                <InfoRow label="Student No">
                  <span className="font-mono">{student.studentNo}</span>
                </InfoRow>
                <InfoRow label="Admission No">
                  <span className="font-mono">{student.admissionNo ?? "-"}</span>
                </InfoRow>
                <InfoRow label="Date of Birth">{fmtDate(student.dateOfBirth)}</InfoRow>
                <InfoRow label="Gender">{student.gender ?? "-"}</InfoRow>
                <InfoRow label="Status">{statusBadge(student.status)}</InfoRow>
                <InfoRow label="Class / Stream">
                  {student.currentClass?.name ?? "-"}
                  {student.currentStream ? ` / ${student.currentStream.name}` : ""}
                </InfoRow>
                <InfoRow label="Boarding">
                  <Badge variant={student.isBoarding ? "secondary" : "outline"}>
                    {student.isBoarding ? "Boarder" : "Day Scholar"}
                  </Badge>
                </InfoRow>
              </CardContent>
            </Card>

            {/* Guardians */}
            <Card>
              <CardHeader>
                <CardTitle>Guardians</CardTitle>
              </CardHeader>
              <CardContent>
                {student.guardianLinks?.length > 0 ? (
                  <div className="space-y-2">
                    {student.guardianLinks.map((link: any) => (
                      <div
                        key={link.id}
                        className="flex items-center justify-between rounded-md border px-3 py-2"
                      >
                        <div>
                          <div className="text-sm font-medium">
                            {link.guardian.firstName} {link.guardian.lastName}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {link.relationship}
                            {link.isPrimary ? " · Primary" : ""}
                          </div>
                        </div>
                        <div className="text-right text-xs text-muted-foreground">
                          <div>{link.guardian.phone}</div>
                          {link.guardian.email ? <div>{link.guardian.email}</div> : null}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No guardians linked to this student.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Summary stats */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[
                { label: "Enrollments", value: counts.enrollments ?? 0 },
                { label: "Results", value: counts.resultLines ?? 0 },
                { label: "Fee Invoices", value: counts.feeInvoices ?? 0 },
                { label: "Guardians", value: counts.guardianLinks ?? 0 },
              ].map((stat) => (
                <Card key={stat.label}>
                  <CardContent className="py-4">
                    <div className="text-xs text-muted-foreground">{stat.label}</div>
                    <div className="text-2xl font-semibold font-mono">{stat.value}</div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Loading student profile…</p>
        )}
      </div>

      {/* Enrollments */}
      <div className={activeView === "enrollments" ? "space-y-2" : "hidden"}>
        <h2 className="text-section-title">Enrollment History</h2>
        <DataTable
          data={student?.enrollments ?? []}
          columns={enrollmentColumns}
          searchPlaceholder="Search enrollments"
          searchSubmitLabel="Search"
          pagination={{ enabled: true }}
          emptyState={
            profileQuery.isLoading
              ? "Loading enrollments..."
              : "No enrollment records found."
          }
        />
      </div>

      {/* Results */}
      <div className={activeView === "results" ? "space-y-2" : "hidden"}>
        <h2 className="text-section-title">Result Lines</h2>
        <DataTable
          data={student?.resultLines ?? []}
          columns={resultColumns}
          searchPlaceholder="Search results"
          searchSubmitLabel="Search"
          pagination={{ enabled: true }}
          emptyState={
            profileQuery.isLoading
              ? "Loading results..."
              : "No result records found."
          }
        />
      </div>

      {/* Fees */}
      <div className={activeView === "fees" ? "space-y-2" : "hidden"}>
        <h2 className="text-section-title">Fee Invoices</h2>
        <DataTable
          data={student?.feeInvoices ?? []}
          columns={feeColumns}
          searchPlaceholder="Search invoices"
          searchSubmitLabel="Search"
          pagination={{ enabled: true }}
          emptyState={
            profileQuery.isLoading
              ? "Loading invoices..."
              : "No fee invoices found."
          }
        />
      </div>

      {/* Attendance */}
      <div className={activeView === "attendance" ? "space-y-2" : "hidden"}>
        <h2 className="text-section-title">Attendance</h2>
        <p className="text-sm text-muted-foreground">
          Attendance records will appear here.
        </p>
      </div>

      {/* Boarding */}
      <div className={activeView === "boarding" ? "space-y-2" : "hidden"}>
        <h2 className="text-section-title">Boarding Allocations</h2>
        <DataTable
          data={student?.boardingAllocations ?? []}
          columns={boardingColumns}
          searchPlaceholder="Search allocations"
          searchSubmitLabel="Search"
          pagination={{ enabled: true }}
          emptyState={
            profileQuery.isLoading
              ? "Loading allocations..."
              : "No boarding allocations found."
          }
        />
      </div>
    </VerticalDataViews>
  );
}
