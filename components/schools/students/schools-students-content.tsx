"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { VerticalDataViews } from "@/components/ui/vertical-data-views";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import {
  fetchSchoolsClasses,
  fetchSchoolsGuardians,
  fetchSchoolsStudents,
  type SchoolsClassRecord,
  type SchoolsGuardianRecord,
  type SchoolsStudentRecord,
} from "@/lib/schools/admin-v2";

type StudentsView = "students" | "guardians";

function statusBadge(status: string) {
  if (status === "ACTIVE") return <Badge variant="secondary">Active</Badge>;
  if (status === "APPLICANT") return <Badge variant="outline">Applicant</Badge>;
  if (status === "SUSPENDED") return <Badge variant="destructive">Suspended</Badge>;
  if (status === "GRADUATED") return <Badge variant="outline">Graduated</Badge>;
  return <Badge variant="destructive">Withdrawn</Badge>;
}

const initialStudentForm = { firstName: "", lastName: "", admissionNo: "", isBoarding: false };
const initialGuardianForm = { firstName: "", lastName: "", phone: "", email: "", nationalId: "" };

export function SchoolsStudentsContent() {
  const [activeView, setActiveView] = useState<StudentsView>("students");
  const queryClient = useQueryClient();

  const [studentDialogOpen, setStudentDialogOpen] = useState(false);
  const [studentForm, setStudentForm] = useState(initialStudentForm);

  const [guardianDialogOpen, setGuardianDialogOpen] = useState(false);
  const [guardianForm, setGuardianForm] = useState(initialGuardianForm);

  const [classFilter, setClassFilter] = useState<string>("");
  const [streamFilter, setStreamFilter] = useState<string>("");

  const createStudentMutation = useMutation({
    mutationFn: async (payload: typeof studentForm) =>
      fetchJson("/api/v2/schools/students", {
        method: "POST",
        body: JSON.stringify({
          firstName: payload.firstName,
          lastName: payload.lastName,
          admissionNo: payload.admissionNo || undefined,
          isBoarding: payload.isBoarding,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schools", "students", "directory"] });
      setStudentForm(initialStudentForm);
      setStudentDialogOpen(false);
    },
  });

  const createGuardianMutation = useMutation({
    mutationFn: async (payload: typeof guardianForm) =>
      fetchJson("/api/v2/schools/guardians", {
        method: "POST",
        body: JSON.stringify({
          firstName: payload.firstName,
          lastName: payload.lastName,
          phone: payload.phone,
          email: payload.email || undefined,
          nationalId: payload.nationalId || undefined,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schools", "guardians", "directory"] });
      setGuardianForm(initialGuardianForm);
      setGuardianDialogOpen(false);
    },
  });

  const handleStudentDialogOpenChange = (open: boolean) => {
    setStudentDialogOpen(open);
    if (!open) {
      setStudentForm(initialStudentForm);
      createStudentMutation.reset();
    }
  };

  const handleGuardianDialogOpenChange = (open: boolean) => {
    setGuardianDialogOpen(open);
    if (!open) {
      setGuardianForm(initialGuardianForm);
      createGuardianMutation.reset();
    }
  };

  const handleStudentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentForm.firstName || !studentForm.lastName) return;
    createStudentMutation.mutate(studentForm);
  };

  const handleGuardianSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!guardianForm.firstName || !guardianForm.lastName || !guardianForm.phone) return;
    createGuardianMutation.mutate(guardianForm);
  };

  const studentsQuery = useQuery({
    queryKey: ["schools", "students", "directory", classFilter, streamFilter],
    queryFn: () =>
      fetchSchoolsStudents({
        page: 1,
        limit: 200,
        classId: classFilter || undefined,
        streamId: streamFilter || undefined,
      }),
  });
  const guardiansQuery = useQuery({
    queryKey: ["schools", "guardians", "directory"],
    queryFn: () => fetchSchoolsGuardians({ page: 1, limit: 200 }),
  });
  const classesQuery = useQuery({
    queryKey: ["schools", "classes", "list"],
    queryFn: () => fetchSchoolsClasses({ page: 1, limit: 100 }),
  });

  const students = useMemo(
    () => {
      const raw = studentsQuery.data;
      if (!raw) return [];
      return Array.isArray(raw) ? raw : raw.data ?? [];
    },
    [studentsQuery.data],
  );
  const guardians = useMemo(
    () => {
      const raw = guardiansQuery.data;
      if (!raw) return [];
      return Array.isArray(raw) ? raw : raw.data ?? [];
    },
    [guardiansQuery.data],
  );

  const classes = useMemo<SchoolsClassRecord[]>(() => {
    const raw = classesQuery.data;
    if (!raw) return [];
    return Array.isArray(raw) ? raw : raw.data ?? [];
  }, [classesQuery.data]);

  const filteredStreams = useMemo(() => {
    if (!classFilter) return [];
    const cls = classes.find((c) => c.id === classFilter);
    return cls?.streams ?? [];
  }, [classFilter, classes]);

  const studentColumns = useMemo<ColumnDef<SchoolsStudentRecord>[]>(
    () => [
      {
        id: "student",
        header: "Student",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">
              {row.original.studentNo} -{" "}
              <Link href={`/schools/students/${row.original.id}`} className="hover:underline">
                {row.original.firstName} {row.original.lastName}
              </Link>
            </div>
            <div className="text-xs text-muted-foreground">
              Admission: {row.original.admissionNo || "-"}
            </div>
          </div>
        ),
      },
      {
        id: "class",
        header: "Class / Stream",
        cell: ({ row }) => (
          <span>
            {row.original.currentClass ? (
              <Link href={`/schools/classes/${row.original.currentClass.id}`} className="hover:underline">
                {row.original.currentClass.name}
              </Link>
            ) : (
              "-"
            )}
            {row.original.currentStream ? ` / ${row.original.currentStream.name}` : ""}
          </span>
        ),
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => statusBadge(row.original.status),
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
        id: "guardians",
        header: "Guardians",
        cell: ({ row }) => <NumericCell>{row.original._count.guardianLinks}</NumericCell>,
      },
      {
        id: "enrollments",
        header: "Enrollments",
        cell: ({ row }) => <NumericCell>{row.original._count.enrollments}</NumericCell>,
      },
    ],
    [],
  );

  const guardianColumns = useMemo<ColumnDef<SchoolsGuardianRecord>[]>(
    () => [
      {
        id: "guardian",
        header: "Guardian",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">
              {row.original.guardianNo} - {row.original.firstName} {row.original.lastName}
            </div>
            <div className="text-xs text-muted-foreground">
              {row.original.phone} {row.original.email ? ` / ${row.original.email}` : ""}
            </div>
          </div>
        ),
      },
      {
        id: "nationalId",
        header: "National ID",
        cell: ({ row }) => row.original.nationalId || "-",
      },
      {
        id: "linkedStudents",
        header: "Linked Students",
        cell: ({ row }) => <NumericCell>{row.original._count.studentLinks}</NumericCell>,
      },
    ],
    [],
  );

  const hasError = studentsQuery.error || guardiansQuery.error;

  return (
    <div className="space-y-4">
      {hasError ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load student directory</AlertTitle>
          <AlertDescription>
            {getApiErrorMessage(studentsQuery.error || guardiansQuery.error)}
          </AlertDescription>
        </Alert>
      ) : null}

      <VerticalDataViews
        items={[
          { id: "students", label: "Students", count: students.length },
          { id: "guardians", label: "Guardians", count: guardians.length },
        ]}
        value={activeView}
        onValueChange={(value) => setActiveView(value as StudentsView)}
        railLabel="Directory Views"
      >
        <div className={activeView === "students" ? "space-y-2" : "hidden"}>
          <div className="flex items-center justify-between">
            <h2 className="text-section-title">Student Directory</h2>
            <Button size="sm" onClick={() => setStudentDialogOpen(true)}>
              Add Student
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Select
              value={classFilter}
              onValueChange={(value) => {
                setClassFilter(value === "all" ? "" : value);
                setStreamFilter("");
              }}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Filter by Class" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Classes</SelectItem>
                {classes.map((cls) => (
                  <SelectItem key={cls.id} value={cls.id}>
                    {cls.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {classFilter && filteredStreams.length > 0 && (
              <Select
                value={streamFilter}
                onValueChange={(value) => setStreamFilter(value === "all" ? "" : value)}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Filter by Stream" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Streams</SelectItem>
                  {filteredStreams.map((stream) => (
                    <SelectItem key={stream.id} value={stream.id}>
                      {stream.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <DataTable
            data={students}
            columns={studentColumns}
            searchPlaceholder="Search students"
            searchSubmitLabel="Search"
            pagination={{ enabled: true }}
            emptyState={
              studentsQuery.isLoading ? "Loading students..." : "No students found."
            }
          />
        </div>

        <div className={activeView === "guardians" ? "space-y-2" : "hidden"}>
          <div className="flex items-center justify-between">
            <h2 className="text-section-title">Guardian Directory</h2>
            <Button size="sm" onClick={() => setGuardianDialogOpen(true)}>
              Add Guardian
            </Button>
          </div>
          <DataTable
            data={guardians}
            columns={guardianColumns}
            searchPlaceholder="Search guardians"
            searchSubmitLabel="Search"
            pagination={{ enabled: true }}
            emptyState={
              guardiansQuery.isLoading ? "Loading guardians..." : "No guardians found."
            }
          />
        </div>
      </VerticalDataViews>

      {/* Create Student Dialog */}
      <Dialog open={studentDialogOpen} onOpenChange={handleStudentDialogOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Student</DialogTitle>
            <DialogDescription>Enter the student details below.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleStudentSubmit} className="space-y-4">
            {createStudentMutation.error ? (
              <Alert variant="destructive">
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{getApiErrorMessage(createStudentMutation.error)}</AlertDescription>
              </Alert>
            ) : null}
            <div className="space-y-2">
              <label htmlFor="student-firstName" className="text-sm font-medium">
                First Name <span className="text-destructive">*</span>
              </label>
              <Input
                id="student-firstName"
                value={studentForm.firstName}
                onChange={(e) => setStudentForm((f) => ({ ...f, firstName: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="student-lastName" className="text-sm font-medium">
                Last Name <span className="text-destructive">*</span>
              </label>
              <Input
                id="student-lastName"
                value={studentForm.lastName}
                onChange={(e) => setStudentForm((f) => ({ ...f, lastName: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="student-admissionNo" className="text-sm font-medium">
                Admission No
              </label>
              <Input
                id="student-admissionNo"
                value={studentForm.admissionNo}
                onChange={(e) => setStudentForm((f) => ({ ...f, admissionNo: e.target.value }))}
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                id="student-isBoarding"
                type="checkbox"
                checked={studentForm.isBoarding}
                onChange={(e) => setStudentForm((f) => ({ ...f, isBoarding: e.target.checked }))}
                className="h-4 w-4 rounded border-gray-300"
              />
              <label htmlFor="student-isBoarding" className="text-sm font-medium">
                Boarding Student
              </label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleStudentDialogOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createStudentMutation.isPending}>
                {createStudentMutation.isPending ? "Saving…" : "Add Student"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Create Guardian Dialog */}
      <Dialog open={guardianDialogOpen} onOpenChange={handleGuardianDialogOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Guardian</DialogTitle>
            <DialogDescription>Enter the guardian details below.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleGuardianSubmit} className="space-y-4">
            {createGuardianMutation.error ? (
              <Alert variant="destructive">
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{getApiErrorMessage(createGuardianMutation.error)}</AlertDescription>
              </Alert>
            ) : null}
            <div className="space-y-2">
              <label htmlFor="guardian-firstName" className="text-sm font-medium">
                First Name <span className="text-destructive">*</span>
              </label>
              <Input
                id="guardian-firstName"
                value={guardianForm.firstName}
                onChange={(e) => setGuardianForm((f) => ({ ...f, firstName: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="guardian-lastName" className="text-sm font-medium">
                Last Name <span className="text-destructive">*</span>
              </label>
              <Input
                id="guardian-lastName"
                value={guardianForm.lastName}
                onChange={(e) => setGuardianForm((f) => ({ ...f, lastName: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="guardian-phone" className="text-sm font-medium">
                Phone <span className="text-destructive">*</span>
              </label>
              <Input
                id="guardian-phone"
                type="tel"
                value={guardianForm.phone}
                onChange={(e) => setGuardianForm((f) => ({ ...f, phone: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="guardian-email" className="text-sm font-medium">
                Email
              </label>
              <Input
                id="guardian-email"
                type="email"
                value={guardianForm.email}
                onChange={(e) => setGuardianForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="guardian-nationalId" className="text-sm font-medium">
                National ID
              </label>
              <Input
                id="guardian-nationalId"
                value={guardianForm.nationalId}
                onChange={(e) => setGuardianForm((f) => ({ ...f, nationalId: e.target.value }))}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleGuardianDialogOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createGuardianMutation.isPending}>
                {createGuardianMutation.isPending ? "Saving…" : "Add Guardian"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
