"use client";

import {
  useMemo,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from "react";
import { useSearchParams } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Switch } from "@corelithzw/react";
import { AccountingShell } from "../accounting-shell";
import { BandChip } from "../band-chip";
import { AccountingListView as DataTable } from "../listview/accounting-list-view";
import { MetricTile } from "../hubs/metric-tile";
import { Alert, AlertDescription, AlertTitle } from "@corelithzw/ui/components/alert";
import { Button } from "@corelithzw/ui/components/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@corelithzw/ui/components/card";
import { Checkbox } from "@corelithzw/ui/components/checkbox";
import { Input } from "@corelithzw/ui/components/input";
import { NumericCell } from "@corelithzw/ui/components/numeric-cell";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@corelithzw/ui/components/select";
import { Textarea } from "@corelithzw/ui/components/textarea";
import { VerticalDataViews } from "@corelithzw/ui/components/vertical-data-views";
import { useToast } from "@corelithzw/ui/components/use-toast";
import { useReservedId } from "@corelithzw/platform/hooks/use-reserved-id";
import { formatAmount, formatHeadline } from "../../format";
import { type AccountingPeriodRecord, type TaxCategoryRecord, type TaxCodeRecord, type TaxRuleRecord, type TaxTemplateRecord, type VatReturnRecord, type VatSummaryRow, createVatReturnDraft, fetchAccountingPeriods, fetchTaxCategories, fetchTaxCodes, fetchTaxRules, fetchTaxTemplates, fetchVatReturns, fetchVatSummary, fileVatReturn, finalizeVatReturn, refreshVatReturn, reviewVatReturn } from "../../api-client";
import { fetchJson, getApiErrorMessage } from "@corelithzw/platform/api-client";
import { Plus, X } from "@corelithzw/ui/lib/icons";
import { cn } from "@corelithzw/ui/lib/utils";

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

const APPLIES_TO_LABEL: Record<string, string> = {
  BOTH: "Both",
  SALES: "Sales",
  PURCHASE: "Purchase",
};

const SCOPE_LABEL: Record<string, string> = {
  BOTH: "Both",
  CUSTOMER: "Customer",
  VENDOR: "Vendor",
};

const SCHEDULE_LABEL: Record<string, string> = {
  NONE: "None",
  FX: "Foreign currency",
  RTGS: "RTGS",
  WITHHOLDING: "Withholding",
};

/**
 * The type a tax code can carry.
 *
 * The column is a free string in the schema, documented there as VAT,
 * WITHHOLDING or OTHER. The select offers those three and folds in whatever
 * types the company's own codes already use, so opening a code created before
 * this list existed cannot silently retype it on save.
 */
const KNOWN_TAX_CODE_TYPES = ["VAT", "WITHHOLDING", "OTHER"];

const RETURN_STATUS: Record<
  VatReturnRecord["status"],
  { label: string; tone: string }
> = {
  DRAFT: { label: "Draft", tone: "warn" },
  REVIEWED: { label: "Reviewed", tone: "info" },
  FINALIZED: { label: "Finalized", tone: "info" },
  FILED: { label: "Filed", tone: "ok" },
  VOIDED: { label: "Voided", tone: "mute" },
};

function summarizeTemplateLines(template: TaxTemplateRecord): string {
  if (!template.lines?.length) return "No tax codes linked";
  return template.lines
    .map((line) => {
      const code = line.taxCode?.code ?? "Unknown";
      return line.isDefault ? `${code} (default)` : code;
    })
    .join(", ");
}

function countActiveRows(rows: Array<{ isActive: boolean }>): number {
  return rows.filter((row) => row.isActive).length;
}

/** Accounting negatives: a deduction is bracketed, never signed. */
function formatPositionAmount(value: number): string {
  return value < 0 ? `(${formatAmount(Math.abs(value))})` : formatAmount(value);
}

/**
 * When a code or a rule is in force.
 *
 * An open end is an arrow rather than a second date, because "1 Jan 2024 →"
 * and "1 Jan 2024 → 31 Dec 2099" mean different things: the first is a code
 * still in force, the second is one somebody has already scheduled to stop.
 */
function formatEffectiveWindow(from?: string | null, to?: string | null): string {
  if (!from && !to) return "—";
  const start = from ? format(new Date(from), "d MMM yyyy") : "Open";
  return to ? `${start} → ${format(new Date(to), "d MMM yyyy")}` : `${start} →`;
}

/**
 * A VAT period, named the way somebody filing it would name it.
 *
 * A whole calendar month reads as "August 2026". Anything else keeps its two
 * dates — calling a part-month period by a month it does not cover would
 * misstate what the return includes.
 */
function formatPeriodLabel(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const lastOfEndMonth = new Date(end.getFullYear(), end.getMonth() + 1, 0).getDate();
  const isWholeMonth =
    start.getDate() === 1 &&
    start.getMonth() === end.getMonth() &&
    start.getFullYear() === end.getFullYear() &&
    end.getDate() === lastOfEndMonth;
  if (isWholeMonth) return format(start, "MMMM yyyy");
  return `${format(start, "d MMM yyyy")} – ${format(end, "d MMM yyyy")}`;
}

function StatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <span className="acct-badge" data-tone={isActive ? "ok" : "mute"}>
      {isActive ? "Active" : "Inactive"}
    </span>
  );
}

/**
 * The row's handle.
 *
 * The design draws no Edit column — a record is opened by its own identity,
 * and the one currently in the editor is the one printed in brand ink. So the
 * first cell of every setup table is the control that opens it.
 */
function RecordButton({
  label,
  mono,
  selected,
  onSelect,
}: {
  label: string;
  mono?: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "block min-w-0 max-w-full truncate text-left text-sm hover:underline",
        mono && "font-mono",
        selected
          ? "font-bold text-[var(--brand-strong)]"
          : "font-medium text-[var(--text-strong)]",
      )}
    >
      {label}
    </button>
  );
}

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <label className="acct-col-head mb-2 block">
      {children}
    </label>
  );
}

function FieldHint({ children }: { children: ReactNode }) {
  return <p className="mt-1 acct-caption">{children}</p>;
}

