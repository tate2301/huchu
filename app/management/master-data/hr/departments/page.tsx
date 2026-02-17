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
  createDepartment,
  deleteDepartment,
  fetchDepartments,
  type DepartmentRecord,
  updateDepartment,
} from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-client";
import { Pencil, Plus, Trash2 } from "@/lib/icons";

type DepartmentFormState = {
  code: string;
  name: string;
  isActive: boolean;
};

const emptyForm: DepartmentFormState = {
  code: "",
  name: "",
  isActive: true,
};

export default function DepartmentsManagementPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<DepartmentRecord | null>(null);
  const [formState, setFormState] = useState<DepartmentFormState>(emptyForm);

  const { data, isLoading, error } = useQuery({
    queryKey: ["management", "master-data", "departments"],
    queryFn: () => fetchDepartments({ limit: 500 }),
  });

  const rows = data?.data ?? [];

  const createMutation = useMutation({
    mutationFn: createDepartment,
    onSuccess: () => {
      toast({
        title: "Department created",
        description: "Department has been added successfully.",
        variant: "success",
      });
      setFormOpen(false);
      setFormState(emptyForm);
      queryClient.invalidateQueries({ queryKey: ["management", "master-data", "departments"] });
    },
    onError: (err) => {
      toast({
        title: "Unable to create department",
        description: getApiErrorMessage(err),
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (payload: { id: string; input: Parameters<typeof updateDepartment>[1] }) =>
      updateDepartment(payload.id, payload.input),
    onSuccess: () => {
      toast({
        title: "Department updated",
        description: "Department changes saved.",
        variant: "success",
      });
      setFormOpen(false);
      setEditing(null);
      setFormState(emptyForm);
      queryClient.invalidateQueries({ queryKey: ["management", "master-data", "departments"] });
    },
    onError: (err) => {
      toast({
        title: "Unable to update department",
        description: getApiErrorMessage(err),
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteDepartment,
    onSuccess: () => {
      toast({
        title: "Department deleted",
        description: "Department has been removed.",
        variant: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["management", "master-data", "departments"] });
    },
    onError: (err) => {
      toast({
        title: "Unable to delete department",
        description: getApiErrorMessage(err),
        variant: "destructive",
      });
    },
  });

  const columns = useMemo<ColumnDef<DepartmentRecord>[]>(
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
                if (window.confirm("Delete this department?")) {
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

    if (editing) {
      updateMutation.mutate({
        id: editing.id,
        input: {
          code: formState.code.trim(),
          name: formState.name.trim(),
          isActive: formState.isActive,
        },
      });
      return;
    }

    createMutation.mutate({
      code: formState.code.trim(),
      name: formState.name.trim(),
      isActive: formState.isActive,
    });
  };

  return (
    <MasterDataShell
      activeTab="departments"
      title="Departments"
      description="Manage department lookup values for employee and compensation workflows."
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
          New Department
        </Button>
      }
    >
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load departments</AlertTitle>
          <AlertDescription>{getApiErrorMessage(error)}</AlertDescription>
        </Alert>
      ) : null}

      <DataTable
        data={rows}
        columns={columns}
        searchPlaceholder="Search departments"
        searchSubmitLabel="Search"
        pagination={{ enabled: true }}
        emptyState={isLoading ? "Loading departments..." : "No departments found."}
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
            <SheetTitle>{editing ? "Edit Department" : "New Department"}</SheetTitle>
            <SheetDescription>
              {editing
                ? "Update department details."
                : "Create a department for HR and compensation assignment."}
            </SheetDescription>
          </SheetHeader>
          <form onSubmit={handleSave} className="mt-6 space-y-4">
            <div>
              <label className="mb-2 block text-sm font-semibold">Code *</label>
              <Input
                value={formState.code}
                onChange={(event) => setFormState((prev) => ({ ...prev, code: event.target.value }))}
                placeholder="MINING"
                required
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold">Name *</label>
              <Input
                value={formState.name}
                onChange={(event) => setFormState((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Mining Operations"
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
                {editing ? "Save Changes" : "Create Department"}
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </MasterDataShell>
  );
}
