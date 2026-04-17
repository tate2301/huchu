"use client";

import {
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useSearchParams } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { AccountingShell } from "@/components/accounting/accounting-shell";
import { AccountingListView as DataTable } from "@/components/accounting/listview/accounting-list-view";
import { FrappeStatCard } from "@/components/charts/frappe-stat-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Textarea } from "@/components/ui/textarea";
import { VerticalDataViews } from "@/components/ui/vertical-data-views";
import { useToast } from "@/components/ui/use-toast";
import { useReservedId } from "@/hooks/use-reserved-id";
import {
  type AccountingPeriodRecord,
  type TaxCategoryRecord,
  type TaxCodeRecord,
  type TaxRuleRecord,
  type TaxTemplateRecord,
  type VatReturnRecord,
  type VatSummaryRow,
  createVatReturnDraft,
  fetchAccountingPeriods,
  fetchTaxCategories,
  fetchTaxCodes,
  fetchTaxRules,
  fetchTaxTemplates,
  fetchVatReturns,
  fetchVatSummary,
  fileVatReturn,
  finalizeVatReturn,
  refreshVatReturn,
  reviewVatReturn,
} from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { EditSquare, Plus, Trash2 } from "@/lib/icons";

const TAX_VIEWS = [
  "codes",
  "categories",
  "templates",
  "rules",
  "vat-summary",
  "vat-returns",
] as const;

type TaxView = (typeof TAX_VIEWS)[number];
type AppliesTo = "SALES" | "PURCHASE" | "BOTH";
type CategoryScope = "CUSTOMER" | "VENDOR" | "BOTH";
type ScheduleType = "NONE" | "FX" | "RTGS" | "WITHHOLDING";
type EditorKind = "code" | "category" | "template" | "rule";
type EditorState =
  | { kind: EditorKind; mode: "create" | "edit"; recordId?: string }
  | null;

type TaxCodeFormState = {
  name: string;
  rate: string;
  type: string;
  appliesTo: AppliesTo;
  vat7OutputBox: string;
  vat7InputBox: string;
  scheduleType: ScheduleType;
  effectiveFrom: string;
  effectiveTo: string;
  isActive: boolean;
};

type TaxCategoryFormState = {
  name: string;
  scope: CategoryScope;
  isActive: boolean;
};

type TaxTemplateLineFormState = {
  key: string;
  taxCodeId: string;
  appliesTo: AppliesTo;
  isDefault: boolean;
};

type TaxTemplateFormState = {
  name: string;
  description: string;
  isActive: boolean;
  lines: TaxTemplateLineFormState[];
};

type TaxRuleFormState = {
  name: string;
  appliesTo: AppliesTo;
  priority: string;
  taxCategoryId: string;
  templateId: string;
  currency: string;
  effectiveFrom: string;
  effectiveTo: string;
  isActive: boolean;
};

function parseTaxView(value: string | null): TaxView {
  return TAX_VIEWS.includes(value as TaxView) ? (value as TaxView) : "codes";
}

function emptyTaxCodeForm(): TaxCodeFormState {
  return {
    name: "",
    rate: "",
    type: "VAT",
    appliesTo: "BOTH",
    vat7OutputBox: "",
    vat7InputBox: "",
    scheduleType: "NONE",
    effectiveFrom: "",
    effectiveTo: "",
    isActive: true,
  };
}

function emptyTaxCategoryForm(): TaxCategoryFormState {
  return {
    name: "",
    scope: "BOTH",
    isActive: true,
  };
}

function makeTemplateLineKey(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function createTemplateLine(
  partial?: Partial<TaxTemplateLineFormState>,
): TaxTemplateLineFormState {
  return {
    key: makeTemplateLineKey(),
    taxCodeId: "",
    appliesTo: "BOTH",
    isDefault: false,
    ...partial,
  };
}

function emptyTaxTemplateForm(): TaxTemplateFormState {
  return {
    name: "",
    description: "",
    isActive: true,
    lines: [createTemplateLine({ isDefault: true })],
  };
}

function emptyTaxRuleForm(): TaxRuleFormState {
  return {
    name: "",
    appliesTo: "BOTH",
    priority: "100",
    taxCategoryId: "",
    templateId: "",
    currency: "",
    effectiveFrom: "",
    effectiveTo: "",
    isActive: true,
  };
}

function toDateInputValue(value?: string | null): string {
  return value ? value.slice(0, 10) : "";
}

function toApiDateValue(value: string): string | null {
  return value ? `${value}T00:00:00.000Z` : null;
}

function buildRuleWindow(rule: TaxRuleRecord): string {
  if (!rule.effectiveFrom && !rule.effectiveTo) return "Always on";
  const start = rule.effectiveFrom ? format(new Date(rule.effectiveFrom), "yyyy-MM-dd") : "Open";
  const end = rule.effectiveTo ? format(new Date(rule.effectiveTo), "yyyy-MM-dd") : "Open";
  return `${start} to ${end}`;
}

function summarizeTemplateLines(template: TaxTemplateRecord): string {
  if (!template.lines?.length) return "No tax codes linked";
  return template.lines
    .map((line) => {
      const code = line.taxCode?.code ?? "Unknown";
      const appliesTo = line.appliesTo === "BOTH" ? "" : ` ${line.appliesTo.toLowerCase()}`;
      return line.isDefault ? `${code}${appliesTo} default` : `${code}${appliesTo}`.trim();
    })
    .join(" • ");
}

function countActiveRows(rows: Array<{ isActive: boolean }>): number {
  return rows.filter((row) => row.isActive).length;
}

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
      {children}
    </label>
  );
}

function FieldHint({ children }: { children: ReactNode }) {
  return <p className="mt-1 text-xs text-[var(--text-muted)]">{children}</p>;
}

