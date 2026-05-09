"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GoldShell } from "@/components/gold/gold-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusChip } from "@/components/ui/status-chip";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { fetchShiftGroups, fetchSites } from "@/lib/api";
import { goldRoutes } from "@/app/gold/routes";
import { SearchableSelect } from "@/app/gold/components/searchable-select";
import { ChevronLeftIcon, AlertCircle } from "@/lib/icons";
import { cn } from "@/lib/utils";

type LedgerEntry = {
  id: string;
  lineNo: number;
  parsedDate: string | null;
  parsedName: string | null;
  mappedShiftGroupId: string | null;
  gramsTotal: number | null;
  expensesJson: string | null;
  boysGrams: number | null;
  mdaraGrams: number | null;
  balGrams: number | null;
  status: "PENDING" | "CREATED" | "SKIPPED" | "ANOMALY" | "FAILED";
  goldShiftAllocationId: string | null;
  goldPourId: string | null;
  buyerReceiptId: string | null;
  errorMessage: string | null;
  parserWarning: string | null;
  shiftGroup: { id: string; name: string } | null;
};

type ExpenseBreakdown = Array<{ type: string; weight: number }>;

const KNOWN_EXPENSE_TYPES = ["Diesel", "Shoots", "LCD"] as const;

const STATUS_ROW_TINT: Record<LedgerEntry["status"], string> = {
  CREATED: "bg-emerald-50/50 border-l-2 border-l-emerald-400",
  ANOMALY: "bg-amber-50/60 border-l-2 border-l-amber-400",
  FAILED: "bg-rose-50/60 border-l-2 border-l-rose-400",
  PENDING: "border-l-2 border-l-transparent",
  SKIPPED: "bg-muted/30 border-l-2 border-l-muted-foreground/20",
};

const STATUS_TONE: Record<
  LedgerEntry["status"],
  Parameters<typeof StatusChip>[0]["status"]
> = {
  CREATED: "passing",
  ANOMALY: "warning",
  FAILED: "danger",
  PENDING: "pending",
  SKIPPED: "pending",
};

function expenseWeightFor(type: string, list: ExpenseBreakdown): number | null {
  const match = list.find(
    (e) => e.type.toLowerCase() === type.toLowerCase(),
  );
  return match ? match.weight : null;
}

/**
 * Replace (or add) a single expense type's weight in the breakdown,
 * preserving the order of the others. Setting weight to null/0 removes
 * the row.
 */
function upsertExpense(
  list: ExpenseBreakdown,
  type: string,
  weight: number | null,
): ExpenseBreakdown {
  const lower = type.toLowerCase();
  const without = list.filter((e) => e.type.toLowerCase() !== lower);
  if (weight == null || weight <= 0) return without;
  // Try to keep the canonical name if the type was already there.
  const existing = list.find((e) => e.type.toLowerCase() === lower);
  return [...without, { type: existing?.type ?? type, weight }];
}

type EditableNumberProps = {
  value: number | null | undefined;
  onSave: (next: number | null) => void;
  step?: number;
  align?: "left" | "right";
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  format?: (n: number) => string;
};

