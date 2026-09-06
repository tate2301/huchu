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
  createGoldExpenseType,
  deleteGoldExpenseType,
  fetchGoldExpenseTypes,
  type GoldExpenseType,
  updateGoldExpenseType,
} from "@/lib/api";
import { getApiErrorMessage, resolveDisplayErrorMessage } from "@corelithzw/platform/api-client";

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
  const [search, setSearch] = useState("");
  const rows = useMemo(() => {
    const all = data ?? [];
    const needle = search.trim().toLowerCase();
    if (!needle) return all;
    return all.filter((row) => row.name.toLowerCase().includes(needle));
  }, [data, search]);

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

  const columns = useMemo<DataTableColumn<GoldExpenseType>[]>(
    () => [
      { key: "name", header: "Expense Type", sortable: true },
      { key: "sortOrder", header: "Sort", sortable: true, width: 100 },
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
    <MasterDataPage<GoldExpenseType>
      title="Gold Expense Types"
      description="What gold-room spending can be booked against."
      createLabel="New expense type"
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
      emptyLabel="No expense type records available."
      search={
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search expense types"
          aria-label="Search expense types"
          className="h-9 w-full sm:w-64"
        />
      }
      renderDetail={(row, close) => (
        <div className="space-y-4">
          <div className="space-y-3">
            <DetailFact label="Expense type">{row.name}</DetailFact>
            <DetailFact label="Sort order">{row.sortOrder}</DetailFact>
            <DetailFact label="Status">{row.isActive ? "Active" : "Inactive"}</DetailFact>
          </div>

          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setEditing(row);
                setFormState({
                  name: row.name,
                  sortOrder: String(row.sortOrder),
                  isActive: row.isActive,
                });
                setFormOpen(true);
              }}
            >
              Edit
            </Button>
            {row.isActive ? (
              <Button
                size="sm"
                variant="outline"
                disabled={deleteMutation.isPending}
                onClick={() => {
                  if (window.confirm("Confirm archival of this gold expense type.")) {
                    deleteMutation.mutate(row.id, { onSuccess: close });
                  }
                }}
              >
                Archive
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                disabled={updateMutation.isPending}
                onClick={() =>
                  updateMutation.mutate({ id: row.id, input: { isActive: true } })
                }
              >
                Set Active
              </Button>
            )}
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
    </MasterDataPage>
  );
}
