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
  createGoldExpenseType,
  deleteGoldExpenseType,
  fetchGoldExpenseTypes,
  type GoldExpenseType,
  updateGoldExpenseType,
} from "@/lib/api";
import { getApiErrorMessage, resolveDisplayErrorMessage } from "@/lib/api-client";
import { Pencil, Plus, Trash2 } from "@/lib/icons";

type GoldExpenseTypeFormState = {
  name: string;
  sortOrder: string;
  isActive: boolean;
};

const emptyForm: GoldExpenseTypeFormState = {
  name: "",
  sortOrder: "0",
  isActive: true,
};

export default function GoldExpenseTypesManagementPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<GoldExpenseType | null>(null);
  const [formState, setFormState] = useState<GoldExpenseTypeFormState>(emptyForm);

  const { data, isLoading, error } = useQuery({
    queryKey: ["management", "master-data", "gold-expense-types"],
    queryFn: () => fetchGoldExpenseTypes({ active: "all" }),
  });
  const loadErrorMessage = resolveDisplayErrorMessage([error]);
  const rows = data ?? [];

  const createMutation = useMutation({
    mutationFn: createGoldExpenseType,
    onSuccess: () => {
      toast({
        title: "Gold expense type created",
        description: "Expense type record created.",
        variant: "success",
      });
      setFormOpen(false);
      setFormState(emptyForm);
      queryClient.invalidateQueries({ queryKey: ["management", "master-data", "gold-expense-types"] });
    },
    onError: (err) => {
      toast({
        title: "Unable to create expense type",
        description: getApiErrorMessage(err),
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (payload: { id: string; input: Parameters<typeof updateGoldExpenseType>[1] }) =>
      updateGoldExpenseType(payload.id, payload.input),
    onSuccess: () => {
      toast({
        title: "Gold expense type updated",
        description: "Expense type record updated.",
        variant: "success",
      });
      setFormOpen(false);
      setEditing(null);
      setFormState(emptyForm);
      queryClient.invalidateQueries({ queryKey: ["management", "master-data", "gold-expense-types"] });
    },
    onError: (err) => {
      toast({
        title: "Unable to update expense type",
        description: getApiErrorMessage(err),
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteGoldExpenseType,
    onSuccess: () => {
      toast({
        title: "Gold expense type archived",
        description: "Expense type record archived.",
        variant: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["management", "master-data", "gold-expense-types"] });
    },
    onError: (err) => {
      toast({
        title: "Unable to archive expense type",
        description: getApiErrorMessage(err),
        variant: "destructive",
      });
    },
  });

  const columns = useMemo<ColumnDef<GoldExpenseType>[]>(
    () => [
      {
        id: "name",
        header: "Expense Type",
        accessorKey: "name",
        size: 280,
        minSize: 220,
        maxSize: 420,
      },
      {
        id: "sortOrder",
        header: "Sort",
        accessorKey: "sortOrder",
        size: 160,
        minSize: 160,
        maxSize: 160,
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => (
          <Badge variant={row.original.isActive ? "secondary" : "outline"}>
            {row.original.isActive ? "Active" : "Inactive"}
          </Badge>
        ),
        size: 120,
        minSize: 120,
        maxSize: 120,
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
                  name: row.original.name,
                  sortOrder: String(row.original.sortOrder),
                  isActive: row.original.isActive,
                });
                setFormOpen(true);
              }}
            >
              <Pencil className="size-4" />
            </Button>
            {row.original.isActive ? (
              <Button
                size="icon"
                variant="ghost"
                onClick={() => {
                  if (window.confirm("Confirm archival of this gold expense type.")) {
                    deleteMutation.mutate(row.original.id);
                  }
                }}
                disabled={deleteMutation.isPending}
              >
                <Trash2 className="size-4" />
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  updateMutation.mutate({
                    id: row.original.id,
                    input: { isActive: true },
                  })
                }
                disabled={updateMutation.isPending}
              >
                Set Active
              </Button>
            )}
          </div>
        ),
        size: 108,
        minSize: 108,
        maxSize: 108,
      },
    ],
    [deleteMutation, updateMutation],
  );

  const handleSave = (event: React.FormEvent) => {
    event.preventDefault();
    if (!formState.name.trim()) {
      toast({
        title: "Incomplete form",
        description: "Expense type name is required.",
        variant: "destructive",
      });
      return;
    }

    const sortOrder = Number(formState.sortOrder);
    if (!Number.isInteger(sortOrder) || sortOrder < 0) {
      toast({
        title: "Invalid sort order",
        description: "Sort order must be a non-negative whole number.",
        variant: "destructive",
      });
      return;
    }

    const payload = {
      name: formState.name.trim(),
      sortOrder,
      isActive: formState.isActive,
    };

    if (editing) {
      updateMutation.mutate({
        id: editing.id,
        input: payload,
      });
      return;
    }

    createMutation.mutate(payload);
  };

  return (
    <MasterDataShell
      activeTab="gold-expense-types"
      title="Gold Expense Types"
      description="Expense type reference data for gold shift output."
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
          New Expense Type
        </Button>
      }
    >
      {loadErrorMessage ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load gold expense types</AlertTitle>
          <AlertDescription>{loadErrorMessage}</AlertDescription>
        </Alert>
      ) : null}

      <DataTable
        data={rows}
        columns={columns}
        searchPlaceholder="Search expense types"
        searchSubmitLabel="Search"
        pagination={{ enabled: true }}
        emptyState={isLoading ? "Loading expense type records..." : "No expense type records available."}
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
        <SheetContent size="md" className="w-full p-6">
          <SheetHeader>
            <SheetTitle>{editing ? "Edit Expense Type" : "New Expense Type"}</SheetTitle>
            <SheetDescription>
              {editing
                ? "Update expense type details and status."
                : "Create a gold expense type for shift output forms."}
            </SheetDescription>
          </SheetHeader>
          <form onSubmit={handleSave} className="mt-6 space-y-4">
            <div>
              <label className="mb-2 block text-sm font-semibold">Expense Type *</label>
              <Input
                value={formState.name}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, name: event.target.value }))
                }
                placeholder="Diesel"
                required
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold">Sort Order *</label>
              <Input
                type="number"
                min="0"
                step="1"
                value={formState.sortOrder}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, sortOrder: event.target.value }))
                }
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
              <Button
                type="submit"
                className="flex-1"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {editing ? "Save Changes" : "Create Expense Type"}
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </MasterDataShell>
  );
}
