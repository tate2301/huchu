"use client";

import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MasterDataShell } from "@/components/management/master-data/master-data-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useToast } from "@/components/ui/use-toast";
import {
  createJobGrade,
  deleteJobGrade,
  fetchJobGrades,
  type JobGradeRecord,
  updateJobGrade,
} from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-client";
import { Pencil, Plus, Trash2 } from "@/lib/icons";

type GradeFormState = {
  code: string;
  name: string;
  rank: string;
  isActive: boolean;
};

const emptyForm: GradeFormState = {
  code: "",
  name: "",
  rank: "0",
  isActive: true,
};

export default function JobGradesManagementPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<JobGradeRecord | null>(null);
  const [formState, setFormState] = useState<GradeFormState>(emptyForm);

  const { data, isLoading, error } = useQuery({
    queryKey: ["management", "master-data", "job-grades"],
    queryFn: () => fetchJobGrades({ limit: 500 }),
  });

  const rows = data?.data ?? [];

  const createMutation = useMutation({
    mutationFn: createJobGrade,
    onSuccess: () => {
      toast({
        title: "Job grade created",
        description: "Job grade has been added successfully.",
        variant: "success",
      });
      setFormOpen(false);
      setFormState(emptyForm);
      queryClient.invalidateQueries({ queryKey: ["management", "master-data", "job-grades"] });
    },
    onError: (err) => {
      toast({
        title: "Unable to create job grade",
        description: getApiErrorMessage(err),
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (payload: { id: string; input: Parameters<typeof updateJobGrade>[1] }) =>
      updateJobGrade(payload.id, payload.input),
    onSuccess: () => {
      toast({
        title: "Job grade updated",
        description: "Job grade changes saved.",
        variant: "success",
      });
      setFormOpen(false);
      setEditing(null);
      setFormState(emptyForm);
      queryClient.invalidateQueries({ queryKey: ["management", "master-data", "job-grades"] });
    },
    onError: (err) => {
      toast({
        title: "Unable to update job grade",
        description: getApiErrorMessage(err),
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteJobGrade,
    onSuccess: () => {
      toast({
        title: "Job grade deleted",
        description: "Job grade has been removed.",
        variant: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["management", "master-data", "job-grades"] });
    },
    onError: (err) => {
      toast({
        title: "Unable to delete job grade",
        description: getApiErrorMessage(err),
        variant: "destructive",
      });
    },
  });

  const columns = useMemo<ColumnDef<JobGradeRecord>[]>(
    () => [
      {
        id: "code",
        header: "Code",
        cell: ({ row }) => <span className="font-mono">{row.original.code}</span>,
      },
      {
        id: "name",
        header: "Name",
        accessorKey: "name",
      },
      {
        id: "rank",
        header: "Rank",
        cell: ({ row }) => row.original.rank,
      },
      {
        id: "employees",
        header: "Employees",
        cell: ({ row }) => row.original._count?.employees ?? 0,
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
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              onClick={() => {
                setEditing(row.original);
                setFormState({
                  code: row.original.code,
                  name: row.original.name,
                  rank: String(row.original.rank),
                  isActive: row.original.isActive,
                });
                setFormOpen(true);
              }}
            >
              <Pencil className="size-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => {
                if (window.confirm("Delete this job grade?")) {
                  deleteMutation.mutate(row.original.id);
                }
              }}
              disabled={deleteMutation.isPending}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ),
      },
    ],
    [deleteMutation],
  );

  const handleSave = (event: React.FormEvent) => {
    event.preventDefault();
    if (!formState.code.trim() || !formState.name.trim()) {
      toast({
        title: "Missing details",
        description: "Code and name are required.",
        variant: "destructive",
      });
      return;
    }

    const rank = Number(formState.rank);
    if (!Number.isInteger(rank) || rank < 0) {
      toast({
        title: "Invalid rank",
        description: "Rank must be a non-negative whole number.",
        variant: "destructive",
      });
      return;
    }

    if (editing) {
      updateMutation.mutate({
        id: editing.id,
        input: {
          code: formState.code.trim(),
          name: formState.name.trim(),
          rank,
          isActive: formState.isActive,
        },
      });
      return;
    }

    createMutation.mutate({
      code: formState.code.trim(),
      name: formState.name.trim(),
      rank,
      isActive: formState.isActive,
    });
  };

  return (
    <MasterDataShell
      activeTab="job-grades"
      title="Job Grades"
      description="Manage employee grade and ranking reference values."
      actions={
        <Button
          size="sm"
          onClick={() => {
            setEditing(null);
            setFormState(emptyForm);
            setFormOpen(true);
          }}
        >
          <Plus className="mr-2 size-4" />
          New Job Grade
        </Button>
      }
    >
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load job grades</AlertTitle>
          <AlertDescription>{getApiErrorMessage(error)}</AlertDescription>
        </Alert>
      ) : null}

      <DataTable
        data={rows}
        columns={columns}
        searchPlaceholder="Search job grades"
        searchSubmitLabel="Search"
        pagination={{ enabled: true }}
        emptyState={isLoading ? "Loading job grades..." : "No job grades found."}
      />

      <Sheet
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) {
            setEditing(null);
            setFormState(emptyForm);
          }
        }}
      >
        <SheetContent className="w-full sm:max-w-lg p-6">
          <SheetHeader>
            <SheetTitle>{editing ? "Edit Job Grade" : "New Job Grade"}</SheetTitle>
            <SheetDescription>
              {editing
                ? "Update grade details and ranking."
                : "Create a job grade for workforce classification."}
            </SheetDescription>
          </SheetHeader>
          <form onSubmit={handleSave} className="mt-6 space-y-4">
            <div>
              <label className="mb-2 block text-sm font-semibold">Code *</label>
              <Input
                value={formState.code}
                onChange={(event) => setFormState((prev) => ({ ...prev, code: event.target.value }))}
                placeholder="G1"
                required
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold">Name *</label>
              <Input
                value={formState.name}
                onChange={(event) => setFormState((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Senior Miner"
                required
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold">Rank *</label>
              <Input
                type="number"
                min="0"
                step="1"
                value={formState.rank}
                onChange={(event) => setFormState((prev) => ({ ...prev, rank: event.target.value }))}
                required
              />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                variant={formState.isActive ? "secondary" : "outline"}
                onClick={() => setFormState((prev) => ({ ...prev, isActive: !prev.isActive }))}
              >
                {formState.isActive ? "Active" : "Inactive"}
              </Button>
              <Button type="submit" className="flex-1" disabled={createMutation.isPending || updateMutation.isPending}>
                {editing ? "Save Changes" : "Create Job Grade"}
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </MasterDataShell>
  );
}
