"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Switch } from "@corelithzw/react";
import { AccountingShell } from "@corelithzw/module-books/components/accounting-shell";
import { Alert, AlertDescription, AlertTitle } from "@corelithzw/ui/components/alert";
import { Button } from "@corelithzw/ui/components/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@corelithzw/ui/components/card";
import { BandChip } from "@corelithzw/module-books/components/band-chip";
import {
  type BadgeTone,
  type ReportRow,
  ReportTable,
  amt,
  badge,
  dim,
  nm,
  txt,
} from "@corelithzw/ui/components/report-table";
import { formatAmount } from "@corelithzw/module-books/format";
import { Input } from "@corelithzw/ui/components/input";
import { SegmentedControl } from "@corelithzw/ui/components/segmented-control";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@corelithzw/ui/components/select";
import { useToast } from "@corelithzw/ui/components/use-toast";
import { type ChartOfAccountRecord, fetchChartOfAccounts, fetchTrialBalance } from "@corelithzw/module-books/api-client";
import { fetchJson, getApiErrorMessage } from "@corelithzw/platform/api-client";
import { Search, TableRows } from "@corelithzw/ui/lib/icons";
import { AccountingNewButton } from "@corelithzw/module-books/components/accounting-new-button";
import { useReservedId } from "@corelithzw/platform/hooks/use-reserved-id";

const accountTypes = ["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"] as const;

type AccountType = (typeof accountTypes)[number];

/**
 * The five account types, as the chart names them to a reader.
 *
 * The enum is shouted (`ASSET`) because that is what the API stores; a column
 * of shouted words down a table reads as an error state rather than a
 * classification, so the label is the sentence-case one and the enum stays in
 * the payload where it belongs.
 */
const TYPE_LABEL: Record<AccountType, string> = {
  ASSET: "Asset",
  LIABILITY: "Liability",
  EQUITY: "Equity",
  INCOME: "Income",
  EXPENSE: "Expense",
};

/** The same five, as the tab strip names a whole group of them. */
const TYPE_TAB_LABEL: Record<AccountType, string> = {
  ASSET: "Assets",
  LIABILITY: "Liabilities",
  EQUITY: "Equity",
  INCOME: "Income",
  EXPENSE: "Expenses",
};

/**
 * A tone per type, so the category column is scannable without being read.
 *
 * These are the accounting tones doing their usual job rather than decoration:
 * income is money in (ok), expense is money out (bad), a liability is a claim
 * against you (warn), an asset is neutral information (info), and equity is the
 * residue that falls out of the other four (mute).
 */
const TYPE_TONE: Record<AccountType, BadgeTone> = {
  ASSET: "info",
  LIABILITY: "warn",
  EQUITY: "mute",
  INCOME: "ok",
  EXPENSE: "bad",
};

type TypeFilter = "all" | AccountType;

type TreeRow = { account: ChartOfAccountRecord; depth: number };

/**
 * The chart in reading order, with each account's depth in the tree.
 *
 * A flat list sorted by code only *looks* like a hierarchy while every child's
 * number happens to sort directly under its parent's — which holds for a
 * textbook 1000/1010 chart and stops holding the first time somebody adds
 * 1015 under a different group. Walking parent-first makes the indent the
 * actual parent chain rather than a coincidence of numbering.
 *
 * An account whose parent the current filter excluded is treated as a root, so
 * filtering to Expenses never silently drops a ledger whose group is an Asset —
 * the row is still there, just at the depth the filtered view can justify.
 */
function orderAsTree(accounts: ChartOfAccountRecord[]): TreeRow[] {
  const present = new Set(accounts.map((account) => account.id));
  const byParent = new Map<string, ChartOfAccountRecord[]>();

  for (const account of accounts) {
    const parentId =
      account.parentAccountId && present.has(account.parentAccountId)
        ? account.parentAccountId
        : "";
    const siblings = byParent.get(parentId);
    if (siblings) siblings.push(account);
    else byParent.set(parentId, [account]);
  }

  for (const siblings of byParent.values()) {
    siblings.sort((a, b) => a.code.localeCompare(b.code));
  }

  const ordered: TreeRow[] = [];
  // A parent chain is data the API returns, not a structure this page controls,
  // so a cycle from a bad edit has to end the walk rather than hang the tab.
  const walked = new Set<string>();

  const walk = (parentId: string, depth: number) => {
    for (const account of byParent.get(parentId) ?? []) {
      if (walked.has(account.id)) continue;
      walked.add(account.id);
      ordered.push({ account, depth });
      walk(account.id, depth + 1);
    }
  };

  walk("", 0);
  return ordered;
}

