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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/components/ui/use-toast";
import {
  type CostCenterRecord,
  type JournalEntryRecord,
  fetchChartOfAccounts,
  fetchCostCenters,
  fetchJournalEntries,
} from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { Plus } from "@/lib/icons";

const statusOptions = ["DRAFT", "POSTED"] as const;

type JournalLineForm = {
  accountId: string;
  debit: string;
  credit: string;
  memo: string;
  costCenterId: string;
};

export default function JournalsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [entryDate, setEntryDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [description, setDescription] = useState("");
  const [entryStatus, setEntryStatus] = useState<(typeof statusOptions)[number]>("DRAFT");
  const [lines, setLines] = useState<JournalLineForm[]>([
    { accountId: "", debit: "", credit: "", memo: "", costCenterId: "" },
    { accountId: "", debit: "", credit: "", memo: "", costCenterId: "" },
  ]);

  const {
    data: journalData,
    isLoading: journalsLoading,
    error: journalsError,
  } = useQuery({
    queryKey: ["accounting", "journals"],
    queryFn: () => fetchJournalEntries({ limit: 200 }),
  });

  const {
    data: accountData,
    isLoading: accountsLoading,
    error: accountsError,
  } = useQuery({
    queryKey: ["accounting", "coa", "active"],
    queryFn: () => fetchChartOfAccounts({ limit: 500, active: true }),
  });

  const { data: costCenterData } = useQuery({
    queryKey: ["accounting", "cost-centers"],
    queryFn: () => fetchCostCenters({ limit: 200, active: true }),
  });

  const journalEntries = useMemo(() => journalData?.data ?? [], [journalData]);
  const accounts = accountData?.data ?? [];
  const costCenters = costCenterData?.data ?? [];

  const filteredEntries = useMemo(() => {
    if (statusFilter === "all") return journalEntries;
    return journalEntries.filter((entry) => entry.status === statusFilter);
  }, [journalEntries, statusFilter]);

  const columns: ColumnDef<JournalEntryRecord>[] = [
    {
      id: "entry",
      header: "Entry",
      accessorKey: "entryNumber",
      cell: ({ row }) => (
        <NumericCell align="left">#{row.original.entryNumber}</NumericCell>
      ),
    },
    {
      id: "date",
      header: "Date",
      accessorKey: "entryDate",
      cell: ({ row }) => (
        <NumericCell align="left">
          {format(new Date(row.original.entryDate), "yyyy-MM-dd")}
        </NumericCell>
      ),
    },
    {
      id: "description",
      header: "Description",
      accessorKey: "description",
      cell: ({ row }) => <span className="font-medium">{row.original.description}</span>,
    },
    {
      id: "status",
      header: "Status",
      accessorKey: "status",
      cell: ({ row }) => (
        <Badge variant={row.original.status === "POSTED" ? "secondary" : "outline"}>
          {row.original.status}
        </Badge>
      ),
    },
    {
      id: "period",
      header: "Period",
      cell: ({ row }) => {
        const period = row.original.period;
        if (!period) return "-";
        return (
          <NumericCell align="left">
            {format(new Date(period.startDate), "yyyy-MM-dd")} to {" "}
            {format(new Date(period.endDate), "yyyy-MM-dd")}
          </NumericCell>
        );
      },
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex justify-end">
          {row.original.status === "DRAFT" ? (
            <Button size="sm" onClick={() => postMutation.mutate(row.original.id)}>
              Post Entry
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  const createMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      fetchJson("/api/accounting/journals", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      toast({
        title: "Journal entry created",
        description: "Your journal entry has been saved.",
        variant: "success",
      });
      resetForm();
      setFormOpen(false);
      queryClient.invalidateQueries({ queryKey: ["accounting", "journals"] });
    },
    onError: (err) => {
      toast({
        title: "Unable to create journal entry",
        description: getApiErrorMessage(err),
        variant: "destructive",
      });
    },
  });

  const postMutation = useMutation({
    mutationFn: async (id: string) =>
      fetchJson(`/api/accounting/journals/${id}/post` as const, {
        method: "POST",
      }),
    onSuccess: () => {
      toast({
        title: "Journal entry posted",
        description: "The entry is now posted to the ledger.",
        variant: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["accounting", "journals"] });
    },
    onError: (err) => {
      toast({
        title: "Unable to post entry",
        description: getApiErrorMessage(err),
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setEntryDate(format(new Date(), "yyyy-MM-dd"));
    setDescription("");
    setEntryStatus("DRAFT");
    setLines([
      { accountId: "", debit: "", credit: "", memo: "", costCenterId: "" },
      { accountId: "", debit: "", credit: "", memo: "", costCenterId: "" },
    ]);
  };

  const totals = useMemo(() => {
    const debit = lines.reduce((sum, line) => sum + (Number(line.debit) || 0), 0);
    const credit = lines.reduce((sum, line) => sum + (Number(line.credit) || 0), 0);
    return { debit, credit, balanced: Math.abs(debit - credit) <= 0.01 };
  }, [lines]);

  const updateLine = (index: number, field: keyof JournalLineForm, value: string) => {
    setLines((prev) =>
      prev.map((line, idx) => (idx === index ? { ...line, [field]: value } : line)),
    );
  };

  const addLine = () => {
    setLines((prev) => [...prev, { accountId: "", debit: "", credit: "", memo: "", costCenterId: "" }]);
  };

  const removeLine = (index: number) => {
    if (lines.length <= 2) return;
    setLines((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    if (!description.trim()) {
      toast({
        title: "Missing description",
        description: "Please enter a journal entry description.",
        variant: "destructive",
      });
      return;
    }

    const preparedLines = lines
      .map((line) => ({
        accountId: line.accountId,
        debit: Number(line.debit) || 0,
        credit: Number(line.credit) || 0,
        memo: line.memo.trim() || undefined,
        costCenterId: line.costCenterId || undefined,
      }))
      .filter((line) => line.accountId && (line.debit > 0 || line.credit > 0));

    if (preparedLines.length < 2) {
      toast({
        title: "Incomplete lines",
        description: "Provide at least two valid journal lines.",
        variant: "destructive",
      });
      return;
    }

    if (!totals.balanced) {
      toast({
        title: "Entry is not balanced",
        description: "Total debits must equal total credits.",
        variant: "destructive",
      });
      return;
    }

    createMutation.mutate({
      entryDate,
      description: description.trim(),
      status: entryStatus,
      lines: preparedLines,
    });
  };

  return (
    <AccountingShell
      activeTab="journals"
      title="Journal Entries"
      description="Create and post manual journals to keep the ledger up to date."
      actions={
        <Button size="sm" onClick={() => setFormOpen(true)}>
          <Plus className="mr-2 size-4" />
          New Entry
        </Button>
      }
    >
      {(journalsError || accountsError) ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load journals</AlertTitle>
          <AlertDescription>{getApiErrorMessage(journalsError || accountsError)}</AlertDescription>
        </Alert>
      ) : null}

      <DataTable
        data={filteredEntries}
        columns={columns}
        searchPlaceholder="Search journals"
        searchSubmitLabel="Search"
        pagination={{ enabled: true }}
        toolbar={
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger size="sm" className="h-8 w-[160px]">
              <SelectValue placeholder="Filter status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="DRAFT">Draft</SelectItem>
              <SelectItem value="POSTED">Posted</SelectItem>
            </SelectContent>
          </Select>
        }
        emptyState={journalsLoading ? "Loading journals..." : "No journal entries yet."}
      />

      <Sheet open={formOpen} onOpenChange={setFormOpen}>
        <SheetContent className="w-full sm:max-w-3xl p-6 overflow-y-auto">
          <SheetHeader>
            <SheetTitle>New Journal Entry</SheetTitle>
            <SheetDescription>
              Keep debits and credits balanced before posting to the ledger.
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-semibold mb-2">Entry Date *</label>
                <Input
                  type="date"
                  value={entryDate}
                  onChange={(event) => setEntryDate(event.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Status</label>
                <Select value={entryStatus} onValueChange={(value) => setEntryStatus(value as "DRAFT" | "POSTED")}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    {statusOptions.map((status) => (
                      <SelectItem key={status} value={status}>
                        {status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold mb-2">Description *</label>
              <Input
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Month-end payroll accrual"
                required
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Entry Lines</h3>
                <Button type="button" size="sm" variant="outline" onClick={addLine}>
                  Add Line
                </Button>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[220px]">Account</TableHead>
                    <TableHead className="w-[140px] text-right">Debit</TableHead>
                    <TableHead className="w-[140px] text-right">Credit</TableHead>
                    <TableHead>Memo</TableHead>
                    <TableHead className="w-[160px]">Cost Center</TableHead>
                    <TableHead className="w-[90px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line, index) => (
                    <TableRow key={`line-${index}`}>
                      <TableCell>
                        <Select
                          value={line.accountId}
                          onValueChange={(value) => updateLine(index, "accountId", value)}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder={accountsLoading ? "Loading..." : "Select account"} />
                          </SelectTrigger>
                          <SelectContent>
                            {accounts.map((account) => (
                              <SelectItem key={account.id} value={account.id}>
                                {account.code} - {account.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={line.debit}
                          onChange={(event) => updateLine(index, "debit", event.target.value)}
                          className="text-right font-mono"
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={line.credit}
                          onChange={(event) => updateLine(index, "credit", event.target.value)}
                          className="text-right font-mono"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={line.memo}
                          onChange={(event) => updateLine(index, "memo", event.target.value)}
                          placeholder="Optional memo"
                        />
                      </TableCell>
                      <TableCell>
                        <Select
                          value={line.costCenterId}
                          onValueChange={(value) => updateLine(index, "costCenterId", value)}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Optional" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">No cost center</SelectItem>
                            {costCenters.map((center: CostCenterRecord) => (
                              <SelectItem key={center.id} value={center.id}>
                                {center.code} - {center.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-right">
                        {lines.length > 2 ? (
                          <Button type="button" size="sm" variant="ghost" onClick={() => removeLine(index)}>
                            Remove
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="flex justify-end gap-6 text-sm">
                <span className="text-muted-foreground">
                  Total Debit: <span className="font-mono">{totals.debit.toFixed(2)}</span>
                </span>
                <span className="text-muted-foreground">
                  Total Credit: <span className="font-mono">{totals.credit.toFixed(2)}</span>
                </span>
                <Badge variant={totals.balanced ? "secondary" : "destructive"}>
                  {totals.balanced ? "Balanced" : "Not Balanced"}
                </Badge>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="submit"
                className="flex-1"
                disabled={createMutation.isPending}
              >
                Save Entry
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
