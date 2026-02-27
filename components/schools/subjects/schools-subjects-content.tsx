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
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import {
  fetchSchoolsSubjects,
  type SchoolsSubjectRecord,
} from "@/lib/schools/admin-v2";

const initialSubjectForm = { code: "", name: "", isCore: true, passMark: "50" };

export function SchoolsSubjectsContent() {
  const queryClient = useQueryClient();

  const [subjectDialogOpen, setSubjectDialogOpen] = useState(false);
  const [subjectForm, setSubjectForm] = useState(initialSubjectForm);

  const createSubjectMutation = useMutation({
    mutationFn: async (payload: typeof subjectForm) =>
      fetchJson("/api/v2/schools/subjects", {
        method: "POST",
        body: JSON.stringify({
          code: payload.code,
          name: payload.name,
          isCore: payload.isCore,
          passMark: payload.passMark ? Number(payload.passMark) : 50,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schools", "subjects"] });
      setSubjectForm(initialSubjectForm);
      setSubjectDialogOpen(false);
    },
  });

  const handleSubjectDialogOpenChange = (open: boolean) => {
    setSubjectDialogOpen(open);
    if (!open) {
      setSubjectForm(initialSubjectForm);
      createSubjectMutation.reset();
    }
  };

  const handleSubjectSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subjectForm.code || !subjectForm.name) return;
    createSubjectMutation.mutate(subjectForm);
  };

  const subjectsQuery = useQuery({
    queryKey: ["schools", "subjects"],
    queryFn: () => fetchSchoolsSubjects({ page: 1, limit: 200 }),
  });

  const subjects = useMemo(() => {
    const raw = subjectsQuery.data;
    if (!raw) return [];
    return Array.isArray(raw) ? raw : raw.data ?? [];
  }, [subjectsQuery.data]);

  const subjectColumns = useMemo<ColumnDef<SchoolsSubjectRecord>[]>(
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
        id: "type",
        header: "Type",
        cell: ({ row }) => (
          <Badge variant={row.original.isCore ? "secondary" : "outline"}>
            {row.original.isCore ? "Core" : "Elective"}
          </Badge>
        ),
      },
      {
        accessorKey: "passMark",
        header: "Pass Mark",
        cell: ({ row }) => <NumericCell>{row.original.passMark}</NumericCell>,
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => (
          <Badge variant={row.original.isActive ? "secondary" : "destructive"}>
            {row.original.isActive ? "Active" : "Inactive"}
          </Badge>
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-4">
      {subjectsQuery.error ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load subjects</AlertTitle>
          <AlertDescription>
            {getApiErrorMessage(subjectsQuery.error)}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-2">
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
          emptyState={
            subjectsQuery.isLoading ? "Loading subjects..." : "No subjects found."
          }
        />
      </div>

      {/* Create Subject Dialog */}
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
                min="0"
                max="100"
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
    </div>
  );
}
