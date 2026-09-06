"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DataTableColumn } from "@corelithzw/react";
import {
  DetailFact,
  MasterDataPage,
} from "@corelithzw/shell/master-data-page";
import { Badge } from "@corelithzw/ui/components/badge";
import { Button } from "@corelithzw/ui/components/button";
import { Input } from "@corelithzw/ui/components/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@corelithzw/ui/components/sheet";
import { useToast } from "@corelithzw/ui/components/use-toast";
import {
  createJobGrade,
  deleteJobGrade,
  fetchJobGrades,
  type JobGradeRecord,
  updateJobGrade,
} from "@/lib/api";
import { getApiErrorMessage, resolveDisplayErrorMessage } from "@corelithzw/platform/api-client";
import { useReservedId } from "@/hooks/use-reserved-id";

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
  const {
    reservedId,
    isReserving,
    error: reserveError,
  } = useReservedId({
    entity: "JOB_GRADE",
    enabled: formOpen && !editing,
  });
  const resolvedCode = editing ? formState.code : reservedId;

  const { data, isLoading, error } = useQuery({
    queryKey: ["management", "master-data", "job-grades"],
    queryFn: () => fetchJobGrades({ limit: 500 }),
  });
  const loadErrorMessage = resolveDisplayErrorMessage([error]);

  const [search, setSearch] = useState("");
  const rows = useMemo(() => {
    const all = data?.data ?? [];
    const needle = search.trim().toLowerCase();
    if (!needle) return all;
    return all.filter(
      (row) =>
        row.code.toLowerCase().includes(needle) ||
        row.name.toLowerCase().includes(needle),
    );
  }, [data, search]);

  const createMutation = useMutation({
    mutationFn: createJobGrade,
    onSuccess: () => {
      toast({
        title: "Job grade created",
        description: "Job grade record created.",
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
        description: "Job grade record updated.",
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
        description: "Job grade record deleted.",
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

  // No actions column: a row is picked, and what can be done to it lives in
  // the detail pane — not behind forty pencils competing with the data.
  const columns = useMemo<DataTableColumn<JobGradeRecord>[]>(
    () => [
      {
        key: "code",
        header: "Code",
        width: 112,
        render: (row) => <span className="font-mono">{row.code}</span>,
      },
      { key: "name", header: "Name", sortable: true },
      { key: "rank", header: "Rank", sortable: true, width: 120 },
      {
        key: "employees",
        header: "Employees",
        width: 120,
        render: (row) => row._count?.employees ?? 0,
      },
      {
        key: "status",
        header: "Status",
        width: 120,
        render: (row) => (
          <Badge variant={row.isActive ? "secondary" : "outline"}>
            {row.isActive ? "Active" : "Inactive"}
          </Badge>
        ),
      },
    ],
    [],
  );

  const handleSave = (event: React.FormEvent) => {
    event.preventDefault();
    if (!formState.name.trim()) {
      toast({
        title: "Incomplete form",
        description: "Job grade name is required.",
        variant: "destructive",
      });
      return;
    }
    if (!editing && !resolvedCode.trim()) {
      toast({
        title: "Job grade code unavailable",
        description: reserveError ?? "Code reservation is in progress.",
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
          name: formState.name.trim(),
          rank,
          isActive: formState.isActive,
        },
      });
      return;
    }

    createMutation.mutate({
      code: resolvedCode.trim(),
      name: formState.name.trim(),
      rank,
      isActive: formState.isActive,
    });
  };

  return (
    <MasterDataPage<JobGradeRecord>
      title="Job Grades"
      description="Workforce classification: what each grade is called and where it ranks."
      createLabel="New job grade"
      onCreate={() => {
        setEditing(null);
        setFormState(emptyForm);
        setFormOpen(true);
      }}
      columns={columns}
      data={rows}
      rowKey={(row) => row.id}
      isLoading={isLoading}
      error={loadErrorMessage}
      emptyLabel="No job grade records available."
      search={
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search job grades"
          aria-label="Search job grades"
          className="h-9 w-full sm:w-64"
        />
      }
      renderDetail={(row, close) => (
        <div className="space-y-4">
          <div className="space-y-3">
            <DetailFact label="Code">
              <span className="font-mono">{row.code}</span>
            </DetailFact>
            <DetailFact label="Name">{row.name}</DetailFact>
            <DetailFact label="Rank">{row.rank}</DetailFact>
            <DetailFact label="Employees on this grade">
              {row._count?.employees ?? 0}
            </DetailFact>
            <DetailFact label="Status">
              {row.isActive ? "Active" : "Inactive"}
            </DetailFact>
          </div>

          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setEditing(row);
                setFormState({
                  code: row.code,
                  name: row.name,
                  rank: String(row.rank),
                  isActive: row.isActive,
                });
                setFormOpen(true);
              }}
            >
              Edit
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (window.confirm("Confirm deletion of this job grade.")) {
                  deleteMutation.mutate(row.id, { onSuccess: close });
                }
              }}
            >
              Delete
            </Button>
          </div>
        </div>
      )}
    >

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
        <SheetContent size="md" className="w-full p-6">
          <SheetHeader>
            <SheetTitle>{editing ? "Edit Job Grade" : "New Job Grade"}</SheetTitle>
            <SheetDescription>
              {editing
                ? "Update job grade details and ranking."
                : "Create a job grade record for workforce classification."}
            </SheetDescription>
          </SheetHeader>
          <form onSubmit={handleSave} className="mt-6 space-y-4">
            <div>
              <label className="mb-2 block text-sm font-semibold">Code *</label>
              <Input
                value={resolvedCode}
                readOnly
                placeholder={isReserving ? "Reserving code..." : "Auto-generated"}
                required
              />
              <p className="mt-1 text-sm text-muted-foreground">
                {editing
                  ? "Job grade code cannot be changed."
                  : reserveError ?? "Code is generated automatically and cannot be edited."}
              </p>
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
              <Button type="submit" className="flex-1" disabled={createMutation.isPending || updateMutation.isPending || (!editing && (isReserving || !resolvedCode))}>
                {editing ? "Save Changes" : "Create Job Grade"}
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </MasterDataPage>
  );
}
