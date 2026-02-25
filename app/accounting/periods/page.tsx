"use client";

import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { AccountingShell } from "@/components/accounting/accounting-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AccountingListView as DataTable } from "@/components/accounting/listview/accounting-list-view";
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
import { type AccountingPeriodRecord, fetchAccountingPeriods } from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { Plus } from "@/lib/icons";

export default function AccountingPeriodsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const {
    data: periodsData,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["accounting", "periods"],
    queryFn: () => fetchAccountingPeriods({ limit: 200 }),
  });

  const periods = useMemo(() => periodsData?.data ?? [], [periodsData]);

  const filteredPeriods = useMemo(() => {
    if (statusFilter === "all") return periods;
    return periods.filter((period) => period.status === statusFilter);
  }, [periods, statusFilter]);

  const columns: ColumnDef<AccountingPeriodRecord>[] = [
    {
      id: "period",
      header: "Period",
      cell: ({ row }) => (
        <NumericCell align="left">
          {format(new Date(row.original.startDate), "yyyy-MM-dd")} to {" "}
          {format(new Date(row.original.endDate), "yyyy-MM-dd")}
        </NumericCell>
      ),
      size: 280,
      minSize: 220,
      maxSize: 420},
    {
      id: "status",
      header: "Status",
      accessorKey: "status",
      cell: ({ row }) => (
        <Badge variant={row.original.status === "OPEN" ? "secondary" : "outline"}>
          {row.original.status}
        </Badge>
      ),
      size: 120,
      minSize: 120,
      maxSize: 120},
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex justify-end">
          {row.original.status === "OPEN" ? (
            <Button size="sm" onClick={() => closeMutation.mutate(row.original.id)}>
              Close Period
            </Button>
          ) : null}
        </div>
      ),
      size: 108,
      minSize: 108,
      maxSize: 108},
  ];

  const createMutation = useMutation({
    mutationFn: async (payload: { startDate: string; endDate: string }) =>
      fetchJson("/api/accounting/periods", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      toast({
        title: "Period created",
        description: "Accounting period opened successfully.",
        variant: "success",
      });
      setFormOpen(false);
      setStartDate("");
      setEndDate("");
      queryClient.invalidateQueries({ queryKey: ["accounting", "periods"] });
    },
    onError: (err) => {
      toast({
        title: "Unable to create period",
        description: getApiErrorMessage(err),
        variant: "destructive",
      });
    },
  });

  const closeMutation = useMutation({
    mutationFn: async (id: string) =>
      fetchJson(`/api/accounting/periods/${id}` as const, {
        method: "PATCH",
        body: JSON.stringify({ status: "CLOSED" }),
      }),
    onSuccess: () => {
      toast({
        title: "Period closed",
        description: "Accounting period has been closed.",
        variant: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["accounting", "periods"] });
    },
    onError: (err) => {
      toast({
        title: "Unable to close period",
        description: getApiErrorMessage(err),
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    if (!startDate || !endDate) {
      toast({
        title: "Missing dates",
        description: "Please provide start and end dates.",
        variant: "destructive",
      });
      return;
    }

    createMutation.mutate({ startDate, endDate });
  };

  return (
    <AccountingShell
      activeTab="periods"
      title="Accounting Periods"
      description="Open and close accounting periods to control posting windows."
      actions={
        <Button size="sm" onClick={() => setFormOpen(true)}>
          <Plus className="mr-2 size-4" />
          New Period
        </Button>
      }
    >
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load accounting periods</AlertTitle>
          <AlertDescription>{getApiErrorMessage(error)}</AlertDescription>
        </Alert>
      ) : null}

      <DataTable
        data={filteredPeriods}
        columns={columns}
        groupBy="status"
        searchPlaceholder="Search periods"
        searchSubmitLabel="Search"
        pagination={{ enabled: true }}
        toolbar={
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger size="sm" className="h-8 w-[160px]">
              <SelectValue placeholder="Filter status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="OPEN">Open</SelectItem>
              <SelectItem value="CLOSED">Closed</SelectItem>
            </SelectContent>
          </Select>
        }
        emptyState={isLoading ? "Loading periods..." : "No accounting periods found."}
      />

      <Sheet open={formOpen} onOpenChange={setFormOpen}>
        <SheetContent size="md" className="w-full p-6">
          <SheetHeader>
            <SheetTitle>Open Accounting Period</SheetTitle>
            <SheetDescription>
              Periods must not overlap. Once closed, entries cannot be posted inside the window.
            </SheetDescription>
          </SheetHeader>
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label className="block text-sm font-semibold mb-2">Start Date *</label>
              <Input
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-2">End Date *</label>
              <Input
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="submit" className="flex-1" disabled={createMutation.isPending}>
                Create Period
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