function EditableNumber({
  value,
  onSave,
  step = 0.01,
  align = "right",
  placeholder = "—",
  disabled,
  className,
  format = (n) => n.toFixed(3),
}: EditableNumberProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value != null ? String(value) : "");

  useEffect(() => {
    if (!editing) setDraft(value != null ? String(value) : "");
  }, [value, editing]);

  if (disabled || value === undefined) {
    return (
      <span
        className={cn(
          "font-mono",
          align === "right" ? "text-right" : "text-left",
          className,
        )}
      >
        {value != null ? format(value) : placeholder}
      </span>
    );
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft(value != null ? String(value) : "");
          setEditing(true);
        }}
        className={cn(
          "font-mono cursor-text rounded px-1 py-0.5 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          align === "right" ? "ml-auto block text-right" : "block text-left",
          value == null && "text-muted-foreground italic",
          className,
        )}
        title="Click to edit"
      >
        {value != null ? format(value) : placeholder}
      </button>
    );
  }

  const commit = () => {
    const trimmed = draft.trim();
    let next: number | null = null;
    if (trimmed !== "") {
      const parsed = Number(trimmed);
      if (Number.isFinite(parsed)) next = parsed;
    }
    if (next !== (value ?? null)) onSave(next);
    setEditing(false);
  };

  return (
    <input
      autoFocus
      type="number"
      step={step}
      inputMode="decimal"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          (e.target as HTMLInputElement).blur();
        } else if (e.key === "Escape") {
          setDraft(value != null ? String(value) : "");
          setEditing(false);
        }
      }}
      className={cn(
        "w-20 rounded border border-primary/40 bg-background px-1 py-0.5 text-xs font-mono outline-none ring-2 ring-primary/20 focus:ring-primary/30",
        align === "right" ? "text-right" : "text-left",
      )}
    />
  );
}

type EditableDateProps = {
  value: string | null | undefined;
  onSave: (iso: string | null) => void;
  disabled?: boolean;
};

function EditableDate({ value, onSave, disabled }: EditableDateProps) {
  const display = value ? new Date(value).toLocaleDateString() : "—";
  const isoDate = value ? new Date(value).toISOString().slice(0, 10) : "";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(isoDate);

  useEffect(() => {
    if (!editing) setDraft(isoDate);
  }, [isoDate, editing]);

  if (disabled) {
    return <span className="whitespace-nowrap">{display}</span>;
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft(isoDate);
          setEditing(true);
        }}
        className="cursor-text rounded px-1 py-0.5 transition-colors hover:bg-muted/60 whitespace-nowrap"
        title="Click to edit"
      >
        {display}
      </button>
    );
  }

  const commit = () => {
    if (draft && draft !== isoDate) onSave(draft);
    else if (!draft && value) onSave(null);
    setEditing(false);
  };

  return (
    <input
      autoFocus
      type="date"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setDraft(isoDate);
          setEditing(false);
        }
      }}
      className="rounded border border-primary/40 bg-background px-1 py-0.5 text-xs outline-none ring-2 ring-primary/20"
    />
  );
}