export function TaxSetupWorkspace() {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const [activeView, setActiveView] = useState<TaxView>(
    parseTaxView(searchParams.get("view")),
  );
  const [editor, setEditor] = useState<EditorState>(null);
  const [taxCodeForm, setTaxCodeForm] = useState<TaxCodeFormState>(emptyTaxCodeForm);
  const [categoryForm, setCategoryForm] = useState<TaxCategoryFormState>(emptyTaxCategoryForm);
  const [templateForm, setTemplateForm] = useState<TaxTemplateFormState>(emptyTaxTemplateForm);
  const [ruleForm, setRuleForm] = useState<TaxRuleFormState>(emptyTaxRuleForm);
  const [summaryPeriodId, setSummaryPeriodId] = useState("");
  const [summaryStartDate, setSummaryStartDate] = useState("");
  const [summaryEndDate, setSummaryEndDate] = useState("");
  const [vatReturnPeriodId, setVatReturnPeriodId] = useState("");
  const [vatReturnAdjustmentsTax, setVatReturnAdjustmentsTax] = useState("");
  const [vatReturnFilingCategory, setVatReturnFilingCategory] =
    useState("GENERAL");

  const {
    reservedId,
    isReserving,
    error: reserveError,
  } = useReservedId({
    entity: "TAX_CODE",
    enabled: editor?.kind === "code" && editor.mode === "create",
  });

  const taxCodesQuery = useQuery({
    queryKey: ["accounting", "tax-codes"],
    queryFn: fetchTaxCodes,
  });
  const taxCategoriesQuery = useQuery({
    queryKey: ["accounting", "tax-categories"],
    queryFn: fetchTaxCategories,
  });
  const taxTemplatesQuery = useQuery({
    queryKey: ["accounting", "tax-templates"],
    queryFn: fetchTaxTemplates,
  });
  const taxRulesQuery = useQuery({
    queryKey: ["accounting", "tax-rules"],
    queryFn: fetchTaxRules,
  });
  const periodsQuery = useQuery({
    queryKey: ["accounting", "periods", "vat"],
    queryFn: () => fetchAccountingPeriods({ limit: 200 }),
  });
  const vatSummaryQuery = useQuery({
    queryKey: ["accounting", "vat-summary", summaryPeriodId, summaryStartDate, summaryEndDate],
    queryFn: () =>
      fetchVatSummary({
        periodId: summaryPeriodId || undefined,
        startDate: summaryStartDate || undefined,
        endDate: summaryEndDate || undefined,
      }),
    enabled: activeView === "vat-summary",
  });
  const vatReturnsQuery = useQuery({
    queryKey: ["accounting", "vat-returns"],
    queryFn: () => fetchVatReturns({ limit: 200 }),
    enabled: activeView === "vat-returns",
  });

  const taxCodes = taxCodesQuery.data ?? [];
  const taxCategories = taxCategoriesQuery.data ?? [];
  const taxTemplates = taxTemplatesQuery.data ?? [];
  const taxRules = taxRulesQuery.data ?? [];
  const periods = periodsQuery.data?.data ?? [];
  const vatRows = vatSummaryQuery.data?.rows ?? [];
  const vatTotals = vatSummaryQuery.data?.totals ?? {
    outputTax: 0,
    inputTax: 0,
    netTax: 0,
  };
  const vatReturns = vatReturnsQuery.data?.data ?? [];

  const dataError =
    taxCodesQuery.error ??
    taxCategoriesQuery.error ??
    taxTemplatesQuery.error ??
    taxRulesQuery.error ??
    periodsQuery.error ??
    vatSummaryQuery.error ??
    vatReturnsQuery.error;

  function closeEditor() {
    setEditor(null);
  }

  function openTaxCodeCreate() {
    setTaxCodeForm(emptyTaxCodeForm());
    setEditor({ kind: "code", mode: "create" });
  }

  function openTaxCodeEdit(record: TaxCodeRecord) {
    setTaxCodeForm({
      name: record.name,
      rate: String(record.rate),
      type: record.type ?? "VAT",
      appliesTo: (record.appliesTo as AppliesTo) ?? "BOTH",
      vat7OutputBox: record.vat7OutputBox ?? "",
      vat7InputBox: record.vat7InputBox ?? "",
      scheduleType: (record.scheduleType as ScheduleType) ?? "NONE",
      effectiveFrom: toDateInputValue(record.effectiveFrom),
      effectiveTo: toDateInputValue(record.effectiveTo),
      isActive: record.isActive,
    });
    setEditor({ kind: "code", mode: "edit", recordId: record.id });
  }

  function openCategoryCreate() {
    setCategoryForm(emptyTaxCategoryForm());
    setEditor({ kind: "category", mode: "create" });
  }

  function openCategoryEdit(record: TaxCategoryRecord) {
    setCategoryForm({
      name: record.name,
      scope: record.scope,
      isActive: record.isActive,
    });
    setEditor({ kind: "category", mode: "edit", recordId: record.id });
  }

  function openTemplateCreate() {
    if (!taxCodes.length) {
      toast({
        title: "Create a tax code first",
        description:
          "Templates need at least one tax code so the default mix has something to resolve.",
        variant: "destructive",
      });
      return;
    }
    setTemplateForm(emptyTaxTemplateForm());
    setEditor({ kind: "template", mode: "create" });
  }

  function openTemplateEdit(record: TaxTemplateRecord) {
    setTemplateForm({
      name: record.name,
      description: record.description ?? "",
      isActive: record.isActive,
      lines:
        record.lines?.length
          ? record.lines.map((line) =>
              createTemplateLine({
                taxCodeId: line.taxCodeId,
                appliesTo: line.appliesTo,
                isDefault: line.isDefault,
              }),
            )
          : [createTemplateLine({ isDefault: true })],
    });
    setEditor({ kind: "template", mode: "edit", recordId: record.id });
  }

  function openRuleCreate() {
    if (!taxTemplates.length) {
      toast({
        title: "Create a tax template first",
        description:
          "Rules need a template target before the engine can resolve tax behaviour.",
        variant: "destructive",
      });
      return;
    }
    setRuleForm({
      ...emptyTaxRuleForm(),
      templateId: taxTemplates[0]?.id ?? "",
    });
    setEditor({ kind: "rule", mode: "create" });
  }

  function openRuleEdit(record: TaxRuleRecord) {
    setRuleForm({
      name: record.name,
      appliesTo: record.appliesTo,
      priority: String(record.priority),
      taxCategoryId: record.taxCategoryId ?? "",
      templateId: record.templateId,
      currency: record.currency ?? "",
      effectiveFrom: toDateInputValue(record.effectiveFrom),
      effectiveTo: toDateInputValue(record.effectiveTo),
      isActive: record.isActive,
    });
    setEditor({ kind: "rule", mode: "edit", recordId: record.id });
  }

  function openCreateForActiveView() {
    if (activeView === "codes") {
      openTaxCodeCreate();
      return;
    }
    if (activeView === "categories") {
      openCategoryCreate();
      return;
    }
    if (activeView === "templates") {
      openTemplateCreate();
      return;
    }
    if (activeView === "rules") {
      openRuleCreate();
    }
  }

  const saveTaxCodeMutation = useMutation({
    mutationFn: async (input: {
      mode: "create" | "edit";
      id?: string;
      payload: Record<string, unknown>;
    }) =>
      fetchJson<TaxCodeRecord>(
        input.mode === "create"
          ? "/api/accounting/tax"
          : `/api/accounting/tax/${input.id}`,
        {
          method: input.mode === "create" ? "POST" : "PATCH",
          body: JSON.stringify(input.payload),
        },
      ),
    onSuccess: (_, variables) => {
      toast({
        title: variables.mode === "create" ? "Tax code created" : "Tax code updated",
        description:
          variables.mode === "create"
            ? "The tax code is now available to templates and VAT reporting."
            : "Tax code changes have been saved.",
        variant: "success",
      });
      closeEditor();
      queryClient.invalidateQueries({ queryKey: ["accounting", "tax-codes"] });
      queryClient.invalidateQueries({ queryKey: ["accounting", "tax-templates"] });
    },
    onError: (error) => {
      toast({
        title: "Unable to save tax code",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const saveCategoryMutation = useMutation({
    mutationFn: async (input: {
      mode: "create" | "edit";
      id?: string;
      payload: Record<string, unknown>;
    }) =>
      fetchJson<TaxCategoryRecord>(
        input.mode === "create"
          ? "/api/accounting/tax/categories"
          : `/api/accounting/tax/categories/${input.id}`,
        {
          method: input.mode === "create" ? "POST" : "PATCH",
          body: JSON.stringify(input.payload),
        },
      ),
    onSuccess: (_, variables) => {
      toast({
        title:
          variables.mode === "create" ? "Tax category created" : "Tax category updated",
        description:
          variables.mode === "create"
            ? "Counterparty tax grouping is ready for rules."
            : "Category changes have been saved.",
        variant: "success",
      });
      closeEditor();
      queryClient.invalidateQueries({ queryKey: ["accounting", "tax-categories"] });
      queryClient.invalidateQueries({ queryKey: ["accounting", "tax-rules"] });
    },
    onError: (error) => {
      toast({
        title: "Unable to save tax category",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const saveTemplateMutation = useMutation({
    mutationFn: async (input: {
      mode: "create" | "edit";
      id?: string;
      payload: Record<string, unknown>;
    }) =>
      fetchJson<TaxTemplateRecord>(
        input.mode === "create"
          ? "/api/accounting/tax/templates"
          : `/api/accounting/tax/templates/${input.id}`,
        {
          method: input.mode === "create" ? "POST" : "PATCH",
          body: JSON.stringify(input.payload),
        },
      ),
    onSuccess: (_, variables) => {
      toast({
        title:
          variables.mode === "create" ? "Tax template created" : "Tax template updated",
        description:
          variables.mode === "create"
            ? "The tax mix is ready to be targeted by rules."
            : "Template changes have been saved.",
        variant: "success",
      });
      closeEditor();
      queryClient.invalidateQueries({ queryKey: ["accounting", "tax-templates"] });
      queryClient.invalidateQueries({ queryKey: ["accounting", "tax-rules"] });
    },
    onError: (error) => {
      toast({
        title: "Unable to save tax template",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const saveRuleMutation = useMutation({
    mutationFn: async (input: {
      mode: "create" | "edit";
      id?: string;
      payload: Record<string, unknown>;
    }) =>
      fetchJson<TaxRuleRecord>(
        input.mode === "create"
          ? "/api/accounting/tax/rules"
          : `/api/accounting/tax/rules/${input.id}`,
        {
          method: input.mode === "create" ? "POST" : "PATCH",
          body: JSON.stringify(input.payload),
        },
      ),
    onSuccess: (_, variables) => {
      toast({
        title: variables.mode === "create" ? "Tax rule created" : "Tax rule updated",
        description:
          variables.mode === "create"
            ? "Rule priority is now part of tax resolution."
            : "Rule changes have been saved.",
        variant: "success",
      });
      closeEditor();
      queryClient.invalidateQueries({ queryKey: ["accounting", "tax-rules"] });
    },
    onError: (error) => {
      toast({
        title: "Unable to save tax rule",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const vatReturnActionMutation = useMutation({
    mutationFn: async (input: {
      action: "review" | "refresh" | "finalize" | "file";
      vatReturnId: string;
    }) => {
      if (input.action === "review") return reviewVatReturn(input.vatReturnId);
      if (input.action === "refresh") return refreshVatReturn(input.vatReturnId);
      if (input.action === "finalize") return finalizeVatReturn(input.vatReturnId);
      return fileVatReturn(input.vatReturnId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounting", "vat-returns"] });
      queryClient.invalidateQueries({ queryKey: ["accounting", "vat-summary"] });
      toast({
        title: "VAT return updated",
        description: "The VAT return workflow was updated successfully.",
        variant: "success",
      });
    },
    onError: (error) => {
      toast({
        title: "Unable to update VAT return",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const createVatReturnMutation = useMutation({
    mutationFn: async () => {
      if (!vatReturnPeriodId) {
        throw new Error("Select an open period to generate a VAT return draft.");
      }
      const period = periods.find((item) => item.id === vatReturnPeriodId);
      if (!period || period.status !== "OPEN") {
        throw new Error("VAT return drafts can only be created for OPEN periods.");
      }
      return createVatReturnDraft({
        periodId: vatReturnPeriodId,
        adjustmentsTax: vatReturnAdjustmentsTax
          ? Number(vatReturnAdjustmentsTax)
          : undefined,
        filingCategory: vatReturnFilingCategory,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounting", "vat-returns"] });
      toast({
        title: "VAT return draft created",
        description: "The selected period now has a draft VAT return.",
        variant: "success",
      });
    },
    onError: (error) => {
      toast({
        title: "Unable to create VAT return draft",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  function handleTaxCodeSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor || editor.kind !== "code") return;

    if (!taxCodeForm.name.trim() || !taxCodeForm.rate.trim()) {
      toast({
        title: "Missing tax code details",
        description: "Name and rate are required before saving.",
        variant: "destructive",
      });
      return;
    }

    if (editor.mode === "create" && !reservedId.trim()) {
      toast({
        title: "Unable to reserve tax code",
        description: reserveError ?? "Please wait for the auto-generated code.",
        variant: "destructive",
      });
      return;
    }

    saveTaxCodeMutation.mutate({
      mode: editor.mode,
      id: editor.recordId,
      payload: {
        ...(editor.mode === "create" ? { code: reservedId.trim() } : {}),
        name: taxCodeForm.name.trim(),
        rate: Number(taxCodeForm.rate),
        type: taxCodeForm.type.trim() || "VAT",
        appliesTo: taxCodeForm.appliesTo,
        vat7OutputBox: taxCodeForm.vat7OutputBox.trim() || null,
        vat7InputBox: taxCodeForm.vat7InputBox.trim() || null,
        scheduleType: taxCodeForm.scheduleType,
        effectiveFrom: toApiDateValue(taxCodeForm.effectiveFrom),
        effectiveTo: toApiDateValue(taxCodeForm.effectiveTo),
        isActive: taxCodeForm.isActive,
      },
    });
  }

  function handleCategorySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor || editor.kind !== "category") return;
    if (!categoryForm.name.trim()) {
      toast({
        title: "Missing category details",
        description: "Category name is required before saving.",
        variant: "destructive",
      });
      return;
    }
    saveCategoryMutation.mutate({
      mode: editor.mode,
      id: editor.recordId,
      payload: {
        name: categoryForm.name.trim(),
        scope: categoryForm.scope,
        isActive: categoryForm.isActive,
      },
    });
  }

  function handleTemplateSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor || editor.kind !== "template") return;

    const validLines = templateForm.lines.filter((line) => line.taxCodeId);
    if (!templateForm.name.trim()) {
      toast({
        title: "Missing template details",
        description: "Template name is required before saving.",
        variant: "destructive",
      });
      return;
    }
    if (!validLines.length) {
      toast({
        title: "Add a tax code",
        description: "Templates need at least one tax code line.",
        variant: "destructive",
      });
      return;
    }

    const defaultIndex = validLines.findIndex((line) => line.isDefault);
    saveTemplateMutation.mutate({
      mode: editor.mode,
      id: editor.recordId,
      payload: {
        name: templateForm.name.trim(),
        description: templateForm.description.trim() || null,
        isActive: templateForm.isActive,
        lines: validLines.map((line, index) => ({
          taxCodeId: line.taxCodeId,
          sortOrder: index,
          appliesTo: line.appliesTo,
          isDefault: defaultIndex >= 0 ? index === defaultIndex : index === 0,
        })),
      },
    });
  }

  function handleRuleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor || editor.kind !== "rule") return;

    if (!ruleForm.name.trim() || !ruleForm.templateId) {
      toast({
        title: "Missing rule details",
        description: "Rule name and template are required before saving.",
        variant: "destructive",
      });
      return;
    }

    saveRuleMutation.mutate({
      mode: editor.mode,
      id: editor.recordId,
      payload: {
        name: ruleForm.name.trim(),
        appliesTo: ruleForm.appliesTo,
        priority: Number(ruleForm.priority || "100"),
        taxCategoryId: ruleForm.taxCategoryId || null,
        templateId: ruleForm.templateId,
        currency: ruleForm.currency.trim() || null,
        effectiveFrom: toApiDateValue(ruleForm.effectiveFrom),
        effectiveTo: toApiDateValue(ruleForm.effectiveTo),
        isActive: ruleForm.isActive,
      },
    });
  }

  function addTemplateLine() {
    setTemplateForm((current) => ({
      ...current,
      lines: [...current.lines, createTemplateLine()],
    }));
  }

  function removeTemplateLine(key: string) {
    setTemplateForm((current) => {
      const remaining = current.lines.filter((line) => line.key !== key);
      return {
        ...current,
        lines: remaining.length ? remaining : [createTemplateLine({ isDefault: true })],
      };
    });
  }

  function updateTemplateLine(
    key: string,
    patch: Partial<TaxTemplateLineFormState>,
  ) {
    setTemplateForm((current) => ({
      ...current,
      lines: current.lines.map((line) => {
        if (line.key !== key) {
          return patch.isDefault ? { ...line, isDefault: false } : line;
        }
        return { ...line, ...patch };
      }),
    }));
  }

  function handlePeriodChange(value: string) {
    setSummaryPeriodId(value);
    if (value) {
      setSummaryStartDate("");
      setSummaryEndDate("");
    }
  }

  function handleStartDateChange(value: string) {
    setSummaryStartDate(value);
    if (value) setSummaryPeriodId("");
  }

  function handleEndDateChange(value: string) {
    setSummaryEndDate(value);
    if (value) setSummaryPeriodId("");
  }

  const viewItems = useMemo(
    () => [
      { id: "codes", label: "Tax Codes", count: taxCodes.length },
      { id: "categories", label: "Categories", count: taxCategories.length },
      { id: "templates", label: "Templates", count: taxTemplates.length },
      { id: "rules", label: "Rules", count: taxRules.length },
      { id: "vat-summary", label: "VAT Summary", count: vatRows.length },
      { id: "vat-returns", label: "VAT Returns", count: vatReturns.length },
    ],
    [taxCodes.length, taxCategories.length, taxTemplates.length, taxRules.length, vatRows.length, vatReturns.length],
  );

  const viewCopy = useMemo<Record<TaxView, { title: string; description: string }>>(
    () => ({
      codes: {
        title: "Rate library",
        description:
          "Tax codes hold statutory percentages, VAT box mapping, and the low-level rates your templates reuse.",
      },
      categories: {
        title: "Counterparty grouping",
        description:
          "Categories label customer and vendor tax treatment so downstream rules can resolve the right template without guesswork.",
      },
      templates: {
        title: "Reusable tax mixes",
        description:
          "Templates package one or more tax codes into a repeatable combination for sales, purchases, and special handling.",
      },
      rules: {
        title: "Resolution logic",
        description:
          "Rules choose the winning template by priority, party category, and optional currency or effective date boundaries.",
      },
      "vat-summary": {
        title: "VAT position",
        description:
          "Review current output, input, and net VAT before drafting or refreshing returns.",
      },
      "vat-returns": {
        title: "Return workflow",
        description:
          "Move draft VAT returns through review, finalisation, and filing without leaving the accounting module.",
      },
    }),
    [],
  );

  const codeColumns: ColumnDef<TaxCodeRecord>[] = [
    {
      id: "code",
      header: "Code",
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.code}</span>,
      size: 120,
      minSize: 120,
      maxSize: 120,
    },
    {
      id: "name",
      header: "Tax Name",
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="truncate font-medium text-[var(--text-strong)]">{row.original.name}</div>
          <div className="truncate text-xs text-[var(--text-muted)]">{row.original.type}</div>
        </div>
      ),
    },
    {
      id: "rate",
      header: "Rate",
      cell: ({ row }) => <span className="font-mono">{row.original.rate}%</span>,
      size: 96,
      minSize: 96,
      maxSize: 96,
    },
    {
      id: "appliesTo",
      header: "Applies To",
      cell: ({ row }) => (
        <Badge variant="outline" className="rounded-full font-mono text-[10px]">
          {row.original.appliesTo ?? "BOTH"}
        </Badge>
      ),
      size: 140,
      minSize: 140,
      maxSize: 140,
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => (
        <Badge variant={row.original.isActive ? "secondary" : "outline"}>
          {row.original.isActive ? "Active" : "Inactive"}
        </Badge>
      ),
      size: 120,
      minSize: 120,
      maxSize: 120,
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex justify-end">
          <Button size="sm" variant="outline" className="h-8" onClick={() => openTaxCodeEdit(row.original)}>
            <EditSquare className="mr-2 size-4" />
            Edit
          </Button>
        </div>
      ),
      size: 120,
      minSize: 120,
      maxSize: 120,
    },
  ];

  const categoryColumns: ColumnDef<TaxCategoryRecord>[] = [
    {
      id: "code",
      header: "Code",
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.code}</span>,
      size: 120,
      minSize: 120,
      maxSize: 120,
    },
    { id: "name", header: "Category", accessorKey: "name" },
    {
      id: "scope",
      header: "Scope",
      cell: ({ row }) => (
        <Badge variant="outline" className="rounded-full font-mono text-[10px]">
          {row.original.scope}
        </Badge>
      ),
      size: 140,
      minSize: 140,
      maxSize: 140,
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => (
        <Badge variant={row.original.isActive ? "secondary" : "outline"}>
          {row.original.isActive ? "Active" : "Inactive"}
        </Badge>
      ),
      size: 120,
      minSize: 120,
      maxSize: 120,
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex justify-end">
          <Button size="sm" variant="outline" className="h-8" onClick={() => openCategoryEdit(row.original)}>
            <EditSquare className="mr-2 size-4" />
            Edit
          </Button>
        </div>
      ),
      size: 120,
      minSize: 120,
      maxSize: 120,
    },
  ];

  const templateColumns: ColumnDef<TaxTemplateRecord>[] = [
    {
      id: "code",
      header: "Code",
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.code}</span>,
      size: 120,
      minSize: 120,
      maxSize: 120,
    },
    {
      id: "name",
      header: "Template",
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="truncate font-medium text-[var(--text-strong)]">{row.original.name}</div>
          <div className="line-clamp-2 text-xs text-[var(--text-muted)]">
            {row.original.description?.trim() || "No description added"}
          </div>
        </div>
      ),
    },
    {
      id: "lineCount",
      header: "Lines",
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.lines?.length ?? 0}</span>,
      size: 92,
      minSize: 92,
      maxSize: 92,
    },
    {
      id: "mix",
      header: "Tax Mix",
      cell: ({ row }) => (
        <div className="min-w-0 text-xs text-[var(--text-muted)]">
          <div className="line-clamp-2">{summarizeTemplateLines(row.original)}</div>
        </div>
      ),
      size: 320,
      minSize: 260,
      maxSize: 420,
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => (
        <Badge variant={row.original.isActive ? "secondary" : "outline"}>
          {row.original.isActive ? "Active" : "Inactive"}
        </Badge>
      ),
      size: 120,
      minSize: 120,
      maxSize: 120,
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex justify-end">
          <Button size="sm" variant="outline" className="h-8" onClick={() => openTemplateEdit(row.original)}>
            <EditSquare className="mr-2 size-4" />
            Edit
          </Button>
        </div>
      ),
      size: 120,
      minSize: 120,
      maxSize: 120,
    },
  ];

  const ruleColumns: ColumnDef<TaxRuleRecord>[] = [
    {
      id: "name",
      header: "Rule",
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="truncate font-medium text-[var(--text-strong)]">{row.original.name}</div>
          <div className="truncate text-xs text-[var(--text-muted)]">
            Template: {row.original.template?.name ?? "Unknown"}
          </div>
        </div>
      ),
    },
    {
      id: "appliesTo",
      header: "Applies To",
      cell: ({ row }) => (
        <Badge variant="outline" className="rounded-full font-mono text-[10px]">
          {row.original.appliesTo}
        </Badge>
      ),
      size: 140,
      minSize: 140,
      maxSize: 140,
    },
    {
      id: "priority",
      header: "Priority",
      cell: ({ row }) => <span className="font-mono">{row.original.priority}</span>,
      size: 100,
      minSize: 100,
      maxSize: 100,
    },
    {
      id: "category",
      header: "Category",
      cell: ({ row }) => (
        <div className="min-w-0 text-xs text-[var(--text-muted)]">
          <div className="truncate">{row.original.taxCategory?.name ?? "All counterparties"}</div>
          <div className="truncate font-mono">{row.original.taxCategory?.code ?? "GLOBAL"}</div>
        </div>
      ),
      size: 200,
      minSize: 180,
      maxSize: 260,
    },
    {
      id: "window",
      header: "Effective Window",
      cell: ({ row }) => (
        <div className="min-w-0 text-xs text-[var(--text-muted)]">
          <div className="truncate font-mono">{buildRuleWindow(row.original)}</div>
          <div className="truncate">Currency: {row.original.currency ?? "Any"}</div>
        </div>
      ),
      size: 220,
      minSize: 200,
      maxSize: 280,
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => (
        <Badge variant={row.original.isActive ? "secondary" : "outline"}>
          {row.original.isActive ? "Active" : "Inactive"}
        </Badge>
      ),
      size: 120,
      minSize: 120,
      maxSize: 120,
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex justify-end">
          <Button size="sm" variant="outline" className="h-8" onClick={() => openRuleEdit(row.original)}>
            <EditSquare className="mr-2 size-4" />
            Edit
          </Button>
        </div>
      ),
      size: 120,
      minSize: 120,
      maxSize: 120,
    },
  ];

  const vatSummaryColumns: ColumnDef<VatSummaryRow>[] = [
    {
      id: "code",
      header: "Code",
      cell: ({ row }) => <span className="font-mono">{row.original.code}</span>,
      size: 140,
      minSize: 140,
      maxSize: 140,
    },
    { id: "name", header: "Tax Name", accessorKey: "name" },
    {
      id: "rate",
      header: "Rate",
      cell: ({ row }) => <span className="font-mono">{row.original.rate}%</span>,
      size: 88,
      minSize: 88,
      maxSize: 88,
    },
    {
      id: "output",
      header: "Output VAT",
      cell: ({ row }) => <NumericCell>{row.original.outputTax.toFixed(2)}</NumericCell>,
      size: 120,
      minSize: 120,
      maxSize: 120,
    },
    {
      id: "input",
      header: "Input VAT",
      cell: ({ row }) => <NumericCell>{row.original.inputTax.toFixed(2)}</NumericCell>,
      size: 120,
      minSize: 120,
      maxSize: 120,
    },
    {
      id: "net",
      header: "Net VAT",
      cell: ({ row }) => <NumericCell>{row.original.netTax.toFixed(2)}</NumericCell>,
      size: 120,
      minSize: 120,
      maxSize: 120,
    },
  ];

  const activeCreateLabel =
    activeView === "codes"
      ? "New Tax Code"
      : activeView === "categories"
        ? "New Category"
        : activeView === "templates"
          ? "New Template"
          : activeView === "rules"
            ? "New Rule"
            : null;

  const createDisabled =
    (activeView === "templates" && taxCodes.length === 0) ||
    (activeView === "rules" && taxTemplates.length === 0);

  const editorTitle = !editor
    ? ""
    : editor.kind === "code"
      ? editor.mode === "create"
        ? "New Tax Code"
        : "Edit Tax Code"
      : editor.kind === "category"
        ? editor.mode === "create"
          ? "New Tax Category"
          : "Edit Tax Category"
        : editor.kind === "template"
          ? editor.mode === "create"
            ? "New Tax Template"
            : "Edit Tax Template"
          : editor.mode === "create"
            ? "New Tax Rule"
            : "Edit Tax Rule";

  const editorDescription = !editor
    ? ""
    : editor.kind === "code"
      ? "Define the statutory rate and reporting boxes that your templates reuse."
      : editor.kind === "category"
        ? "Group counterparties so rules can resolve the right template consistently."
        : editor.kind === "template"
          ? "Bundle tax codes into a reusable mix for sales and purchase documents."
          : "Control how the system resolves templates when more than one option exists.";

  const vatReturnColumns: ColumnDef<VatReturnRecord>[] = [
    {
      id: "period",
      header: "Period",
      cell: ({ row }) => (
        <span className="font-mono text-xs">
          {format(new Date(row.original.periodStart), "yyyy-MM-dd")} to{" "}
          {format(new Date(row.original.periodEnd), "yyyy-MM-dd")}
        </span>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => (
        <Badge
          variant={row.original.status === "FILED" ? "secondary" : "outline"}
          className="font-mono"
        >
          {row.original.status}
        </Badge>
      ),
      size: 120,
      minSize: 120,
      maxSize: 120,
    },
    {
      id: "dueDates",
      header: "Due Dates",
      cell: ({ row }) => (
        <div className="text-xs">
          <div className="font-mono">
            Return:{" "}
            {row.original.returnDueDate
              ? format(new Date(row.original.returnDueDate), "yyyy-MM-dd")
              : "-"}
          </div>
          <div className="font-mono">
            Payment:{" "}
            {row.original.paymentDueDate
              ? format(new Date(row.original.paymentDueDate), "yyyy-MM-dd")
              : "-"}
          </div>
        </div>
      ),
      size: 180,
      minSize: 180,
      maxSize: 220,
    },
    {
      id: "outputTax",
      header: "Output Tax",
      cell: ({ row }) => <NumericCell>{row.original.outputTax.toFixed(2)}</NumericCell>,
      size: 120,
      minSize: 120,
      maxSize: 120,
    },
    {
      id: "inputTax",
      header: "Input Tax",
      cell: ({ row }) => <NumericCell>{row.original.inputTax.toFixed(2)}</NumericCell>,
      size: 120,
      minSize: 120,
      maxSize: 120,
    },
    {
      id: "payableRefundable",
      header: "Payable / Refundable",
      cell: ({ row }) => {
        const boxes = row.original.vat7Boxes ?? {};
        const payable = Number(boxes.vatPayable ?? 0);
        const refundable = Number(boxes.vatRefundable ?? 0);
        return (
          <div className="text-right font-mono text-xs">
            <div>Payable: {payable.toFixed(2)}</div>
            <div>Refund: {refundable.toFixed(2)}</div>
          </div>
        );
      },
      size: 150,
      minSize: 150,
      maxSize: 180,
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const vatReturn = row.original;
        return (
          <div className="flex items-center justify-end gap-2">
            {vatReturn.status === "DRAFT" ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  vatReturnActionMutation.mutate({
                    action: "review",
                    vatReturnId: vatReturn.id,
                  })
                }
              >
                Review
              </Button>
            ) : null}
            {vatReturn.status === "REVIEWED" ? (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    vatReturnActionMutation.mutate({
                      action: "refresh",
                      vatReturnId: vatReturn.id,
                    })
                  }
                >
                  Refresh
                </Button>
                <Button
                  size="sm"
                  onClick={() =>
                    vatReturnActionMutation.mutate({
                      action: "finalize",
                      vatReturnId: vatReturn.id,
                    })
                  }
                >
                  Finalize
                </Button>
              </>
            ) : null}
            {vatReturn.status === "FINALIZED" ? (
              <Button
                size="sm"
                onClick={() =>
                  vatReturnActionMutation.mutate({
                    action: "file",
                    vatReturnId: vatReturn.id,
                  })
                }
              >
                Mark Filed
              </Button>
            ) : null}
          </div>
        );
      },
      size: 240,
      minSize: 220,
      maxSize: 260,
    },
  ];

  return (
    <AccountingShell
      activeTab="tax"
      title="Tax Setup"
      actions={
        activeCreateLabel ? (
          <Button size="sm" onClick={openCreateForActiveView} disabled={createDisabled}>
            <Plus className="mr-2 size-4" />
            {activeCreateLabel}
          </Button>
        ) : undefined
      }
    >
      {dataError ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load tax setup</AlertTitle>
          <AlertDescription>{getApiErrorMessage(dataError)}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <FrappeStatCard
          label="Active tax codes"
          value={countActiveRows(taxCodes)}
          valueLabel={String(countActiveRows(taxCodes))}
        />
        <FrappeStatCard
          label="Active categories"
          value={countActiveRows(taxCategories)}
          valueLabel={String(countActiveRows(taxCategories))}
        />
        <FrappeStatCard
          label="Active templates"
          value={countActiveRows(taxTemplates)}
          valueLabel={String(countActiveRows(taxTemplates))}
        />
        <FrappeStatCard
          label="Active rules"
          value={countActiveRows(taxRules)}
          valueLabel={String(countActiveRows(taxRules))}
        />
      </div>

      <section className="rounded-[24px] border border-[var(--edge-subtle)] bg-[var(--surface-subtle)] px-5 py-4 shadow-[var(--surface-frame-shadow)]">
        <div className="flex flex-wrap items-start gap-3">
          <Badge variant="secondary" className="rounded-full px-3 py-1">
            Seeded logic stays editable
          </Badge>
          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-sm font-medium text-[var(--text-strong)]">
              Build tax behaviour in four layers, then review VAT from the same module.
            </p>
            <p className="max-w-3xl text-sm text-[var(--text-muted)]">
              Codes define rates, categories describe counterparties, templates bundle the mixes,
              and rules decide which template wins. That keeps seeded defaults visible while still
              giving finance teams room for custom treatment.
            </p>
          </div>
        </div>
      </section>

      <VerticalDataViews
        items={viewItems}
        value={activeView}
        onValueChange={(value) => setActiveView(value as TaxView)}
        railLabel="Tax Views"
      >
        <section className="space-y-3">
          <div className="rounded-[24px] border border-[var(--edge-subtle)] bg-[var(--surface-base)] px-5 py-4 shadow-[var(--surface-frame-shadow)]">
            <p className="text-sm font-semibold text-[var(--text-strong)]">
              {viewCopy[activeView].title}
            </p>
            <p className="mt-1 max-w-3xl text-sm text-[var(--text-muted)]">
              {viewCopy[activeView].description}
            </p>
          </div>
          <div className={activeView === "codes" ? "space-y-3" : "hidden"}>
            <DataTable
              data={taxCodes}
              columns={codeColumns}
              groupBy="type"
              searchPlaceholder="Search tax codes"
              searchSubmitLabel="Search"
              pagination={{ enabled: true }}
              emptyState={taxCodesQuery.isLoading ? "Loading tax codes..." : "No tax codes found."}
            />
          </div>

          <div className={activeView === "categories" ? "space-y-3" : "hidden"}>
            <DataTable
              data={taxCategories}
              columns={categoryColumns}
              groupBy="scope"
              searchPlaceholder="Search tax categories"
              searchSubmitLabel="Search"
              pagination={{ enabled: true }}
              emptyState={
                taxCategoriesQuery.isLoading
                  ? "Loading tax categories..."
                  : "No tax categories found."
              }
            />
          </div>

          <div className={activeView === "templates" ? "space-y-3" : "hidden"}>
            <DataTable
              data={taxTemplates}
              columns={templateColumns}
              groupBy={(row) =>
                row.lines && row.lines.length > 1 ? "Composite templates" : "Single-code templates"
              }
              searchPlaceholder="Search tax templates"
              searchSubmitLabel="Search"
              pagination={{ enabled: true }}
              emptyState={
                taxTemplatesQuery.isLoading
                  ? "Loading tax templates..."
                  : "No tax templates found."
              }
            />
          </div>

          <div className={activeView === "rules" ? "space-y-3" : "hidden"}>
            <DataTable
              data={taxRules}
              columns={ruleColumns}
              groupBy="appliesTo"
              searchPlaceholder="Search tax rules"
              searchSubmitLabel="Search"
              pagination={{ enabled: true }}
              emptyState={taxRulesQuery.isLoading ? "Loading tax rules..." : "No tax rules found."}
            />
          </div>

          <div className={activeView === "vat-summary" ? "space-y-3" : "hidden"}>
            <div className="grid gap-4 md:grid-cols-3">
              <FrappeStatCard
                label="Output VAT"
                value={vatTotals.outputTax}
                valueLabel={vatTotals.outputTax.toFixed(2)}
              />
              <FrappeStatCard
                label="Input VAT"
                value={vatTotals.inputTax}
                valueLabel={vatTotals.inputTax.toFixed(2)}
              />
              <FrappeStatCard
                label="Net VAT"
                value={vatTotals.netTax}
                valueLabel={vatTotals.netTax.toFixed(2)}
                tone={vatTotals.netTax > 0 ? "warning" : "success"}
                negativeIsBetter
              />
            </div>
            <DataTable
              data={vatRows}
              columns={vatSummaryColumns}
              groupBy={(row) => `${row.rate}%`}
              searchPlaceholder="Search VAT summary"
              searchSubmitLabel="Search"
              pagination={{ enabled: true }}
              toolbar={
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={summaryPeriodId} onValueChange={handlePeriodChange}>
                    <SelectTrigger size="sm" className="h-8 w-[220px]">
                      <SelectValue placeholder="Filter by period" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">All Periods</SelectItem>
                      {periods.map((period: AccountingPeriodRecord) => (
                        <SelectItem key={period.id} value={period.id}>
                          {format(new Date(period.startDate), "yyyy-MM-dd")} to{" "}
                          {format(new Date(period.endDate), "yyyy-MM-dd")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="date"
                    value={summaryStartDate}
                    onChange={(event) => handleStartDateChange(event.target.value)}
                    className="h-8"
                  />
                  <Input
                    type="date"
                    value={summaryEndDate}
                    onChange={(event) => handleEndDateChange(event.target.value)}
                    className="h-8"
                  />
                </div>
              }
              emptyState={vatSummaryQuery.isLoading ? "Loading VAT summary..." : "No VAT summary data."}
            />
          </div>

          <div className={activeView === "vat-returns" ? "space-y-3" : "hidden"}>
            <DataTable
              data={vatReturns}
              columns={vatReturnColumns}
              groupBy="status"
              searchPlaceholder="Search VAT returns"
              searchSubmitLabel="Search"
              pagination={{ enabled: true }}
              toolbar={
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={vatReturnPeriodId} onValueChange={setVatReturnPeriodId}>
                    <SelectTrigger size="sm" className="h-8 w-[220px]">
                      <SelectValue placeholder="Select period" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Select period</SelectItem>
                      {periods.map((period: AccountingPeriodRecord) => (
                        <SelectItem key={period.id} value={period.id}>
                          {format(new Date(period.startDate), "yyyy-MM-dd")} to{" "}
                          {format(new Date(period.endDate), "yyyy-MM-dd")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    min="-999999999"
                    step="0.01"
                    value={vatReturnAdjustmentsTax}
                    onChange={(event) => setVatReturnAdjustmentsTax(event.target.value)}
                    placeholder="Adjustments tax"
                    className="h-8 w-[180px] text-right font-mono"
                  />
                  <Select value={vatReturnFilingCategory} onValueChange={setVatReturnFilingCategory}>
                    <SelectTrigger size="sm" className="h-8 w-[180px]">
                      <SelectValue placeholder="Filing category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="GENERAL">General</SelectItem>
                      <SelectItem value="CATEGORY_A">Category A</SelectItem>
                      <SelectItem value="CATEGORY_C">Category C</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    onClick={() => createVatReturnMutation.mutate()}
                    disabled={createVatReturnMutation.isPending || !vatReturnPeriodId}
                  >
                    Create Draft
                  </Button>
                </div>
              }
              emptyState={vatReturnsQuery.isLoading ? "Loading VAT returns..." : "No VAT returns found."}
            />
          </div>
        </section>
      </VerticalDataViews>

      <Sheet open={editor !== null} onOpenChange={(open) => (!open ? closeEditor() : null)}>
        <SheetContent size="lg" className="w-full p-6 sm:p-8">
          {editor ? (
            <>
              <SheetHeader className="pr-10">
                <SheetTitle>{editorTitle}</SheetTitle>
                <SheetDescription>{editorDescription}</SheetDescription>
              </SheetHeader>

              {editor.kind === "code" ? (
                <form onSubmit={handleTaxCodeSubmit} className="mt-6 space-y-4">
                  <div>
                    <FieldLabel>Code</FieldLabel>
                    <Input
                      value={
                        editor.mode === "create"
                          ? reservedId
                          : taxCodes.find((row) => row.id === editor.recordId)?.code ?? ""
                      }
                      readOnly
                      placeholder={isReserving ? "Reserving..." : "Auto-generated"}
                    />
                    <FieldHint>
                      {editor.mode === "create"
                        ? reserveError ?? "Code is reserved automatically when the sheet opens."
                        : "Tax codes remain fixed after creation so template references stay stable."}
                    </FieldHint>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <FieldLabel>Name</FieldLabel>
                      <Input value={taxCodeForm.name} onChange={(event) => setTaxCodeForm((current) => ({ ...current, name: event.target.value }))} required />
                    </div>
                    <div>
                      <FieldLabel>Rate (%)</FieldLabel>
                      <Input type="number" min="0" step="0.01" value={taxCodeForm.rate} onChange={(event) => setTaxCodeForm((current) => ({ ...current, rate: event.target.value }))} className="text-right font-mono" required />
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-3">
                    <div>
                      <FieldLabel>Type</FieldLabel>
                      <Input value={taxCodeForm.type} onChange={(event) => setTaxCodeForm((current) => ({ ...current, type: event.target.value }))} />
                    </div>
                    <div>
                      <FieldLabel>Applies To</FieldLabel>
                      <Select value={taxCodeForm.appliesTo} onValueChange={(value) => setTaxCodeForm((current) => ({ ...current, appliesTo: value as AppliesTo }))}>
                        <SelectTrigger><SelectValue placeholder="Applies to" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="BOTH">Both</SelectItem>
                          <SelectItem value="SALES">Sales</SelectItem>
                          <SelectItem value="PURCHASE">Purchase</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <FieldLabel>Schedule Type</FieldLabel>
                      <Select value={taxCodeForm.scheduleType} onValueChange={(value) => setTaxCodeForm((current) => ({ ...current, scheduleType: value as ScheduleType }))}>
                        <SelectTrigger><SelectValue placeholder="Schedule type" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="NONE">None</SelectItem>
                          <SelectItem value="FX">Foreign Currency</SelectItem>
                          <SelectItem value="RTGS">RTGS</SelectItem>
                          <SelectItem value="WITHHOLDING">Withholding</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <FieldLabel>VAT-7 Output Box</FieldLabel>
                      <Input value={taxCodeForm.vat7OutputBox} onChange={(event) => setTaxCodeForm((current) => ({ ...current, vat7OutputBox: event.target.value }))} />
                    </div>
                    <div>
                      <FieldLabel>VAT-7 Input Box</FieldLabel>
                      <Input value={taxCodeForm.vat7InputBox} onChange={(event) => setTaxCodeForm((current) => ({ ...current, vat7InputBox: event.target.value }))} />
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <FieldLabel>Effective From</FieldLabel>
                      <Input type="date" value={taxCodeForm.effectiveFrom} onChange={(event) => setTaxCodeForm((current) => ({ ...current, effectiveFrom: event.target.value }))} />
                    </div>
                    <div>
                      <FieldLabel>Effective To</FieldLabel>
                      <Input type="date" value={taxCodeForm.effectiveTo} onChange={(event) => setTaxCodeForm((current) => ({ ...current, effectiveTo: event.target.value }))} />
                    </div>
                  </div>
                  <div className="flex items-center gap-3 rounded-[20px] border border-[var(--edge-subtle)] bg-[var(--surface-subtle)] px-4 py-3">
                    <Checkbox checked={taxCodeForm.isActive} onCheckedChange={(checked) => setTaxCodeForm((current) => ({ ...current, isActive: checked === true }))} />
                    <span className="text-sm text-[var(--text-strong)]">Keep this tax code active</span>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button type="submit" className="flex-1" disabled={saveTaxCodeMutation.isPending || (editor.mode === "create" && (isReserving || !reservedId))}>
                      {editor.mode === "create" ? "Save Tax Code" : "Update Tax Code"}
                    </Button>
                    <Button type="button" variant="outline" onClick={closeEditor}>Cancel</Button>
                  </div>
                </form>
              ) : null}
              {editor.kind === "category" ? (
                <form onSubmit={handleCategorySubmit} className="mt-6 space-y-4">
                  <div>
                    <FieldLabel>Name</FieldLabel>
                    <Input value={categoryForm.name} onChange={(event) => setCategoryForm((current) => ({ ...current, name: event.target.value }))} required />
                  </div>
                  <div>
                    <FieldLabel>Scope</FieldLabel>
                    <Select value={categoryForm.scope} onValueChange={(value) => setCategoryForm((current) => ({ ...current, scope: value as CategoryScope }))}>
                      <SelectTrigger><SelectValue placeholder="Scope" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="BOTH">Both</SelectItem>
                        <SelectItem value="CUSTOMER">Customer</SelectItem>
                        <SelectItem value="VENDOR">Vendor</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-3 rounded-[20px] border border-[var(--edge-subtle)] bg-[var(--surface-subtle)] px-4 py-3">
                    <Checkbox checked={categoryForm.isActive} onCheckedChange={(checked) => setCategoryForm((current) => ({ ...current, isActive: checked === true }))} />
                    <span className="text-sm text-[var(--text-strong)]">Keep this category active</span>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button type="submit" className="flex-1" disabled={saveCategoryMutation.isPending}>
                      {editor.mode === "create" ? "Save Tax Category" : "Update Tax Category"}
                    </Button>
                    <Button type="button" variant="outline" onClick={closeEditor}>Cancel</Button>
                  </div>
                </form>
              ) : null}
              {editor.kind === "template" ? (
                <form onSubmit={handleTemplateSubmit} className="mt-6 space-y-4">
                  <div>
                    <FieldLabel>Name</FieldLabel>
                    <Input value={templateForm.name} onChange={(event) => setTemplateForm((current) => ({ ...current, name: event.target.value }))} required />
                  </div>
                  <div>
                    <FieldLabel>Description</FieldLabel>
                    <Textarea value={templateForm.description} onChange={(event) => setTemplateForm((current) => ({ ...current, description: event.target.value }))} rows={3} />
                  </div>
                  <div className="flex items-center gap-3 rounded-[20px] border border-[var(--edge-subtle)] bg-[var(--surface-subtle)] px-4 py-3">
                    <Checkbox checked={templateForm.isActive} onCheckedChange={(checked) => setTemplateForm((current) => ({ ...current, isActive: checked === true }))} />
                    <span className="text-sm text-[var(--text-strong)]">Keep this template active</span>
                  </div>
                  <div className="space-y-3 rounded-[24px] border border-[var(--edge-subtle)] bg-[var(--surface-base)] px-4 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-[var(--text-strong)]">Tax Lines</p>
                        <FieldHint>Add at least one tax code to the template.</FieldHint>
                      </div>
                      <Button type="button" size="sm" variant="outline" onClick={addTemplateLine}>
                        <Plus className="mr-2 size-4" />
                        Add Line
                      </Button>
                    </div>
                    {templateForm.lines.map((line, index) => (
                      <div key={line.key} className="grid gap-3 rounded-[20px] border border-[var(--edge-subtle)] bg-[var(--surface-subtle)] px-4 py-4 md:grid-cols-[minmax(0,1fr)_180px_140px_auto]">
                        <div>
                          <FieldLabel>Tax Code {index + 1}</FieldLabel>
                          <Select value={line.taxCodeId} onValueChange={(value) => updateTemplateLine(line.key, { taxCodeId: value })}>
                            <SelectTrigger><SelectValue placeholder="Select tax code" /></SelectTrigger>
                            <SelectContent>
                              {taxCodes.map((taxCode) => (
                                <SelectItem key={taxCode.id} value={taxCode.id}>
                                  {taxCode.code} - {taxCode.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <FieldLabel>Applies To</FieldLabel>
                          <Select value={line.appliesTo} onValueChange={(value) => updateTemplateLine(line.key, { appliesTo: value as AppliesTo })}>
                            <SelectTrigger><SelectValue placeholder="Applies to" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="BOTH">Both</SelectItem>
                              <SelectItem value="SALES">Sales</SelectItem>
                              <SelectItem value="PURCHASE">Purchase</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex items-end pb-2">
                          <label className="flex items-center gap-3 text-sm text-[var(--text-strong)]">
                            <Checkbox checked={line.isDefault} onCheckedChange={(checked) => updateTemplateLine(line.key, { isDefault: checked === true })} />
                            Default
                          </label>
                        </div>
                        <div className="flex items-end justify-end pb-1">
                          <Button type="button" size="sm" variant="ghost" onClick={() => removeTemplateLine(line.key)}>
                            <Trash2 className="mr-2 size-4" />
                            Remove
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button type="submit" className="flex-1" disabled={saveTemplateMutation.isPending}>
                      {editor.mode === "create" ? "Save Tax Template" : "Update Tax Template"}
                    </Button>
                    <Button type="button" variant="outline" onClick={closeEditor}>Cancel</Button>
                  </div>
                </form>
              ) : null}
              {editor.kind === "rule" ? (
                <form onSubmit={handleRuleSubmit} className="mt-6 space-y-4">
                  <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_180px]">
                    <div>
                      <FieldLabel>Name</FieldLabel>
                      <Input value={ruleForm.name} onChange={(event) => setRuleForm((current) => ({ ...current, name: event.target.value }))} required />
                    </div>
                    <div>
                      <FieldLabel>Priority</FieldLabel>
                      <Input type="number" min="1" max="1000" value={ruleForm.priority} onChange={(event) => setRuleForm((current) => ({ ...current, priority: event.target.value }))} className="text-right font-mono" />
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-3">
                    <div>
                      <FieldLabel>Applies To</FieldLabel>
                      <Select value={ruleForm.appliesTo} onValueChange={(value) => setRuleForm((current) => ({ ...current, appliesTo: value as AppliesTo }))}>
                        <SelectTrigger><SelectValue placeholder="Applies to" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="BOTH">Both</SelectItem>
                          <SelectItem value="SALES">Sales</SelectItem>
                          <SelectItem value="PURCHASE">Purchase</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <FieldLabel>Template</FieldLabel>
                      <Select value={ruleForm.templateId} onValueChange={(value) => setRuleForm((current) => ({ ...current, templateId: value }))}>
                        <SelectTrigger><SelectValue placeholder="Select template" /></SelectTrigger>
                        <SelectContent>
                          {taxTemplates.map((template) => (
                            <SelectItem key={template.id} value={template.id}>
                              {template.code} - {template.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <FieldLabel>Tax Category</FieldLabel>
                      <Select value={ruleForm.taxCategoryId || "__all__"} onValueChange={(value) => setRuleForm((current) => ({ ...current, taxCategoryId: value === "__all__" ? "" : value }))}>
                        <SelectTrigger><SelectValue placeholder="All counterparties" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__all__">All counterparties</SelectItem>
                          {taxCategories.map((category) => (
                            <SelectItem key={category.id} value={category.id}>
                              {category.code} - {category.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-3">
                    <div>
                      <FieldLabel>Currency</FieldLabel>
                      <Input value={ruleForm.currency} onChange={(event) => setRuleForm((current) => ({ ...current, currency: event.target.value.toUpperCase() }))} placeholder="USD" />
                      <FieldHint>Leave blank to match any currency.</FieldHint>
                    </div>
                    <div>
                      <FieldLabel>Effective From</FieldLabel>
                      <Input type="date" value={ruleForm.effectiveFrom} onChange={(event) => setRuleForm((current) => ({ ...current, effectiveFrom: event.target.value }))} />
                    </div>
                    <div>
                      <FieldLabel>Effective To</FieldLabel>
                      <Input type="date" value={ruleForm.effectiveTo} onChange={(event) => setRuleForm((current) => ({ ...current, effectiveTo: event.target.value }))} />
                    </div>
                  </div>
                  <div className="flex items-center gap-3 rounded-[20px] border border-[var(--edge-subtle)] bg-[var(--surface-subtle)] px-4 py-3">
                    <Checkbox checked={ruleForm.isActive} onCheckedChange={(checked) => setRuleForm((current) => ({ ...current, isActive: checked === true }))} />
                    <span className="text-sm text-[var(--text-strong)]">Keep this rule active</span>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button type="submit" className="flex-1" disabled={saveRuleMutation.isPending}>
                      {editor.mode === "create" ? "Save Tax Rule" : "Update Tax Rule"}
                    </Button>
                    <Button type="button" variant="outline" onClick={closeEditor}>Cancel</Button>
                  </div>
                </form>
              ) : null}
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </AccountingShell>
  );
}