function Field({
  label,
  required,
  wide,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  wide?: boolean;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={cn("min-w-0", wide && "col-span-2")}>
      <FieldLabel>
        {label}
        {required ? <span className="text-[var(--tone-danger)]"> *</span> : null}
      </FieldLabel>
      {children}
      {hint ? <FieldHint>{hint}</FieldHint> : null}
    </div>
  );
}

/**
 * Active/inactive as a switch rather than a checkbox.
 *
 * A checkbox reads as "include this"; the state it actually sets is whether
 * the record keeps appearing on new documents, which is a two-state mode. The
 * hint carries the part the interface enforces but cannot show — that history
 * already posted against the record survives being switched off.
 */
function StatusField({
  checked,
  onChange,
  hint,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  hint: string;
}) {
  return (
    <Field label="Status" wide hint={hint}>
      <label className="flex h-[30px] items-center gap-2.5">
        <Switch
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          aria-label="Record is active"
        />
        <span
          className={cn(
            "text-sm font-semibold",
            checked ? "text-[var(--badge-ok-fg)]" : "text-[var(--text-subtle)]",
          )}
        >
          {checked ? "Active" : "Inactive"}
        </span>
      </label>
    </Field>
  );
}

/**
 * The right-hand pane.
 *
 * The design keeps the record you are working on beside the list rather than
 * over it: a sheet hides the very rows you are editing against — the other
 * rates, the other priorities — which is exactly the context a tax rule is
 * written from. It pins one toolbar below the view switcher so it stays put
 * while the list scrolls under its own header.
 */
function SidePanel({
  chip,
  chipTone,
  title,
  onSubmit,
  children,
  extra,
  footer,
}: {
  chip: string;
  chipTone: "info" | "warn";
  title: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  children: ReactNode;
  extra?: ReactNode;
  footer: ReactNode;
}) {
  return (
    <Card
      className="sticky"
      style={{ top: "calc(var(--stack-top, 0px) + var(--list-toolbar-h))" }}
    >
      <form onSubmit={onSubmit}>
        <CardHeader className="justify-start gap-2">
          <span className="acct-badge" data-tone={chipTone}>
            {chip}
          </span>
          <CardTitle className="min-w-0 truncate">{title}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 items-start gap-x-3 gap-y-2.5">
          {children}
        </CardContent>
        {extra}
        <CardFooter className="justify-start gap-2">{footer}</CardFooter>
      </form>
    </Card>
  );
}

/** Save, cancel, and the separated destructive action the design keeps right. */
function PanelFooter({
  saveLabel,
  saving,
  onCancel,
  destructive,
}: {
  saveLabel: string;
  saving: boolean;
  onCancel: () => void;
  destructive?: ReactNode;
}) {
  return (
    <>
      <Button type="submit" size="sm" disabled={saving}>
        {saveLabel}
      </Button>
      <Button type="button" size="sm" variant="outline" onClick={onCancel}>
        Cancel
      </Button>
      {destructive ? <div className="ml-auto">{destructive}</div> : null}
    </>
  );
}

/** The destructive action, outlined in danger ink rather than filled. */
function DestructiveButton({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={disabled}
      onClick={onClick}
      className="border-[var(--tone-danger-bd)] text-[var(--badge-bad-fg)]"
    >
      {label}
    </Button>
  );
}

/**
 * The note over a list.
 *
 * Not a title: the band already says Tax and the pill already says which view
 * this is, so a heading here would name the page twice. What is left is the
 * one line that states a rule the table itself cannot show — which of two
 * competing rules wins, what a template actually is.
 */
