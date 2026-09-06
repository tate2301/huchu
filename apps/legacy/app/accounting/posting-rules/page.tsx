"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AccountingShell } from "@corelithzw/module-books/components/accounting-shell";
import { BandChip } from "@corelithzw/module-books/components/band-chip";
import { PostingRuleList } from "@corelithzw/module-books/components/posting-rule-list";
import { PostingRuleExplainer } from "@corelithzw/module-books/components/posting-rule-explainer";
import { PageActions } from "@corelithzw/ui/layout/page-actions";
import { VerticalDataViews } from "@corelithzw/ui/components/vertical-data-views";
import { Badge } from "@corelithzw/ui/components/badge";
import { Button } from "@corelithzw/ui/components/button";
import { Input } from "@corelithzw/ui/components/input";
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
  SheetHeader,
  SheetTitle,
} from "@corelithzw/ui/components/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@corelithzw/ui/components/dialog";
import { Separator } from "@corelithzw/ui/components/separator";
import { useToast } from "@corelithzw/ui/components/use-toast";
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
} from "@corelithzw/module-books/source-types";
import {
  Plus,
  Trash2,
  RefreshCw,
  Play,
  CheckCircle2,
  XCircle,
} from "@corelithzw/ui/lib/icons";

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
    <CheckCircle2 className="h-4 w-4 text-[var(--badge-ok-fg)] flex-shrink-0" />
  ) : (
    <XCircle className="h-4 w-4 text-[var(--badge-bad-fg)] flex-shrink-0" />
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
  const [selectedId, setSelectedId] = useState<string | null>(null);

  /** Account lookup for the explainer, so a line can name its account rather
   *  than show the id the record stores. */
  const accountsById = useMemo(
    () => new Map(coaOptions.map((account) => [account.id, account])),
    [coaOptions],
  );

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

  /*
    Master and detail, not a spreadsheet of properties.

    The list is the index and the panel is the answer. Selection lives here so
    it survives opening and closing the editor sheet — you edit a rule, save,
    and are still looking at the rule you were reading.
  */
  const selectedRule =
    rules.find((rule) => rule.id === selectedId) ?? rules[0] ?? null;

  return (
    <div className="space-y-3">
      {/*
        The actions belong in the app bar, not in a strip above the list.

        They are registered from inside this view rather than passed down as
        the shell's `actions` prop because "New rule" opens the editor sheet,
        and the sheet's form state lives here — hoisting all of it to the page
        just so the button could be declared one level higher would put the
        form's state two components away from the form. The row they replace
        also carried a rule count, which the Rules panel head already prints.
      */}
      <PageActions>
        <Button variant="ghost" size="sm" onClick={onRefetch} aria-label="Refresh rules">
          <RefreshCw className="h-4 w-4" />
        </Button>
        <Button size="sm" onClick={openNew}>
          <Plus className="h-4 w-4 mr-1" />
          New rule
        </Button>
      </PageActions>

      {isLoading ? (
        <div className="py-12 text-center text-sm text-[var(--text-muted)]">Loading rules…</div>
      ) : rules.length === 0 ? (
        <div className="py-12 text-center text-sm text-[var(--text-muted)]">
          No posting rules configured. Add your first rule to start posting journals
          automatically.
        </div>
      ) : (
        <div className="grid min-w-0 items-start gap-2.5 lg:grid-cols-[264px_minmax(0,1fr)]">
          <PostingRuleList
            rules={rules}
            selectedId={selectedRule?.id ?? null}
            onSelect={setSelectedId}
            className="lg:sticky lg:top-[calc(var(--stack-top,0px)+0.75rem)]"
          />

          {selectedRule ? (
            <div className="flex min-w-0 flex-col gap-2.5">
              <div className="flex min-w-0 items-center gap-2">
                <h3 className="min-w-0 flex-1 truncate text-base font-bold text-[var(--text-strong)]">
                  {selectedRule.name}
                </h3>
                <span className="acct-badge" data-tone={selectedRule.isActive ? "ok" : "mute"}>
                  {selectedRule.isActive ? "Active" : "Inactive"}
                </span>
                {selectedRule.isFallback ? (
                  <span className="acct-badge" data-tone="warn">
                    Fallback
                  </span>
                ) : null}
                <Button variant="ghost" size="sm" onClick={() => openEdit(selectedRule)}>
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-[var(--badge-bad-fg)] hover:text-[var(--badge-bad-fg)]"
                  onClick={() => setDeleteId(selectedRule.id)}
                  aria-label={`Delete ${selectedRule.name}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>

              {selectedRule.description ? (
                <p className="text-sm text-[var(--text-muted)]">{selectedRule.description}</p>
              ) : null}

              <PostingRuleExplainer
                rule={selectedRule}
                accountsById={accountsById}
                onEdit={() => openEdit(selectedRule)}
              />
            </div>
          ) : null}
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
                  <label className="acct-field-label">Rule name</label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Retail Sale - Zimbabwe Default"
                  />
                </div>
                <div>
                  <label className="acct-field-label">
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
                  <label className="acct-field-label">
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
                <label className="acct-field-label">
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
                  <label className="acct-field-label">Scope</label>
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
                  <label className="acct-field-label">Mode</label>
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
                <p className="acct-caption">
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
                    <SelectTrigger className="acct-caption">
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
                    <SelectTrigger className="acct-caption">
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
                    className="acct-caption"
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
                  <span className="acct-caption font-normal normal-case">(minimum 2)</span>
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
                  <div key={idx} className="border rounded-[var(--radius-sm)] p-3 space-y-2">
                    <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center">
                      <div>
                        <label className="acct-field-label">
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
                          <SelectTrigger className="acct-caption">
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
                          <label className="acct-field-label">
                            Account
                          </label>
                          <Select
                            value={line.accountId ?? ""}
                            onValueChange={(v) =>
                              updateLine(idx, { accountId: v || null })
                            }
                          >
                            <SelectTrigger className="acct-caption">
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
                          <label className="acct-field-label">
                            Repeat mode
                          </label>
                          <Select
                            value={line.repeatMode}
                            onValueChange={(v: "NONE" | "TENDER") =>
                              updateLine(idx, { repeatMode: v })
                            }
                          >
                            <SelectTrigger className="acct-caption">
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
                        <label className="acct-field-label">
                          Direction
                        </label>
                        <Select
                          value={line.direction}
                          onValueChange={(v: "DEBIT" | "CREDIT") =>
                            updateLine(idx, { direction: v })
                          }
                        >
                          <SelectTrigger className="acct-caption">
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
                        <label className="acct-field-label">
                          Basis
                        </label>
                        <Select
                          value={line.basis}
                          onValueChange={(v: (typeof BASIS_OPTIONS)[number]) =>
                            updateLine(idx, { basis: v })
                          }
                        >
                          <SelectTrigger className="acct-caption">
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
                            <label className="acct-field-label">
                              Value path
                            </label>
                            <Input
                              className="acct-caption"
                              value={line.valuePath}
                              onChange={(e) =>
                                updateLine(idx, { valuePath: e.target.value })
                              }
                              placeholder="Optional payload path"
                            />
                          </div>
                          <div>
                            <label className="acct-field-label">
                              Memo template
                            </label>
                            <Input
                              className="acct-caption"
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
        <p className="acct-caption">
          These source types must have at least one active rule for retail journals to post
          automatically.
        </p>
      </div>

      <div className="overflow-hidden rounded-[10px] border border-[var(--border)] bg-[var(--surface)]">
        <table className="w-full text-sm">
          <thead className="border-b border-[var(--border)] bg-[var(--table-header-bg)]">
            <tr>
              <th className="acct-col-head px-[13px] py-1.5 text-left">
                Source type
              </th>
              <th className="acct-col-head px-[13px] py-1.5 text-left">Rules</th>
              <th className="acct-col-head px-[13px] py-1.5 text-left">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--table-divider)]">
            {RETAIL_REQUIRED_SOURCE_TYPES.map((st) => {
              const typeRules = rulesBySource[st] ?? [];
              const active = typeRules.filter((r) => r.isActive);
              const covered = active.length > 0;
              return (
                <tr key={st} className="hover:bg-[var(--canvas)]">
                  <td className="px-[13px] py-1.5">
                    <span className="acct-caption rounded-[4px] bg-[var(--surface-muted)] px-1.5 py-0.5 font-mono">
                      {formatAccountingSourceType(st)}
                    </span>
                  </td>
                  <td className="px-[13px] py-1.5 text-[var(--text-muted)]">
                    {typeRules.length === 0
                      ? "None"
                      : typeRules.map((r) => r.name).join(", ")}
                  </td>
                  <td className="px-[13px] py-1.5">
                    <div className="flex items-center gap-1.5">
                      <ReadinessIcon passed={covered} />
                      <span className="acct-caption">
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
          <div className="overflow-hidden rounded-[10px] border border-[var(--border)] bg-[var(--surface)]">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--border)] bg-[var(--table-header-bg)]">
                <tr>
                  <th className="acct-col-head px-[13px] py-1.5 text-left">
                    Tender type
                  </th>
                  <th className="acct-col-head px-[13px] py-1.5 text-left">
                    Currency
                  </th>
                  <th className="acct-col-head px-[13px] py-1.5 text-left">
                    Clearing account
                  </th>
                  <th className="acct-col-head px-[13px] py-1.5 text-left">
                    Scope
                  </th>
                  <th className="acct-col-head px-[13px] py-1.5 text-left">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--table-divider)]">
                {tenderMappings.map((m) => (
                  <tr key={m.id} className="hover:bg-[var(--canvas)]">
                    <td className="px-[13px] py-1.5 font-semibold text-[var(--text-strong)]">{m.tenderType}</td>
                    <td className="px-[13px] py-1.5 text-[var(--text-muted)]">
                      {m.currency ?? "All"}
                    </td>
                    <td className="px-[13px] py-1.5">
                      {m.clearingAccount
                        ? `${m.clearingAccount.code} - ${m.clearingAccount.name}`
                        : m.clearingAccountId}
                    </td>
                    <td className="acct-caption px-[13px] py-1.5">
                      {m.siteId ? "Site" : "Company"}
                    </td>
                    <td className="px-[13px] py-1.5">
                      <Badge
                        variant={m.isActive ? "default" : "outline"}
                        className="acct-caption"
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
        <p className="acct-caption">
          Preview the journal that would be generated for a given event without persisting
          anything.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="acct-field-label">Source type</label>
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
          <label className="acct-field-label">Description</label>
          <Input
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
        </div>
        <div>
          <label className="acct-field-label">Amount</label>
          <Input
            type="number"
            value={form.amount}
            onChange={(e) => setForm((f) => ({ ...f, amount: Number(e.target.value) }))}
          />
        </div>
        <div>
          <label className="acct-field-label">
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
          <label className="acct-field-label">
            Tax amount (optional)
          </label>
          <Input
            type="number"
            value={form.taxAmount}
            onChange={(e) => setForm((f) => ({ ...f, taxAmount: e.target.value }))}
          />
        </div>
        <div>
          <label className="acct-field-label">Currency</label>
          <Input
            value={form.currency}
            onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
          />
        </div>
        <div>
          <label className="acct-field-label">
            Site ID (optional)
          </label>
          <Input
            value={form.siteId}
            onChange={(e) => setForm((f) => ({ ...f, siteId: e.target.value }))}
          />
        </div>
        <div>
          <label className="acct-field-label">
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
          <h4 className="acct-col-head">
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
              <SelectTrigger className="acct-caption">
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
              className="acct-caption"
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
              className="acct-caption"
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
        <div className="p-3 border border-destructive/30 bg-destructive/5 rounded-[var(--radius-sm)] text-sm text-destructive">
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
              <Badge variant="outline" className="acct-caption">
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
                <p key={warning} className="acct-caption text-[var(--badge-warn-fg)]">
                  {warning}
                </p>
              ))}
            </div>
          )}

          <div className="overflow-hidden rounded-[10px] border border-[var(--border)] bg-[var(--surface)]">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--border)] bg-[var(--table-header-bg)]">
                <tr>
                  <th className="acct-col-head px-[13px] py-1.5 text-left">
                    Account
                  </th>
                  <th className="acct-col-head px-[13px] py-1.5 text-right">
                    Debit
                  </th>
                  <th className="acct-col-head px-[13px] py-1.5 text-right">
                    Credit
                  </th>
                  <th className="acct-col-head px-[13px] py-1.5 text-left">
                    Memo
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--table-divider)]">
                {result.lines.map((line, i) => (
                  <tr key={i} className="hover:bg-[var(--canvas)]">
                    <td className="px-[13px] py-1.5">
                      <span className="font-mono acct-caption">{line.accountCode}</span>{" "}
                      <span className="text-muted-foreground">{line.accountName}</span>
                    </td>
                    <td className="px-[13px] py-1.5 text-right font-mono tabular-nums">
                      {line.debit > 0 ? line.debit.toFixed(2) : ""}
                    </td>
                    <td className="px-[13px] py-1.5 text-right font-mono tabular-nums">
                      {line.credit > 0 ? line.credit.toFixed(2) : ""}
                    </td>
                    <td className="acct-caption px-[13px] py-1.5">{line.memo}</td>
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
          <p className="acct-caption mt-0.5">
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
        <div className="overflow-hidden rounded-[10px] border border-[var(--border)] bg-[var(--surface)]">
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--border)] bg-[var(--table-header-bg)]">
              <tr>
                <th className="acct-col-head px-[13px] py-1.5 text-left">
                  Status
                </th>
                <th className="acct-col-head px-[13px] py-1.5 text-left">
                  Source type
                </th>
                <th className="acct-col-head px-[13px] py-1.5 text-left">
                  Description
                </th>
                <th className="acct-col-head px-[13px] py-1.5 text-right">
                  Amount
                </th>
                <th className="acct-col-head px-[13px] py-1.5 text-left">
                  Attempts
                </th>
                <th className="acct-col-head px-[13px] py-1.5 text-left">
                  Last error
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--table-divider)]">
              {[...pending, ...events].map((ev) => (
                <tr key={ev.id} className="hover:bg-[var(--canvas)]">
                  <td className="px-[13px] py-1.5">
                    <Badge
                      variant={ev.status === "FAILED" ? "destructive" : "outline"}
                      className="acct-caption"
                    >
                      {ev.status}
                    </Badge>
                  </td>
                  <td className="px-[13px] py-1.5">
                    <span className="acct-caption rounded-[4px] bg-[var(--surface-muted)] px-1.5 py-0.5 font-mono">
                      {formatAccountingSourceType(ev.sourceType)}
                    </span>
                  </td>
                  <td className="max-w-48 truncate px-[13px] py-1.5 text-[var(--text-muted)]">
                    {ev.description}
                  </td>
                  <td className="px-[13px] py-1.5 text-right font-mono tabular-nums">
                    {Number(ev.amount).toFixed(2)}
                  </td>
                  <td className="px-[13px] py-1.5 text-[var(--text-muted)]">{ev.attemptCount}</td>
                  <td className="acct-caption max-w-64 truncate px-[13px] py-1.5 text-[var(--badge-bad-fg)]">
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
            <div className="overflow-hidden rounded-[10px] border border-[var(--border)] bg-[var(--surface)]">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-[var(--table-divider)]">
                  {readiness.checks.map((check) => (
                    <tr key={check.id} className="hover:bg-[var(--canvas)]">
                      <td className="w-8 px-[13px] py-1.5">
                        <ReadinessIcon passed={check.ready} />
                      </td>
                      <td className="px-[13px] py-1.5 font-semibold text-[var(--text-strong)]">{check.label}</td>
                      <td className="acct-caption px-[13px] py-1.5">
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
          <p className="acct-caption">
            Provisions chart of accounts, tax codes, currencies, posting rules, and tender
            mappings for Zimbabwe retail. Idempotent - safe to re-run.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="acct-field-label">
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
            <label className="acct-field-label">
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
          <div className="border rounded-[var(--radius-sm)] p-4 space-y-2 bg-[var(--surface-muted)]">
            <p className="acct-col-head">
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
              <p className="acct-caption text-[var(--badge-warn-fg)]">
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
          <p className="acct-caption">
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
              <div className="border rounded-[var(--radius-sm)] overflow-hidden max-h-64 overflow-y-auto">
                <table className="w-full acct-caption">
                  <thead className="bg-[var(--surface-muted)] border-b sticky top-0">
                    <tr>
                      <th className="acct-col-head px-[13px] py-1.5 text-left">
                        Candidate
                      </th>
                      <th className="acct-col-head px-[13px] py-1.5 text-left">
                        Entry date
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--table-divider)]">
                    {backfillResult.candidates.map((candidate, i) => (
                      <tr key={i} className="hover:bg-[var(--canvas)]">
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
                  <p key={failure.key} className="acct-caption text-[var(--badge-bad-fg)]">
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
  const failedEvents = failuresData ?? 0;

  return (
    <AccountingShell
      activeTab="posting-rules"
      title="Posting Rules"
      description="what each kind of business event posts to the ledger"
      bandSlot={
        <BandChip
          label="Failed"
          value={String(failedEvents)}
          tone={failedEvents > 0 ? "bad" : "mute"}
        />
      }
    >
      {/*
        The failed count used to ride on the "Failures & replay" pill as well.
        It is in the band alone now: the band never scrolls away, so the one
        number that says "something the ledger expected never arrived" stays in
        view while you read a rule, and printing it twice in two sticky rows
        only invites the reader to check whether the two agree.
      */}
      <VerticalDataViews
        items={VIEWS}
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
