"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AccountingShell } from "@/components/accounting/accounting-shell";
import { VerticalDataViews } from "@/components/ui/vertical-data-views";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/components/ui/use-toast";
import {
  backfillRetailAccounting,
  fetchAccountingReadiness,
  fetchIntegrationEvents,
  fetchPostingRules,
  fetchChartOfAccounts,
  previewPostingRule,
  runSeedPack,
  fetchTenderMappings,
  type AccountingSetupReadiness,
  type AccountingIntegrationEventRecord,
  type AccountingSeedPackResult,
  type PostingRuleRecord,
  type PostingSimulationResult,
  type RetailAccountingBackfillResult,
  type TenderAccountMappingRecord,
} from "@/lib/api";
import {
  RETAIL_REQUIRED_SOURCE_TYPES,
  RETAIL_TENDER_TYPES,
  ACCOUNTING_SOURCE_TYPE_OPTIONS,
  formatAccountingSourceType,
} from "@/lib/accounting/source-types";
import {
  Plus,
  Trash2,
  RefreshCw,
  Play,
  CheckCircle2,
  XCircle,
} from "lucide-react";

// ─── constants ───────────────────────────────────────────────────────────────

const VIEWS = [
  { id: "rule-library", label: "Rule library" },
  { id: "retail-defaults", label: "Retail defaults" },
  { id: "simulation", label: "Simulation" },
  { id: "failures", label: "Failures & replay" },
  { id: "seed", label: "Seed & readiness" },
];

const BASIS_OPTIONS = ["AMOUNT", "NET", "TAX", "GROSS", "DEDUCTIONS", "ALLOWANCES"] as const;
const CONDITION_FIELDS = [
  "SITE_ID",
  "REGISTER_CODE",
  "TENDER_TYPE",
  "CURRENCY",
  "CUSTOMER_TAX_CATEGORY_ID",
  "VENDOR_TAX_CATEGORY_ID",
  "SALE_TYPE",
  "MOVEMENT_TYPE",
] as const;
const CONDITION_OPERATORS = [
  "EQ",
  "NEQ",
  "IN",
  "NOT_IN",
  "EXISTS",
  "NOT_EXISTS",
] as const;

function readinessPassed(readiness: AccountingSetupReadiness | undefined) {
  return readiness?.summary.completed ?? 0;
}

function readinessTotal(readiness: AccountingSetupReadiness | undefined) {
  return readiness?.summary.total ?? 0;
}

function readinessComplete(readiness: AccountingSetupReadiness | undefined) {
  return readinessPassed(readiness) === readinessTotal(readiness) && readinessTotal(readiness) > 0;
}

type LineForm = {
  accountId: string | null;
  direction: "DEBIT" | "CREDIT";
  basis: (typeof BASIS_OPTIONS)[number];
  taxCodeId: string | null;
  allocationType: "PERCENT" | "FIXED" | null;
  allocationValue: number | null;
  repeatMode: "NONE" | "TENDER";
  accountSource: "FIXED_ACCOUNT" | "TENDER_MAPPING";
  valuePath: string;
  memoTemplate: string;
  costCenterId: string | null;
  sortOrder: number;
};

type ConditionForm = {
  field: (typeof CONDITION_FIELDS)[number];
  operator: (typeof CONDITION_OPERATORS)[number];
  valueString: string;
  valueListJson: string;
};

type RuleForm = {
  name: string;
  description: string;
  sourceType: string;
  priority: number;
  scopeType: "COMPANY" | "SITE";
  siteId: string;
  ruleMode: "GUIDED" | "ADVANCED";
  isFallback: boolean;
  isActive: boolean;
  conditions: ConditionForm[];
  lines: LineForm[];
};

function emptyLine(): LineForm {
  return {
    accountId: null,
    direction: "DEBIT",
    basis: "AMOUNT",
    taxCodeId: null,
    allocationType: "PERCENT",
    allocationValue: 100,
    repeatMode: "NONE",
    accountSource: "FIXED_ACCOUNT",
    valuePath: "",
    memoTemplate: "",
    costCenterId: null,
    sortOrder: 0,
  };
}

function emptyCondition(): ConditionForm {
  return { field: "TENDER_TYPE", operator: "EQ", valueString: "", valueListJson: "" };
}

function emptyForm(): RuleForm {
  return {
    name: "",
    description: "",
    sourceType: "RETAIL_SALE",
    priority: 100,
    scopeType: "COMPANY",
    siteId: "",
    ruleMode: "GUIDED",
    isFallback: false,
    isActive: true,
    conditions: [],
    lines: [emptyLine(), emptyLine()],
  };
}

