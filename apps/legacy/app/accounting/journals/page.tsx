"use client";

import { useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AccountingShell } from "@/components/accounting/accounting-shell";
import { Alert, AlertDescription, AlertTitle } from "@corelithzw/ui/components/alert";
import { Badge } from "@corelithzw/ui/components/badge";
import { Button } from "@corelithzw/ui/components/button";
import { AccountingListView as DataTable } from "@/components/accounting/listview/accounting-list-view";
import {
  JournalDetailPanel,
  journalStatusLabel,
  journalStatusOf,
  journalStatusTone,
  type JournalStatus,
} from "@/components/accounting/journal-detail-panel";
import { BandChip } from "@/components/accounting/band-chip";
import { AccountingEditableListView } from "@/components/accounting/listview/accounting-editable-list-view";
import { Card, CardHeader, CardTitle } from "@corelithzw/ui/components/card";
import { Input } from "@corelithzw/ui/components/input";
import { NumericCell } from "@corelithzw/ui/components/numeric-cell";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@corelithzw/ui/components/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@corelithzw/ui/components/sheet";
import { useToast } from "@corelithzw/ui/components/use-toast";
import {
  type CostCenterRecord,
  type JournalEntryRecord,
  fetchChartOfAccounts,
  fetchCostCenters,
  fetchJournalEntries,
} from "@/lib/api";
import { formatAmount } from "@/lib/accounting/format";
import { fetchJson, getApiErrorMessage } from "@corelithzw/platform/api-client";
import { FileCheck } from "@corelithzw/ui/lib/icons";
import { cn } from "@corelithzw/ui/lib/utils";
import { AccountingNewButton } from "@/components/accounting/accounting-new-button";

/**
 * The two states a journal can be written in.
 *
 * Reversal and voiding are things that happen to an entry afterwards, not ways
 * of composing one, so the new-entry form offers only these two even though the
 * lifecycle below has four.
 */
const statusOptions = ["DRAFT", "POSTED"] as const;

const lifecycle = ["DRAFT", "POSTED", "REVERSED", "VOIDED"] as const;

type StatusFilter = "all" | JournalStatus;

/**
 * The lifecycle, as a filter.
 *
 * Drawn as a segmented track rather than a dropdown because the states are
 * few, fixed and mutually exclusive, and because each one carries a count —
 * "three drafts" is worth seeing without opening a menu first.
 */
