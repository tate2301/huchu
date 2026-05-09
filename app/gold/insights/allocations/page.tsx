"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { GoldShell } from "@/components/gold/gold-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusChip } from "@/components/ui/status-chip";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { ChevronRight, Coins } from "@/lib/icons";

type AllocationRow = {
  id: string;
  date: string;
  shift: string;
  totalWeight: number;
  netWeight: number;
  workerShareWeight: number;
  companyShareWeight: number;
  workflowStatus: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";
  site: { name: string; code: string };
  shiftReport: { id: string; status: string; crewCount: number } | null;
  createdBy: { id: string; name: string } | null;
};

type ListResponse = {
  data: AllocationRow[];
  pagination: { total: number };
};

const FILTERS = [
  { value: "", label: "All" },
  { value: "DRAFT", label: "Draft" },
  { value: "SUBMITTED", label: "Submitted" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
];

const STATUS_TONE: Record<
  AllocationRow["workflowStatus"],
  Parameters<typeof StatusChip>[0]["status"]
> = {
  DRAFT: "pending",
  SUBMITTED: "warning",
  APPROVED: "passing",
  REJECTED: "danger",
};

const grams = (n: number) => `${n.toFixed(3)} g`;

export default function AllocationsListPage() {
  const [filter, setFilter] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["gold-allocations-list", filter],
    queryFn: () =>
      fetchJson<ListResponse>(
        `/api/gold/shift-allocations?limit=200${
          filter ? `&workflowStatus=${filter}` : ""
        }`,
      ),
  });

  const rows = useMemo(() => data?.data ?? [], [data]);
  const counts = useMemo(() => {
    const result: Record<string, number> = { ALL: rows.length };
    for (const r of rows) {
      result[r.workflowStatus] = (result[r.workflowStatus] ?? 0) + 1;
    }
    return result;
  }, [rows]);

  return (
    <GoldShell
      activeTab="payouts"
      title="Shift allocations"
      actions={
        <Button asChild size="sm">
          <Link href="/gold/shift-output/new">Record Shift Output</Link>
        </Button>
      }
    >
      <div className="space-y-5">
        <header className="rounded-lg border bg-card p-4">
          <div className="flex items-start gap-3">
            <Coins className="h-5 w-5 text-amber-600 mt-1" />
            <div>
              <h2 className="font-semibold">Allocation queue</h2>
              <p className="text-sm text-muted-foreground">
                Every shift's gold output, splits, and approval status. Click a
                row to drill in, mark attendance, submit/approve, or follow the
                auto-pour through to its sale.
              </p>
            </div>
          </div>
        </header>

        <nav className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <Button
              key={f.value}
              size="sm"
              variant={filter === f.value ? "default" : "outline"}
              onClick={() => setFilter(f.value)}
            >
              {f.label}
              <span className="ml-2 rounded-full bg-muted px-1.5 text-xs">
                {f.value === "" ? counts.ALL ?? 0 : counts[f.value] ?? 0}
              </span>
            </Button>
          ))}
        </nav>

        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Could not load</AlertTitle>
            <AlertDescription>{getApiErrorMessage(error)}</AlertDescription>
          </Alert>
        ) : null}

        <section className="rounded-lg border bg-card overflow-hidden">
          {isLoading ? (
            <div className="p-4">
              <Skeleton className="h-40 w-full" />
            </div>
          ) : rows.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground text-center">
              No allocations match this filter.
            </p>
          ) : (
            <table className="min-w-full text-sm">
              <thead className="bg-muted/40">
                <tr className="text-left">
                  <th className="px-4 py-2.5">Date</th>
                  <th className="px-4 py-2.5">Shift</th>
                  <th className="px-4 py-2.5">Site</th>
                  <th className="px-4 py-2.5 text-right">Gross</th>
                  <th className="px-4 py-2.5 text-right">Boys</th>
                  <th className="px-4 py-2.5 text-right">Mdara</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5 w-8" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    className="border-t hover:bg-muted/30 transition-colors"
                  >
                    <td className="px-4 py-2 whitespace-nowrap">
                      {new Date(r.date).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs">{r.shift}</td>
                    <td className="px-4 py-2">{r.site.name}</td>
                    <td className="px-4 py-2 text-right font-medium">
                      {grams(r.totalWeight)}
                    </td>
                    <td className="px-4 py-2 text-right text-blue-700">
                      {grams(r.workerShareWeight)}
                    </td>
                    <td className="px-4 py-2 text-right text-emerald-700">
                      {grams(r.companyShareWeight)}
                    </td>
                    <td className="px-4 py-2">
                      <StatusChip
                        status={STATUS_TONE[r.workflowStatus]}
                        label={r.workflowStatus}
                      />
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Link
                        href={`/gold/insights/allocations/${r.id}`}
                        className="text-primary hover:underline"
                      >
                        <ChevronRight className="h-4 w-4 inline" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </GoldShell>
  );
}
