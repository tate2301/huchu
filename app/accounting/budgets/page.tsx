"use client";

import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { AccountingShell } from "@/components/accounting/accounting-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { NumericCell } from "@/components/ui/numeric-cell";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useToast } from "@/components/ui/use-toast";
import { type BudgetRecord, fetchBudgets } from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { Plus } from "@/lib/icons";

const today = format(new Date(), "yyyy-MM-dd");

export default function BudgetsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [formState, setFormState] = useState({
    name: "",
    startDate: today,
    endDate: today,
    status: "DRAFT",
    totalAmount: "",
    notes: "",
  });

  const { data: budgetsData, isLoading, error } = useQuery({
    queryKey: ["accounting", "budgets"],
    queryFn: () => fetchBudgets({ limit: 200 }),
  });

  const budgets = useMemo(() => budgetsData?.data ?? [], [budgetsData]);

  const filteredBudgets = useMemo(() => {
    if (statusFilter === "all") return budgets;
    return budgets.filter((budget) => budget.status === statusFilter);
  }, [budgets, statusFilter]);

  const columns = useMemo<ColumnDef<BudgetRecord>[]>(
    () => [
      {
        id: "name",
        header: "Budget",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.name}</div>
            <div className="text-xs text-muted-foreground">
              {format(new Date(row.original.startDate), "yyyy-MM-dd")} to {" "}
              {format(new Date(row.original.endDate), "yyyy-MM-dd")}
            </div>
          </div>
        ),
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => (
          <Badge variant={row.original.status === "ACTIVE" ? "secondary" : "outline"}>
            {row.original.status}
          </Badge>
        ),
      },
      {
        id: "total",
        header: "Total Amount",
        cell: ({ row }) => <NumericCell>{row.original.totalAmount.toFixed(2)}</NumericCell>,
      },
    ],
    [],
  );

  const createMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      fetchJson("/api/accounting/budgets", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      toast({
        title: "Budget created",
        description: "Budget saved successfully.",
        variant: "success",
      });
      setFormOpen(false);
      setFormState({
        name: "",
        startDate: today,
        endDate: today,
        status: "DRAFT",
        totalAmount: "",
        notes: "",
      });
      queryClient.invalidateQueries({ queryKey: ["accounting", "budgets"] });
    },
    onError: (err) => {
      toast({
        title: "Unable to create budget",
        description: getApiErrorMessage(err),
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    if (!formState.name.trim() || !formState.totalAmount) {
      toast({
        title: "Missing details",
        description: "Budget name and total amount are required.",
        variant: "destructive",
      });
      return;
    }

    createMutation.mutate({
      name: formState.name.trim(),
      startDate: formState.startDate,
      endDate: formState.endDate,
      status: formState.status,
      totalAmount: Number(formState.totalAmount),
      notes: formState.notes.trim() || undefined,
    });
  };

  return (
    <AccountingShell
      activeTab="budgets"
      title="Budgets"
      description="Set budget totals for planning and monitoring spend."
      actions={
        <Button size="sm" onClick={() => setFormOpen(true)}>
          <Plus className="mr-2 size-4" />
          New Budget
        </Button>
      }
    >
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load budgets</AlertTitle>
          <AlertDescription>{getApiErrorMessage(error)}</AlertDescription>
        </Alert>
      ) : null}

      <DataTable
        data={filteredBudgets}
        columns={columns}
        searchPlaceholder="Search budgets"
        searchSubmitLabel="Search"
        pagination={{ enabled: true }}
        toolbar={
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger size="sm" className="h-8 w-[180px]">
              <SelectValue placeholder="Filter status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="DRAFT">Draft</SelectItem>
              <SelectItem value="ACTIVE">Active</SelectItem>
              <SelectItem value="CLOSED">Closed</SelectItem>
            </SelectContent>
          </Select>
        }
        emptyState={isLoading ? "Loading budgets..." : "No budgets found."}
      />

      <Sheet open={formOpen} onOpenChange={setFormOpen}>
        <SheetContent className="w-full sm:max-w-lg p-6">
          <SheetHeader>
            <SheetTitle>New Budget</SheetTitle>
            <SheetDescription>Plan budgets for future periods.</SheetDescription>
          </SheetHeader>
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label className="block text-sm font-semibold mb-2">Budget Name *</label>
              <Input
                value={formState.name}
                onChange={(event) => setFormState((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="FY2026 Budget"
                required
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-semibold mb-2">Start Date *</label>
                <Input
                  type="date"
                  value={formState.startDate}
                  onChange={(event) => setFormState((prev) => ({ ...prev, startDate: event.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">End Date *</label>
                <Input
                  type="date"
                  value={formState.endDate}
                  onChange={(event) => setFormState((prev) => ({ ...prev, endDate: event.target.value }))}
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-semibold mb-2">Status</label>
                <Select
                  value={formState.status}
                  onValueChange={(value) => setFormState((prev) => ({ ...prev, status: value }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DRAFT">Draft</SelectItem>
                    <SelectItem value="ACTIVE">Active</SelectItem>
                    <SelectItem value="CLOSED">Closed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Total Amount *</label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formState.totalAmount}
                  onChange={(event) =>
                    setFormState((prev) => ({ ...prev, totalAmount: event.target.value }))
                  }
                  className="text-right font-mono"
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold mb-2">Notes</label>
              <Input
                value={formState.notes}
                onChange={(event) => setFormState((prev) => ({ ...prev, notes: event.target.value }))}
                placeholder="Optional notes"
              />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="submit" className="flex-1" disabled={createMutation.isPending}>
                Save Budget
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