function ruleFromRecord(r: PostingRuleRecord): RuleForm {
  return {
    name: r.name,
    description: r.description ?? "",
    sourceType: r.sourceType,
    priority: r.priority,
    scopeType: r.scopeType,
    siteId: r.siteId ?? "",
    ruleMode: r.ruleMode,
    isFallback: r.isFallback,
    isActive: r.isActive,
    conditions: (r.conditions ?? []).map((c) => ({
      field: c.field as (typeof CONDITION_FIELDS)[number],
      operator: c.operator as (typeof CONDITION_OPERATORS)[number],
      valueString: c.valueString ?? "",
      valueListJson: c.valueListJson ?? "",
    })),
    lines: r.lines.map((l) => ({
      accountId: l.accountId ?? null,
      direction: l.direction,
      basis: l.basis,
      taxCodeId: l.taxCodeId ?? null,
      allocationType: l.allocationType ?? null,
      allocationValue: l.allocationValue ?? null,
      repeatMode: l.repeatMode ?? "NONE",
      accountSource: l.accountSource ?? "FIXED_ACCOUNT",
      valuePath: l.valuePath ?? "",
      memoTemplate: l.memoTemplate ?? "",
      costCenterId: l.costCenterId ?? null,
      sortOrder: l.sortOrder ?? 0,
    })),
  };
}

// ─── ReadinessIcon ────────────────────────────────────────────────────────────

function ReadinessIcon({ passed }: { passed: boolean }) {
  return passed ? (
    <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
  ) : (
    <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
  );
}

// ─── RuleLibraryView ──────────────────────────────────────────────────────────

