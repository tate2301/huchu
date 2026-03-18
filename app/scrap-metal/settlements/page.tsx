"use client";

import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ScrapShell } from "@/components/scrap-metal/scrap-shell";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { VerticalDataViews } from "@/components/ui/vertical-data-views";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { Plus } from "@/lib/icons";

type BalanceRecord = {
  id: string;
  balance: number;
  lastUpdated: string;
  employee: {
    id: string;
    name: string;
    employeeId: string;
  };
};

type PayoutBatch = {
  id: string;
  label: string;
  workflowStatus: string;
  dueDate: string;
  items: Array<{ id: string; amount: number; employee: { id: string; name: string; employeeId: string } }>;
};

type EmployeeOption = { id: string; name: string; employeeId: string };
type BatchItemDraft = { employeeId: string; amount: string; notes: string };

export default function ScrapSettlementsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeView, setActiveView] = useState("balances");
  const [createOpen, setCreateOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [periodStart, setPeriodStart] = useState(new Date().toISOString().slice(0, 10));
  const [periodEnd, setPeriodEnd] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<BatchItemDraft[]>([{ employeeId: "", amount: "", notes: "" }]);

  const balancesQuery = useQuery({
    queryKey: ["scrap-balances"],
    queryFn: () => fetchJson<{ data: BalanceRecord[] }>("/api/scrap-metal/employee-balances?limit=500"),
  });
  const batchesQuery = useQuery({
    queryKey: ["scrap-payout-batches"],
    queryFn: () => fetchJson<{ data: PayoutBatch[] }>("/api/hr/payout-batches?source=SCRAP&limit=500"),
  });
  const employeesQuery = useQuery({
    queryKey: ["employees", "scrap-settlements"],
    queryFn: () => fetchJson<{ data: EmployeeOption[] }>("/api/employees?active=true&limit=500"),
    enabled: createOpen,
  });

  const createBatch = useMutation({
    mutationFn: async () =>
      fetchJson("/api/hr/payout-batches", {
        method: "POST",
        body: JSON.stringify({
          source: "SCRAP",
          label,
          periodStart,
          periodEnd,
          dueDate,
          currency: "USD",
          notes: notes || undefined,
          items: items
            .filter((item) => item.employeeId && item.amount)
            .map((item) => ({
              employeeId: item.employeeId,
              amount: Number(item.amount),
              notes: item.notes || undefined,
            })),
        }),
      }),
    onSuccess: () => {
      toast({ title: "Settlement batch created", variant: "success" });
      setCreateOpen(false);
      setLabel("");
      setNotes("");
      setItems([{ employeeId: "", amount: "", notes: "" }]);
      queryClient.invalidateQueries({ queryKey: ["scrap-payout-batches"] });
    },
    onError: (error) => {
      toast({
        title: "Unable to create settlement batch",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const balances = balancesQuery.data?.data ?? [];
  const batches = batchesQuery.data?.data ?? [];
  const employees = employeesQuery.data?.data ?? [];

  const balanceColumns = useMemo<ColumnDef<BalanceRecord>[]>(
    () => [
      {
        id: "employee",
        header: "Operator",
        accessorFn: (row) => `${row.employee.name} ${row.employee.employeeId}`,
        cell: ({ row }) => (
          <div>
            <div className="font-semibold">{row.original.employee.name}</div>
            <div className="font-mono text-xs text-muted-foreground">
              {row.original.employee.employeeId}
            </div>
          </div>
        ),
      },
      {
        id: "balance",
        header: "Balance",
        cell: ({ row }) => (
          <NumericCell className={row.original.balance > 0 ? "text-amber-700" : "text-emerald-700"}>
            USD {row.original.balance.toFixed(2)}
          </NumericCell>
        ),
      },
      {
        id: "updated",
        header: "Updated",
        cell: ({ row }) => <NumericCell align="left">{row.original.lastUpdated.slice(0, 10)}</NumericCell>,
      },
    ],
    [],
  );

  const batchColumns = useMemo<ColumnDef<PayoutBatch>[]>(
    () => [
      {
        id: "label",
        header: "Batch",
        accessorFn: (row) => row.label,
        cell: ({ row }) => (
          <div>
            <div className="font-semibold">{row.original.label}</div>
            <div className="text-xs text-muted-foreground">{row.original.items.length} operators</div>
          </div>
        ),
      },
      {
        id: "status",
        header: "Workflow",
        cell: ({ row }) => <Badge variant="secondary">{row.original.workflowStatus}</Badge>,
        size: 120,
      },
      {
        id: "dueDate",
        header: "Due Date",
        cell: ({ row }) => <NumericCell align="left">{row.original.dueDate.slice(0, 10)}</NumericCell>,
        size: 120,
      },
      {
        id: "value",
        header: "Value",
        cell: ({ row }) => (
          <NumericCell>
            USD {row.original.items.reduce((sum, item) => sum + item.amount, 0).toFixed(2)}
          </NumericCell>
        ),
        size: 140,
      },
    ],
    [],
  );

  const views = [
    { id: "balances", label: "Operator balances", count: balances.length },
    { id: "batches", label: "Settlement batches", count: batches.length },
  ];

  const loadError = balancesQuery.error || batchesQuery.error;

  return (
    <ScrapShell
      title="Settlements"
      description="Track operator balances and prepare scrap settlement batches for HR disbursement."
      actions={
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          New Settlement Batch
        </Button>
      }
    >
      {loadError ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load settlements</AlertTitle>
          <AlertDescription>{getApiErrorMessage(loadError)}</AlertDescription>
        </Alert>
      ) : null}

      <VerticalDataViews
        items={views}
        value={activeView}
        onValueChange={setActiveView}
        railLabel="Settlement views"
      >
        {activeView === "balances" ? (
          <DataTable
            data={balances}
            columns={balanceColumns}
            features={{ sorting: true, globalFilter: true, pagination: true }}
            pagination={{ enabled: true, server: false }}
            searchPlaceholder="Search operator"
            tableClassName="text-sm"
            emptyState={balancesQuery.isLoading ? "Loading balances..." : "No scrap balances yet"}
          />
        ) : (
          <DataTable
            data={batches}
            columns={batchColumns}
            features={{ sorting: true, globalFilter: true, pagination: true }}
            pagination={{ enabled: true, server: false }}
            searchPlaceholder="Search settlement batch"
            tableClassName="text-sm"
            emptyState={batchesQuery.isLoading ? "Loading batches..." : "No settlement batches yet"}
          />
        )}
      </VerticalDataViews>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>New Settlement Batch</DialogTitle>
            <DialogDescription>Create a scrap settlement batch for review and disbursement.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Batch label" />
            <div className="grid gap-4 sm:grid-cols-3">
              <Input type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} />
              <Input type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} />
              <Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
            </div>
            <Textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Notes" />
            {items.map((item, index) => (
              <div key={`scrap-item-${index}`} className="grid gap-3 rounded-xl bg-[var(--surface-muted)] p-3 sm:grid-cols-[2fr_1fr_2fr_auto]">
                <Select
                  value={item.employeeId || "__none"}
                  onValueChange={(value) =>
                    setItems((current) =>
                      current.map((entry, entryIndex) =>
                        entryIndex === index ? { ...entry, employeeId: value === "__none" ? "" : value } : entry,
                      ),
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select operator" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Select operator</SelectItem>
                    {employees.map((employee) => (
                      <SelectItem key={employee.id} value={employee.id}>
                        {employee.name} ({employee.employeeId})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={item.amount}
                  onChange={(event) =>
                    setItems((current) =>
                      current.map((entry, entryIndex) =>
                        entryIndex === index ? { ...entry, amount: event.target.value } : entry,
                      ),
                    )
                  }
                  placeholder="Amount"
                />
                <Input
                  value={item.notes}
                  onChange={(event) =>
                    setItems((current) =>
                      current.map((entry, entryIndex) =>
                        entryIndex === index ? { ...entry, notes: event.target.value } : entry,
                      ),
                    )
                  }
                  placeholder="Operator note"
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={items.length === 1}
                  onClick={() => setItems((current) => current.filter((_, entryIndex) => entryIndex !== index))}
                >
                  Remove
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setItems((current) => [...current, { employeeId: "", amount: "", notes: "" }])}
            >
              Add Operator
            </Button>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={createBatch.isPending || !label.trim()}
              onClick={() => createBatch.mutate()}
            >
              {createBatch.isPending ? "Creating..." : "Create Batch"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ScrapShell>
  );
}
