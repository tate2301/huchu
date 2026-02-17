"use client";

import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AccountingShell } from "@/components/accounting/accounting-shell";
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
import { type CostCenterRecord, fetchCostCenters } from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { Plus } from "@/lib/icons";
import { useReservedId } from "@/hooks/use-reserved-id";

export default function CostCentersPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [formState, setFormState] = useState({ code: "", name: "", isActive: true });
  const {
    reservedId,
    isReserving,
    error: reserveError,
  } = useReservedId({
    entity: "COST_CENTER",
    enabled: formOpen,
  });

  const { data: costCentersData, isLoading, error } = useQuery({
    queryKey: ["accounting", "cost-centers"],
    queryFn: () => fetchCostCenters({ limit: 200 }),
  });

  const costCenters = costCentersData?.data ?? [];

  const columns = useMemo<ColumnDef<CostCenterRecord>[]>(
    () => [
      {
        id: "code",
        header: "Code",
        cell: ({ row }) => <span className="font-mono">{row.original.code}</span>,
      },
      {
        id: "name",
        header: "Cost Center",
        accessorKey: "name",
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

  const createMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      fetchJson("/api/accounting/cost-centers", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      toast({
        title: "Cost center created",
        description: "Cost center saved successfully.",
        variant: "success",
      });
      setFormOpen(false);
      setFormState({ code: "", name: "", isActive: true });
      queryClient.invalidateQueries({ queryKey: ["accounting", "cost-centers"] });
    },
    onError: (err) => {
      toast({
        title: "Unable to create cost center",
        description: getApiErrorMessage(err),
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    if (!formState.name.trim()) {
      toast({
        title: "Missing details",
        description: "Name is required.",
        variant: "destructive",
      });
      return;
    }

    if (!reservedId.trim()) {
      toast({
        title: "Unable to reserve cost center code",
        description: reserveError ?? "Please wait for code reservation to complete.",
        variant: "destructive",
      });
      return;
    }

    createMutation.mutate({
      code: reservedId.trim(),
      name: formState.name.trim(),
      isActive: formState.isActive,
    });
  };

  return (
    <AccountingShell
      activeTab="cost-centers"
      title="Cost Centers"
      description="Group expenses and revenue by cost center."
      actions={
        <Button size="sm" onClick={() => setFormOpen(true)}>
          <Plus className="mr-2 size-4" />
          New Cost Center
        </Button>
      }
    >
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load cost centers</AlertTitle>
          <AlertDescription>{getApiErrorMessage(error)}</AlertDescription>
        </Alert>
      ) : null}

      <DataTable
        data={costCenters}
        columns={columns}
        searchPlaceholder="Search cost centers"
        searchSubmitLabel="Search"
        pagination={{ enabled: true }}
        emptyState={isLoading ? "Loading cost centers..." : "No cost centers found."}
      />

      <Sheet open={formOpen} onOpenChange={setFormOpen}>
        <SheetContent size="md" className="w-full p-6">
          <SheetHeader>
            <SheetTitle>New Cost Center</SheetTitle>
            <SheetDescription>Define a cost center for allocation and reporting.</SheetDescription>
          </SheetHeader>
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label className="block text-sm font-semibold mb-2">Code *</label>
              <Input
                value={reservedId}
                readOnly
                placeholder={isReserving ? "Reserving..." : "Auto-generated"}
                required
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {reserveError ?? "Code is auto-generated and cannot be edited."}
              </p>
            </div>
            <div>
              <label className="block text-sm font-semibold mb-2">Name *</label>
              <Input
                value={formState.name}
                onChange={(event) => setFormState((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Administration"
                required
              />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="submit"
                className="flex-1"
                disabled={createMutation.isPending || isReserving || !reservedId}
              >
                Save Cost Center
              </Button>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </AccountingShell>
  );
}
