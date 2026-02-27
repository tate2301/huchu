"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
  fetchSchoolsClasses,
  type SchoolsClassRecord,
  type SchoolsStreamRecord,
} from "@/lib/schools/admin-v2";

type ClassesView = "classes" | "streams";

const initialClassForm = { code: "", name: "", level: "", capacity: "" };

export function SchoolsClassesContent() {
  const [activeView, setActiveView] = useState<ClassesView>("classes");
  const queryClient = useQueryClient();

  const [classDialogOpen, setClassDialogOpen] = useState(false);
  const [classForm, setClassForm] = useState(initialClassForm);

  const createClassMutation = useMutation({
    mutationFn: async (payload: typeof classForm) =>
      fetchJson("/api/v2/schools/classes", {
        method: "POST",
        body: JSON.stringify({
          code: payload.code,
          name: payload.name,
          level: payload.level ? Number(payload.level) : null,
          capacity: payload.capacity ? Number(payload.capacity) : null,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schools", "classes"] });
      setClassForm(initialClassForm);
      setClassDialogOpen(false);
    },
  });

  const handleClassDialogOpenChange = (open: boolean) => {
    setClassDialogOpen(open);
    if (!open) {
      setClassForm(initialClassForm);
      createClassMutation.reset();
    }
  };

  const handleClassSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!classForm.code || !classForm.name) return;
    createClassMutation.mutate(classForm);
  };

  const classesQuery = useQuery({
    queryKey: ["schools", "classes"],
    queryFn: () => fetchSchoolsClasses({ page: 1, limit: 200 }),
  });

  const classes = useMemo(() => {
    const raw = classesQuery.data;
    if (!raw) return [];
    return Array.isArray(raw) ? raw : raw.data ?? [];
  }, [classesQuery.data]);

  const streams = useMemo(() => {
    return classes.flatMap((cls: SchoolsClassRecord) =>
      (cls.streams ?? []).map((s) => ({ ...s, className: cls.name })),
    );
  }, [classes]);

  const classColumns = useMemo<ColumnDef<SchoolsClassRecord>[]>(
    () => [
      {
        accessorKey: "code",
        header: "Code",
        cell: ({ row }) => (
          <Link
            href={`/schools/classes/${row.original.id}`}
            className="font-medium text-primary hover:underline"
          >
            {row.original.code}
          </Link>
        ),
      },
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => (
          <Link
            href={`/schools/classes/${row.original.id}`}
            className="hover:underline"
          >
            {row.original.name}
          </Link>
        ),
      },
      {
        accessorKey: "level",
        header: "Level",
        cell: ({ row }) => (
          <NumericCell>{row.original.level ?? "-"}</NumericCell>
        ),
      },
      {
        accessorKey: "capacity",
        header: "Capacity",
        cell: ({ row }) => (
          <NumericCell>{row.original.capacity ?? "-"}</NumericCell>
        ),
      },
      {
        id: "streams",
        header: "Streams",
        cell: ({ row }) => (
          <NumericCell>{row.original._count.streams}</NumericCell>
        ),
      },
      {
        id: "students",
        header: "Students",
        cell: ({ row }) => (
          <NumericCell>{row.original._count.students}</NumericCell>
        ),
      },
    ],
    [],
  );

  const streamColumns = useMemo<ColumnDef<SchoolsStreamRecord>[]>(
    () => [
      {
        accessorKey: "code",
        header: "Code",
        cell: ({ row }) => <span className="font-medium">{row.original.code}</span>,
      },
      {
        accessorKey: "name",
        header: "Name",
      },
      {
        id: "class",
        header: "Class",
        cell: ({ row }) => (row.original as SchoolsStreamRecord & { className?: string }).className ?? "-",
      },
      {
        accessorKey: "capacity",
        header: "Capacity",
        cell: ({ row }) => (
          <NumericCell>{row.original.capacity ?? "-"}</NumericCell>
        ),
      },
    ],
    [],
  );

  const hasError = classesQuery.error;

  return (
    <div className="space-y-4">
      {hasError ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load classes</AlertTitle>
          <AlertDescription>
            {getApiErrorMessage(classesQuery.error)}
          </AlertDescription>
        </Alert>
      ) : null}

      <VerticalDataViews
        items={[
          { id: "classes", label: "Classes", count: classes.length },
          { id: "streams", label: "Streams", count: streams.length },
        ]}
        value={activeView}
        onValueChange={(value) => setActiveView(value as ClassesView)}
        railLabel="Class Views"
      >
        <div className={activeView === "classes" ? "space-y-2" : "hidden"}>
          <div className="flex items-center justify-between">
            <h2 className="text-section-title">Classes</h2>
            <Button size="sm" onClick={() => setClassDialogOpen(true)}>
              Add Class
            </Button>
          </div>
          <DataTable
            data={classes}
            columns={classColumns}
            searchPlaceholder="Search classes"
            searchSubmitLabel="Search"
            pagination={{ enabled: true }}
            emptyState={
              classesQuery.isLoading ? "Loading classes..." : "No classes found."
            }
          />
        </div>

        <div className={activeView === "streams" ? "space-y-2" : "hidden"}>
          <div className="flex items-center justify-between">
            <h2 className="text-section-title">Streams</h2>
          </div>
          <DataTable
            data={streams}
            columns={streamColumns}
            searchPlaceholder="Search streams"
            searchSubmitLabel="Search"
            pagination={{ enabled: true }}
            emptyState={
              classesQuery.isLoading ? "Loading streams..." : "No streams found."
            }
          />
        </div>
      </VerticalDataViews>

      {/* Create Class Dialog */}
      <Dialog open={classDialogOpen} onOpenChange={handleClassDialogOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Class</DialogTitle>
            <DialogDescription>Enter the class details below.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleClassSubmit} className="space-y-4">
            {createClassMutation.error ? (
              <Alert variant="destructive">
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{getApiErrorMessage(createClassMutation.error)}</AlertDescription>
              </Alert>
            ) : null}
            <div className="space-y-2">
              <label htmlFor="class-code" className="text-sm font-medium">
                Code <span className="text-destructive">*</span>
              </label>
              <Input
                id="class-code"
                value={classForm.code}
                onChange={(e) => setClassForm((f) => ({ ...f, code: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="class-name" className="text-sm font-medium">
                Name <span className="text-destructive">*</span>
              </label>
              <Input
                id="class-name"
                value={classForm.name}
                onChange={(e) => setClassForm((f) => ({ ...f, name: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="class-level" className="text-sm font-medium">
                Level
              </label>
              <Input
                id="class-level"
                type="number"
                value={classForm.level}
                onChange={(e) => setClassForm((f) => ({ ...f, level: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="class-capacity" className="text-sm font-medium">
                Capacity
              </label>
              <Input
                id="class-capacity"
                type="number"
                value={classForm.capacity}
                onChange={(e) => setClassForm((f) => ({ ...f, capacity: e.target.value }))}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleClassDialogOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createClassMutation.isPending}>
                {createClassMutation.isPending ? "Saving…" : "Add Class"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