const emptyForm = {
  code: "",
  name: "",
  type: "ASSET" as AccountType,
  nodeType: "LEDGER" as "GROUP" | "LEDGER",
  parentAccountId: "",
  description: "",
  isActive: true,
};

type FormState = typeof emptyForm;

function toFormState(account: ChartOfAccountRecord): FormState {
  return {
    code: account.code,
    name: account.name,
    type: account.type,
    nodeType: account.nodeType ?? "LEDGER",
    parentAccountId: account.parentAccountId ?? "",
    description: account.description ?? "",
    isActive: account.isActive,
  };
}

export default function ChartOfAccountsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  /**
   * The editor is a mode of the page, not a layer over it.
   *
   * "new" means the right panel is composing an account that does not exist
   * yet; otherwise it is showing whichever row the table has selected. One
   * panel doing both is what keeps the table visible while you type — a chart
   * of accounts is the one form where the surrounding rows are the reference
   * you are working from.
   */
  const [mode, setMode] = useState<"browse" | "new">("browse");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [nodeTypeFilter, setNodeTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [formState, setFormState] = useState<FormState>(emptyForm);

  const {
    reservedId,
    isReserving,
    error: reserveError,
  } = useReservedId({
    entity: "CHART_OF_ACCOUNT",
    enabled: mode === "new",
  });

  const {
    data: accountsData,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["accounting", "coa"],
    queryFn: () => fetchChartOfAccounts({ limit: 500 }),
  });

  const accounts = useMemo(() => accountsData?.data ?? [], [accountsData]);

  /**
   * What each account is carrying, from the ledger rather than from the chart.
   *
   * A chart of accounts record has no balance on it — the number lives in the
   * journal lines — so the figure the artboard puts in the Balance column and
   * the "Balance today" strip has to come from the trial balance. Asked with no
   * period and no dates, that report sums every posted line ever made, which is
   * the account's balance *today* rather than a period movement, and it rolls
   * child totals up into their groups so a group row shows the branch.
   *
   * The query key matches the trial balance page's unfiltered one on purpose:
   * the two tabs then share a single fetch instead of each paying for the same
   * scan of the ledger.
   */
  const { data: trialBalance } = useQuery({
    queryKey: ["accounting", "trial-balance", "", "", ""],
    queryFn: () => fetchTrialBalance({}),
  });

  /**
   * Absent rather than zero when the ledger has nothing to say.
   *
   * The trial balance only reports active accounts, so a deactivated one is
   * missing from this map — and "we did not ask about this account" has to read
   * as an em dash, not as a confident 0.00 that would claim the account was
   * emptied before it was retired.
   */
  const balanceByAccount = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of trialBalance?.rows ?? []) map.set(row.accountId, row.balance);
    return map;
  }, [trialBalance]);

  /**
   * The chart's size, for the band.
   *
   * Counted across every account rather than the filtered view: "96 accounts"
   * is a fact about the chart, and a chip that changed as you typed in the
   * search box would be reporting the filter rather than the books. Inactive
   * only earns a chip when there are some — a permanent "Inactive 0" is a
   * reassurance nobody asked for taking up band width on every page load.
   */
  const accountCounts = useMemo(
    () => ({
      total: accounts.length,
      inactive: accounts.filter((account) => !account.isActive).length,
    }),
    [accounts],
  );

  /**
   * Everything the type tabs do not decide.
   *
   * Split out from the type filter because the tabs carry counts, and a count
   * has to predict what clicking it gives you: "Assets 31" beside a search box
   * with "cash" in it means 31 asset accounts *matching cash*, not 31 in the
   * whole chart.
   */
  const scoped = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return accounts.filter((account) => {
      if (nodeTypeFilter !== "all" && (account.nodeType ?? "LEDGER") !== nodeTypeFilter)
        return false;
      if (statusFilter === "active" && !account.isActive) return false;
      if (statusFilter === "inactive" && account.isActive) return false;
      if (needle) {
        const haystack = `${account.code} ${account.name}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
  }, [accounts, nodeTypeFilter, search, statusFilter]);

  const typeCounts = useMemo(() => {
    const counts: Record<AccountType, number> = {
      ASSET: 0,
      LIABILITY: 0,
      EQUITY: 0,
      INCOME: 0,
      EXPENSE: 0,
    };
    for (const account of scoped) counts[account.type] += 1;
    return counts;
  }, [scoped]);

  const visibleAccounts = useMemo(
    () => scoped.filter((account) => typeFilter === "all" || account.type === typeFilter),
    [scoped, typeFilter],
  );

  const treeRows = useMemo(() => orderAsTree(visibleAccounts), [visibleAccounts]);

  /**
   * The panel always has something to show while the table has rows: the row
   * you picked, or the first one. A master-detail layout with an empty detail
   * half is a 380px column of nothing asking to be clicked.
   */
  const selectedAccount = useMemo(() => {
    if (mode === "new") return null;
    return (
      visibleAccounts.find((account) => account.id === selectedId) ?? visibleAccounts[0] ?? null
    );
  }, [mode, selectedId, visibleAccounts]);

  const selectedAccountId = selectedAccount?.id ?? null;

  // Keyed on the id alone, deliberately. Every refetch hands back new record
  // objects, and depending on the record itself would wipe whatever you had
  // typed each time an unrelated mutation invalidated the query.
  useEffect(() => {
    if (mode === "new") return;
    const account = accounts.find((candidate) => candidate.id === selectedAccountId);
    if (account) setFormState(toFormState(account));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, selectedAccountId]);

  const parentOptions = useMemo(() => {
    return accounts
      .filter(
        (account) =>
          account.isActive &&
          account.nodeType === "GROUP" &&
          account.type === formState.type &&
          account.id !== selectedAccountId,
      )
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [accounts, formState.type, selectedAccountId]);

  const rows = useMemo<ReportRow[]>(
    () =>
      treeRows.map(({ account, depth }) => {
        const isGroup = (account.nodeType ?? "LEDGER") === "GROUP";
        const isSelected = account.id === selectedAccountId;
        const parent = account.parentAccountId
          ? accounts.find((candidate) => candidate.id === account.parentAccountId)
          : undefined;
        const balance = balanceByAccount.get(account.id);

        // The indent lives on the text rather than on the cell because the tree
        // is arbitrarily deep — `indent` is a single step, and a chart three
        // levels down needs three.
        const name = (
          <span
            className="block truncate"
            style={depth > 0 ? { paddingLeft: depth * 14 } : undefined}
          >
            {account.name}
          </span>
        );

        return {
          id: account.id,
          expanded: isSelected,
          onSelect: () => {
            setMode("browse");
            setSelectedId(account.id);
          },
          cells: [
            txt(account.code, {
              mono: true,
              bold: isGroup || isSelected,
              // Brand ink marks the row the panel is editing — the same signal
              // the row background gives, kept in the column the eye tracks.
              tone: isSelected ? "total" : isGroup ? "strong" : "body",
            }),
            isGroup ? nm(name) : txt(name),
            badge(TYPE_LABEL[account.type], TYPE_TONE[account.type]),
            txt(isGroup ? "Group" : "Ledger", { tone: isGroup ? "body" : "dim" }),
            parent
              ? txt(parent.name, { tone: "subtle" })
              : dim({ align: "left", mono: false }),
            // A credit balance on an account the chart files as a debit one —
            // accumulated depreciation, an overdrawn bank — is the figure a
            // reader has to notice, so the sign is carried by the ink as well
            // as by the minus.
            balance === undefined
              ? dim()
              : amt(formatAmount(balance), { tone: balance < 0 ? "bad" : "strong" }),
          ],
        };
      }),
    [accounts, balanceByAccount, selectedAccountId, treeRows],
  );

  const createMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      fetchJson("/api/accounting/coa", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      toast({
        title: "Account created",
        description: "Chart of account updated successfully.",
        variant: "success",
      });
      setMode("browse");
      queryClient.invalidateQueries({ queryKey: ["accounting", "coa"] });
    },
    onError: (err) => {
      toast({
        title: "Unable to create account",
        description: getApiErrorMessage(err),
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (payload: { id: string; data: Record<string, unknown> }) =>
      fetchJson(`/api/accounting/coa/${payload.id}` as const, {
        method: "PATCH",
        body: JSON.stringify(payload.data),
      }),
    onSuccess: () => {
      toast({
        title: "Account updated",
        description: "Account changes saved.",
        variant: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["accounting", "coa"] });
    },
    onError: (err) => {
      toast({
        title: "Unable to update account",
        description: getApiErrorMessage(err),
        variant: "destructive",
      });
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: async (id: string) =>
      fetchJson(`/api/accounting/coa/${id}` as const, { method: "DELETE" }),
    onSuccess: () => {
      toast({
        title: "Account deactivated",
        description: "The account is now inactive.",
        variant: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["accounting", "coa"] });
    },
    onError: (err) => {
      toast({
        title: "Unable to deactivate account",
        description: getApiErrorMessage(err),
        variant: "destructive",
      });
    },
  });

  const openNew = () => {
    setFormState(emptyForm);
    setMode("new");
  };

  const cancelEdit = () => {
    if (mode === "new") {
      setMode("browse");
      return;
    }
    if (selectedAccount) setFormState(toFormState(selectedAccount));
  };

  const handleDeactivate = (id: string) => {
    if (!window.confirm("Deactivate this account?")) return;
    deactivateMutation.mutate(id);
  };

  const resolvedCode = mode === "new" ? reservedId : formState.code;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    if (!formState.name.trim()) {
      toast({
        title: "Missing details",
        description: "Account name is required.",
        variant: "destructive",
      });
      return;
    }

    if (mode === "new" && !resolvedCode.trim()) {
      toast({
        title: "Unable to reserve account code",
        description: reserveError ?? "Please wait for code reservation to complete.",
        variant: "destructive",
      });
      return;
    }

    const payload: Record<string, unknown> = {
      name: formState.name.trim(),
      type: formState.type,
      nodeType: formState.nodeType,
      parentAccountId: formState.parentAccountId || null,
      isActive: formState.isActive,
    };

    const description = formState.description.trim();
    if (description) payload.description = description;

    if (mode === "new") {
      createMutation.mutate({ ...payload, code: resolvedCode.trim() });
      return;
    }

    if (selectedAccount) {
      updateMutation.mutate({ id: selectedAccount.id, data: payload });
    }
  };

  const editing = mode === "new" ? null : selectedAccount;
  const showPanel = mode === "new" || Boolean(selectedAccount);

  return (
    <AccountingShell
      activeTab="chart-of-accounts"
      title="Chart of Accounts"
      description="the account tree every posting lands in"
      bandSlot={
        <>
          <BandChip label="Accounts" value={String(accountCounts.total)} tone="mute" />
          {accountCounts.inactive > 0 ? (
            <BandChip label="Inactive" value={String(accountCounts.inactive)} tone="warn" />
          ) : null}
        </>
      }
      actions={
        <AccountingNewButton items={[{ label: "New account", icon: TableRows, onClick: openNew }]} />
      }
    >
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load chart of accounts</AlertTitle>
          <AlertDescription>{getApiErrorMessage(error)}</AlertDescription>
        </Alert>
      ) : null}

      {/*
        The toolbar pins, and publishes where it ends so the table head below it
        can pin underneath rather than behind it. `--stack-top` cannot be
        redefined in terms of itself, hence the two steps.
      */}
      <div
        style={
          {
            "--stack-next": "calc(var(--stack-top, 0px) + var(--list-toolbar-h))",
          } as React.CSSProperties
        }
      >
        <div
          className="band-shell sticky z-20 flex min-h-[var(--list-toolbar-h)] flex-wrap items-center gap-2 border-b border-[var(--border)] bg-[var(--surface-base)] py-1.5"
          style={{ top: "var(--stack-top, 0px)" }}
        >
          <SegmentedControl<TypeFilter>
            size="sm"
            ariaLabel="Filter by account type"
            value={typeFilter}
            onValueChange={setTypeFilter}
            options={[
              { value: "all", label: "All", count: scoped.length },
              ...accountTypes.map((type) => ({
                value: type,
                label: TYPE_TAB_LABEL[type],
                count: typeCounts[type],
              })),
            ]}
          />

          <div className="relative min-w-[90px] max-w-[220px] flex-1">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--text-disabled)]"
            />
            <Input
              aria-label="Search accounts"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Code or account name"
              className="h-[30px] pl-8"
            />
          </div>

          <div className="flex-1" />

          <Select value={nodeTypeFilter} onValueChange={setNodeTypeFilter}>
            <SelectTrigger
              size="sm"
              aria-label="Filter by node type"
              className="h-[30px] w-auto gap-1.5 [&_[data-slot=select-value]]:font-semibold [&_[data-slot=select-value]]:text-[var(--text-strong)]"
            >
              <span className="text-sm text-[var(--text-muted)]">Node</span>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="GROUP">Group</SelectItem>
              <SelectItem value="LEDGER">Ledger</SelectItem>
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger
              size="sm"
              aria-label="Filter by status"
              className="h-[30px] w-auto gap-1.5 [&_[data-slot=select-value]]:font-semibold [&_[data-slot=select-value]]:text-[var(--text-strong)]"
            >
              <span className="text-sm text-[var(--text-muted)]">Status</span>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/*
          Master and detail. The chart is the one form where the neighbouring
          rows are the reference you are editing against — which parent this
          belongs under, what the sibling codes look like — so the editor sits
          beside the table rather than over it.
        */}
        <div
          className="grid min-w-0 items-start gap-2.5 pt-3 xl:grid-cols-[minmax(0,1fr)_380px]"
          style={{ "--stack-top": "var(--stack-next)" } as React.CSSProperties}
        >
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle>Accounts</CardTitle>
              <span className="acct-caption">indent shows the parent chain</span>
            </CardHeader>
            <ReportTable
              label="Chart of accounts"
              tracks="90px minmax(0,1fr) 110px 100px 130px 120px"
              columns={[
                { label: "Code" },
                { label: "Account" },
                { label: "Category" },
                { label: "Node" },
                { label: "Parent" },
                // No Status column: the toolbar's Status pill decides what is
                // in the list and says so, which on the default Active view
                // leaves a column of identical badges saying it again.
                { label: "Balance", align: "right" },
              ]}
              rows={rows}
              emptyLabel={isLoading ? "Loading accounts…" : "No accounts match these filters."}
            />
          </Card>

          {showPanel ? (
            <Card className="min-w-0 xl:sticky xl:top-[calc(var(--stack-top,0px)+0.75rem)]">
              <CardHeader className="justify-start gap-2">
                <span className="acct-badge" data-tone="info">
                  {mode === "new" ? "NEW" : "EDIT"}
                </span>
                <CardTitle className="min-w-0 flex-1 truncate">
                  {editing ? `${editing.code} — ${editing.name}` : "New account"}
                </CardTitle>
              </CardHeader>

              <form onSubmit={handleSubmit}>
                <CardContent className="grid grid-cols-2 gap-x-3 gap-y-3">
                  <div className="min-w-0">
                    <label className="acct-field-label" htmlFor="coa-code">
                      Code
                    </label>
                    <Input
                      id="coa-code"
                      value={resolvedCode}
                      readOnly
                      className="font-mono"
                      placeholder={isReserving ? "Reserving…" : "Auto-generated"}
                    />
                    <p className="acct-caption mt-1">
                      {mode === "new"
                        ? (reserveError ?? "Reserved for you; it cannot be edited.")
                        : "Codes are immutable once postings can reference them."}
                    </p>
                  </div>

                  <div className="min-w-0">
                    <label className="acct-field-label" htmlFor="coa-node">
                      Node type
                    </label>
                    <Select
                      value={formState.nodeType}
                      onValueChange={(value) =>
                        setFormState((prev) => ({
                          ...prev,
                          nodeType: value as FormState["nodeType"],
                        }))
                      }
                    >
                      <SelectTrigger id="coa-node" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="LEDGER">Ledger</SelectItem>
                        <SelectItem value="GROUP">Group</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="col-span-2 min-w-0">
                    <label className="acct-field-label" htmlFor="coa-name">
                      Name
                    </label>
                    <Input
                      id="coa-name"
                      value={formState.name}
                      onChange={(event) =>
                        setFormState((prev) => ({ ...prev, name: event.target.value }))
                      }
                      placeholder="Cash on Hand"
                      required
                    />
                  </div>

                  <div className="col-span-2 min-w-0">
                    <label className="acct-field-label" htmlFor="coa-category">
                      Category
                    </label>
                    <Select
                      value={formState.type}
                      onValueChange={(value) =>
                        setFormState((prev) => ({
                          ...prev,
                          type: value as AccountType,
                          // The parent has to be of the same type, so the one
                          // that was picked under the old type is no longer a
                          // legal answer.
                          parentAccountId: "",
                        }))
                      }
                    >
                      <SelectTrigger id="coa-category" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {accountTypes.map((type) => (
                          <SelectItem key={type} value={type}>
                            {TYPE_LABEL[type]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="col-span-2 min-w-0">
                    <label className="acct-field-label" htmlFor="coa-parent">
                      Parent account
                    </label>
                    <Select
                      value={formState.parentAccountId || "none"}
                      onValueChange={(value) =>
                        setFormState((prev) => ({
                          ...prev,
                          parentAccountId: value === "none" ? "" : value,
                        }))
                      }
                    >
                      <SelectTrigger id="coa-parent" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No parent</SelectItem>
                        {parentOptions.map((account) => (
                          <SelectItem key={account.id} value={account.id}>
                            {account.code} — {account.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {/* A rule, not a restatement: only groups of the same
                        category can be a parent, so the list being short — or
                        empty — is the constraint showing rather than a bug. */}
                    <p className="acct-caption mt-1">
                      Only {TYPE_LABEL[formState.type].toLowerCase()} groups can be a parent.
                    </p>
                  </div>

                  <div className="min-w-0">
                    <span className="acct-field-label">Status</span>
                    <Switch
                      checked={formState.isActive}
                      onChange={(event) =>
                        setFormState((prev) => ({ ...prev, isActive: event.target.checked }))
                      }
                      label={formState.isActive ? "Active" : "Inactive"}
                      aria-label="Account status"
                    />
                  </div>

                  <div className="col-span-2 min-w-0">
                    <label className="acct-field-label" htmlFor="coa-description">
                      Description
                    </label>
                    <Input
                      id="coa-description"
                      value={formState.description}
                      onChange={(event) =>
                        setFormState((prev) => ({ ...prev, description: event.target.value }))
                      }
                      placeholder="Optional account notes"
                    />
                  </div>

                  {/*
                    The one figure on this panel that is not a field: what the
                    account you are about to change is currently carrying. It
                    only appears for an account the ledger knows about, so a
                    brand new one is never handed a balance it cannot have.
                  */}
                  {editing && balanceByAccount.has(editing.id) ? (
                    <div className="col-span-2 flex min-w-0 items-center gap-2 rounded-[7px] border border-[var(--border)] bg-[var(--canvas)] px-[11px] py-[9px]">
                      <span className="text-[11.5px] text-[var(--text-muted)]">Balance today</span>
                      <div className="flex-1" />
                      <span className="font-mono text-sm font-bold text-[var(--text-strong)]">
                        {formatAmount(balanceByAccount.get(editing.id) ?? 0)}
                      </span>
                    </div>
                  ) : null}
                </CardContent>

                <CardFooter className="justify-start gap-2">
                  <Button
                    type="submit"
                    size="sm"
                    disabled={
                      createMutation.isPending ||
                      updateMutation.isPending ||
                      (mode === "new" && (isReserving || !resolvedCode))
                    }
                  >
                    {mode === "new" ? "Create account" : "Save account"}
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={cancelEdit}>
                    Cancel
                  </Button>
                  <div className="flex-1" />
                  {editing?.isActive ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="text-[var(--badge-bad-fg)] hover:text-[var(--badge-bad-fg)]"
                      onClick={() => handleDeactivate(editing.id)}
                      disabled={deactivateMutation.isPending}
                    >
                      Deactivate
                    </Button>
                  ) : null}
                </CardFooter>
              </form>
            </Card>
          ) : null}
        </div>
      </div>
    </AccountingShell>
  );
}
