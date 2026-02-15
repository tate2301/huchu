"use client";

import { useState } from "react";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/components/ui/use-toast";
import {
  type ChartOfAccountRecord,
  type PostingRuleRecord,
  fetchChartOfAccounts,
  fetchPostingRules,
} from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { Plus } from "@/lib/icons";

const sourceTypeOptions = [
  { value: "STOCK_RECEIPT", label: "Stock Receipt" },
  { value: "STOCK_ISSUE", label: "Stock Issue" },
  { value: "STOCK_ADJUSTMENT", label: "Stock Adjustment" },
  { value: "PAYROLL_RUN", label: "Payroll Run" },
  { value: "PAYROLL_DISBURSEMENT", label: "Payroll Disbursement" },
  { value: "GOLD_RECEIPT", label: "Gold Receipt" },
  { value: "GOLD_DISPATCH", label: "Gold Dispatch" },
  { value: "SALES_INVOICE", label: "Sales Invoice" },
  { value: "SALES_RECEIPT", label: "Sales Receipt" },
  { value: "SALES_CREDIT_NOTE", label: "Sales Credit Note" },
  { value: "SALES_WRITE_OFF", label: "Sales Write-off" },
  { value: "PURCHASE_BILL", label: "Purchase Bill" },
  { value: "PURCHASE_PAYMENT", label: "Purchase Payment" },
  { value: "PURCHASE_DEBIT_NOTE", label: "Purchase Debit Note" },
  { value: "PURCHASE_WRITE_OFF", label: "Purchase Write-off" },
  { value: "BANK_TRANSACTION", label: "Bank Transaction" },
  { value: "MAINTENANCE_COMPLETION", label: "Maintenance Completion" },
] as const;

const basisOptions = ["AMOUNT", "NET", "TAX", "GROSS", "DEDUCTIONS", "ALLOWANCES"] as const;
const allocationTypes = ["PERCENT", "FIXED"] as const;

const defaultLine = () => ({
  accountId: "",
  direction: "DEBIT",
  basis: "AMOUNT",
  allocationType: "PERCENT",
  allocationValue: "100",
});

type PostingRuleLineForm = ReturnType<typeof defaultLine>;