const statusTabs: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  ...lifecycle.map((value) => ({ value, label: journalStatusLabel[value] })),
];

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
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
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

  /**
   * Newest first, and said so in the panel head.
   *
   * A ledger is read from the most recent posting backwards — what happened
   * today, then yesterday — so the order is fixed here rather than left to
   * whatever order the API happened to return. Entry number breaks the tie
   * when several journals share a date, which on a busy day is most of them.
   */
  const orderedEntries = useMemo(
    () =>
      [...journalEntries].sort((a, b) => {
        const byDate = new Date(b.entryDate).getTime() - new Date(a.entryDate).getTime();
        return byDate !== 0 ? byDate : b.entryNumber - a.entryNumber;
      }),
    [journalEntries],
  );

  /**
   * Counts on the filter, taken from the whole ledger.
   *
   * Each segment says how many journals it would show, which only means
   * anything if it is counted before the filter is applied — otherwise the
   * segment you are standing on is the only one with a truthful number.
   */
  const statusCounts = useMemo(() => {
    const counts: Record<StatusFilter, number> = {
      all: journalEntries.length,
      DRAFT: 0,
      POSTED: 0,
      REVERSED: 0,
      VOIDED: 0,
    };
    for (const entry of journalEntries) {
      const status = journalStatusOf(entry);
      if (typeof counts[status] === "number") counts[status] += 1;
    }
    return counts;
  }, [journalEntries]);

  const filteredEntries = useMemo(() => {
    if (statusFilter === "all") return orderedEntries;
    return orderedEntries.filter((entry) => journalStatusOf(entry) === statusFilter);
  }, [orderedEntries, statusFilter]);

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
  const draftCount = statusCounts.DRAFT;

  /*
    Five columns, because a journal row answers five questions: which entry,
    when, what for, how much, and what state it is in.

    It used to carry Debit, Credit and Amount side by side, which is three
    columns saying one thing — on any entry the ledger will accept, the two
    sides are equal, so the second and third figures are the first one
    repeated. The one figure stays; the two sides are in the panel beside the
    list, per line, where the difference between them is actually information.

    The design draws a sixth, Source, naming the module that raised the posting
    — payroll, receivables, a manual correction. The list endpoint does not
    return it, so the column is left out rather than filled with a guess.
  */
  const columns: ColumnDef<JournalEntryRecord>[] = [
    {
      id: "entry",
      header: "Ref",
      accessorKey: "entryNumber",
      /*
        The reference opens the entry.

        The design's instruction is "click a journal to open its lines", and
        the underlying list view has no row-click of its own. The reference is
        the right target anyway: it is what a person points at when they say
        which journal they mean. The open entry's reference is set in brand ink
        so the list says which of its rows the panel is showing.
      */
      cell: ({ row }) => {
        const isOpen = row.original.id === selectedEntry?.id;
        return (
          <button
            type="button"
            onClick={() => setSelectedEntryId(row.original.id)}
            className={cn(
              "font-mono text-sm hover:underline",
              isOpen
                ? "font-bold text-[var(--brand-strong)]"
                : "text-[var(--text-muted)]",
            )}
          >
            JE-{row.original.entryNumber}
          </button>
        );
      },
      size: 120,
      minSize: 120,
      maxSize: 120},
    {
      id: "date",
      header: "Date",
      accessorKey: "entryDate",
      cell: ({ row }) => (
        <span className="text-sm text-[var(--text-subtle)]">
          {format(new Date(row.original.entryDate), "d MMM yyyy")}
        </span>
      ),
      size: 116,
      minSize: 116,
      maxSize: 116},
    {
      id: "description",
      header: "Memo",
      accessorKey: "description",
      cell: ({ row }) => (
        <span className="font-semibold text-[var(--text-strong)]">{row.original.description}</span>
      ),
      size: 280,
      minSize: 220,
      maxSize: 420},
    {
      id: "amount",
      header: "Amount",
      // `amount` is the entry's value; `totalDebit` is the same figure on a
      // balanced entry, and stands in when the list response omits the first.
      cell: ({ row }) => (
        <NumericCell className="font-semibold text-[var(--text-strong)]">
          {formatAmount(row.original.amount ?? row.original.totalDebit ?? 0)}
        </NumericCell>
      ),
      size: 120,
      minSize: 120,
      maxSize: 120},
    {
      id: "status",
      header: "Status",
      accessorKey: "status",
      cell: ({ row }) => {
        const status = journalStatusOf(row.original);
        return (
          <span className="acct-badge" data-tone={journalStatusTone[status] ?? "mute"}>
            {journalStatusLabel[status] ?? row.original.status}
          </span>
        );
      },
      size: 110,
      minSize: 110,
      maxSize: 110},
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

  const reverseMutation = useMutation({
    mutationFn: async (input: { id: string; reason?: string }) =>
      fetchJson(`/api/accounting/journals/${input.id}/reverse` as const, {
        method: "POST",
        body: JSON.stringify({ reason: input.reason }),
      }),
    onSuccess: () => {
      toast({
        title: "Journal entry reversed",
        description: "A mirror entry has been posted and the original marked reversed.",
        variant: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["accounting", "journals"] });
    },
    onError: (err) => {
      toast({
        title: "Unable to reverse entry",
        description: getApiErrorMessage(err),
        variant: "destructive",
      });
    },
  });

  /*
    Posting is the panel's action now, not the row's.

    A journal is posted once you have read its lines and satisfied yourself the
    two sides agree — which is what the panel is for. A button on the row asked
    for the same commitment from someone who had only seen a total.
  */
  const postOpenEntry = () => {
    if (!selectedEntry) return;
    const reason = window.prompt(
      "Override reason (required only when period/freeze rules block posting). Leave blank if not needed.",
    );
    postMutation.mutate({
      id: selectedEntry.id,
      periodOverrideReason: reason?.trim() || undefined,
    });
  };

  /*
    Reversing writes a second journal rather than editing the first.

    A posted entry is a fact about the books and stays one, so the ledger
    cancels it with a mirror posting and marks the original REVERSED. Both
    journals then appear in the list, which is why cancelling the prompt has to
    abort: this is not a filter, it leaves two permanent entries behind.
  */
  const reverseOpenEntry = () => {
    if (!selectedEntry) return;
    const reason = window.prompt(
      `Reverse JE-${selectedEntry.entryNumber}? A mirror entry will be posted to cancel it out. Give a reason for the audit trail.`,
    );
    if (reason === null) return;
    reverseMutation.mutate({
      id: selectedEntry.id,
      reason: reason.trim() || undefined,
    });
  };

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
        <AccountingNewButton
          label="New journal"
          items={[{ label: "New journal", icon: FileCheck, onClick: () => setFormOpen(true) }]}
        />
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
        {/* The list keeps its own toolbar, so the toolbar's page-gutter bleed
            is put back to the panel's width — otherwise it reaches past the
            card's corners and gets clipped by them. */}
        <Card className="min-w-0 [&_.table-edge-to-edge]:mx-0 [&_.table-edge-to-edge]:w-full">
          <CardHeader>
            <CardTitle>Journal entries</CardTitle>
            <span className="acct-caption shrink-0">newest first</span>
          </CardHeader>
          <DataTable
            data={filteredEntries}
            columns={columns}
            /* The shared list view bands its rows by status whether or not it
               is asked to, so the order is stated rather than left to fall out
               alphabetically: work still to do comes before work already
               done. */
            groupBy="status"
            groupOrder={[...lifecycle]}
            searchPlaceholder="Search journals"
            searchSubmitLabel="Search"
            pagination={{ enabled: true }}
            toolbar={
              <>
                {/* The track is `width: 100%` by design — it is normally the
                    only thing in its row. Here it shares a toolbar, so it is
                    sized by its own segments. */}
                <div
                  className="segmented segmented-sm"
                  style={{ width: "auto" }}
                  role="group"
                  aria-label="Filter by status"
                >
                  {statusTabs.map((tab) => (
                    <button
                      key={tab.value}
                      type="button"
                      onClick={() => setStatusFilter(tab.value)}
                      aria-pressed={statusFilter === tab.value}
                      className={cn("segmented-item", statusFilter === tab.value && "active")}
                    >
                      {tab.label}
                      <span className="acct-rail-sub">{statusCounts[tab.value]}</span>
                    </button>
                  ))}
                </div>
                {/* The one thing the list cannot show about itself: that a
                    reference is a door, not a label. */}
                <span className="acct-caption">click a reference to open its lines</span>
              </>
            }
            emptyState={journalsLoading ? "Loading journals..." : "No journal entries yet."}
          />
        </Card>

        <JournalDetailPanel
          entry={selectedEntry}
          accountsById={accountsById}
          onPost={postOpenEntry}
          posting={postMutation.isPending}
          onReverse={reverseOpenEntry}
          reversing={reverseMutation.isPending}
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