function parseExpenses(json: string | null): ExpenseBreakdown {
  if (!json) return [];
  try {
    const arr = JSON.parse(json) as ExpenseBreakdown;
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

type ImportDetail = {
  id: string;
  fileName: string;
  status: "DRAFT" | "MAPPING" | "PREVIEW" | "COMMITTED" | "FAILED" | "ROLLED_BACK";
  siteId: string | null;
  mappingsJson: string | null;
  rowsTotal: number;
  rowsCreated: number;
  rowsAnomaly: number;
  rowsFailed: number;
  createdAt: string;
  uploadedBy: { id: string; name: string } | null;
  site: { id: string; name: string; code: string } | null;
  entries: LedgerEntry[];
  summary?: CommitSummary;
};

type CommitSummary = {
  rowsCreated: number;
  rowsSkipped: number;
  rowsAnomaly: number;
  rowsFailed: number;
  allocationsCreated: number;
  poursCreated: number;
  salesCreated: number;
  totalSaleGrams: number;
  totalDeficitGrams: number;
};

const grams = (n: number | null | undefined) =>
  n == null ? "—" : `${n.toFixed(3)} g`;

export default function GoldImportDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [commitResult, setCommitResult] = useState<CommitSummary | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["gold-import", id],
    queryFn: () => fetchJson<ImportDetail>(`/api/gold/imports/${id}`),
    enabled: !!id,
  });

  const { data: groupsData } = useQuery({
    queryKey: ["shift-groups", "import", data?.siteId],
    queryFn: () =>
      fetchShiftGroups({ active: true, limit: 200, siteId: data?.siteId ?? undefined }),
    enabled: !!data?.siteId,
  });

  const { data: sitesData } = useQuery({
    queryKey: ["sites", "import"],
    queryFn: fetchSites,
  });

  const distinctNames = useMemo(() => {
    if (!data) return [] as string[];
    const set = new Set<string>();
    for (const e of data.entries) if (e.parsedName) set.add(e.parsedName);
    return Array.from(set).sort();
  }, [data]);

  const groups = groupsData?.data ?? [];
  const sites = sitesData ?? [];

  const patchMutation = useMutation({
    mutationFn: async (payload: { siteId?: string; mappings?: Record<string, string> }) =>
      fetchJson<ImportDetail>(`/api/gold/imports/${id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gold-import", id] });
    },
    onError: (err) => {
      toast({
        title: "Could not save",
        description: getApiErrorMessage(err),
        variant: "destructive",
      });
    },
  });

  const commitMutation = useMutation({
    mutationFn: async () =>
      fetchJson<ImportDetail & { summary?: CommitSummary }>(
        `/api/gold/imports/${id}/commit`,
        { method: "POST" },
      ),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["gold-import", id] });
      queryClient.invalidateQueries({ queryKey: ["gold-imports"] });
      queryClient.invalidateQueries({ queryKey: ["gold-summary"] });
      if (result.summary) setCommitResult(result.summary);
      toast({
        title: result.summary
          ? `${result.summary.allocationsCreated} allocations · ${result.summary.salesCreated} sales`
          : "Committed",
        description: "Ledger imported.",
        variant: "success",
      });
    },
  });

  // Mapping saves debounce + always send the FULL merged snapshot. The
  // PATCH handler reads-then-writes mappingsJson, so concurrent writes
  // can drop earlier deltas — but if every write contains the complete
  // set, "last-write-wins" still has all of it.
  const [localMappings, setLocalMappings] = useState<Record<string, string>>(
    {},
  );
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Sync local from server snapshot whenever data refreshes.
  useEffect(() => {
    if (!data) return;
    const serverMappings: Record<string, string> = data.mappingsJson
      ? JSON.parse(data.mappingsJson)
      : {};
    setLocalMappings((prev) => {
      const merged: Record<string, string> = { ...serverMappings };
      // Preserve any not-yet-flushed local edits.
      for (const [k, v] of Object.entries(prev)) {
        if (!merged[k]) merged[k] = v;
      }
      return merged;
    });
  }, [data?.mappingsJson, data]);
  useEffect(() => {
    return () => {
      if (flushTimer.current) clearTimeout(flushTimer.current);
    };
  }, []);

  if (isLoading) {
    return (
      <GoldShell activeTab="home" title="Loading import...">
        <Skeleton className="h-96 w-full" />
      </GoldShell>
    );
  }
  if (error || !data) {
    return (
      <GoldShell activeTab="home" title="Could not load import">
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error ? getApiErrorMessage(error) : "Not found"}</AlertDescription>
        </Alert>
      </GoldShell>
    );
  }

  const isLocked = data.status === "COMMITTED";
  const existingMappings: Record<string, string> = data.mappingsJson
    ? JSON.parse(data.mappingsJson)
    : {};
  // Sales-only or otherwise name-less imports are valid (the FIFO sales
  // pass handles them); only require mapping when there ARE distinct
  // names parsed from the ledger.
  const allMapped = distinctNames.every(
    (name) => !!(localMappings[name] || existingMappings[name]),
  );
  const siteIsSet = !!data.siteId;
  const canCommit = !isLocked && allMapped && siteIsSet;
  const mappedCount = distinctNames.filter(
    (n) => !!(localMappings[n] || existingMappings[n]),
  ).length;

  const setSiteAndSave = (newSiteId: string) => {
    if (!newSiteId || newSiteId === data.siteId) return;
    patchMutation.mutate({ siteId: newSiteId });
  };

  const setMappingAndSave = (name: string, shiftGroupId: string) => {
    if (!shiftGroupId) return;
    if (localMappings[name] === shiftGroupId) return;
    const nextMappings = { ...localMappings, [name]: shiftGroupId };
    setLocalMappings(nextMappings);
    if (flushTimer.current) clearTimeout(flushTimer.current);
    flushTimer.current = setTimeout(() => {
      patchMutation.mutate({ mappings: nextMappings });
    }, 350);
  };

  // Per-entry inline edit. Refuses for entries that already produced
  // records (server enforces too).
  const entryMutation = useMutation({
    mutationFn: async (input: {
      entryId: string;
      patch: {
        parsedDate?: string | null;
        gramsTotal?: number | null;
        expenses?: ExpenseBreakdown;
        boysGrams?: number | null;
        mdaraGrams?: number | null;
        balGrams?: number | null;
      };
    }) =>
      fetchJson<unknown>(
        `/api/gold/imports/${id}/entries/${input.entryId}`,
        {
          method: "PATCH",
          body: JSON.stringify(input.patch),
        },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gold-import", id] });
    },
    onError: (err) => {
      toast({
        title: "Could not save change",
        description: getApiErrorMessage(err),
        variant: "destructive",
      });
    },
  });

  const updateEntry = (
    entryId: string,
    patch: Parameters<typeof entryMutation.mutate>[0]["patch"],
  ) => {
    entryMutation.mutate({ entryId, patch });
  };

  return (
    <GoldShell
      activeTab="home"
      title={`Ledger: ${data.fileName}`}
      actions={
        <div className="flex gap-2">
          <Button asChild size="sm" variant="ghost">
            <Link href="/gold/import">
              <ChevronLeftIcon className="mr-1 h-4 w-4" /> All imports
            </Link>
          </Button>
          {!isLocked ? (
            <Button
              size="sm"
              disabled={!canCommit || commitMutation.isPending}
              onClick={() => commitMutation.mutate()}
            >
              {commitMutation.isPending ? "Committing..." : "Commit import"}
            </Button>
          ) : null}
        </div>
      }
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-4">
          <StatusChip
            status={
              data.status === "COMMITTED"
                ? "passing"
                : data.status === "FAILED"
                  ? "danger"
                  : "warning"
            }
            label={data.status}
          />
          <span className="text-sm text-muted-foreground">
            {data.rowsTotal} rows · {data.rowsCreated} created ·{" "}
            {data.rowsAnomaly} flagged · {data.rowsFailed} failed
          </span>
          <span className="text-sm text-muted-foreground">
            Uploaded by {data.uploadedBy?.name ?? "—"} on{" "}
            {new Date(data.createdAt).toLocaleString()}
          </span>
        </div>

        {/* Step indicator */}
        <ol className="flex flex-wrap gap-2 text-xs">
          <li
            className={`flex items-center gap-2 rounded-full border px-3 py-1.5 ${
              siteIsSet ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-amber-500 bg-amber-50 text-amber-700"
            }`}
          >
            <span className="font-bold">1</span>
            <span>Site {siteIsSet ? "✓" : "needed"}</span>
          </li>
          <li
            className={`flex items-center gap-2 rounded-full border px-3 py-1.5 ${
              allMapped ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-amber-500 bg-amber-50 text-amber-700"
            }`}
          >
            <span className="font-bold">2</span>
            <span>Mappings ({mappedCount}/{distinctNames.length})</span>
          </li>
          <li
            className={`flex items-center gap-2 rounded-full border px-3 py-1.5 ${
              isLocked ? "border-emerald-500 bg-emerald-50 text-emerald-700" : canCommit ? "border-blue-500 bg-blue-50 text-blue-700" : "border-muted text-muted-foreground"
            }`}
          >
            <span className="font-bold">3</span>
            <span>{isLocked ? "Committed" : canCommit ? "Ready to commit" : "Commit"}</span>
          </li>
        </ol>

        {commitMutation.error ? (
          <Alert variant="destructive">
            <AlertTitle>Commit failed</AlertTitle>
            <AlertDescription>{getApiErrorMessage(commitMutation.error)}</AlertDescription>
          </Alert>
        ) : null}

        {(commitResult ?? data.summary) ? (
          (() => {
            const summary = commitResult ?? data.summary!;
            return (
              <section className="rounded-lg border border-emerald-200 bg-emerald-50 p-5">
                <header className="flex items-center justify-between gap-3 mb-3">
                  <h2 className="font-semibold text-emerald-900">Commit results</h2>
                  <StatusChip status="passing" label="Done" />
                </header>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-emerald-800">Allocations</p>
                    <p className="text-lg font-semibold">{summary.allocationsCreated}</p>
                  </div>
                  <div>
                    <p className="text-xs text-emerald-800">Auto-pours</p>
                    <p className="text-lg font-semibold">{summary.poursCreated}</p>
                  </div>
                  <div>
                    <p className="text-xs text-emerald-800">Sales (FIFO)</p>
                    <p className="text-lg font-semibold">
                      {summary.salesCreated}
                      <span className="ml-1 text-xs font-normal text-muted-foreground">
                        ({summary.totalSaleGrams.toFixed(2)} g)
                      </span>
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-emerald-800">Inventory deficit</p>
                    <p className={`text-lg font-semibold ${summary.totalDeficitGrams > 0 ? "text-rose-700" : ""}`}>
                      {summary.totalDeficitGrams.toFixed(2)} g
                    </p>
                  </div>
                </div>
                <p className="mt-3 text-xs text-emerald-800">
                  {summary.rowsAnomaly > 0
                    ? `${summary.rowsAnomaly} rows flagged as anomalies — see the table below.`
                    : "All rows clean."}
                  {summary.rowsFailed > 0
                    ? ` ${summary.rowsFailed} rows failed and need attention.`
                    : ""}
                </p>
              </section>
            );
          })()
        ) : null}

        {!isLocked ? (
          <section className="rounded-lg border bg-card p-5 space-y-4">
            <header>
              <h2 className="font-semibold">1 · Pick site</h2>
              <p className="text-sm text-muted-foreground">
                Every row in this ledger belongs to one mine site. Saved instantly.
              </p>
            </header>
            <SearchableSelect
              value={data.siteId ?? undefined}
              options={sites.map((s) => ({ value: s.id, label: s.name, meta: s.code }))}
              placeholder="Pick site"
              searchPlaceholder="Search sites..."
              onValueChange={(v) => v && setSiteAndSave(v)}
            />
          </section>
        ) : null}

        {!isLocked ? (
          <section className="rounded-lg border bg-card p-5 space-y-4">
            <header>
              <h2 className="font-semibold">
                2 · Map shift leaders ({mappedCount}/{distinctNames.length})
              </h2>
              <p className="text-sm text-muted-foreground">
                {data.siteId
                  ? "Each name maps to a shift group. Members of that group will be marked PRESENT for every shift this leader logged. Saved instantly."
                  : "Pick a site first to load shift groups."}
              </p>
            </header>

            {distinctNames.length === 0 ? (
              <p className="text-sm text-muted-foreground">No leader names parsed.</p>
            ) : (
              <ul className="divide-y">
                {distinctNames.map((name) => {
                  const current =
                    localMappings[name] ?? existingMappings[name] ?? "";
                  const isMapped = !!current;
                  return (
                    <li
                      key={name}
                      className={`grid grid-cols-1 sm:grid-cols-[220px_1fr_24px] gap-3 py-3 items-center ${isMapped ? "" : "bg-amber-50/30 -mx-5 px-5"}`}
                    >
                      <span className="font-mono font-semibold">{name}</span>
                      <SearchableSelect
                        value={current || undefined}
                        options={groups.map((g) => ({
                          value: g.id,
                          label: g.name,
                          meta: g.leader?.name,
                        }))}
                        placeholder={
                          groups.length === 0
                            ? data.siteId
                              ? "No shift groups for this site"
                              : "Pick a site first"
                            : "Pick a shift group"
                        }
                        searchPlaceholder="Search groups..."
                        disabled={!data.siteId || groups.length === 0}
                        onValueChange={(v) => setMappingAndSave(name, v)}
                      />
                      {isMapped ? (
                        <span className="text-emerald-600 text-lg">✓</span>
                      ) : (
                        <span className="text-amber-500 text-lg">!</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ) : null}

        <section className="rounded-lg border bg-card">
          <header className="border-b px-5 py-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">
                {isLocked ? "Allocations & expenses" : "3 · Preview rows"}
              </h2>
              <p className="text-xs text-muted-foreground">
                {data.entries.length} rows ·{" "}
                <span className="text-emerald-700">CREATED</span>{" "}
                <span className="text-amber-700">ANOMALY</span>{" "}
                <span className="text-rose-700">FAILED</span>{" "}
                <span className="text-muted-foreground">PENDING</span>.{" "}
                {isLocked
                  ? "Already committed — reset the import to edit."
                  : "Click any number to edit before commit. Anomaly rows save with a flag and are reconciled later."}
              </p>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link href="/reports/gold-chain">Open full Chain Records →</Link>
            </Button>
          </header>
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-muted/40">
                <tr className="text-left">
                  <th className="px-2 py-2 w-10">#</th>
                  <th className="px-2 py-2">Date</th>
                  <th className="px-2 py-2">Leader / Group</th>
                  <th className="px-2 py-2 text-right">Gross</th>
                  {KNOWN_EXPENSE_TYPES.map((t) => (
                    <th key={t} className="px-2 py-2 text-right">
                      {t}
                    </th>
                  ))}
                  <th className="px-2 py-2 text-right">Other</th>
                  <th className="px-2 py-2 text-right">Σ exp</th>
                  <th className="px-2 py-2 text-right">Workers</th>
                  <th className="px-2 py-2 text-right">Company</th>
                  <th className="px-2 py-2 text-right">Co. total</th>
                  <th className="px-2 py-2 text-right">Bal</th>
                  <th className="px-2 py-2">Batch</th>
                  <th className="px-2 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.entries.map((e) => {
                  const expenses = parseExpenses(e.expensesJson);
                  const expenseTotal = expenses.reduce(
                    (sum, exp) => sum + exp.weight,
                    0,
                  );
                  const otherExpenses = expenses.filter(
                    (exp) =>
                      !KNOWN_EXPENSE_TYPES.some(
                        (t) => t.toLowerCase() === exp.type.toLowerCase(),
                      ),
                  );
                  const otherTotal = otherExpenses.reduce(
                    (s, x) => s + x.weight,
                    0,
                  );
                  const companyTotal =
                    e.mdaraGrams != null
                      ? +(e.mdaraGrams + expenseTotal).toFixed(3)
                      : null;
                  const mappedGroupId =
                    e.parsedName != null
                      ? localMappings[e.parsedName] ??
                        existingMappings[e.parsedName] ??
                        null
                      : null;
                  const groupName =
                    e.shiftGroup?.name ??
                    (mappedGroupId
                      ? groups.find((g) => g.id === mappedGroupId)?.name
                      : null);
                  const rowLocked = !!(
                    e.goldShiftAllocationId ||
                    e.goldPourId ||
                    e.buyerReceiptId ||
                    isLocked
                  );
                  const flagMessage = e.errorMessage ?? null;
                  const flagSeverity: "warning" | "danger" | null =
                    e.status === "FAILED"
                      ? "danger"
                      : e.status === "ANOMALY"
                        ? "warning"
                        : null;
                  const colCount = 15;
                  const setExpense = (type: string) => (next: number | null) => {
                    const nextExpenses = upsertExpense(expenses, type, next);
                    updateEntry(e.id, { expenses: nextExpenses });
                  };
                  return (
                    <Fragment key={e.id}>
                      <tr
                        className={cn(
                          "border-t align-top",
                          STATUS_ROW_TINT[e.status],
                        )}
                      >
                        <td className="px-2 py-1.5 text-muted-foreground">
                          {e.lineNo}
                        </td>
                        <td className="px-2 py-1.5">
                          <EditableDate
                            value={e.parsedDate}
                            onSave={(iso) =>
                              updateEntry(e.id, { parsedDate: iso })
                            }
                            disabled={rowLocked}
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <div className="font-mono font-semibold">
                            {e.parsedName ?? "—"}
                          </div>
                          {groupName ? (
                            <div className="text-[10px] text-muted-foreground">
                              {groupName}
                            </div>
                          ) : (
                            <div className="text-[10px] text-amber-700">
                              not mapped
                            </div>
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-right font-medium">
                          <EditableNumber
                            value={e.gramsTotal}
                            onSave={(n) =>
                              updateEntry(e.id, { gramsTotal: n })
                            }
                            disabled={rowLocked}
                          />
                        </td>
                        {KNOWN_EXPENSE_TYPES.map((t) => (
                          <td key={t} className="px-2 py-1.5 text-right">
                            <EditableNumber
                              value={expenseWeightFor(t, expenses)}
                              onSave={setExpense(t)}
                              disabled={rowLocked}
                            />
                          </td>
                        ))}
                        <td
                          className="px-2 py-1.5 text-right text-muted-foreground"
                          title={
                            otherExpenses.length === 0
                              ? "No other expense types"
                              : otherExpenses
                                  .map(
                                    (x) => `${x.type}: ${x.weight.toFixed(2)} g`,
                                  )
                                  .join(" · ")
                          }
                        >
                          {otherTotal > 0 ? (
                            <span>
                              {otherTotal.toFixed(2)}
                              <span className="ml-1 text-[10px]">
                                ({otherExpenses.length})
                              </span>
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-right font-medium">
                          {expenseTotal > 0 ? grams(expenseTotal) : "—"}
                        </td>
                        <td className="px-2 py-1.5 text-right text-blue-700">
                          <EditableNumber
                            value={e.boysGrams}
                            onSave={(n) =>
                              updateEntry(e.id, { boysGrams: n })
                            }
                            disabled={rowLocked}
                          />
                        </td>
                        <td className="px-2 py-1.5 text-right text-emerald-700">
                          <EditableNumber
                            value={e.mdaraGrams}
                            onSave={(n) =>
                              updateEntry(e.id, { mdaraGrams: n })
                            }
                            disabled={rowLocked}
                          />
                        </td>
                        <td className="px-2 py-1.5 text-right font-medium">
                          {grams(companyTotal)}
                        </td>
                        <td
                          className={cn(
                            "px-2 py-1.5 text-right",
                            e.balGrams != null &&
                              e.balGrams < 0 &&
                              "font-semibold text-rose-700",
                          )}
                        >
                          <EditableNumber
                            value={e.balGrams}
                            onSave={(n) => updateEntry(e.id, { balGrams: n })}
                            disabled={rowLocked}
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          {e.goldShiftAllocationId ? (
                            <Link
                              href={`/gold/insights/allocations/${e.goldShiftAllocationId}`}
                              className="text-primary hover:underline"
                            >
                              allocation →
                            </Link>
                          ) : e.goldPourId ? (
                            <Link
                              href={`/gold/intake/pours/${e.goldPourId}`}
                              className="text-primary hover:underline"
                            >
                              bare pour →
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                          {e.buyerReceiptId ? (
                            <Link
                              href={`/gold/settlement/receipts/${e.buyerReceiptId}`}
                              className="ml-2 text-primary hover:underline"
                            >
                              sale →
                            </Link>
                          ) : null}
                        </td>
                        <td className="px-2 py-1.5">
                          <StatusChip
                            status={STATUS_TONE[e.status]}
                            label={e.status}
                          />
                        </td>
                      </tr>
                      {flagMessage ? (
                        <tr
                          className={cn(
                            "border-t",
                            flagSeverity === "danger"
                              ? "bg-rose-50/60"
                              : "bg-amber-50/60",
                          )}
                        >
                          <td colSpan={colCount} className="px-2 py-1.5">
                            <div
                              className={cn(
                                "flex items-start gap-2 text-[11px]",
                                flagSeverity === "danger"
                                  ? "text-rose-800"
                                  : "text-amber-800",
                              )}
                            >
                              <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                              <div>
                                <span className="font-semibold">
                                  {flagSeverity === "danger"
                                    ? "Failed:"
                                    : "Anomaly:"}
                                </span>{" "}
                                {flagMessage}
                                {e.parserWarning &&
                                e.parserWarning !== flagMessage ? (
                                  <span className="ml-2 italic opacity-80">
                                    (parser: {e.parserWarning})
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
              <tfoot className="bg-muted/30 text-[11px] font-medium">
                {(() => {
                  const totals = data.entries.reduce(
                    (acc, e) => {
                      const expList = parseExpenses(e.expensesJson);
                      const exp = expList.reduce((s, x) => s + x.weight, 0);
                      const perType: Record<string, number> = { ...acc.perType };
                      for (const t of KNOWN_EXPENSE_TYPES) {
                        const w = expenseWeightFor(t, expList) ?? 0;
                        perType[t] = (perType[t] ?? 0) + w;
                      }
                      const otherTotal = expList
                        .filter(
                          (x) =>
                            !KNOWN_EXPENSE_TYPES.some(
                              (t) =>
                                t.toLowerCase() === x.type.toLowerCase(),
                            ),
                        )
                        .reduce((s, x) => s + x.weight, 0);
                      return {
                        gross: acc.gross + (e.gramsTotal ?? 0),
                        expense: acc.expense + exp,
                        other: acc.other + otherTotal,
                        boys: acc.boys + (e.boysGrams ?? 0),
                        mdara: acc.mdara + (e.mdaraGrams ?? 0),
                        bal:
                          acc.bal +
                          (e.balGrams != null && e.balGrams < 0
                            ? e.balGrams
                            : 0),
                        perType,
                      };
                    },
                    {
                      gross: 0,
                      expense: 0,
                      other: 0,
                      boys: 0,
                      mdara: 0,
                      bal: 0,
                      perType: {} as Record<string, number>,
                    },
                  );
                  return (
                    <tr className="border-t">
                      <td className="px-2 py-2" colSpan={3}>
                        Totals ({data.entries.length} rows)
                      </td>
                      <td className="px-2 py-2 text-right">
                        {grams(totals.gross)}
                      </td>
                      {KNOWN_EXPENSE_TYPES.map((t) => (
                        <td key={t} className="px-2 py-2 text-right">
                          {totals.perType[t]
                            ? grams(totals.perType[t])
                            : "—"}
                        </td>
                      ))}
                      <td className="px-2 py-2 text-right">
                        {totals.other > 0 ? grams(totals.other) : "—"}
                      </td>
                      <td className="px-2 py-2 text-right">
                        {grams(totals.expense)}
                      </td>
                      <td className="px-2 py-2 text-right text-blue-700">
                        {grams(totals.boys)}
                      </td>
                      <td className="px-2 py-2 text-right text-emerald-700">
                        {grams(totals.mdara)}
                      </td>
                      <td className="px-2 py-2 text-right">
                        {grams(totals.mdara + totals.expense)}
                      </td>
                      <td className="px-2 py-2 text-right text-rose-700">
                        {totals.bal === 0 ? "—" : grams(totals.bal)}
                      </td>
                      <td className="px-2 py-2" colSpan={2} />
                    </tr>
                  );
                })()}
              </tfoot>
            </table>
          </div>
        </section>
      </div>
    </GoldShell>
  );
}
