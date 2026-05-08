"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
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
import { ChevronLeftIcon } from "@/lib/icons";

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
  buyerReceiptId: string | null;
  errorMessage: string | null;
  shiftGroup: { id: string; name: string } | null;
};

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
  const allMapped =
    distinctNames.length > 0 && distinctNames.every((name) => !!existingMappings[name]);
  const siteIsSet = !!data.siteId;
  const canCommit = !isLocked && allMapped && siteIsSet;
  const mappedCount = distinctNames.filter((n) => !!existingMappings[n]).length;

  const setSiteAndSave = (newSiteId: string) => {
    if (!newSiteId || newSiteId === data.siteId) return;
    patchMutation.mutate({ siteId: newSiteId });
  };

  const setMappingAndSave = (name: string, shiftGroupId: string) => {
    if (!shiftGroupId) return;
    if (existingMappings[name] === shiftGroupId) return;
    patchMutation.mutate({ mappings: { [name]: shiftGroupId } });
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
                  const current = existingMappings[name] ?? "";
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
          <header className="border-b px-5 py-3">
            <h2 className="font-semibold">3 · Preview rows</h2>
            <p className="text-xs text-muted-foreground">
              {data.entries.length} rows. Negative Bal = sale out. Flagged rows
              will be created as exceptions on commit.
            </p>
          </header>
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-muted/40">
                <tr className="text-left">
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Leader</th>
                  <th className="px-3 py-2">Group</th>
                  <th className="px-3 py-2 text-right">Grams</th>
                  <th className="px-3 py-2 text-right">Boys</th>
                  <th className="px-3 py-2 text-right">Mdara</th>
                  <th className="px-3 py-2 text-right">Bal</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.entries.map((e) => {
                  const tone =
                    e.status === "CREATED"
                      ? "passing"
                      : e.status === "ANOMALY"
                        ? "warning"
                        : e.status === "FAILED"
                          ? "danger"
                          : "pending";
                  return (
                    <tr key={e.id} className="border-t">
                      <td className="px-3 py-1.5">{e.lineNo}</td>
                      <td className="px-3 py-1.5">
                        {e.parsedDate ? new Date(e.parsedDate).toLocaleDateString() : "—"}
                      </td>
                      <td className="px-3 py-1.5 font-mono">{e.parsedName ?? "—"}</td>
                      <td className="px-3 py-1.5 text-muted-foreground">
                        {e.shiftGroup?.name ?? (e.parsedName && existingMappings[e.parsedName]
                          ? groups.find((g) => g.id === existingMappings[e.parsedName!])?.name
                          : "—")}
                      </td>
                      <td className="px-3 py-1.5 text-right">{grams(e.gramsTotal)}</td>
                      <td className="px-3 py-1.5 text-right">{grams(e.boysGrams)}</td>
                      <td className="px-3 py-1.5 text-right">{grams(e.mdaraGrams)}</td>
                      <td
                        className={`px-3 py-1.5 text-right ${
                          e.balGrams != null && e.balGrams < 0 ? "text-rose-600 font-semibold" : ""
                        }`}
                      >
                        {grams(e.balGrams)}
                      </td>
                      <td className="px-3 py-1.5">
                        <StatusChip status={tone} label={e.status} />
                        {e.errorMessage ? (
                          <p className="mt-0.5 text-[10px] text-muted-foreground">
                            {e.errorMessage}
                          </p>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </GoldShell>
  );
}
