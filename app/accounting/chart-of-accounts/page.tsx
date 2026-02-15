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
import { type ChartOfAccountRecord, fetchChartOfAccounts } from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { Plus } from "@/lib/icons";

const accountTypes = ["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"] as const;

export default function ChartOfAccountsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<ChartOfAccountRecord | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [formState, setFormState] = useState({
    code: "",
    name: "",
    type: "ASSET",
    category: "",
    description: "",
    isActive: true,
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

  const filteredAccounts = useMemo(() => {
    return accounts.filter((account) => {
      if (typeFilter !== "all" && account.type !== typeFilter) return false;
      if (statusFilter === "active" && !account.isActive) return false;
      if (statusFilter === "inactive" && account.isActive) return false;
      return true;
    });
  }, [accounts, statusFilter, typeFilter]);

  const columns: ColumnDef<ChartOfAccountRecord>[] = [
    {
      id: "code",
      header: "Code",
      accessorKey: "code",
      cell: ({ row }) => <span className="font-mono">{row.original.code}</span>,
    },
    {
      id: "name",
      header: "Account Name",
      accessorKey: "name",
      cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
    },
    {
      id: "type",
      header: "Type",
      accessorKey: "type",
      cell: ({ row }) => <Badge variant="outline">{row.original.type}</Badge>,
    },
    {
      id: "category",
      header: "Category",
      accessorKey: "category",
      cell: ({ row }) => row.original.category ?? "-",
    },
    {
      id: "status",
      header: "Status",
      accessorKey: "isActive",
      cell: ({ row }) => (
        <Badge variant={row.original.isActive ? "secondary" : "outline"}>
          {row.original.isActive ? "Active" : "Inactive"}
        </Badge>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => openEdit(row.original)}
          >
            Edit
          </Button>
          {row.original.isActive ? (
            <Button
              type="button"
              size="sm"
              variant="destructive"
              onClick={() => handleDeactivate(row.original.id)}
            >
              Deactivate
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

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
      closeForm();
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
      closeForm();
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
    setEditingAccount(null);
    setFormState({
      code: "",
      name: "",
      type: "ASSET",
      category: "",
      description: "",
      isActive: true,
    });
    setFormOpen(true);
  };

  const openEdit = (account: ChartOfAccountRecord) => {
    setEditingAccount(account);
    setFormState({
      code: account.code,
      name: account.name,
      type: account.type,
      category: account.category ?? "",
      description: account.description ?? "",
      isActive: account.isActive,
    });
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditingAccount(null);
  };

  const handleDeactivate = (id: string) => {
    if (!window.confirm("Deactivate this account?")) return;
    deactivateMutation.mutate(id);
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    if (!formState.code.trim() || !formState.name.trim()) {
      toast({
        title: "Missing details",
        description: "Account code and name are required.",
        variant: "destructive",
      });
      return;
    }

    const payload: Record<string, unknown> = {
      name: formState.name.trim(),
      type: formState.type,
      isActive: formState.isActive,
    };

    const category = formState.category.trim();
    if (category) payload.category = category;
    const description = formState.description.trim();
    if (description) payload.description = description;

    if (!editingAccount || !editingAccount.systemManaged) {
      payload.code = formState.code.trim();
    }

    if (editingAccount) {
      updateMutation.mutate({ id: editingAccount.id, data: payload });
      return;
    }

    createMutation.mutate(payload);
  };

  return (
    <AccountingShell
      activeTab="chart-of-accounts"
      title="Chart of Accounts"
      description="Maintain the account list that powers all postings and reporting."
      actions={
        <Button size="sm" onClick={openNew}>
          <Plus className="mr-2 size-4" />
          Add Account
        </Button>
      }
    >
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load chart of accounts</AlertTitle>
          <AlertDescription>{getApiErrorMessage(error)}</AlertDescription>
        </Alert>
      ) : null}

      <DataTable
        data={filteredAccounts}
        columns={columns}
        searchPlaceholder="Search accounts"
        searchSubmitLabel="Search"
        pagination={{ enabled: true }}
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger size="sm" className="h-8 w-[180px]">
                <SelectValue placeholder="Filter type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {accountTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger size="sm" className="h-8 w-[160px]">
                <SelectValue placeholder="Filter status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="all">All Statuses</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
        emptyState={isLoading ? "Loading accounts..." : "No accounts found."}
      />

      <Sheet open={formOpen} onOpenChange={setFormOpen}>
        <SheetContent className="w-full sm:max-w-lg p-6">
          <SheetHeader>
            <SheetTitle>{editingAccount ? "Edit Account" : "Add Account"}</SheetTitle>
            <SheetDescription>
              Codes map to posting rules and keep your ledger structure consistent.
            </SheetDescription>
          </SheetHeader>
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label className="block text-sm font-semibold mb-2">Account Code *</label>
              <Input
                value={formState.code}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, code: event.target.value }))
                }
                placeholder="1000"
                disabled={Boolean(editingAccount?.systemManaged)}
                required
              />
              {editingAccount?.systemManaged ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  System-managed codes cannot be changed.
                </p>
              ) : null}
            </div>
            <div>
              <label className="block text-sm font-semibold mb-2">Account Name *</label>
              <Input
                value={formState.name}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, name: event.target.value }))
                }
                placeholder="Cash on Hand"
                required
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-semibold mb-2">Type *</label>
                <Select
                  value={formState.type}
                  onValueChange={(value) =>
                    setFormState((prev) => ({ ...prev, type: value }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {accountTypes.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Status</label>
                <Select
                  value={formState.isActive ? "active" : "inactive"}
                  onValueChange={(value) =>
                    setFormState((prev) => ({ ...prev, isActive: value === "active" }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold mb-2">Category</label>
              <Input
                value={formState.category}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, category: event.target.value }))
                }
                placeholder="Current Assets"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-2">Description</label>
              <Input
                value={formState.description}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, description: event.target.value }))
                }
                placeholder="Optional account notes"
              />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="submit"
                className="flex-1"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {editingAccount ? "Save Changes" : "Create Account"}
              </Button>
              <Button type="button" variant="outline" onClick={closeForm}>
                Cancel
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </AccountingShell>
  );
}