function RuleLibraryView({
  rules,
  coaOptions,
  isLoading,
  onRefetch,
}: {
  rules: PostingRuleRecord[];
  coaOptions: { id: string; code: string; name: string }[];
  isLoading: boolean;
  onRefetch: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<RuleForm>(emptyForm());
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: async (f: RuleForm) => {
      const body = {
        name: f.name,
        description: f.description || null,
        sourceType: f.sourceType,
        priority: f.priority,
        scopeType: f.scopeType,
        siteId: f.siteId || null,
        ruleMode: f.ruleMode,
        isFallback: f.isFallback,
        isActive: f.isActive,
        conditions: f.conditions.map((c) => ({
          field: c.field,
          operator: c.operator,
          valueString: c.valueString || null,
          valueListJson: c.valueListJson || null,
        })),
        lines: f.lines.map((l, i) => ({
          accountId: l.accountId || null,
          direction: l.direction,
          basis: l.basis,
          taxCodeId: l.taxCodeId || null,
          allocationType: l.allocationType || null,
          allocationValue: l.allocationValue,
          repeatMode: l.repeatMode,
          accountSource: l.accountSource,
          valuePath: l.valuePath || null,
          memoTemplate: l.memoTemplate || null,
          costCenterId: l.costCenterId || null,
          sortOrder: i,
        })),
      };
      const url = editingId
        ? `/api/accounting/posting-rules/${editingId}`
        : "/api/accounting/posting-rules";
      const method = editingId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? "Failed to save rule");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Rule saved" });
      qc.invalidateQueries({ queryKey: ["accounting", "posting-rules"] });
      setSheetOpen(false);
    },
    onError: (e: Error) =>
      toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/accounting/posting-rules/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete rule");
    },
    onSuccess: () => {
      toast({ title: "Rule deleted" });
      qc.invalidateQueries({ queryKey: ["accounting", "posting-rules"] });
      setDeleteId(null);
    },
    onError: (e: Error) =>
      toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  function openNew() {
    setEditingId(null);
    setForm(emptyForm());
    setSheetOpen(true);
  }

  function openEdit(r: PostingRuleRecord) {
    setEditingId(r.id);
    setForm(ruleFromRecord(r));
    setSheetOpen(true);
  }

  function updateLine(idx: number, patch: Partial<LineForm>) {
    setForm((f) => {
      const lines = [...f.lines];
      lines[idx] = { ...lines[idx], ...patch };
      return { ...f, lines };
    });
  }

  function removeLine(idx: number) {
    setForm((f) => ({ ...f, lines: f.lines.filter((_, i) => i !== idx) }));
  }

  function updateCondition(idx: number, patch: Partial<ConditionForm>) {
    setForm((f) => {
      const conditions = [...f.conditions];
      conditions[idx] = { ...conditions[idx], ...patch };
      return { ...f, conditions };
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            {rules.length} rule{rules.length !== 1 ? "s" : ""} configured
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={onRefetch}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button size="sm" onClick={openNew}>
            <Plus className="h-4 w-4 mr-1" />
            New rule
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          Loading rules…
        </div>
      ) : rules.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          No posting rules configured. Add your first rule to start posting journals automatically.
        </div>
      ) : (
        <div className="border rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 border-b">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground w-8">#</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Source</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Rule name</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Scope</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Mode</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Lines</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Status</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rules.map((r) => (
                <tr key={r.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">
                    {r.priority}
                  </td>
                  <td className="px-3 py-2">
                    <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
                      {formatAccountingSourceType(r.sourceType)}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-medium">
                    {r.name}
                    {r.isFallback && (
                      <Badge variant="outline" className="ml-2 text-xs">
                        fallback
                      </Badge>
                    )}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground text-xs">{r.scopeType}</td>
                  <td className="px-3 py-2 text-muted-foreground text-xs">{r.ruleMode}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.lines.length}</td>
                  <td className="px-3 py-2">
                    <Badge
                      variant={r.isActive ? "default" : "outline"}
                      className="text-xs"
                    >
                      {r.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(r)}>
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setDeleteId(r.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Rule editor sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto" side="right">
          <SheetHeader>
            <SheetTitle>
              {editingId ? "Edit posting rule" : "New posting rule"}
            </SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-6">
            {/* Basic info */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Identity
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-xs text-muted-foreground mb-1 block">Rule name</label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Retail Sale - Zimbabwe Default"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    Source type
                  </label>
                  <Select
                    value={form.sourceType}
                    onValueChange={(v) => setForm((f) => ({ ...f, sourceType: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ACCOUNTING_SOURCE_TYPE_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    Priority (lower = higher precedence)
                  </label>
                  <Input
                    type="number"
                    min={0}
                    max={9999}
                    value={form.priority}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, priority: Number(e.target.value) }))
                    }
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  Description (optional)
                </label>
                <Input
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="When does this rule apply?"
                />
              </div>
            </div>

            <Separator />

            {/* Scope */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Scope
              </h3>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Scope</label>
                  <Select
                    value={form.scopeType}
                    onValueChange={(v: "COMPANY" | "SITE") =>
                      setForm((f) => ({ ...f, scopeType: v }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="COMPANY">Company-wide</SelectItem>
                      <SelectItem value="SITE">Site-specific</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Mode</label>
                  <Select
                    value={form.ruleMode}
                    onValueChange={(v: "GUIDED" | "ADVANCED") =>
                      setForm((f) => ({ ...f, ruleMode: v }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="GUIDED">Guided</SelectItem>
                      <SelectItem value="ADVANCED">Advanced</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end gap-2">
                  <label className="flex items-center gap-2 text-sm cursor-pointer pb-2">
                    <input
                      type="checkbox"
                      checked={form.isFallback}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, isFallback: e.target.checked }))
                      }
                      className="rounded"
                    />
                    Fallback rule
                  </label>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, isActive: e.target.checked }))
                    }
                    className="rounded"
                  />
                  Active
                </label>
              </div>
            </div>

            <Separator />

            {/* Conditions */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  Conditions
                </h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      conditions: [...f.conditions, emptyCondition()],
                    }))
                  }
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add condition
                </Button>
              </div>
              {form.conditions.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No conditions - this rule applies to all{" "}
                  {formatAccountingSourceType(form.sourceType)} events within its scope.
                </p>
              )}
              {form.conditions.map((cond, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center"
                >
                  <Select
                    value={cond.field}
                    onValueChange={(v) =>
                      updateCondition(idx, { field: v as typeof cond.field })
                    }
                  >
                    <SelectTrigger className="text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CONDITION_FIELDS.map((f) => (
                        <SelectItem key={f} value={f}>
                          {f}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={cond.operator}
                    onValueChange={(v) =>
                      updateCondition(idx, { operator: v as typeof cond.operator })
                    }
                  >
                    <SelectTrigger className="text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CONDITION_OPERATORS.map((o) => (
                        <SelectItem key={o} value={o}>
                          {o}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    className="text-xs"
                    value={
                      cond.operator === "IN" || cond.operator === "NOT_IN"
                        ? cond.valueListJson
                        : cond.valueString
                    }
                    onChange={(e) => {
                      if (cond.operator === "IN" || cond.operator === "NOT_IN") {
                        updateCondition(idx, { valueListJson: e.target.value });
                      } else {
                        updateCondition(idx, { valueString: e.target.value });
                      }
                    }}
                    placeholder={
                      cond.operator === "IN" || cond.operator === "NOT_IN"
                        ? '["A","B"]'
                        : "value"
                    }
                    disabled={
                      cond.operator === "EXISTS" || cond.operator === "NOT_EXISTS"
                    }
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        conditions: f.conditions.filter((_, i) => i !== idx),
                      }))
                    }
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>

            <Separator />

            {/* Lines */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  Journal lines{" "}
                  <span className="text-xs font-normal normal-case">(minimum 2)</span>
                </h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setForm((f) => ({ ...f, lines: [...f.lines, emptyLine()] }))
                  }
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add line
                </Button>
              </div>

              <div className="space-y-2">
                {form.lines.map((line, idx) => (
                  <div key={idx} className="border rounded-md p-3 space-y-2">
                    <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center">
                      <div>
                        <label className="text-xs text-muted-foreground block mb-0.5">
                          Account source
                        </label>
                        <Select
                          value={line.accountSource}
                          onValueChange={(v: "FIXED_ACCOUNT" | "TENDER_MAPPING") =>
                            updateLine(idx, {
                              accountSource: v,
                              accountId: v === "TENDER_MAPPING" ? null : line.accountId,
                              repeatMode: v === "TENDER_MAPPING" ? "TENDER" : line.repeatMode,
                            })
                          }
                        >
                          <SelectTrigger className="text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="FIXED_ACCOUNT">Fixed account</SelectItem>
                            <SelectItem value="TENDER_MAPPING">Tender mapping</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {line.accountSource === "FIXED_ACCOUNT" ? (
                        <div>
                          <label className="text-xs text-muted-foreground block mb-0.5">
                            Account
                          </label>
                          <Select
                            value={line.accountId ?? ""}
                            onValueChange={(v) =>
                              updateLine(idx, { accountId: v || null })
                            }
                          >
                            <SelectTrigger className="text-xs">
                              <SelectValue placeholder="Select…" />
                            </SelectTrigger>
                            <SelectContent>
                              {coaOptions.map((a) => (
                                <SelectItem key={a.id} value={a.id}>
                                  {a.code} — {a.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ) : (
                        <div>
                          <label className="text-xs text-muted-foreground block mb-0.5">
                            Repeat mode
                          </label>
                          <Select
                            value={line.repeatMode}
                            onValueChange={(v: "NONE" | "TENDER") =>
                              updateLine(idx, { repeatMode: v })
                            }
                          >
                            <SelectTrigger className="text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="NONE">None</SelectItem>
                              <SelectItem value="TENDER">Per tender split</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      <div>
                        <label className="text-xs text-muted-foreground block mb-0.5">
                          Direction
                        </label>
                        <Select
                          value={line.direction}
                          onValueChange={(v: "DEBIT" | "CREDIT") =>
                            updateLine(idx, { direction: v })
                          }
                        >
                          <SelectTrigger className="text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="DEBIT">Debit</SelectItem>
                            <SelectItem value="CREDIT">Credit</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={form.lines.length <= 2}
                        onClick={() => removeLine(idx)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-xs text-muted-foreground block mb-0.5">
                          Basis
                        </label>
                        <Select
                          value={line.basis}
                          onValueChange={(v: (typeof BASIS_OPTIONS)[number]) =>
                            updateLine(idx, { basis: v })
                          }
                        >
                          <SelectTrigger className="text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {BASIS_OPTIONS.map((b) => (
                              <SelectItem key={b} value={b}>
                                {b}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {form.ruleMode === "ADVANCED" && (
                        <>
                          <div>
                            <label className="text-xs text-muted-foreground block mb-0.5">
                              Value path
                            </label>
                            <Input
                              className="text-xs"
                              value={line.valuePath}
                              onChange={(e) =>
                                updateLine(idx, { valuePath: e.target.value })
                              }
                              placeholder="Optional payload path"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-muted-foreground block mb-0.5">
                              Memo template
                            </label>
                            <Input
                              className="text-xs"
                              value={line.memoTemplate}
                              onChange={(e) =>
                                updateLine(idx, { memoTemplate: e.target.value })
                              }
                              placeholder="e.g. Sale {sourceId} - {tenderType}"
                            />
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            <div className="flex justify-end gap-2 pb-6">
              <Button variant="outline" onClick={() => setSheetOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => saveMutation.mutate(form)}
                disabled={
                  saveMutation.isPending ||
                  form.name.trim() === "" ||
                  form.lines.length < 2
                }
              >
                {saveMutation.isPending ? "Saving…" : "Save rule"}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Delete confirm */}
      <Dialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete posting rule?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will permanently remove the rule. Historical journals already posted will not
            be affected.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── RetailDefaultsView ───────────────────────────────────────────────────────

function RetailDefaultsView({
  rules,
  tenderMappings,
}: {
  rules: PostingRuleRecord[];
  tenderMappings: TenderAccountMappingRecord[];
}) {
  const rulesBySource = rules.reduce<Record<string, PostingRuleRecord[]>>((acc, r) => {
    (acc[r.sourceType] = acc[r.sourceType] ?? []).push(r);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold mb-1">Retail posting rule coverage</h3>
        <p className="text-xs text-muted-foreground">
          These source types must have at least one active rule for retail journals to post
          automatically.
        </p>
      </div>

      <div className="border rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 border-b">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                Source type
              </th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Rules</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {RETAIL_REQUIRED_SOURCE_TYPES.map((st) => {
              const typeRules = rulesBySource[st] ?? [];
              const active = typeRules.filter((r) => r.isActive);
              const covered = active.length > 0;
              return (
                <tr key={st} className="hover:bg-muted/20">
                  <td className="px-3 py-2">
                    <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
                      {formatAccountingSourceType(st)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {typeRules.length === 0
                      ? "None"
                      : typeRules.map((r) => r.name).join(", ")}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <ReadinessIcon passed={covered} />
                      <span className="text-xs">
                        {covered ? `${active.length} active` : "Missing"}
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div>
        <h3 className="text-sm font-semibold mb-3">Tender account mappings</h3>
        {tenderMappings.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No tender mappings configured. Run the seed pack to create defaults.
          </p>
        ) : (
          <div className="border rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 border-b">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                    Tender type
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                    Currency
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                    Clearing account
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                    Scope
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {tenderMappings.map((m) => (
                  <tr key={m.id} className="hover:bg-muted/20">
                    <td className="px-3 py-2 font-medium">{m.tenderType}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {m.currency ?? "All"}
                    </td>
                    <td className="px-3 py-2">
                      {m.clearingAccount
                        ? `${m.clearingAccount.code} - ${m.clearingAccount.name}`
                        : m.clearingAccountId}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground text-xs">
                      {m.siteId ? "Site" : "Company"}
                    </td>
                    <td className="px-3 py-2">
                      <Badge
                        variant={m.isActive ? "default" : "outline"}
                        className="text-xs"
                      >
                        {m.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── SimulationView ───────────────────────────────────────────────────────────

function SimulationView() {
  const [form, setForm] = useState({
    sourceType: "RETAIL_SALE",
    amount: 100,
    netAmount: "",
    taxAmount: "",
    currency: "USD",
    siteId: "",
    registerCode: "",
    description: "Simulation test",
    invertDirection: false,
    payments: [{ tenderType: "CASH", amount: 100, currency: "USD" }],
  });
  const [result, setResult] = useState<PostingSimulationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const previewMutation = useMutation({
    mutationFn: () =>
      previewPostingRule({
        sourceType: form.sourceType,
        sourceId: `sim-${Date.now()}`,
        description: form.description,
        amount: Number(form.amount),
        netAmount: form.netAmount ? Number(form.netAmount) : null,
        taxAmount: form.taxAmount ? Number(form.taxAmount) : null,
        currency: form.currency || null,
        siteId: form.siteId || null,
        registerCode: form.registerCode || null,
        invertDirection: form.invertDirection,
        payments: form.payments,
      }),
    onSuccess: (data) => {
      setResult(data);
      setError(data.error ?? null);
    },
    onError: (e: Error) => {
      setError(e.message);
      setResult(null);
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold mb-1">Posting simulation</h3>
        <p className="text-xs text-muted-foreground">
          Preview the journal that would be generated for a given event without persisting
          anything.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Source type</label>
          <Select
            value={form.sourceType}
            onValueChange={(v) => setForm((f) => ({ ...f, sourceType: v }))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ACCOUNTING_SOURCE_TYPE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Description</label>
          <Input
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Amount</label>
          <Input
            type="number"
            value={form.amount}
            onChange={(e) => setForm((f) => ({ ...f, amount: Number(e.target.value) }))}
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">
            Net amount (optional)
          </label>
          <Input
            type="number"
            value={form.netAmount}
            onChange={(e) => setForm((f) => ({ ...f, netAmount: e.target.value }))}
            placeholder="Leave blank to use amount"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">
            Tax amount (optional)
          </label>
          <Input
            type="number"
            value={form.taxAmount}
            onChange={(e) => setForm((f) => ({ ...f, taxAmount: e.target.value }))}
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Currency</label>
          <Input
            value={form.currency}
            onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">
            Site ID (optional)
          </label>
          <Input
            value={form.siteId}
            onChange={(e) => setForm((f) => ({ ...f, siteId: e.target.value }))}
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">
            Register code (optional)
          </label>
          <Input
            value={form.registerCode}
            onChange={(e) => setForm((f) => ({ ...f, registerCode: e.target.value }))}
          />
        </div>
      </div>

      {/* Tender splits */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Payment splits
          </h4>
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              setForm((f) => ({
                ...f,
                payments: [
                  ...f.payments,
                  { tenderType: "CASH", amount: 0, currency: "USD" },
                ],
              }))
            }
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add split
          </Button>
        </div>
        {form.payments.map((p, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center">
            <Select
              value={p.tenderType}
              onValueChange={(v) =>
                setForm((f) => {
                  const payments = [...f.payments];
                  payments[i] = { ...payments[i], tenderType: v };
                  return { ...f, payments };
                })
              }
            >
              <SelectTrigger className="text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RETAIL_TENDER_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="number"
              className="text-xs"
              value={p.amount}
              onChange={(e) =>
                setForm((f) => {
                  const payments = [...f.payments];
                  payments[i] = { ...payments[i], amount: Number(e.target.value) };
                  return { ...f, payments };
                })
              }
            />
            <Input
              className="text-xs"
              value={p.currency}
              onChange={(e) =>
                setForm((f) => {
                  const payments = [...f.payments];
                  payments[i] = { ...payments[i], currency: e.target.value };
                  return { ...f, payments };
                })
              }
              placeholder="Currency"
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setForm((f) => ({ ...f, payments: f.payments.filter((_, j) => j !== i) }))
              }
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>

      <Button onClick={() => previewMutation.mutate()} disabled={previewMutation.isPending}>
        <Play className="h-4 w-4 mr-2" />
        {previewMutation.isPending ? "Simulating..." : "Run simulation"}
      </Button>

      {error && (
        <div className="p-3 border border-destructive/30 bg-destructive/5 rounded-md text-sm text-destructive">
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <ReadinessIcon passed={result.balanced} />
            <span className="text-sm font-medium">
              {result.balanced ? "Balanced" : "Unbalanced"} - Dr{" "}
              {result.totalDebit.toFixed(2)} / Cr {result.totalCredit.toFixed(2)}
            </span>
            {result.selectedRule?.name && (
              <Badge variant="outline" className="text-xs">
                {result.selectedRule.name}
              </Badge>
            )}
          </div>

          {result.error && (
            <p className="text-sm text-destructive">{result.error}</p>
          )}

          {result.warnings.length > 0 && (
            <div className="space-y-1">
              {result.warnings.map((warning) => (
                <p key={warning} className="text-xs text-amber-700">
                  {warning}
                </p>
              ))}
            </div>
          )}

          <div className="border rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 border-b">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                    Account
                  </th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                    Debit
                  </th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                    Credit
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                    Memo
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {result.lines.map((line, i) => (
                  <tr key={i} className="hover:bg-muted/20">
                    <td className="px-3 py-2">
                      <span className="font-mono text-xs">{line.accountCode}</span>{" "}
                      <span className="text-muted-foreground">{line.accountName}</span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {line.debit > 0 ? line.debit.toFixed(2) : ""}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {line.credit > 0 ? line.credit.toFixed(2) : ""}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{line.memo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── FailuresView ─────────────────────────────────────────────────────────────

function FailuresView() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const {
    data: eventsData,
    isLoading: failedLoading,
    refetch,
  } = useQuery({
    queryKey: ["accounting", "integration-events", "failed"],
    queryFn: () => fetchIntegrationEvents({ status: "FAILED", limit: 100 }),
  });

  const { data: pendingData, isLoading: pendingLoading } = useQuery({
    queryKey: ["accounting", "integration-events", "pending"],
    queryFn: () => fetchIntegrationEvents({ status: "PENDING", limit: 100 }),
  });

  const isLoading = failedLoading || pendingLoading;
  const events: AccountingIntegrationEventRecord[] = eventsData?.data ?? [];
  const pending: AccountingIntegrationEventRecord[] = pendingData?.data ?? [];
  const total = events.length + pending.length;

  const replayMutation = useMutation({
    mutationFn: () =>
      fetch("/api/accounting/integration/replay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 100 }),
      }).then((r) => r.json()),
    onSuccess: (data) => {
      toast({
        title: "Replay complete",
        description: `${data.posted ?? 0} posted, ${data.failed ?? 0} still failing`,
      });
      qc.invalidateQueries({ queryKey: ["accounting", "integration-events"] });
    },
    onError: (e: Error) =>
      toast({ title: "Replay failed", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Integration event failures</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {total} event{total !== 1 ? "s" : ""} pending or failed
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            disabled={total === 0 || replayMutation.isPending}
            onClick={() => replayMutation.mutate()}
          >
            <RefreshCw className="h-4 w-4 mr-1" />
            {replayMutation.isPending ? "Replaying…" : "Replay all"}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          Loading events…
        </div>
      ) : total === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto mb-2" />
          No failed or pending events — all journals posted successfully.
        </div>
      ) : (
        <div className="border rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 border-b">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                  Status
                </th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                  Source type
                </th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                  Description
                </th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                  Amount
                </th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                  Attempts
                </th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                  Last error
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {[...pending, ...events].map((ev) => (
                <tr key={ev.id} className="hover:bg-muted/20">
                  <td className="px-3 py-2">
                    <Badge
                      variant={ev.status === "FAILED" ? "destructive" : "outline"}
                      className="text-xs"
                    >
                      {ev.status}
                    </Badge>
                  </td>
                  <td className="px-3 py-2">
                    <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
                      {formatAccountingSourceType(ev.sourceType)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground max-w-48 truncate">
                    {ev.description}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {Number(ev.amount).toFixed(2)}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{ev.attemptCount}</td>
                  <td className="px-3 py-2 text-xs text-destructive max-w-64 truncate">
                    {ev.lastError ?? "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── SeedView ─────────────────────────────────────────────────────────────────

function SeedView() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [fxRates, setFxRates] = useState({ ZWG: "", ZAR: "" });
  const [backfillDryRun, setBackfillDryRun] = useState(true);
  const [seedResult, setSeedResult] = useState<AccountingSeedPackResult | null>(null);
  const [backfillResult, setBackfillResult] = useState<RetailAccountingBackfillResult | null>(
    null,
  );

  const {
    data: readiness,
    isLoading: readinessLoading,
    refetch: refetchReadiness,
  } = useQuery({
    queryKey: ["accounting", "setup-readiness"],
    queryFn: fetchAccountingReadiness,
  });

  const seedMutation = useMutation({
    mutationFn: (mode: "DRY_RUN" | "APPLY") => {
      const rates: Record<string, number> = {};
      if (fxRates.ZWG) rates["ZWG"] = Number(fxRates.ZWG);
      if (fxRates.ZAR) rates["ZAR"] = Number(fxRates.ZAR);
      return runSeedPack({
        mode,
        fxRates: Object.keys(rates).length > 0 ? rates : undefined,
      });
    },
    onSuccess: (data, mode) => {
      setSeedResult(data);
      if (mode === "APPLY") {
        toast({
          title: "Seed pack applied",
          description: `${data.createdAccounts} accounts, ${data.createdPostingRules} rules created`,
        });
        refetchReadiness();
        qc.invalidateQueries({ queryKey: ["accounting", "posting-rules"] });
      } else {
        toast({
          title: "Dry run complete",
          description: "Review the preview below before applying.",
        });
      }
    },
    onError: (e: Error) =>
      toast({ title: "Seed pack error", description: e.message, variant: "destructive" }),
  });

  const backfillMutation = useMutation({
    mutationFn: () => backfillRetailAccounting({ dryRun: backfillDryRun, limit: 200 }),
    onSuccess: (data) => {
      setBackfillResult(data);
      if (data.mode === "APPLY") {
        toast({
          title: "Backfill complete",
          description: `${data.posted ?? 0} journals posted`,
        });
      } else {
        toast({
          title: "Backfill dry run",
          description: `${data.discovered} candidates identified`,
        });
      }
    },
    onError: (e: Error) =>
      toast({ title: "Backfill error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-8">
      {/* Readiness */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Accounting setup readiness</h3>
          <Button variant="ghost" size="sm" onClick={() => refetchReadiness()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>

        {readinessLoading ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            Checking readiness...
          </div>
        ) : readiness ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <ReadinessIcon passed={readinessComplete(readiness)} />
              <span className="font-medium">
                {readinessPassed(readiness)}/{readinessTotal(readiness)} checks passing
              </span>
            </div>
            <div className="border rounded-md overflow-hidden">
              <table className="w-full text-sm">
                <tbody className="divide-y">
                  {readiness.checks.map((check) => (
                    <tr key={check.id} className="hover:bg-muted/20">
                      <td className="px-3 py-2 w-8">
                        <ReadinessIcon passed={check.ready} />
                      </td>
                      <td className="px-3 py-2 font-medium">{check.label}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {check.note ?? ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>

      <Separator />

      {/* Seed pack */}
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold mb-1">
            Zimbabwe Retail Foundation seed pack
          </h3>
          <p className="text-xs text-muted-foreground">
            Provisions chart of accounts, tax codes, currencies, posting rules, and tender
            mappings for Zimbabwe retail. Idempotent - safe to re-run.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">
              ZWG/USD rate (e.g. 27.5)
            </label>
            <Input
              type="number"
              step="0.01"
              value={fxRates.ZWG}
              onChange={(e) => setFxRates((r) => ({ ...r, ZWG: e.target.value }))}
              placeholder="Current market rate"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">
              ZAR/USD rate (e.g. 18.5)
            </label>
            <Input
              type="number"
              step="0.01"
              value={fxRates.ZAR}
              onChange={(e) => setFxRates((r) => ({ ...r, ZAR: e.target.value }))}
              placeholder="Current market rate"
            />
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => seedMutation.mutate("DRY_RUN")}
            disabled={seedMutation.isPending}
          >
            {seedMutation.isPending && seedMutation.variables === "DRY_RUN"
              ? "Previewing..."
              : "Preview (dry run)"}
          </Button>
          <Button
            onClick={() => seedMutation.mutate("APPLY")}
            disabled={seedMutation.isPending}
          >
            {seedMutation.isPending && seedMutation.variables === "APPLY"
              ? "Applying..."
              : "Apply seed pack"}
          </Button>
        </div>

        {seedResult && (
          <div className="border rounded-md p-4 space-y-2 bg-muted/20">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {seedResult.mode === "DRY_RUN" ? "Dry run preview" : "Applied"}
            </p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
              <span>Accounts created</span>
              <span className="tabular-nums">{seedResult.createdAccounts}</span>
              <span>Tax codes created</span>
              <span className="tabular-nums">{seedResult.createdTaxCodes}</span>
              <span>Tax categories</span>
              <span className="tabular-nums">{seedResult.createdTaxCategories}</span>
              <span>Currency definitions</span>
              <span className="tabular-nums">{seedResult.createdCurrencyDefinitions}</span>
              <span>FX rates created</span>
              <span className="tabular-nums">{seedResult.createdCurrencyRates}</span>
              <span>Tender mappings</span>
              <span className="tabular-nums">{seedResult.createdTenderMappings}</span>
              <span>Posting rules created</span>
              <span className="tabular-nums">{seedResult.createdPostingRules}</span>
              <span>Bank accounts created</span>
              <span className="tabular-nums">{seedResult.createdBankAccounts}</span>
              <span>Periods created</span>
              <span className="tabular-nums">{seedResult.createdPeriods}</span>
            </div>
            {seedResult.preview.missingFxQuotes.length > 0 && (
              <p className="text-xs text-amber-700">
                Missing FX quotes for: {seedResult.preview.missingFxQuotes.join(", ")}
              </p>
            )}
          </div>
        )}
      </div>

      <Separator />

      {/* Backfill */}
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold mb-1">Retail accounting backfill</h3>
          <p className="text-xs text-muted-foreground">
            Post missing historical journals for retail sales, refunds, goods receipts, shift
            openings, and variances. Always dry-run first.
          </p>
        </div>

        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={backfillDryRun}
              onChange={(e) => setBackfillDryRun(e.target.checked)}
              className="rounded"
            />
            Dry run (preview only)
          </label>
        </div>

        <Button
          variant={backfillDryRun ? "outline" : "default"}
          onClick={() => backfillMutation.mutate()}
          disabled={backfillMutation.isPending}
        >
          {backfillMutation.isPending
            ? "Running..."
            : backfillDryRun
              ? "Preview backfill"
              : "Run backfill"}
        </Button>

        {backfillResult && (
          <div className="space-y-2">
            <div className="flex gap-4 text-sm">
              {backfillResult.mode === "DRY_RUN" ? (
                <span>{backfillResult.discovered} candidates identified</span>
              ) : (
                <>
                  <span>{backfillResult.posted ?? 0} posted</span>
                  <span>{backfillResult.skipped ?? 0} skipped</span>
                  <span
                    className={backfillResult.failed > 0 ? "text-destructive" : ""}
                  >
                    {backfillResult.failed ?? 0} failed
                  </span>
                </>
              )}
            </div>

            {backfillResult.mode === "DRY_RUN" && backfillResult.candidates.length > 0 && (
              <div className="border rounded-md overflow-hidden max-h-64 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40 border-b sticky top-0">
                    <tr>
                      <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">
                        Candidate
                      </th>
                      <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">
                        Entry date
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {backfillResult.candidates.map((candidate, i) => (
                      <tr key={i} className="hover:bg-muted/20">
                        <td className="px-3 py-1.5 text-muted-foreground truncate max-w-48">
                          {candidate.label}
                        </td>
                        <td className="px-3 py-1.5 text-muted-foreground font-mono">
                          {candidate.entryDate.slice(0, 10)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {backfillResult.mode === "APPLY" && backfillResult.failures.length > 0 && (
              <div className="space-y-1">
                {backfillResult.failures.map((failure) => (
                  <p key={failure.key} className="text-xs text-destructive">
                    {failure.key}: {failure.error}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function PostingStudioPage() {
  const searchParams = useSearchParams();
  const initialViewParam = searchParams.get("view");
  const initialView = VIEWS.some((view) => view.id === initialViewParam)
    ? initialViewParam!
    : "rule-library";
  const [activeView, setActiveView] = useState(initialView);

  const {
    data: rules = [],
    isLoading: rulesLoading,
    refetch: refetchRules,
  } = useQuery({
    queryKey: ["accounting", "posting-rules"],
    queryFn: () => fetchPostingRules(),
  });

  const { data: coaData } = useQuery({
    queryKey: ["accounting", "coa", "posting"],
    queryFn: () => fetchChartOfAccounts({ limit: 500, active: true }),
  });

  const { data: tenderMappings = [] } = useQuery({
    queryKey: ["accounting", "tender-mappings"],
    queryFn: () => fetchTenderMappings(),
  });

  const coaOptions = (coaData?.data ?? []).map((a) => ({
    id: a.id,
    code: a.code,
    name: a.name,
  }));

  // Count failures for badge
  const { data: failuresData } = useQuery({
    queryKey: ["accounting", "integration-events", "failed-count"],
    queryFn: () => fetchIntegrationEvents({ status: "FAILED", limit: 1 }).then((data) => data.meta.total),
    refetchInterval: 60_000,
  });

  const viewItems = VIEWS.map((v) => ({
    ...v,
    ...(v.id === "failures" && (failuresData ?? 0) > 0
      ? { count: failuresData as number }
      : {}),
  }));

  return (
    <AccountingShell activeTab="posting-rules" title="Posting Studio">
      <VerticalDataViews
        items={viewItems}
        value={activeView}
        onValueChange={setActiveView}
        railLabel="Views"
      >
        <div className={activeView === "rule-library" ? "" : "hidden"}>
          <RuleLibraryView
            rules={rules as PostingRuleRecord[]}
            coaOptions={coaOptions}
            isLoading={rulesLoading}
            onRefetch={refetchRules}
          />
        </div>
        <div className={activeView === "retail-defaults" ? "" : "hidden"}>
          <RetailDefaultsView
            rules={rules as PostingRuleRecord[]}
            tenderMappings={tenderMappings as TenderAccountMappingRecord[]}
          />
        </div>
        <div className={activeView === "simulation" ? "" : "hidden"}>
          <SimulationView />
        </div>
        <div className={activeView === "failures" ? "" : "hidden"}>
          <FailuresView />
        </div>
        <div className={activeView === "seed" ? "" : "hidden"}>
          <SeedView />
        </div>
      </VerticalDataViews>
    </AccountingShell>
  );
}
