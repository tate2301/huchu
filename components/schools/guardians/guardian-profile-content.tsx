"use client";

import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { VerticalDataViews } from "@/components/ui/vertical-data-views";
import { getApiErrorMessage } from "@/lib/api-client";
import { fetchGuardianProfile } from "@/lib/schools/admin-v2";

type ProfileView = "identity" | "students" | "documents";

/* eslint-disable @typescript-eslint/no-explicit-any */

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b py-2 last:border-b-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{children}</span>
    </div>
  );
}

function statusBadge(status: string) {
  if (status === "ACTIVE") return <Badge variant="secondary">Active</Badge>;
  if (status === "APPLICANT") return <Badge variant="outline">Applicant</Badge>;
  if (status === "SUSPENDED") return <Badge variant="destructive">Suspended</Badge>;
  if (status === "GRADUATED") return <Badge variant="outline">Graduated</Badge>;
  return <Badge variant="destructive">Withdrawn</Badge>;
}

export function GuardianProfileContent({ guardianId }: { guardianId: string }) {
  const [activeView, setActiveView] = useState<ProfileView>("identity");

  const profileQuery = useQuery({
    queryKey: ["schools", "guardians", "profile", guardianId],
    queryFn: () => fetchGuardianProfile(guardianId),
  });

  const guardian: any = profileQuery.data ?? null;

  const studentColumns = useMemo<ColumnDef<any>[]>(
    () => [
      {
        id: "studentNo",
        header: "Student No",
        cell: ({ row }) => (
          <Link
            href={`/schools/students/${row.original.student.id}`}
            className="font-mono text-sm hover:underline"
          >
            {row.original.student.studentNo}
          </Link>
        ),
      },
      {
        id: "name",
        header: "Name",
        cell: ({ row }) =>
          `${row.original.student.firstName} ${row.original.student.lastName}`,
      },
      {
        id: "class",
        header: "Class",
        cell: ({ row }) => row.original.student.currentClass?.name ?? "-",
      },
      {
        id: "stream",
        header: "Stream",
        cell: ({ row }) => row.original.student.currentStream?.name ?? "-",
      },
      {
        id: "relationship",
        header: "Relationship",
        cell: ({ row }) => row.original.relationship ?? "-",
      },
      {
        id: "isPrimary",
        header: "Primary",
        cell: ({ row }) => (
          <Badge variant={row.original.isPrimary ? "secondary" : "outline"}>
            {row.original.isPrimary ? "Yes" : "No"}
          </Badge>
        ),
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => statusBadge(row.original.student.status),
      },
    ],
    [],
  );

  if (profileQuery.error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Unable to load guardian profile</AlertTitle>
        <AlertDescription>{getApiErrorMessage(profileQuery.error)}</AlertDescription>
      </Alert>
    );
  }

  const counts = guardian?._count ?? {};

  return (
    <VerticalDataViews
      items={[
        { id: "identity", label: "Identity" },
        { id: "students", label: "Linked Students", count: counts.studentLinks },
        { id: "documents", label: "Documents" },
      ]}
      value={activeView}
      onValueChange={(value) => setActiveView(value as ProfileView)}
      railLabel="Guardian"
    >
      {/* Identity */}
      <div className={activeView === "identity" ? "space-y-4" : "hidden"}>
        {guardian ? (
          <>
            <Card>
              <CardHeader>
                <CardTitle>
                  {guardian.firstName} {guardian.lastName}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-0">
                <InfoRow label="Guardian No">
                  <span className="font-mono">{guardian.guardianNo}</span>
                </InfoRow>
                <InfoRow label="Phone">
                  <span className="font-mono">{guardian.phone}</span>
                </InfoRow>
                <InfoRow label="Email">{guardian.email ?? "-"}</InfoRow>
                <InfoRow label="National ID">
                  <span className="font-mono">{guardian.nationalId ?? "-"}</span>
                </InfoRow>
                <InfoRow label="Address">{guardian.address ?? "-"}</InfoRow>
              </CardContent>
            </Card>

            {/* Summary stats */}
            <div className="grid grid-cols-2 gap-4">
              <Card>
                <CardContent className="py-4">
                  <div className="text-xs text-muted-foreground">Linked Students</div>
                  <div className="text-2xl font-mono">{counts.studentLinks ?? 0}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="py-4">
                  <div className="text-xs text-muted-foreground">Primary Guardian For</div>
                  <div className="text-2xl font-mono">
                    {guardian.studentLinks?.filter((link: any) => link.isPrimary).length ?? 0}
                  </div>
                </CardContent>
              </Card>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Loading guardian profile…</p>
        )}
      </div>

      {/* Students */}
      <div className={activeView === "students" ? "space-y-2" : "hidden"}>
        <h2 className="text-section-title">Linked Students</h2>
        <DataTable
          data={guardian?.studentLinks ?? []}
          columns={studentColumns}
          searchPlaceholder="Search students"
          searchSubmitLabel="Search"
          pagination={{ enabled: true }}
          emptyState={
            profileQuery.isLoading
              ? "Loading students..."
              : "No linked students found."
          }
        />
      </div>

      {/* Documents */}
      <div className={activeView === "documents" ? "space-y-2" : "hidden"}>
        <h2 className="text-section-title">Documents</h2>
        <p className="text-sm text-muted-foreground">
          Document management will appear here.
        </p>
      </div>
    </VerticalDataViews>
  );
}
