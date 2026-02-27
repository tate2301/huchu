"use client";

import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NumericCell } from "@/components/ui/numeric-cell";
import { VerticalDataViews } from "@/components/ui/vertical-data-views";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import {
  fetchTeacherAssignments,
  fetchTeacherProfiles,
  fetchTeacherSubjects,
  type TeacherAssignmentRecord,
  type TeacherProfileRecord,
  type TeacherSubjectRecord,
} from "@/lib/schools/admin-v2";

type TeachersView = "profiles" | "subjects" | "assignments";

const initialSubjectForm = { code: "", name: "", isCore: false, passMark: "50" };
const initialTeacherForm = { employeeCode: "", department: "", isClassTeacher: false, isHod: false };

export function SchoolsTeachersContent() {
  const [activeView, setActiveView] = useState<TeachersView>("profiles");
  const queryClient = useQueryClient();

  const [subjectDialogOpen, setSubjectDialogOpen] = useState(false);
  const [subjectForm, setSubjectForm] = useState(initialSubjectForm);

  const [teacherDialogOpen, setTeacherDialogOpen] = useState(false);
  const [teacherForm, setTeacherForm] = useState(initialTeacherForm);

  const createSubjectMutation = useMutation({
    mutationFn: async (payload: typeof subjectForm) =>
      fetchJson("/api/v2/schools/teachers/subjects", {
        method: "POST",
        body: JSON.stringify({
          code: payload.code,
          name: payload.name,
          isCore: payload.isCore,
          passMark: parseFloat(payload.passMark) || 50,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schools", "teachers", "subjects"] });
      setSubjectForm(initialSubjectForm);
      setSubjectDialogOpen(false);
    },
  });

  const createTeacherMutation = useMutation({
    mutationFn: async (payload: typeof teacherForm) =>
      fetchJson("/api/v2/schools/teachers/profiles", {
        method: "POST",
        body: JSON.stringify({
          employeeCode: payload.employeeCode,
          department: payload.department || undefined,
          isClassTeacher: payload.isClassTeacher,
          isHod: payload.isHod,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schools", "teachers", "profiles"] });
      setTeacherForm(initialTeacherForm);
      setTeacherDialogOpen(false);
    },
  });

  const handleSubjectDialogOpenChange = (open: boolean) => {
    setSubjectDialogOpen(open);
    if (!open) {
      setSubjectForm(initialSubjectForm);
      createSubjectMutation.reset();
    }
  };

  const handleTeacherDialogOpenChange = (open: boolean) => {
    setTeacherDialogOpen(open);
    if (!open) {
      setTeacherForm(initialTeacherForm);
      createTeacherMutation.reset();
    }
  };

  const handleSubjectSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subjectForm.code || !subjectForm.name) return;
    createSubjectMutation.mutate(subjectForm);
  };

  const handleTeacherSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!teacherForm.employeeCode) return;
    createTeacherMutation.mutate(teacherForm);
  };

  const profilesQuery = useQuery({
    queryKey: ["schools", "teachers", "profiles"],
    queryFn: () => fetchTeacherProfiles({ page: 1, limit: 200 }),
  });
  const subjectsQuery = useQuery({
    queryKey: ["schools", "teachers", "subjects"],
    queryFn: () => fetchTeacherSubjects({ page: 1, limit: 200 }),
  });
  const assignmentsQuery = useQuery({
    queryKey: ["schools", "teachers", "assignments"],
    queryFn: () => fetchTeacherAssignments({ page: 1, limit: 200 }),
  });

  const profiles = useMemo(() => profilesQuery.data?.data ?? [], [profilesQuery.data]);
  const subjects = useMemo(() => subjectsQuery.data?.data ?? [], [subjectsQuery.data]);
  const assignments = useMemo(
    () => assignmentsQuery.data?.data ?? [],
    [assignmentsQuery.data],
  );

  const profileColumns = useMemo<ColumnDef<TeacherProfileRecord>[]>(
    () => [
      {
        id: "teacher",
        header: "Teacher",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.user.name}</div>
            <div className="text-xs text-muted-foreground">
              {row.original.employeeCode} / {row.original.user.email}
            </div>
          </div>
        ),
      },
      {
        id: "department",
        header: "Department",
        cell: ({ row }) => row.original.department || "-",
      },
      {
        id: "roles",
        header: "Profile Flags",
        cell: ({ row }) => (
          <div className="flex gap-1">
            {row.original.isClassTeacher ? <Badge variant="secondary">Class Teacher</Badge> : null}
            {row.original.isHod ? <Badge variant="secondary">HOD</Badge> : null}
            {!row.original.isClassTeacher && !row.original.isHod ? (
              <Badge variant="outline">General</Badge>
            ) : null}
          </div>
        ),
      },
      {
        id: "assignments",
        header: "Assignments",
        cell: ({ row }) => <NumericCell>{row.original._count.assignments}</NumericCell>,
      },
      {
        id: "active",
        header: "Active",
        cell: ({ row }) => (
          <Badge variant={row.original.isActive ? "secondary" : "destructive"}>
            {row.original.isActive ? "Active" : "Inactive"}
          </Badge>
        ),
      },
    ],
    [],
  );

  const subjectColumns = useMemo<ColumnDef<TeacherSubjectRecord>[]>(
    () => [
      {
        id: "subject",
        header: "Subject",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.code}</div>
            <div className="text-xs text-muted-foreground">{row.original.name}</div>
          </div>
        ),
      },
      {
        id: "core",
        header: "Core",
        cell: ({ row }) => (
          <Badge variant={row.original.isCore ? "secondary" : "outline"}>
            {row.original.isCore ? "Core" : "Elective"}
          </Badge>
        ),
      },
      {
        id: "passMark",
        header: "Pass Mark",
        cell: ({ row }) => <NumericCell>{row.original.passMark.toFixed(2)}</NumericCell>,
      },
      {
        id: "assignments",
        header: "Assignments",
        cell: ({ row }) => <NumericCell>{row.original._count.classSubjects}</NumericCell>,
      },
      {
        id: "active",
        header: "Active",
        cell: ({ row }) => (
          <Badge variant={row.original.isActive ? "secondary" : "destructive"}>
            {row.original.isActive ? "Active" : "Inactive"}
          </Badge>
        ),
      },
    ],
    [],
  );

  const assignmentColumns = useMemo<ColumnDef<TeacherAssignmentRecord>[]>(
    () => [
      {
        id: "teacher",
        header: "Teacher",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.teacherProfile.user.name}</div>
            <div className="text-xs text-muted-foreground">
              {row.original.teacherProfile.employeeCode}
            </div>
          </div>
        ),
      },
      {
        id: "classSubject",
        header: "Class / Subject",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">
              {row.original.class.name}
              {row.original.stream ? ` / ${row.original.stream.name}` : ""}
            </div>
            <div className="text-xs text-muted-foreground">
              {row.original.subject.code} - {row.original.subject.name}
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
        id: "passMark",
        header: "Pass Mark",
        cell: ({ row }) => <NumericCell>{row.original.subject.passMark.toFixed(2)}</NumericCell>,
      },
      {
        id: "active",
        header: "Active",
        cell: ({ row }) => (
          <Badge variant={row.original.isActive ? "secondary" : "destructive"}>
            {row.original.isActive ? "Active" : "Inactive"}
          </Badge>
        ),
      },
    ],
    [],
  );

  const hasError = profilesQuery.error || subjectsQuery.error || assignmentsQuery.error;

  return (
    <div className="space-y-4">
      {hasError ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load teacher management</AlertTitle>
          <AlertDescription>
            {getApiErrorMessage(
              profilesQuery.error || subjectsQuery.error || assignmentsQuery.error,
            )}
          </AlertDescription>
        </Alert>
      ) : null}

      <VerticalDataViews
        items={[
          { id: "profiles", label: "Teacher Profiles", count: profiles.length },
          { id: "subjects", label: "Subjects", count: subjects.length },
          { id: "assignments", label: "Assignments", count: assignments.length },
        ]}
        value={activeView}
        onValueChange={(value) => setActiveView(value as TeachersView)}
        railLabel="Teacher Views"
      >
        <div className={activeView === "profiles" ? "space-y-2" : "hidden"}>
          <div className="flex items-center justify-between">
            <h2 className="text-section-title">Teacher Profiles</h2>
            <Button size="sm" onClick={() => setTeacherDialogOpen(true)}>
              Add Teacher
            </Button>
          </div>
          <DataTable
            data={profiles}
            columns={profileColumns}
            searchPlaceholder="Search teacher profiles"
            searchSubmitLabel="Search"
            pagination={{ enabled: true }}
            emptyState={profilesQuery.isLoading ? "Loading profiles..." : "No profiles found."}
          />
        </div>

        <div className={activeView === "subjects" ? "space-y-2" : "hidden"}>
          <div className="flex items-center justify-between">
            <h2 className="text-section-title">Subjects</h2>
            <Button size="sm" onClick={() => setSubjectDialogOpen(true)}>
              Add Subject
            </Button>
          </div>
          <DataTable
            data={subjects}
            columns={subjectColumns}
            searchPlaceholder="Search subjects"
            searchSubmitLabel="Search"
            pagination={{ enabled: true }}
            emptyState={subjectsQuery.isLoading ? "Loading subjects..." : "No subjects found."}
          />
        </div>

        <div className={activeView === "assignments" ? "space-y-2" : "hidden"}>
          <h2 className="text-section-title">Class-Subject Assignments</h2>
          <DataTable
            data={assignments}
            columns={assignmentColumns}
            searchPlaceholder="Search assignments"
            searchSubmitLabel="Search"
            pagination={{ enabled: true }}
            emptyState={
              assignmentsQuery.isLoading ? "Loading assignments..." : "No assignments found."
            }
          />
        </div>
      </VerticalDataViews>

      {/* Add Subject Dialog */}
      <Dialog open={subjectDialogOpen} onOpenChange={handleSubjectDialogOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Subject</DialogTitle>
            <DialogDescription>Enter the subject details below.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubjectSubmit} className="space-y-4">
            {createSubjectMutation.error ? (
              <Alert variant="destructive">
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{getApiErrorMessage(createSubjectMutation.error)}</AlertDescription>
              </Alert>
            ) : null}
            <div className="space-y-2">
              <label htmlFor="subject-code" className="text-sm font-medium">
                Code <span className="text-destructive">*</span>
              </label>
              <Input
                id="subject-code"
                value={subjectForm.code}
                onChange={(e) => setSubjectForm((f) => ({ ...f, code: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="subject-name" className="text-sm font-medium">
                Name <span className="text-destructive">*</span>
              </label>
              <Input
                id="subject-name"
                value={subjectForm.name}
                onChange={(e) => setSubjectForm((f) => ({ ...f, name: e.target.value }))}
                required
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                id="subject-isCore"
                type="checkbox"
                checked={subjectForm.isCore}
                onChange={(e) => setSubjectForm((f) => ({ ...f, isCore: e.target.checked }))}
                className="h-4 w-4 rounded border-gray-300"
              />
              <label htmlFor="subject-isCore" className="text-sm font-medium">
                Core Subject
              </label>
            </div>
            <div className="space-y-2">
              <label htmlFor="subject-passMark" className="text-sm font-medium">
                Pass Mark
              </label>
              <Input
                id="subject-passMark"
                type="number"
                step="0.01"
                value={subjectForm.passMark}
                onChange={(e) => setSubjectForm((f) => ({ ...f, passMark: e.target.value }))}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleSubjectDialogOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createSubjectMutation.isPending}>
                {createSubjectMutation.isPending ? "Saving…" : "Add Subject"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add Teacher Dialog */}
      <Dialog open={teacherDialogOpen} onOpenChange={handleTeacherDialogOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Teacher</DialogTitle>
            <DialogDescription>Enter the teacher profile details below.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleTeacherSubmit} className="space-y-4">
            {createTeacherMutation.error ? (
              <Alert variant="destructive">
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{getApiErrorMessage(createTeacherMutation.error)}</AlertDescription>
              </Alert>
            ) : null}
            <div className="space-y-2">
              <label htmlFor="teacher-employeeCode" className="text-sm font-medium">
                Employee Code <span className="text-destructive">*</span>
              </label>
              <Input
                id="teacher-employeeCode"
                value={teacherForm.employeeCode}
                onChange={(e) => setTeacherForm((f) => ({ ...f, employeeCode: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="teacher-department" className="text-sm font-medium">
                Department
              </label>
              <Input
                id="teacher-department"
                value={teacherForm.department}
                onChange={(e) => setTeacherForm((f) => ({ ...f, department: e.target.value }))}
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                id="teacher-isClassTeacher"
                type="checkbox"
                checked={teacherForm.isClassTeacher}
                onChange={(e) => setTeacherForm((f) => ({ ...f, isClassTeacher: e.target.checked }))}
                className="h-4 w-4 rounded border-gray-300"
              />
              <label htmlFor="teacher-isClassTeacher" className="text-sm font-medium">
                Class Teacher
              </label>
            </div>
            <div className="flex items-center gap-2">
              <input
                id="teacher-isHod"
                type="checkbox"
                checked={teacherForm.isHod}
                onChange={(e) => setTeacherForm((f) => ({ ...f, isHod: e.target.checked }))}
                className="h-4 w-4 rounded border-gray-300"
              />
              <label htmlFor="teacher-isHod" className="text-sm font-medium">
                Head of Department
              </label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleTeacherDialogOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createTeacherMutation.isPending}>
                {createTeacherMutation.isPending ? "Saving…" : "Add Teacher"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
