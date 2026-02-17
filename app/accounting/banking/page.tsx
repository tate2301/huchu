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
import { VerticalDataViews } from "@/components/ui/vertical-data-views";
import { useToast } from "@/components/ui/use-toast";
import {
  type BankAccountRecord,
  type BankReconciliationRecord,
  type BankTransactionRecord,
  fetchBankAccounts,
  fetchBankReconciliations,
  fetchBankTransactions,
} from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { Plus } from "@/lib/icons";

const today = format(new Date(), "yyyy-MM-dd");

export default function BankingPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeView, setActiveView] = useState<"accounts" | "transactions" | "reconciliations">("accounts");
  const [accountFormOpen, setAccountFormOpen] = useState(false);
  const [transactionFormOpen, setTransactionFormOpen] = useState(false);
  const [reconciliationFormOpen, setReconciliationFormOpen] = useState(false);
  const [accountFilter, setAccountFilter] = useState("");

  const [accountForm, setAccountForm] = useState({
    name: "",
    bankName: "",
    accountNumber: "",
    currency: "USD",
    openingBalance: "0",
    isActive: true,
  });

  const [transactionForm, setTransactionForm] = useState({
    bankAccountId: "",
    txnDate: today,
    description: "",
    reference: "",
    amount: "",
    direction: "DEBIT",
  });
  const [reconciliationForm, setReconciliationForm] = useState({
    bankAccountId: "",
    startDate: today,
    endDate: today,
    statementBalance: "",
  });
  const { data: accountsData, error: accountsError } = useQuery({
    queryKey: ["accounting", "banking", "accounts"],
    queryFn: () => fetchBankAccounts({ limit: 200 }),
  });

  const { data: transactionsData, error: transactionsError } = useQuery({
    queryKey: ["accounting", "banking", "transactions"],
    queryFn: () => fetchBankTransactions({ limit: 200 }),
  });

  const { data: reconciliationsData, error: reconciliationsError } = useQuery({
    queryKey: ["accounting", "banking", "reconciliations"],
    queryFn: () => fetchBankReconciliations({ limit: 200 }),
  });

  const accounts = useMemo(() => accountsData?.data ?? [], [accountsData]);
  const transactions = useMemo(() => transactionsData?.data ?? [], [transactionsData]);
  const reconciliations = useMemo(() => reconciliationsData?.data ?? [], [reconciliationsData]);

  const filteredTransactions = useMemo(() => {
    if (!accountFilter) return transactions;
    return transactions.filter((txn) => txn.bankAccountId === accountFilter);
  }, [accountFilter, transactions]);
  const accountColumns = useMemo<ColumnDef<BankAccountRecord>[]>(
    () => [
      {
        id: "name",
        header: "Account",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.name}</div>
            <div className="text-xs text-muted-foreground">{row.original.bankName || "-"}</div>
          </div>
        ),
      },
      {
        id: "number",
        header: "Account Number",
        accessorKey: "accountNumber",
        cell: ({ row }) => <span className="font-mono">{row.original.accountNumber || "-"}</span>,
      },
      {
        id: "currency",
        header: "Currency",
        accessorKey: "currency",
      },
      {
        id: "opening",
        header: "Opening Balance",
        cell: ({ row }) => <NumericCell>{row.original.openingBalance.toFixed(2)}</NumericCell>,
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

  const transactionColumns = useMemo<ColumnDef<BankTransactionRecord>[]>(
    () => [
      {
        id: "date",
        header: "Date",
        cell: ({ row }) => (
          <NumericCell align="left">
            {format(new Date(row.original.txnDate), "yyyy-MM-dd")}
          </NumericCell>
        ),
      },
      {
        id: "account",
        header: "Account",
        cell: ({ row }) => row.original.bankAccount?.name ?? "-",
      },
      {
        id: "description",
        header: "Description",
        accessorKey: "description",
      },
      {
        id: "direction",
        header: "Direction",
        cell: ({ row }) => (
          <Badge variant={row.original.direction === "DEBIT" ? "outline" : "secondary"}>
            {row.original.direction}
          </Badge>
        ),
      },
      {
        id: "amount",
        header: "Amount",
        cell: ({ row }) => <NumericCell>{row.original.amount.toFixed(2)}</NumericCell>,
      },
      {
        id: "reconciled",
        header: "Reconciled",
        cell: ({ row }) => (
          <Badge variant={row.original.reconciledAt ? "secondary" : "outline"}>
            {row.original.reconciledAt ? "Yes" : "No"}
          </Badge>
        ),
      },
    ],
    [],
  );

  const reconciliationColumns = useMemo<ColumnDef<BankReconciliationRecord>[]>(
    () => [
      {
        id: "account",
        header: "Account",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.bankAccount?.name ?? "-"}</div>
            <div className="text-xs text-muted-foreground">
              {row.original.bankAccount?.currency ?? "USD"}
            </div>
          </div>
        ),
      },
      {
        id: "period",
        header: "Period",
        cell: ({ row }) => (
          <div className="text-sm">
            <div className="font-mono">{format(new Date(row.original.startDate), "yyyy-MM-dd")}</div>
            <div className="text-xs text-muted-foreground">
              {format(new Date(row.original.endDate), "yyyy-MM-dd")}
            </div>
          </div>
        ),
      },
      {
        id: "statement",
        header: "Statement Balance",
        cell: ({ row }) => <NumericCell>{row.original.statementBalance.toFixed(2)}</NumericCell>,
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => (
          <Badge variant={row.original.status === "OPEN" ? "secondary" : "outline"}>
            {row.original.status}
          </Badge>
        ),
      },
    ],
    [],
  );
  const createAccountMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      fetchJson("/api/accounting/banking/accounts", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      toast({
        title: "Bank account created",
        description: "Account saved successfully.",
        variant: "success",
      });
      setAccountFormOpen(false);
      setAccountForm({
        name: "",
        bankName: "",
        accountNumber: "",
        currency: "USD",
        openingBalance: "0",
        isActive: true,
      });
      queryClient.invalidateQueries({ queryKey: ["accounting", "banking", "accounts"] });
    },
    onError: (err) => {
      toast({
        title: "Unable to create account",
        description: getApiErrorMessage(err),
        variant: "destructive",
      });
    },
  });

  const createTransactionMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      fetchJson("/api/accounting/banking/transactions", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      toast({
        title: "Transaction created",
        description: "Bank transaction saved successfully.",
        variant: "success",
      });
      setTransactionFormOpen(false);
      setTransactionForm({
        bankAccountId: "",
        txnDate: today,
        description: "",
        reference: "",
        amount: "",
        direction: "DEBIT",
      });
      queryClient.invalidateQueries({ queryKey: ["accounting", "banking", "transactions"] });
    },
    onError: (err) => {
      toast({
        title: "Unable to create transaction",
        description: getApiErrorMessage(err),
        variant: "destructive",
      });
    },
  });

  const createReconciliationMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      fetchJson("/api/accounting/banking/reconciliations", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      toast({
        title: "Reconciliation created",
        description: "Bank reconciliation saved successfully.",
        variant: "success",
      });
      setReconciliationFormOpen(false);
      setReconciliationForm({
        bankAccountId: "",
        startDate: today,
        endDate: today,
        statementBalance: "",
      });
      queryClient.invalidateQueries({ queryKey: ["accounting", "banking", "reconciliations"] });
    },
    onError: (err) => {
      toast({
        title: "Unable to create reconciliation",
        description: getApiErrorMessage(err),
        variant: "destructive",
      });
    },
  });

  const submitAccount = (event: React.FormEvent) => {
    event.preventDefault();

    if (!accountForm.name.trim()) {
      toast({
        title: "Missing account name",
        description: "Please provide an account name.",
        variant: "destructive",
      });
      return;
    }

    createAccountMutation.mutate({
      name: accountForm.name.trim(),
      bankName: accountForm.bankName.trim() || undefined,
      accountNumber: accountForm.accountNumber.trim() || undefined,
      currency: accountForm.currency || "USD",
      openingBalance: Number(accountForm.openingBalance) || 0,
      isActive: accountForm.isActive,
    });
  };

  const submitTransaction = (event: React.FormEvent) => {
    event.preventDefault();

    if (!transactionForm.bankAccountId || !transactionForm.description.trim() || !transactionForm.amount) {
      toast({
        title: "Missing details",
        description: "Bank account, description, and amount are required.",
        variant: "destructive",
      });
      return;
    }

    createTransactionMutation.mutate({
      bankAccountId: transactionForm.bankAccountId,
      txnDate: transactionForm.txnDate,
      description: transactionForm.description.trim(),
      reference: transactionForm.reference.trim() || undefined,
      amount: Number(transactionForm.amount),
      direction: transactionForm.direction,
    });
  };

  const submitReconciliation = (event: React.FormEvent) => {
    event.preventDefault();

    if (!reconciliationForm.bankAccountId || !reconciliationForm.statementBalance) {
      toast({
        title: "Missing details",
        description: "Bank account and statement balance are required.",
        variant: "destructive",
      });
      return;
    }

    createReconciliationMutation.mutate({
      bankAccountId: reconciliationForm.bankAccountId,
      startDate: reconciliationForm.startDate,
      endDate: reconciliationForm.endDate,
      statementBalance: Number(reconciliationForm.statementBalance),
    });
  };
  return (
    <AccountingShell
      activeTab="banking"
      title="Banking"
      description="Manage bank accounts and reconcile transactions."
      actions={
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setAccountFormOpen(true)}>
            <Plus className="mr-2 size-4" />
            New Account
          </Button>
          <Button size="sm" variant="outline" onClick={() => setTransactionFormOpen(true)}>
            <Plus className="mr-2 size-4" />
            New Transaction
          </Button>
          <Button size="sm" variant="outline" onClick={() => setReconciliationFormOpen(true)}>
            <Plus className="mr-2 size-4" />
            New Reconciliation
          </Button>
        </div>
      }
    >
      {(accountsError || transactionsError || reconciliationsError) ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load banking data</AlertTitle>
          <AlertDescription>
            {getApiErrorMessage(accountsError || transactionsError || reconciliationsError)}
          </AlertDescription>
        </Alert>
      ) : null}

      <VerticalDataViews
        items={[
          { id: "accounts", label: "Bank Accounts", count: accounts.length },
          { id: "transactions", label: "Transactions", count: transactions.length },
          { id: "reconciliations", label: "Reconciliations", count: reconciliations.length },
        ]}
        value={activeView}
        onValueChange={(value) =>
          setActiveView(value as "accounts" | "transactions" | "reconciliations")
        }
        railLabel="Banking Views"
      >
        <div className={activeView === "accounts" ? "space-y-3" : "hidden"}>
          <DataTable
            data={accounts}
            columns={accountColumns}
            searchPlaceholder="Search bank accounts"
            searchSubmitLabel="Search"
            pagination={{ enabled: true }}
            emptyState={"No bank accounts found."}
          />
        </div>

        <div className={activeView === "transactions" ? "space-y-3" : "hidden"}>
          <DataTable
            data={filteredTransactions}
            columns={transactionColumns}
            searchPlaceholder="Search transactions"
            searchSubmitLabel="Search"
            pagination={{ enabled: true }}
            toolbar={
              <Select value={accountFilter} onValueChange={setAccountFilter}>
                <SelectTrigger size="sm" className="h-8 w-[200px]">
                  <SelectValue placeholder="Filter by account" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Accounts</SelectItem>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            }
            emptyState={"No transactions found."}
          />
        </div>

        <div className={activeView === "reconciliations" ? "space-y-3" : "hidden"}>
          <DataTable
            data={reconciliations}
            columns={reconciliationColumns}
            searchPlaceholder="Search reconciliations"
            searchSubmitLabel="Search"
            pagination={{ enabled: true }}
            emptyState={"No reconciliations found."}
          />
        </div>
      </VerticalDataViews>
      <Sheet open={accountFormOpen} onOpenChange={setAccountFormOpen}>
        <SheetContent size="md" className="w-full p-6">
          <SheetHeader>
            <SheetTitle>New Bank Account</SheetTitle>
            <SheetDescription>Track balances and reconciliation for each bank account.</SheetDescription>
          </SheetHeader>
          <form onSubmit={submitAccount} className="mt-6 space-y-4">
            <div>
              <label className="block text-sm font-semibold mb-2">Account Name *</label>
              <Input
                value={accountForm.name}
                onChange={(event) => setAccountForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Main Account"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-2">Bank Name</label>
              <Input
                value={accountForm.bankName}
                onChange={(event) => setAccountForm((prev) => ({ ...prev, bankName: event.target.value }))}
                placeholder="CBZ"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-2">Account Number</label>
              <Input
                value={accountForm.accountNumber}
                onChange={(event) =>
                  setAccountForm((prev) => ({ ...prev, accountNumber: event.target.value }))
                }
                placeholder="000123456"
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-semibold mb-2">Currency</label>
                <Input
                  value={accountForm.currency}
                  onChange={(event) =>
                    setAccountForm((prev) => ({ ...prev, currency: event.target.value }))
                  }
                  placeholder="USD"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Opening Balance</label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={accountForm.openingBalance}
                  onChange={(event) =>
                    setAccountForm((prev) => ({ ...prev, openingBalance: event.target.value }))
                  }
                  className="text-right font-mono"
                />
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="submit" className="flex-1" disabled={createAccountMutation.isPending}>
                Save Account
              </Button>
              <Button type="button" variant="outline" onClick={() => setAccountFormOpen(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
      <Sheet open={transactionFormOpen} onOpenChange={setTransactionFormOpen}>
        <SheetContent size="md" className="w-full p-6">
          <SheetHeader>
            <SheetTitle>New Bank Transaction</SheetTitle>
            <SheetDescription>Capture deposits, withdrawals, and adjustments.</SheetDescription>
          </SheetHeader>
          <form onSubmit={submitTransaction} className="mt-6 space-y-4">
            <div>
              <label className="block text-sm font-semibold mb-2">Bank Account *</label>
              <Select
                value={transactionForm.bankAccountId}
                onValueChange={(value) =>
                  setTransactionForm((prev) => ({ ...prev, bankAccountId: value }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select account" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-semibold mb-2">Transaction Date *</label>
              <Input
                type="date"
                value={transactionForm.txnDate}
                onChange={(event) =>
                  setTransactionForm((prev) => ({ ...prev, txnDate: event.target.value }))
                }
                required
              />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-2">Description *</label>
              <Input
                value={transactionForm.description}
                onChange={(event) =>
                  setTransactionForm((prev) => ({ ...prev, description: event.target.value }))
                }
                placeholder="Bank charges"
                required
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-semibold mb-2">Direction</label>
                <Select
                  value={transactionForm.direction}
                  onValueChange={(value) =>
                    setTransactionForm((prev) => ({ ...prev, direction: value }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select direction" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DEBIT">Debit</SelectItem>
                    <SelectItem value="CREDIT">Credit</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Amount *</label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={transactionForm.amount}
                  onChange={(event) =>
                    setTransactionForm((prev) => ({ ...prev, amount: event.target.value }))
                  }
                  className="text-right font-mono"
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold mb-2">Reference</label>
              <Input
                value={transactionForm.reference}
                onChange={(event) =>
                  setTransactionForm((prev) => ({ ...prev, reference: event.target.value }))
                }
                placeholder="Optional reference"
              />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="submit" className="flex-1" disabled={createTransactionMutation.isPending}>
                Save Transaction
              </Button>
              <Button type="button" variant="outline" onClick={() => setTransactionFormOpen(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
      <Sheet open={reconciliationFormOpen} onOpenChange={setReconciliationFormOpen}>
        <SheetContent size="md" className="w-full p-6">
          <SheetHeader>
            <SheetTitle>New Bank Reconciliation</SheetTitle>
            <SheetDescription>Start a reconciliation period for a bank account.</SheetDescription>
          </SheetHeader>
          <form onSubmit={submitReconciliation} className="mt-6 space-y-4">
            <div>
              <label className="block text-sm font-semibold mb-2">Bank Account *</label>
              <Select
                value={reconciliationForm.bankAccountId}
                onValueChange={(value) =>
                  setReconciliationForm((prev) => ({ ...prev, bankAccountId: value }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select account" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-semibold mb-2">Start Date *</label>
                <Input
                  type="date"
                  value={reconciliationForm.startDate}
                  onChange={(event) =>
                    setReconciliationForm((prev) => ({ ...prev, startDate: event.target.value }))
                  }
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">End Date *</label>
                <Input
                  type="date"
                  value={reconciliationForm.endDate}
                  onChange={(event) =>
                    setReconciliationForm((prev) => ({ ...prev, endDate: event.target.value }))
                  }
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold mb-2">Statement Balance *</label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={reconciliationForm.statementBalance}
                onChange={(event) =>
                  setReconciliationForm((prev) => ({
                    ...prev,
                    statementBalance: event.target.value,
                  }))
                }
                className="text-right font-mono"
                required
              />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="submit" className="flex-1" disabled={createReconciliationMutation.isPending}>
                Save Reconciliation
              </Button>
              <Button type="button" variant="outline" onClick={() => setReconciliationFormOpen(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </AccountingShell>
  );
}