function ListNote({ children }: { children: ReactNode }) {
  return <p className="acct-caption">{children}</p>;
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
  /*
    What the draft would come to.

    The same summary the VAT summary view reads, scoped to the period being
    prepared. It is the figure the server will compute from the same journals,
    so previewing it here is a read of the real position rather than a guess —
    and preparing a return you have already seen the bottom line of is the
    difference between filing and finding out.
  */
  const returnPreviewQuery = useQuery({
    queryKey: ["accounting", "vat-summary", "return-preview", vatReturnPeriodId],
    queryFn: () => fetchVatSummary({ periodId: vatReturnPeriodId }),
    enabled: activeView === "vat-returns" && Boolean(vatReturnPeriodId),
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

  const editingCodeId = editor?.kind === "code" ? editor.recordId : undefined;
  const editingCategoryId = editor?.kind === "category" ? editor.recordId : undefined;
  const editingTemplateId = editor?.kind === "template" ? editor.recordId : undefined;
  const editingRuleId = editor?.kind === "rule" ? editor.recordId : undefined;

  /*
    Counts the client can already answer.

    Every rule is in memory, so how many of them point at a category or a
    template is a question this page can settle without another endpoint. It
    is the figure that tells you whether deactivating a template is safe.
  */
  const rulesByCategory = useMemo(() => {
    const counts = new Map<string, number>();
    for (const rule of taxRules) {
      if (!rule.taxCategoryId) continue;
      counts.set(rule.taxCategoryId, (counts.get(rule.taxCategoryId) ?? 0) + 1);
    }
    return counts;
  }, [taxRules]);

  const rulesByTemplate = useMemo(() => {
    const counts = new Map<string, number>();
    for (const rule of taxRules) {
      counts.set(rule.templateId, (counts.get(rule.templateId) ?? 0) + 1);
    }
    return counts;
  }, [taxRules]);

  const taxCodeTypeOptions = useMemo(() => {
    const seen = new Set(KNOWN_TAX_CODE_TYPES);
    for (const code of taxCodes) {
      if (code.type) seen.add(code.type);
    }
    return Array.from(seen);
  }, [taxCodes]);

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

  /*
    Deactivate is a one-field PATCH, not a delete.

    Nothing in tax is ever removed: a code that priced last quarter's invoices
    has to keep existing for those invoices to still add up. Switching it off
    takes it out of the pickers on new documents and leaves the history alone,
    which is the only safe meaning "delete" could have had here.
  */
  function deactivateEditingRecord() {
    if (!editor || editor.mode !== "edit" || !editor.recordId) return;
    const input = { mode: "edit" as const, id: editor.recordId, payload: { isActive: false } };
    if (editor.kind === "code") {
      saveTaxCodeMutation.mutate(input);
      return;
    }
    if (editor.kind === "category") {
      saveCategoryMutation.mutate(input);
      return;
    }
    if (editor.kind === "template") {
      saveTemplateMutation.mutate(input);
      return;
    }
    saveRuleMutation.mutate(input);
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

  /*
    The pills say what the cut is, not what the module is. "Tax codes" under a
    band already titled Tax says Tax twice; "Codes" says it once.
  */
  const viewItems = useMemo(
    () => [
      { id: "codes", label: "Codes", count: taxCodes.length },
      { id: "categories", label: "Categories", count: taxCategories.length },
      { id: "templates", label: "Templates", count: taxTemplates.length },
      { id: "rules", label: "Rules", count: taxRules.length },
      { id: "vat-summary", label: "VAT summary", count: vatRows.length },
      { id: "vat-returns", label: "VAT returns", count: vatReturns.length },
    ],
    [taxCodes.length, taxCategories.length, taxTemplates.length, taxRules.length, vatRows.length, vatReturns.length],
  );

  const codeColumns: ColumnDef<TaxCodeRecord>[] = [
    {
      id: "code",
      header: "Code",
      cell: ({ row }) => (
        <RecordButton
          label={row.original.code}
          mono
          selected={editingCodeId === row.original.id}
          onSelect={() => openTaxCodeEdit(row.original)}
        />
      ),
      size: 110,
      minSize: 110,
      maxSize: 110,
    },
    { id: "name", header: "Name", accessorKey: "name" },
    {
      id: "rate",
      header: "Rate",
      cell: ({ row }) => <NumericCell>{row.original.rate}%</NumericCell>,
      size: 80,
      minSize: 80,
      maxSize: 80,
    },
    {
      id: "appliesTo",
      header: "Applies to",
      cell: ({ row }) => APPLIES_TO_LABEL[row.original.appliesTo ?? "BOTH"] ?? "Both",
      size: 100,
      minSize: 100,
      maxSize: 100,
    },
    {
      id: "schedule",
      header: "Schedule",
      cell: ({ row }) => {
        const schedule = row.original.scheduleType ?? "NONE";
        return (
          // A code on no statutory schedule is the ordinary case, so it recedes
          // rather than competing with the codes that do report on one.
          <span className={schedule === "NONE" ? "text-[var(--text-disabled)]" : undefined}>
            {SCHEDULE_LABEL[schedule] ?? schedule}
          </span>
        );
      },
      size: 120,
      minSize: 120,
      maxSize: 120,
    },
    {
      id: "effective",
      header: "Effective",
      cell: ({ row }) => (
        <span className="font-mono text-[var(--text-muted)]">
          {formatEffectiveWindow(row.original.effectiveFrom, row.original.effectiveTo)}
        </span>
      ),
      size: 150,
      minSize: 150,
      maxSize: 150,
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => <StatusBadge isActive={row.original.isActive} />,
      size: 110,
      minSize: 110,
      maxSize: 110,
    },
  ];

  const categoryColumns: ColumnDef<TaxCategoryRecord>[] = [
    {
      id: "name",
      header: "Category",
      cell: ({ row }) => (
        <RecordButton
          label={row.original.name}
          selected={editingCategoryId === row.original.id}
          onSelect={() => openCategoryEdit(row.original)}
        />
      ),
    },
    {
      id: "scope",
      header: "Scope",
      cell: ({ row }) => SCOPE_LABEL[row.original.scope] ?? row.original.scope,
      size: 140,
      minSize: 140,
      maxSize: 140,
    },
    {
      id: "ruleCount",
      header: "Rules using it",
      cell: ({ row }) => <NumericCell>{rulesByCategory.get(row.original.id) ?? 0}</NumericCell>,
      size: 130,
      minSize: 130,
      maxSize: 130,
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => <StatusBadge isActive={row.original.isActive} />,
      size: 110,
      minSize: 110,
      maxSize: 110,
    },
  ];

  const templateColumns: ColumnDef<TaxTemplateRecord>[] = [
    {
      id: "name",
      header: "Template",
      cell: ({ row }) => (
        <RecordButton
          label={row.original.name}
          selected={editingTemplateId === row.original.id}
          onSelect={() => openTemplateEdit(row.original)}
        />
      ),
    },
    {
      id: "mix",
      header: "Codes on it",
      cell: ({ row }) => (
        <span className="block truncate">{summarizeTemplateLines(row.original)}</span>
      ),
      size: 220,
      minSize: 180,
      maxSize: 320,
    },
    {
      id: "lineCount",
      header: "Lines",
      cell: ({ row }) => <NumericCell>{row.original.lines?.length ?? 0}</NumericCell>,
      size: 110,
      minSize: 110,
      maxSize: 110,
    },
    {
      id: "ruleCount",
      header: "Used by rules",
      cell: ({ row }) => <NumericCell>{rulesByTemplate.get(row.original.id) ?? 0}</NumericCell>,
      size: 130,
      minSize: 130,
      maxSize: 130,
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => <StatusBadge isActive={row.original.isActive} />,
      size: 110,
      minSize: 110,
      maxSize: 110,
    },
  ];

  const ruleColumns: ColumnDef<TaxRuleRecord>[] = [
    {
      id: "name",
      header: "Rule",
      cell: ({ row }) => (
        <RecordButton
          label={row.original.name}
          selected={editingRuleId === row.original.id}
          onSelect={() => openRuleEdit(row.original)}
        />
      ),
    },
    {
      id: "appliesTo",
      header: "Applies to",
      cell: ({ row }) => APPLIES_TO_LABEL[row.original.appliesTo] ?? row.original.appliesTo,
      size: 100,
      minSize: 100,
      maxSize: 100,
    },
    {
      id: "priority",
      header: "Priority",
      cell: ({ row }) => <NumericCell>{row.original.priority}</NumericCell>,
      size: 90,
      minSize: 90,
      maxSize: 90,
    },
    {
      id: "category",
      header: "Category",
      cell: ({ row }) => (
        <span className="block truncate">
          {row.original.taxCategory?.name ?? "All counterparties"}
        </span>
      ),
      size: 150,
      minSize: 140,
      maxSize: 200,
    },
    {
      id: "template",
      header: "Template",
      cell: ({ row }) => (
        <span className="block truncate">{row.original.template?.name ?? "Unknown"}</span>
      ),
      size: 150,
      minSize: 140,
      maxSize: 200,
    },
    {
      id: "currency",
      header: "Currency",
      cell: ({ row }) =>
        row.original.currency ? (
          <span className="font-mono">{row.original.currency}</span>
        ) : (
          <span className="text-[var(--text-disabled)]">Any</span>
        ),
      size: 90,
      minSize: 90,
      maxSize: 90,
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => <StatusBadge isActive={row.original.isActive} />,
      size: 100,
      minSize: 100,
      maxSize: 100,
    },
  ];

  const vatSummaryColumns: ColumnDef<VatSummaryRow>[] = [
    {
      id: "code",
      header: "Code",
      cell: ({ row }) => <span className="font-mono">{row.original.code}</span>,
      size: 110,
      minSize: 110,
      maxSize: 110,
    },
    { id: "name", header: "Name", accessorKey: "name" },
    {
      id: "rate",
      header: "Rate",
      cell: ({ row }) => <NumericCell>{row.original.rate}%</NumericCell>,
      size: 90,
      minSize: 90,
      maxSize: 90,
    },
    {
      id: "output",
      header: "Output",
      cell: ({ row }) => <NumericCell>{formatAmount(row.original.outputTax)}</NumericCell>,
      size: 120,
      minSize: 120,
      maxSize: 120,
    },
    {
      id: "input",
      header: "Input",
      cell: ({ row }) => <NumericCell>{formatAmount(row.original.inputTax)}</NumericCell>,
      size: 120,
      minSize: 120,
      maxSize: 120,
    },
  ];

  const activeCreateLabel =
    activeView === "codes"
      ? "New tax code"
      : activeView === "categories"
        ? "New category"
        : activeView === "templates"
          ? "New template"
          : activeView === "rules"
            ? "New rule"
            : null;

  const createDisabled =
    (activeView === "templates" && taxCodes.length === 0) ||
    (activeView === "rules" && taxTemplates.length === 0);

  /*
    The panel is titled with the record, not with the operation.

    "Edit Tax Code" is a label for a mode; VAT15 — Standard rated is a label
    for the thing on screen, and it is the only one that tells you which of six
    codes you are about to change. Only a record that does not exist yet has
    nothing better to be called.
  */
  const editingCode = taxCodes.find((row) => row.id === editingCodeId);
  const editorTitle = !editor
    ? ""
    : editor.kind === "code"
      ? editor.mode === "create"
        ? "New tax code"
        : `${editingCode?.code ?? ""} — ${taxCodeForm.name || "Untitled"}`
      : editor.kind === "category"
        ? editor.mode === "create"
          ? "New category"
          : categoryForm.name || "Untitled category"
        : editor.kind === "template"
          ? editor.mode === "create"
            ? "New template"
            : templateForm.name || "Untitled template"
          : editor.mode === "create"
            ? "New rule"
            : ruleForm.name || "Untitled rule";

  /*
    Deactivating is a save with one field flipped, so it goes through the same
    mutation the form does — there is no separate endpoint and no separate
    outcome. It only appears on a record that exists and is still active.
  */
  const canDeactivate = editor?.mode === "edit" && editor.recordId !== undefined;

  const vatReturnColumns: ColumnDef<VatReturnRecord>[] = [
    {
      id: "period",
      header: "Period",
      cell: ({ row }) => (
        <span className="font-medium text-[var(--text-strong)]">
          {formatPeriodLabel(row.original.periodStart, row.original.periodEnd)}
        </span>
      ),
      size: 150,
      minSize: 150,
      maxSize: 180,
    },
    {
      id: "category",
      header: "Category",
      cell: ({ row }) => row.original.filingCategory ?? "General",
      size: 110,
      minSize: 110,
      maxSize: 110,
    },
    {
      id: "outputTax",
      header: "Output VAT",
      cell: ({ row }) => <NumericCell>{formatAmount(row.original.outputTax)}</NumericCell>,
      size: 120,
      minSize: 120,
      maxSize: 120,
    },
    {
      id: "inputTax",
      header: "Input VAT",
      cell: ({ row }) => <NumericCell>{formatAmount(row.original.inputTax)}</NumericCell>,
      size: 120,
      minSize: 120,
      maxSize: 120,
    },
    {
      id: "netTax",
      header: "Net",
      cell: ({ row }) => <NumericCell>{formatAmount(row.original.netTax)}</NumericCell>,
      size: 120,
      minSize: 120,
      maxSize: 120,
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => {
        const status = RETURN_STATUS[row.original.status];
        return (
          <span className="acct-badge" data-tone={status.tone}>
            {status.label}
          </span>
        );
      },
      size: 110,
      minSize: 110,
      maxSize: 110,
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

  /*
    The VAT position, the way a return reads it.

    Output is split by rate because a zero-rated sale is still a line on the
    VAT7 even though it carries no tax, and input is the reclaim set against
    it. The design also draws a capital-goods split and an adjustments line;
    neither exists in the summary this reads from — adjustments belong to a
    return, not to the period, and nothing on a purchase marks it as capital —
    so those two lines are absent rather than filled with a likely number.
  */
  const vatPosition = useMemo(
    () => [
      {
        label: "Output VAT on standard-rated sales",
        value: vatRows.filter((row) => row.rate > 0).reduce((total, row) => total + row.outputTax, 0),
      },
      {
        label: "Output VAT on zero-rated sales",
        value: vatRows.filter((row) => row.rate === 0).reduce((total, row) => total + row.outputTax, 0),
      },
      { label: "Input VAT on purchases", value: -vatTotals.inputTax },
    ],
    [vatRows, vatTotals.inputTax],
  );

  const activeCodeCount = countActiveRows(taxCodes);
  const inactiveCodeCount = taxCodes.length - activeCodeCount;

  const selectedReturnPeriod = periods.find(
    (period: AccountingPeriodRecord) => period.id === vatReturnPeriodId,
  );
  const returnPreviewNet = returnPreviewQuery.data
    ? returnPreviewQuery.data.totals.netTax + (Number(vatReturnAdjustmentsTax) || 0)
    : null;

  const isRecordView =
    activeView === "codes" ||
    activeView === "categories" ||
    activeView === "templates" ||
    activeView === "rules";

  /*
    The list is written to run edge to edge across a whole page. Here it shares
    the row with a 400px editor, so the gutter it bleeds by is zero: the column
    it sits in *is* its panel, and a list that reached past it would slide under
    the editor beside it.
  */
  const columnScoped = { "--content-gutter-x": "0px" } as CSSProperties;
  const splitColumns = (open: boolean): CSSProperties => ({
    ...columnScoped,
    gridTemplateColumns: open ? "minmax(0, 1fr) 400px" : "minmax(0, 1fr)",
  });

  const appliesToOptions = (
    <SelectContent>
      <SelectItem value="BOTH">Both</SelectItem>
      <SelectItem value="SALES">Sales</SelectItem>
      <SelectItem value="PURCHASE">Purchase</SelectItem>
    </SelectContent>
  );

  return (
    <AccountingShell
      activeTab="tax"
      title="Tax"
      description="codes, categories, templates and the rules that pick between them"
      bandSlot={
        /*
          Net VAT — output less input, which is what actually gets paid to (or
          reclaimed from) ZIMRA. Amber when there is a liability, green when
          the position is a refund or nil, because the two mean opposite things
          to whoever is about to file.
        */
        <BandChip
          label="Net VAT"
          value={formatHeadline(vatTotals.netTax)}
          tone={vatTotals.netTax > 0 ? "warn" : "ok"}
        />
      }
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

      <VerticalDataViews
        items={viewItems}
        value={activeView}
        onValueChange={(value) => setActiveView(value as TaxView)}
        railLabel="Tax views"
      >
        <div
          className={cn("grid items-start gap-2.5", !isRecordView && "hidden")}
          style={splitColumns(editor !== null)}
        >
          <div className="min-w-0">
            <div className={activeView === "codes" ? "space-y-1.5" : "hidden"}>
              <ListNote>The rate a document actually carries.</ListNote>
              <DataTable
                data={taxCodes}
                columns={codeColumns}
                groupBy="type"
                searchPlaceholder="Code or name"
                searchSubmitLabel="Search"
                pagination={{ enabled: true }}
                emptyState={taxCodesQuery.isLoading ? "Loading tax codes..." : "No tax codes found."}
              />
            </div>

            <div className={activeView === "categories" ? "space-y-1.5" : "hidden"}>
              <ListNote>Who a rule applies to.</ListNote>
              <DataTable
                data={taxCategories}
                columns={categoryColumns}
                groupBy="scope"
                searchPlaceholder="Category name"
                searchSubmitLabel="Search"
                pagination={{ enabled: true }}
                emptyState={
                  taxCategoriesQuery.isLoading
                    ? "Loading tax categories..."
                    : "No tax categories found."
                }
              />
            </div>

            <div className={activeView === "templates" ? "space-y-1.5" : "hidden"}>
              <ListNote>The set of codes a rule applies together.</ListNote>
              <DataTable
                data={taxTemplates}
                columns={templateColumns}
                groupBy={(row) =>
                  row.lines && row.lines.length > 1 ? "Composite templates" : "Single-code templates"
                }
                searchPlaceholder="Template name"
                searchSubmitLabel="Search"
                pagination={{ enabled: true }}
                emptyState={
                  taxTemplatesQuery.isLoading
                    ? "Loading tax templates..."
                    : "No tax templates found."
                }
              />
            </div>

            <div className={activeView === "rules" ? "space-y-1.5" : "hidden"}>
              <ListNote>Lowest priority number wins.</ListNote>
              <DataTable
                data={taxRules}
                columns={ruleColumns}
                groupBy="appliesTo"
                searchPlaceholder="Rule name"
                searchSubmitLabel="Search"
                pagination={{ enabled: true }}
                emptyState={taxRulesQuery.isLoading ? "Loading tax rules..." : "No tax rules found."}
              />
            </div>
          </div>

          {editor && editor.kind === "code" ? (
            <SidePanel
              chip={editor.mode === "create" ? "NEW" : "EDIT"}
              chipTone="info"
              title={editorTitle}
              onSubmit={handleTaxCodeSubmit}
              footer={
                <PanelFooter
                  saveLabel="Save changes"
                  saving={
                    saveTaxCodeMutation.isPending ||
                    (editor.mode === "create" && (isReserving || !reservedId))
                  }
                  onCancel={closeEditor}
                  destructive={
                    canDeactivate && taxCodeForm.isActive ? (
                      <DestructiveButton
                        label="Deactivate"
                        disabled={saveTaxCodeMutation.isPending}
                        onClick={deactivateEditingRecord}
                      />
                    ) : null
                  }
                />
              }
            >
              {editor.mode === "create" ? (
                <Field
                  label="Code"
                  wide
                  hint={reserveError ?? "Reserved when the editor opens, and fixed from then on so template references stay stable."}
                >
                  <Input
                    value={reservedId}
                    readOnly
                    className="font-mono"
                    placeholder={isReserving ? "Reserving..." : "Auto-generated"}
                  />
                </Field>
              ) : null}
              <Field label="Name" required wide>
                <Input
                  value={taxCodeForm.name}
                  onChange={(event) =>
                    setTaxCodeForm((current) => ({ ...current, name: event.target.value }))
                  }
                  required
                />
              </Field>
              <Field label="Rate (%)" required>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={taxCodeForm.rate}
                  onChange={(event) =>
                    setTaxCodeForm((current) => ({ ...current, rate: event.target.value }))
                  }
                  className="text-right font-mono"
                  required
                />
              </Field>
              <Field label="Type">
                <Select
                  value={taxCodeForm.type}
                  onValueChange={(value) =>
                    setTaxCodeForm((current) => ({ ...current, type: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Type" />
                  </SelectTrigger>
                  <SelectContent>
                    {taxCodeTypeOptions.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Applies to" wide>
                <Select
                  value={taxCodeForm.appliesTo}
                  onValueChange={(value) =>
                    setTaxCodeForm((current) => ({ ...current, appliesTo: value as AppliesTo }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Applies to" />
                  </SelectTrigger>
                  {appliesToOptions}
                </Select>
              </Field>
              <Field label="VAT-7 output box">
                <Input
                  value={taxCodeForm.vat7OutputBox}
                  onChange={(event) =>
                    setTaxCodeForm((current) => ({ ...current, vat7OutputBox: event.target.value }))
                  }
                  className="font-mono"
                />
              </Field>
              <Field label="VAT-7 input box">
                <Input
                  value={taxCodeForm.vat7InputBox}
                  onChange={(event) =>
                    setTaxCodeForm((current) => ({ ...current, vat7InputBox: event.target.value }))
                  }
                  className="font-mono"
                />
              </Field>
              <Field
                label="Schedule type"
                wide
                hint="Decides which ZIMRA schedule the code reports on."
              >
                <Select
                  value={taxCodeForm.scheduleType}
                  onValueChange={(value) =>
                    setTaxCodeForm((current) => ({ ...current, scheduleType: value as ScheduleType }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Schedule type" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(SCHEDULE_LABEL).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Effective from">
                <Input
                  type="date"
                  value={taxCodeForm.effectiveFrom}
                  onChange={(event) =>
                    setTaxCodeForm((current) => ({ ...current, effectiveFrom: event.target.value }))
                  }
                />
              </Field>
              <Field label="Effective to" hint="Blank leaves the code open-ended.">
                <Input
                  type="date"
                  value={taxCodeForm.effectiveTo}
                  onChange={(event) =>
                    setTaxCodeForm((current) => ({ ...current, effectiveTo: event.target.value }))
                  }
                />
              </Field>
              <StatusField
                checked={taxCodeForm.isActive}
                onChange={(next) => setTaxCodeForm((current) => ({ ...current, isActive: next }))}
                hint="Deactivating keeps history; the code stops appearing on new documents."
              />
            </SidePanel>
          ) : null}

          {editor && editor.kind === "category" ? (
            <SidePanel
              chip={editor.mode === "create" ? "NEW" : "EDIT"}
              chipTone="info"
              title={editorTitle}
              onSubmit={handleCategorySubmit}
              footer={
                <PanelFooter
                  saveLabel="Save changes"
                  saving={saveCategoryMutation.isPending}
                  onCancel={closeEditor}
                  destructive={
                    canDeactivate && categoryForm.isActive ? (
                      <DestructiveButton
                        label="Deactivate"
                        disabled={saveCategoryMutation.isPending}
                        onClick={deactivateEditingRecord}
                      />
                    ) : null
                  }
                />
              }
            >
              <Field label="Name" required wide>
                <Input
                  value={categoryForm.name}
                  onChange={(event) =>
                    setCategoryForm((current) => ({ ...current, name: event.target.value }))
                  }
                  required
                />
              </Field>
              <Field
                label="Scope"
                wide
                hint="Counterparties join a category from their own record, not from here."
              >
                <Select
                  value={categoryForm.scope}
                  onValueChange={(value) =>
                    setCategoryForm((current) => ({ ...current, scope: value as CategoryScope }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Scope" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BOTH">Both</SelectItem>
                    <SelectItem value="CUSTOMER">Customer</SelectItem>
                    <SelectItem value="VENDOR">Vendor</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <StatusField
                checked={categoryForm.isActive}
                onChange={(next) => setCategoryForm((current) => ({ ...current, isActive: next }))}
                hint="Deactivating keeps history; rules stop resolving against the category."
              />
            </SidePanel>
          ) : null}

          {editor && editor.kind === "template" ? (
            <SidePanel
              chip={editor.mode === "create" ? "NEW" : "EDIT"}
              chipTone="info"
              title={editorTitle}
              onSubmit={handleTemplateSubmit}
              extra={
                <div className="border-t border-[var(--border-subtle)]">
                  <div className="flex items-center gap-2 px-[13px] py-1.5">
                    <span className="acct-rail-heading">Codes on this template</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="quiet"
                      className="ml-auto"
                      onClick={addTemplateLine}
                    >
                      <Plus className="mr-1 size-3.5" />
                      Add line
                    </Button>
                  </div>
                  <div className="grid grid-cols-[minmax(0,1fr)_112px_52px_28px] items-center gap-2 border-y border-[var(--border-subtle)] bg-[var(--surface-muted)] px-[13px] py-1">
                    <span className="acct-col-head">Tax code</span>
                    <span className="acct-col-head">Applies to</span>
                    <span className="acct-col-head text-center">Default</span>
                    <span />
                  </div>
                  {templateForm.lines.map((line) => (
                    <div
                      key={line.key}
                      className="grid grid-cols-[minmax(0,1fr)_112px_52px_28px] items-center gap-2 border-b border-[var(--border-subtle)] px-[13px] py-1.5"
                    >
                      <Select
                        value={line.taxCodeId}
                        onValueChange={(value) => updateTemplateLine(line.key, { taxCodeId: value })}
                      >
                        <SelectTrigger size="sm">
                          <SelectValue placeholder="Select tax code" />
                        </SelectTrigger>
                        <SelectContent>
                          {taxCodes.map((taxCode) => (
                            <SelectItem key={taxCode.id} value={taxCode.id}>
                              {taxCode.code} — {taxCode.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select
                        value={line.appliesTo}
                        onValueChange={(value) =>
                          updateTemplateLine(line.key, { appliesTo: value as AppliesTo })
                        }
                      >
                        <SelectTrigger size="sm">
                          <SelectValue placeholder="Applies to" />
                        </SelectTrigger>
                        {appliesToOptions}
                      </Select>
                      <div className="flex justify-center">
                        <Checkbox
                          checked={line.isDefault}
                          onCheckedChange={(checked) =>
                            updateTemplateLine(line.key, { isDefault: checked === true })
                          }
                          aria-label="Default line"
                        />
                      </div>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        aria-label="Remove line"
                        onClick={() => removeTemplateLine(line.key)}
                      >
                        <X className="size-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              }
              footer={
                <PanelFooter
                  saveLabel="Save changes"
                  saving={saveTemplateMutation.isPending}
                  onCancel={closeEditor}
                  destructive={
                    canDeactivate && templateForm.isActive ? (
                      <DestructiveButton
                        label="Deactivate"
                        disabled={saveTemplateMutation.isPending}
                        onClick={deactivateEditingRecord}
                      />
                    ) : null
                  }
                />
              }
            >
              <Field label="Name" required wide>
                <Input
                  value={templateForm.name}
                  onChange={(event) =>
                    setTemplateForm((current) => ({ ...current, name: event.target.value }))
                  }
                  required
                />
              </Field>
              <Field label="Description" wide>
                <Textarea
                  value={templateForm.description}
                  onChange={(event) =>
                    setTemplateForm((current) => ({ ...current, description: event.target.value }))
                  }
                  rows={2}
                />
              </Field>
              <StatusField
                checked={templateForm.isActive}
                onChange={(next) => setTemplateForm((current) => ({ ...current, isActive: next }))}
                hint="Deactivating keeps history; rules stop being able to target the template."
              />
            </SidePanel>
          ) : null}

          {editor && editor.kind === "rule" ? (
            <SidePanel
              chip={editor.mode === "create" ? "NEW" : "EDIT"}
              chipTone="info"
              title={editorTitle}
              onSubmit={handleRuleSubmit}
              footer={
                <PanelFooter
                  saveLabel="Save changes"
                  saving={saveRuleMutation.isPending}
                  onCancel={closeEditor}
                  destructive={
                    canDeactivate && ruleForm.isActive ? (
                      <DestructiveButton
                        label="Deactivate"
                        disabled={saveRuleMutation.isPending}
                        onClick={deactivateEditingRecord}
                      />
                    ) : null
                  }
                />
              }
            >
              <Field label="Name" required wide>
                <Input
                  value={ruleForm.name}
                  onChange={(event) =>
                    setRuleForm((current) => ({ ...current, name: event.target.value }))
                  }
                  required
                />
              </Field>
              <Field label="Applies to">
                <Select
                  value={ruleForm.appliesTo}
                  onValueChange={(value) =>
                    setRuleForm((current) => ({ ...current, appliesTo: value as AppliesTo }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Applies to" />
                  </SelectTrigger>
                  {appliesToOptions}
                </Select>
              </Field>
              <Field label="Priority" hint="Lower wins.">
                <Input
                  type="number"
                  min="1"
                  max="1000"
                  value={ruleForm.priority}
                  onChange={(event) =>
                    setRuleForm((current) => ({ ...current, priority: event.target.value }))
                  }
                  className="text-right font-mono"
                />
              </Field>
              <Field label="Tax category" wide>
                <Select
                  value={ruleForm.taxCategoryId || "__all__"}
                  onValueChange={(value) =>
                    setRuleForm((current) => ({
                      ...current,
                      taxCategoryId: value === "__all__" ? "" : value,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All counterparties" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All counterparties</SelectItem>
                    {taxCategories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Template" required wide>
                <Select
                  value={ruleForm.templateId}
                  onValueChange={(value) =>
                    setRuleForm((current) => ({ ...current, templateId: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select template" />
                  </SelectTrigger>
                  <SelectContent>
                    {taxTemplates.map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Currency" hint="Blank matches any.">
                <Input
                  value={ruleForm.currency}
                  onChange={(event) =>
                    setRuleForm((current) => ({
                      ...current,
                      currency: event.target.value.toUpperCase(),
                    }))
                  }
                  placeholder="USD"
                  className="font-mono"
                />
              </Field>
              <Field label="Effective from">
                <Input
                  type="date"
                  value={ruleForm.effectiveFrom}
                  onChange={(event) =>
                    setRuleForm((current) => ({ ...current, effectiveFrom: event.target.value }))
                  }
                />
              </Field>
              <Field label="Effective to" hint="Blank leaves the rule open-ended.">
                <Input
                  type="date"
                  value={ruleForm.effectiveTo}
                  onChange={(event) =>
                    setRuleForm((current) => ({ ...current, effectiveTo: event.target.value }))
                  }
                />
              </Field>
              <StatusField
                checked={ruleForm.isActive}
                onChange={(next) => setRuleForm((current) => ({ ...current, isActive: next }))}
                hint="Deactivating keeps history; the rule stops competing for new documents."
              />
            </SidePanel>
          ) : null}
        </div>

        <div
          className={cn("space-y-2.5", activeView !== "vat-summary" && "hidden")}
          style={columnScoped}
        >
          <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
            <MetricTile
              title="Active tax codes"
              value={activeCodeCount}
              valueLabel={String(activeCodeCount)}
              delta={`of ${taxCodes.length}`}
              detail={inactiveCodeCount ? `${inactiveCodeCount} switched off` : "all in use"}
              tone="neutral"
            />
            <MetricTile
              title="Output VAT"
              value={vatTotals.outputTax}
              valueLabel={formatHeadline(vatTotals.outputTax)}
              delta="charged"
              detail="on what we sold"
              tone="neutral"
            />
            <MetricTile
              title="Input VAT"
              value={vatTotals.inputTax}
              valueLabel={formatHeadline(vatTotals.inputTax)}
              delta="reclaimable"
              detail="on what we bought"
              tone="neutral"
            />
            {/*
              Net VAT is the only one of the three anybody files, so it carries
              the direction: amber when it is a liability, green when it is a
              refund or nil.
            */}
            <MetricTile
              title="Net VAT due"
              value={vatTotals.netTax}
              valueLabel={formatHeadline(vatTotals.netTax)}
              delta={vatTotals.netTax > 0 ? "payable" : "refundable"}
              detail="to ZIMRA"
              tone={vatTotals.netTax > 0 ? "warn" : "good"}
            />
          </div>

          <div className="grid gap-2.5 xl:grid-cols-12">
            <Card className="xl:col-span-5">
              <CardHeader className="justify-start gap-2">
                <CardTitle>VAT position</CardTitle>
                <span className="ml-auto acct-caption">from posted journals</span>
              </CardHeader>
              <div>
                {vatPosition.map((line) => (
                  <div
                    key={line.label}
                    className="flex min-h-[30px] items-center gap-3 border-b border-[var(--border-subtle)] px-[13px]"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm">{line.label}</span>
                    <span className="w-[130px] shrink-0">
                      <NumericCell>{formatPositionAmount(line.value)}</NumericCell>
                    </span>
                  </div>
                ))}
                <div className="flex min-h-[30px] items-center gap-3 px-[13px]">
                  <span className="min-w-0 flex-1 truncate text-sm font-bold text-[var(--text-strong)]">
                    Net VAT payable
                  </span>
                  <span className="w-[130px] shrink-0 font-bold text-[var(--brand-strong)]">
                    <NumericCell>{formatAmount(vatTotals.netTax)}</NumericCell>
                  </span>
                </div>
              </div>
            </Card>

            <div className="min-w-0 space-y-1.5 xl:col-span-7">
              <ListNote>What drove the position.</ListNote>
              <DataTable
                data={vatRows}
                columns={vatSummaryColumns}
                groupBy={(row) => `${row.rate}%`}
                searchPlaceholder="Code or name"
                searchSubmitLabel="Search"
                pagination={{ enabled: true }}
                toolbar={
                  <div className="flex flex-wrap items-center gap-2">
                    <Select value={summaryPeriodId} onValueChange={handlePeriodChange}>
                      <SelectTrigger size="sm" className="h-8 w-[220px]">
                        <SelectValue placeholder="Filter by period" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">All periods</SelectItem>
                        {periods.map((period: AccountingPeriodRecord) => (
                          <SelectItem key={period.id} value={period.id}>
                            {formatPeriodLabel(period.startDate, period.endDate)}
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
                emptyState={
                  vatSummaryQuery.isLoading ? "Loading VAT summary..." : "No VAT summary data."
                }
              />
            </div>
          </div>
        </div>

        <div
          className={cn("grid items-start gap-2.5", activeView !== "vat-returns" && "hidden")}
          style={splitColumns(true)}
        >
          <div className="min-w-0">
            <DataTable
              data={vatReturns}
              columns={vatReturnColumns}
              groupBy="status"
              searchPlaceholder="Period or category"
              searchSubmitLabel="Search"
              pagination={{ enabled: true }}
              emptyState={
                vatReturnsQuery.isLoading ? "Loading VAT returns..." : "No VAT returns found."
              }
            />
          </div>

          <SidePanel
            chip="DUE"
            chipTone="warn"
            title={
              selectedReturnPeriod
                ? `Prepare ${formatPeriodLabel(selectedReturnPeriod.startDate, selectedReturnPeriod.endDate)}`
                : "Prepare a return"
            }
            onSubmit={(event) => {
              event.preventDefault();
              createVatReturnMutation.mutate();
            }}
            extra={
              /*
                The bottom line before it is committed.

                Read from the same summary the server recomputes the draft
                from, plus whatever adjustment is typed above it — so what the
                panel shows and what the draft comes out at are the same
                arithmetic on the same journals.
              */
              <div className="px-[13px] pb-3">
                <div className="flex items-center gap-2 rounded-[7px] border border-[var(--brand-100)] bg-[var(--brand-soft)] px-[11px] py-2.5">
                  <span className="text-sm text-[var(--brand-strong)]">Net payable</span>
                  <span className="ml-auto font-mono text-base font-bold tabular-nums text-[var(--brand-strong)]">
                    {returnPreviewNet === null
                      ? returnPreviewQuery.isLoading
                        ? "…"
                        : "—"
                      : formatAmount(returnPreviewNet)}
                  </span>
                </div>
              </div>
            }
            footer={
              <>
                <Button
                  type="submit"
                  size="sm"
                  disabled={!vatReturnPeriodId || createVatReturnMutation.isPending}
                >
                  Prepare return
                </Button>
                <div className="ml-auto">
                  <DestructiveButton
                    label="Discard"
                    disabled={!vatReturnPeriodId && !vatReturnAdjustmentsTax}
                    onClick={() => {
                      setVatReturnPeriodId("");
                      setVatReturnAdjustmentsTax("");
                      setVatReturnFilingCategory("GENERAL");
                    }}
                  />
                </div>
              </>
            }
          >
            <Field label="Period" required wide hint="Only an open period can be drafted.">
              <Select value={vatReturnPeriodId} onValueChange={setVatReturnPeriodId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select period" />
                </SelectTrigger>
                <SelectContent>
                  {periods.map((period: AccountingPeriodRecord) => (
                    <SelectItem key={period.id} value={period.id}>
                      {formatPeriodLabel(period.startDate, period.endDate)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Filing category" required wide>
              <Select value={vatReturnFilingCategory} onValueChange={setVatReturnFilingCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Filing category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="GENERAL">General</SelectItem>
                  <SelectItem value="CATEGORY_A">Category A</SelectItem>
                  <SelectItem value="CATEGORY_C">Category C</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Start date">
              <Input
                readOnly
                className="font-mono"
                value={
                  selectedReturnPeriod
                    ? format(new Date(selectedReturnPeriod.startDate), "dd/MM/yyyy")
                    : ""
                }
                placeholder="from the period"
              />
            </Field>
            <Field label="End date">
              <Input
                readOnly
                className="font-mono"
                value={
                  selectedReturnPeriod
                    ? format(new Date(selectedReturnPeriod.endDate), "dd/MM/yyyy")
                    : ""
                }
                placeholder="from the period"
              />
            </Field>
            <Field label="Adjustments tax" wide hint="Credit notes and prior-period corrections.">
              <Input
                type="number"
                min="-999999999"
                step="0.01"
                value={vatReturnAdjustmentsTax}
                onChange={(event) => setVatReturnAdjustmentsTax(event.target.value)}
                placeholder="0.00"
                className="text-right font-mono"
              />
            </Field>
          </SidePanel>
        </div>
      </VerticalDataViews>
    </AccountingShell>
  );
}
