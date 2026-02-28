"use client";

import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { VerticalDataViews } from "@/components/ui/vertical-data-views";
import { getApiErrorMessage } from "@/lib/api-client";
import { fetchTeacherProfile } from "@/lib/schools/admin-v2";

type ProfileView =
  | "identity"
  | "classes"
  | "subjects"
  | "performance"
  | "documents";

/* eslint-disable @typescript-eslint/no-explicit-any */

function statusBadge(isActive: boolean) {
  return isActive ? (
    <Badge variant="secondary">Active</Badge>
  ) : (
    <Badge variant="destructive">Inactive</Badge>
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b py-2 last:border-b-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{children}</span>
    </div>
  );
}

export function TeacherProfileContent({ teacherId }: { teacherId: string }) {
  const [activeView, setActiveView] = useState<ProfileView>("identity");

  const profileQuery = useQuery({
    queryKey: ["schools", "teachers", "profile", teacherId],
    queryFn: () => fetchTeacherProfile(teacherId),
  });

  const teacher: any = profileQuery.data ?? null;

  const assignmentColumns = useMemo<ColumnDef<any>[]>(
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
        id: "subject",
        header: "Subject",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <span>{row.original.subject?.name ?? "-"}</span>
            {row.original.subject?.isCore && (
              <Badge variant="outline" className="text-xs">
                Core
              </Badge>
            )}
          </div>
        ),
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => (
          <Badge variant={row.original.isActive ? "secondary" : "outline"}>
            {row.original.isActive ? "Active" : "Inactive"}
          </Badge>
        ),
      },
    ],
    [],
  );

  // Group assignments by subject for summary
  const subjectSummary = useMemo(() => {
    if (!teacher?.assignments) return [];

    const subjectMap = new Map<string, { subject: any; count: number; classes: Set<string> }>();

    teacher.assignments.forEach((assignment: any) => {
      const subjectId = assignment.subject?.id;
      if (!subjectId) return;

      if (!subjectMap.has(subjectId)) {
        subjectMap.set(subjectId, {
          subject: assignment.subject,
          count: 0,
          classes: new Set(),
        });
      }

      const entry = subjectMap.get(subjectId)!;
      entry.count += 1;
      if (assignment.class?.name) {
        entry.classes.add(assignment.class.name);
      }
    });

    return Array.from(subjectMap.values()).map((entry) => ({
      subject: entry.subject,
      assignmentCount: entry.count,
      classCount: entry.classes.size,
    }));
  }, [teacher?.assignments]);

  if (profileQuery.error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Unable to load teacher profile</AlertTitle>
        <AlertDescription>{getApiErrorMessage(profileQuery.error)}</AlertDescription>
      </Alert>
    );
  }

  const counts = teacher?._count ?? {};

  return (
    <VerticalDataViews
      items={[
        { id: "identity", label: "Identity" },
        { id: "classes", label: "Classes", count: counts.assignments },
        { id: "subjects", label: "Subjects" },
        { id: "performance", label: "Performance" },
        { id: "documents", label: "Documents" },
      ]}
      value={activeView}
      onValueChange={(value) => setActiveView(value as ProfileView)}
      railLabel="Teacher"
    >
      {/* Identity */}
      <div className={activeView === "identity" ? "space-y-4" : "hidden"}>
        {teacher ? (
          <>
            <Card>
              <CardHeader>
                <CardTitle>{teacher.user?.name}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-0">
                <InfoRow label="Employee Code">
                  <span className="font-mono">{teacher.employeeCode}</span>
                </InfoRow>
                <InfoRow label="Email">{teacher.user?.email ?? "-"}</InfoRow>
                <InfoRow label="Phone">{teacher.user?.phone ?? "-"}</InfoRow>
                <InfoRow label="Department">{teacher.department ?? "-"}</InfoRow>
                <InfoRow label="Status">{statusBadge(teacher.isActive)}</InfoRow>
                <InfoRow label="Class Teacher">
                  <Badge variant={teacher.isClassTeacher ? "secondary" : "outline"}>
                    {teacher.isClassTeacher ? "Yes" : "No"}
                  </Badge>
                </InfoRow>
                <InfoRow label="Head of Department (HOD)">
                  <Badge variant={teacher.isHod ? "secondary" : "outline"}>
                    {teacher.isHod ? "Yes" : "No"}
                  </Badge>
                </InfoRow>
              </CardContent>
            </Card>

            {/* Summary stats */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {[
                { label: "Total Assignments", value: counts.assignments ?? 0 },
                { label: "Subjects", value: subjectSummary.length },
                { label: "Classes", value: new Set(teacher.assignments?.map((a: any) => a.class?.id)).size },
              ].map((stat) => (
                <Card key={stat.label}>
                  <CardContent className="py-4">
                    <div className="text-xs text-muted-foreground">{stat.label}</div>
                    <div className="text-2xl font-mono">{stat.value}</div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Loading teacher profile…</p>
        )}
      </div>

      {/* Classes */}
      <div className={activeView === "classes" ? "space-y-2" : "hidden"}>
        <h2 className="text-section-title">Class Assignments</h2>
        <DataTable
          data={teacher?.assignments ?? []}
          columns={assignmentColumns}
          searchPlaceholder="Search assignments"
          searchSubmitLabel="Search"
          pagination={{ enabled: true }}
          emptyState={
            profileQuery.isLoading
              ? "Loading assignments..."
              : "No class assignments found."
          }
        />
      </div>

      {/* Subjects */}
      <div className={activeView === "subjects" ? "space-y-4" : "hidden"}>
        <h2 className="text-section-title">Subject Summary</h2>
        {subjectSummary.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {subjectSummary.map((item) => (
              <Card key={item.subject.id}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between text-base">
                    <span>{item.subject.name}</span>
                    {item.subject.isCore && (
                      <Badge variant="outline" className="text-xs">
                        Core
                      </Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Assignments</span>
                      <span className="font-mono">{item.assignmentCount}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Classes</span>
                      <span className="font-mono">{item.classCount}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No subject assignments found.
          </p>
        )}
      </div>

      {/* Performance */}
      <div className={activeView === "performance" ? "space-y-2" : "hidden"}>
        <h2 className="text-section-title">Performance Metrics</h2>
        <p className="text-sm text-muted-foreground">
          Performance tracking will appear here (student pass rates, average scores, etc.).
        </p>
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
