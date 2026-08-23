"use client";

import { useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AccountingShell } from "@/components/accounting/accounting-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AccountingListView as DataTable } from "@/components/accounting/listview/accounting-list-view";
import { JournalDetailPanel } from "@/components/accounting/journal-detail-panel";
import { BandChip } from "@/components/accounting/band-chip";
import { AccountingEditableListView } from "@/components/accounting/listview/accounting-editable-list-view";
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
import {
  type CostCenterRecord,
  type JournalEntryRecord,
  fetchChartOfAccounts,
  fetchCostCenters,
  fetchJournalEntries,
} from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { FileCheck } from "@/lib/icons";
import { AccountingNewButton } from "@/components/accounting/accounting-new-button";

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
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [formOpen, setFormOpen] = useState(false);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [entryDate, setEntryDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [description, setDescription] = useState("");
  const [entryStatus, setEntryStatus] = useState<(typeof statusOptions)[number]>("DRAFT");
  const [periodOverrideReason, setPeriodOverrideReason] = useState("");
  const [lines, setLines] = useState<JournalLineForm[]>([
    { accountId: "", debit: "", credit: "", memo: "", costCenterId: "" },
    { accountId: "", debit: "", credit: "", memo: "", costCenterId: "" },
  ]);

  useEffect(() => {
    const action = searchParams.get("action");
    if (!action) return;

    const frameId = window.requestAnimationFrame(() => {
      if (action === "new-journal" || action === "new-entry") {
        setFormOpen(true);
      }
    });

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("action");
    const nextQuery = nextParams.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
    return () => window.cancelAnimationFrame(frameId);
  }, [pathname, router, searchParams]);

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

  /**
   * The entry whose lines are showing.
   *
   * Defaults to the newest journal rather than to nothing, so the panel is
   * carrying its weight the moment the page loads instead of showing an empty
   * prompt beside a full table. Falls back cleanly when a filter removes the
   * selected entry from the list.
   */
  const selectedEntry =
    filteredEntries.find((entry) => entry.id === selectedEntryId) ?? filteredEntries[0] ?? null;

  const accountsById = useMemo(
    () => new Map(accounts.map((account) => [account.id, { code: account.code, name: account.name }])),
    [accounts],
  );

  /**
   * Drafts across the whole ledger, not the filtered view.
   *
   * The band chip is a standing fact about the books — "there are three
   * journals nobody has posted" — and it would be worse than useless if it
   * changed to zero the moment somebody filtered the list to Posted.
   */
  const draftCount = useMemo(
    () => journalEntries.filter((entry) => entry.status === "DRAFT").length,
    [journalEntries],
  );

  const columns: ColumnDef<JournalEntryRecord>[] = [
    {
      id: "entry",
      header: "Entry",
      accessorKey: "entryNumber",
      /*
        The reference opens the entry.

        The design's instruction is "click a journal to open its lines", and
        the underlying list view has no row-click of its own. The reference is
        the right target anyway: it is what a person points at when they say
        which journal they mean, and making the whole row clickable would
        fight the row's other controls.
      */
      cell: ({ row }) => (
        <button
          type="button"
          onClick={() => setSelectedEntryId(row.original.id)}
          className="font-mono text-sm font-semibold text-[var(--brand-strong)] hover:underline"
        >
          JE-{row.original.entryNumber}
        </button>
      ),
      size: 112,
      minSize: 112,
      maxSize: 112},
    {
      id: "date",
      header: "Date",
      accessorKey: "entryDate",
      cell: ({ row }) => (
        <NumericCell align="left">
          {format(new Date(row.original.entryDate), "yyyy-MM-dd")}
        </NumericCell>
      ),
      size: 128,
      minSize: 128,
      maxSize: 128},
    {
      id: "description",
      header: "Description",
      accessorKey: "description",
      cell: ({ row }) => <span className="font-medium">{row.original.description}</span>,
      size: 280,
      minSize: 220,
      maxSize: 420},
    {
      id: "status",
      header: "Status",
      accessorKey: "status",
      cell: ({ row }) => (
        <Badge variant={row.original.status === "POSTED" ? "secondary" : "outline"}>
          {row.original.status}
        </Badge>
      ),
      size: 120,
      minSize: 120,
      maxSize: 120},
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
      size: 128,
      minSize: 128,
      maxSize: 128},
    {
      id: "totalDebit",
      header: "Debit",
      cell: ({ row }) => <NumericCell>{(row.original.totalDebit ?? 0).toFixed(2)}</NumericCell>,
      size: 120,
      minSize: 120,
      maxSize: 120},
    {
      id: "totalCredit",
      header: "Credit",
      cell: ({ row }) => <NumericCell>{(row.original.totalCredit ?? 0).toFixed(2)}</NumericCell>,
      size: 120,
      minSize: 120,
      maxSize: 120},
    {
      id: "amount",
      header: "Amount",
      cell: ({ row }) => <NumericCell>{(row.original.amount ?? 0).toFixed(2)}</NumericCell>,
      size: 120,
      minSize: 120,
      maxSize: 120},
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex justify-end">
          {row.original.status === "DRAFT" ? (
            <Button
              size="sm"
              onClick={() => {
                const reason = window.prompt(
                  "Override reason (required only when period/freeze rules block posting). Leave blank if not needed.",
                );
                postMutation.mutate({
                  id: row.original.id,
                  periodOverrideReason: reason?.trim() || undefined,
                });
              }}
            >
              Post Entry
            </Button>
          ) : null}
        </div>
      ),
      size: 108,
      minSize: 108,
      maxSize: 108},
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
    mutationFn: async (input: { id: string; periodOverrideReason?: string }) =>
      fetchJson(`/api/accounting/journals/${input.id}/post` as const, {
        method: "POST",
        body: JSON.stringify({
          periodOverrideReason: input.periodOverrideReason,
        }),
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
    setPeriodOverrideReason("");
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
      periodOverrideReason:
        entryStatus === "POSTED" ? periodOverrideReason.trim() || undefined : undefined,
      lines: preparedLines,
    });
  };

  const lineColumns = [
      {
        key: "account",
        label: "Account",
        width: "220px",
        renderCell: ({ row, rowIndex }: { row: JournalLineForm; rowIndex: number }) => (
          <Select
            value={row.accountId}
            onValueChange={(value) => updateLine(rowIndex, "accountId", value)}
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
        ),
      },
      {
        key: "debit",
        label: "Debit",
        width: "140px",
        align: "right" as const,
        renderCell: ({ row, rowIndex }: { row: JournalLineForm; rowIndex: number }) => (
          <Input
            type="number"
            step="0.01"
            min="0"
            value={row.debit}
            onChange={(event) => updateLine(rowIndex, "debit", event.target.value)}
            className="text-right font-mono"
          />
        ),
      },
      {
        key: "credit",
        label: "Credit",
        width: "140px",
        align: "right" as const,
        renderCell: ({ row, rowIndex }: { row: JournalLineForm; rowIndex: number }) => (
          <Input
            type="number"
            step="0.01"
            min="0"
            value={row.credit}
            onChange={(event) => updateLine(rowIndex, "credit", event.target.value)}
            className="text-right font-mono"
          />
        ),
      },
      {
        key: "memo",
        label: "Memo",
        width: "2fr",
        renderCell: ({ row, rowIndex }: { row: JournalLineForm; rowIndex: number }) => (
          <Input
            value={row.memo}
            onChange={(event) => updateLine(rowIndex, "memo", event.target.value)}
            placeholder="Optional memo"
          />
        ),
      },
      {
        key: "costCenter",
        label: "Cost Center",
        width: "180px",
        renderCell: ({ row, rowIndex }: { row: JournalLineForm; rowIndex: number }) => (
          <Select
            value={row.costCenterId}
            onValueChange={(value) => updateLine(rowIndex, "costCenterId", value)}
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
        ),
      },
      {
        key: "actions",
        label: "",
        width: "100px",
        align: "right" as const,
        renderCell: ({ rowIndex }: { row: JournalLineForm; rowIndex: number }) =>
          lines.length > 2 ? (
            <Button type="button" size="sm" variant="ghost" onClick={() => removeLine(rowIndex)}>
              Remove
            </Button>
          ) : null,
      },
    ];

  return (
    <AccountingShell
      activeTab="journals"
      title="Journals"
      description="every posting into the ledger, and where it came from"
      bandSlot={
        draftCount > 0 ? (
          <BandChip label="In draft" value={String(draftCount)} tone="warn" />
        ) : (
          <BandChip label="In draft" value="0" tone="ok" />
        )
      }
      actions={
        <AccountingNewButton items={[{ label: "New Entry", icon: FileCheck, onClick: () => setFormOpen(true) }]} />
      }
    >
      {(journalsError || accountsError) ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load journals</AlertTitle>
          <AlertDescription>{getApiErrorMessage(journalsError || accountsError)}</AlertDescription>
        </Alert>
      ) : null}

      {/*
        The ledger and the entry, side by side.

        The list alone could tell you a journal existed and what it totalled,
        but not what it did — for that you had to leave the page. A journal is
        only meaningful as its lines: which accounts, which way round, and
        whether the two sides agree. So the lines sit beside the list, pinned,
        and stay there while you scan down.
      */}
      <div className="grid min-w-0 items-start gap-2.5 2xl:grid-cols-[minmax(0,1fr)_430px]">
        <DataTable
          data={filteredEntries}
          columns={columns}
          groupBy="status"
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

        <JournalDetailPanel
          entry={selectedEntry}
          accountsById={accountsById}
          className="2xl:sticky 2xl:top-[calc(var(--stack-top,0px)+0.75rem)]"
        />
      </div>

      <Sheet open={formOpen} onOpenChange={setFormOpen}>
        <SheetContent size="xl" className="w-full p-6 overflow-y-auto">
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
            {entryStatus === "POSTED" ? (
              <div>
                <label className="block text-sm font-semibold mb-2">Override Reason (if required)</label>
                <Input
                  value={periodOverrideReason}
                  onChange={(event) => setPeriodOverrideReason(event.target.value)}
                  placeholder="Reason for posting in frozen/closed period"
                />
              </div>
            ) : null}

            <AccountingEditableListView
              title="Entry Lines"
              addLabel="Add Line"
              onAddRow={addLine}
              rows={lines}
              getRowKey={(_, index) => `line_${index}`}
              columns={lineColumns}
              footer={
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
              }
            />

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