export default function PostingRulesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<PostingRuleRecord | null>(null);
  const [formState, setFormState] = useState({
    name: "",
    sourceType: sourceTypeOptions[0].value,
    isActive: true,
  });
  const [lines, setLines] = useState<PostingRuleLineForm[]>([defaultLine(), defaultLine()]);

  const {
    data: rulesData,
    isLoading: rulesLoading,
    error: rulesError,
  } = useQuery({
    queryKey: ["accounting", "posting-rules"],
    queryFn: fetchPostingRules,
  });

  const {
    data: accountsData,
    isLoading: accountsLoading,
    error: accountsError,
  } = useQuery({
    queryKey: ["accounting", "coa", "posting"],
    queryFn: () => fetchChartOfAccounts({ limit: 500, active: true }),
  });

  const rules = rulesData ?? [];
  const accounts = accountsData?.data ?? [];

  const columns: ColumnDef<PostingRuleRecord>[] = [
    {
      id: "sourceType",
      header: "Source",
      accessorKey: "sourceType",
      cell: ({ row }) => {
        const match = sourceTypeOptions.find((item) => item.value === row.original.sourceType);
        return <span className="font-medium">{match?.label ?? row.original.sourceType}</span>;
      },
    },
    {
      id: "name",
      header: "Rule Name",
      accessorKey: "name",
    },
    {
      id: "lines",
      header: "Lines",
      cell: ({ row }) => <span className="font-mono">{row.original.lines.length}</span>,
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
        <div className="flex justify-end">
          <Button size="sm" variant="outline" onClick={() => openEdit(row.original)}>
            Edit
          </Button>
        </div>
      ),
    },
  ];

  const saveMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      fetchJson("/api/accounting/posting-rules", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      toast({
        title: "Posting rule saved",
        description: "Posting rule updated successfully.",
        variant: "success",
      });
      resetForm();
      setFormOpen(false);
      queryClient.invalidateQueries({ queryKey: ["accounting", "posting-rules"] });
    },
    onError: (err) => {
      toast({
        title: "Unable to save rule",
        description: getApiErrorMessage(err),
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setEditingRule(null);
    setFormState({
      name: "",
      sourceType: sourceTypeOptions[0].value,
      isActive: true,
    });
    setLines([defaultLine(), defaultLine()]);
  };

  const openNew = () => {
    resetForm();
    setFormOpen(true);
  };

  const openEdit = (rule: PostingRuleRecord) => {
    setEditingRule(rule);
    setFormState({
      name: rule.name,
      sourceType: rule.sourceType,
      isActive: rule.isActive,
    });
    setLines(
      rule.lines.map((line) => ({
        accountId: line.accountId,
        direction: line.direction,
        basis: line.basis,
        allocationType: line.allocationType ?? "PERCENT",
        allocationValue: String(line.allocationValue ?? 100),
      })),
    );
    setFormOpen(true);
  };

  const updateLine = (index: number, field: keyof PostingRuleLineForm, value: string) => {
    setLines((prev) =>
      prev.map((line, idx) => (idx === index ? { ...line, [field]: value } : line)),
    );
  };

  const addLine = () => {
    setLines((prev) => [...prev, defaultLine()]);
  };

  const removeLine = (index: number) => {
    if (lines.length <= 2) return;
    setLines((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    if (!formState.name.trim()) {
      toast({
        title: "Missing rule name",
        description: "Please provide a posting rule name.",
        variant: "destructive",
      });
      return;
    }

    const preparedLines = lines
      .map((line) => ({
        accountId: line.accountId,
        direction: line.direction,
        basis: line.basis,
        allocationType: line.allocationType,
        allocationValue: Number(line.allocationValue) || 0,
      }))
      .filter((line) => line.accountId);

    if (preparedLines.length < 2) {
      toast({
        title: "Incomplete lines",
        description: "Provide at least two posting lines.",
        variant: "destructive",
      });
      return;
    }

    saveMutation.mutate({
      name: formState.name.trim(),
      sourceType: formState.sourceType,
      isActive: formState.isActive,
      lines: preparedLines,
    });
  };

  return (
    <AccountingShell
      activeTab="posting-rules"
      title="Posting Rules"
      description="Define automatic postings from operational transactions into the ledger."
      actions={
        <Button size="sm" onClick={openNew}>
          <Plus className="mr-2 size-4" />
          New Rule
        </Button>
      }
    >
      {(rulesError || accountsError) ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load posting rules</AlertTitle>
          <AlertDescription>{getApiErrorMessage(rulesError || accountsError)}</AlertDescription>
        </Alert>
      ) : null}

      <DataTable
        data={rules}
        columns={columns}
        searchPlaceholder="Search posting rules"
        searchSubmitLabel="Search"
        pagination={{ enabled: true }}
        emptyState={rulesLoading ? "Loading rules..." : "No posting rules configured."}
      />

      <Sheet open={formOpen} onOpenChange={setFormOpen}>
        <SheetContent className="w-full sm:max-w-4xl p-6 overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editingRule ? "Edit Posting Rule" : "New Posting Rule"}</SheetTitle>
            <SheetDescription>
              Use line rules to map operational transactions into your ledger accounts.
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-semibold mb-2">Rule Name *</label>
                <Input
                  value={formState.name}
                  onChange={(event) =>
                    setFormState((prev) => ({ ...prev, name: event.target.value }))
                  }
                  placeholder="Sales invoice posting"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Source Type *</label>
                <Select
                  value={formState.sourceType}
                  onValueChange={(value) =>
                    setFormState((prev) => ({ ...prev, sourceType: value }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select source" />
                  </SelectTrigger>
                  <SelectContent>
                    {sourceTypeOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Posting Lines</h3>
                <Button type="button" size="sm" variant="outline" onClick={addLine}>
                  Add Line
                </Button>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[220px]">Account</TableHead>
                    <TableHead className="w-[140px]">Direction</TableHead>
                    <TableHead className="w-[140px]">Basis</TableHead>
                    <TableHead className="w-[140px]">Allocation</TableHead>
                    <TableHead className="w-[140px] text-right">Value</TableHead>
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
                            {accounts.map((account: ChartOfAccountRecord) => (
                              <SelectItem key={account.id} value={account.id}>
                                {account.code} - {account.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={line.direction}
                          onValueChange={(value) => updateLine(index, "direction", value)}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="DEBIT">Debit</SelectItem>
                            <SelectItem value="CREDIT">Credit</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={line.basis}
                          onValueChange={(value) => updateLine(index, "basis", value)}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select" />
                          </SelectTrigger>
                          <SelectContent>
                            {basisOptions.map((basis) => (
                              <SelectItem key={basis} value={basis}>
                                {basis}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={line.allocationType}
                          onValueChange={(value) => updateLine(index, "allocationType", value)}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select" />
                          </SelectTrigger>
                          <SelectContent>
                            {allocationTypes.map((type) => (
                              <SelectItem key={type} value={type}>
                                {type}
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
                          value={line.allocationValue}
                          onChange={(event) =>
                            updateLine(index, "allocationValue", event.target.value)
                          }
                          className="text-right font-mono"
                        />
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
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="submit" className="flex-1" disabled={saveMutation.isPending}>
                Save Posting Rule
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
