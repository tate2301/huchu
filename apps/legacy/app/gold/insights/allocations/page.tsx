"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { GoldShell } from "@/components/gold/gold-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusChip } from "@/components/ui/status-chip";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { ChevronRight, Coins } from "@/lib/icons";
import { ClientDate } from "@/components/ui/client-date";

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
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { data: session } = useSession();
  const role = (session?.user as { role?: string } | undefined)?.role;
  const canApprove = role === "MANAGER" || role === "SUPERADMIN";
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading, error } = useQuery({
    queryKey: ["gold-allocations-list", filter],
    queryFn: () =>
      fetchJson<ListResponse>(
        `/api/gold/shift-allocations?limit=200${
          filter ? `&workflowStatus=${filter}` : ""
        }`,
      ),
  });

  const bulkApprove = useMutation({
    mutationFn: async (ids: string[]) => {
      const results = await Promise.allSettled(
        ids.map((aid) =>
          fetchJson(`/api/gold/shift-allocations/${aid}/approve`, {
            method: "POST",
          }),
        ),
      );
      const failed = results.filter((r) => r.status === "rejected");
      return { total: ids.length, failed: failed.length };
    },
    onSuccess: ({ total, failed }) => {
      queryClient.invalidateQueries({ queryKey: ["gold-allocations-list"] });
      setSelected(new Set());
      toast({
        title: `Approved ${total - failed} of ${total}`,
        description:
          failed > 0
            ? `${failed} could not be approved (already approved or wrong status). Open them to inspect.`
            : "All selected allocations approved.",
        variant: failed > 0 ? "destructive" : "success",
      });
    },
  });

  const bulkSubmit = useMutation({
    mutationFn: async (ids: string[]) => {
      const results = await Promise.allSettled(
        ids.map((aid) =>
          fetchJson(`/api/gold/shift-allocations/${aid}/submit`, {
            method: "POST",
          }),
        ),
      );
      const failed = results.filter((r) => r.status === "rejected");
      return { total: ids.length, failed: failed.length };
    },
    onSuccess: ({ total, failed }) => {
      queryClient.invalidateQueries({ queryKey: ["gold-allocations-list"] });
      setSelected(new Set());
      toast({
        title: `Submitted ${total - failed} of ${total}`,
        variant: failed > 0 ? "destructive" : "success",
      });
    },
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
                Every shift&apos;s gold output, splits, and approval status. Click a
                row to drill in, mark attendance, submit/approve, or follow the
                auto-pour through to its sale.
              </p>
            </div>
          </div>
        </header>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <nav className="flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <Button
                key={f.value}
                size="sm"
                variant={filter === f.value ? "default" : "outline"}
                onClick={() => {
                  setFilter(f.value);
                  setSelected(new Set());
                }}
              >
                {f.label}
                <span className="ml-2 rounded-full bg-muted px-1.5 text-xs">
                  {f.value === "" ? counts.ALL ?? 0 : counts[f.value] ?? 0}
                </span>
              </Button>
            ))}
          </nav>

          {canApprove && selected.size > 0 ? (
            <div className="flex items-center gap-2 rounded-md border bg-amber-50 px-3 py-1.5 text-sm">
              <span className="font-medium">{selected.size} selected</span>
              <Button
                size="sm"
                variant="outline"
                disabled={bulkSubmit.isPending}
                onClick={() => bulkSubmit.mutate(Array.from(selected))}
              >
                Submit
              </Button>
              <Button
                size="sm"
                disabled={bulkApprove.isPending}
                onClick={() => bulkApprove.mutate(Array.from(selected))}
              >
                Approve all
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSelected(new Set())}
              >
                Clear
              </Button>
            </div>
          ) : null}
        </div>

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
                  {canApprove ? (
                    <th className="px-3 py-2.5 w-8">
                      <Checkbox
                        checked={
                          selected.size > 0 && selected.size === rows.length
                        }
                        onCheckedChange={(value) => {
                          if (value === true) {
                            setSelected(new Set(rows.map((r) => r.id)));
                          } else {
                            setSelected(new Set());
                          }
                        }}
                        aria-label="Select all"
                      />
                    </th>
                  ) : null}
                  <th className="px-4 py-2.5">Date</th>
                  <th className="px-4 py-2.5">Shift</th>
                  <th className="px-4 py-2.5">Site</th>
                  <th className="px-4 py-2.5 text-right">Gross</th>
                  <th className="px-4 py-2.5 text-right" title="Workers share">W: Workers</th>
                  <th className="px-4 py-2.5 text-right" title="Company share">C: Company</th>
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
                    {canApprove ? (
                      <td className="px-3 py-2">
                        <Checkbox
                          checked={selected.has(r.id)}
                          onCheckedChange={(value) =>
                            setSelected((prev) => {
                              const next = new Set(prev);
                              if (value === true) next.add(r.id);
                              else next.delete(r.id);
                              return next;
                            })
                          }
                          aria-label={`Select allocation ${r.id}`}
                        />
                      </td>
                    ) : null}
                    <td className="px-4 py-2 whitespace-nowrap">
                      <ClientDate value={r.date} mode="date" />
                    </td>
                    <td className="px-4 py-2 font-mono text-xs">{r.shift}</td>
                    <td className="px-4 py-2">{r.site.name}</td>
                    <td className="px-4 py-2 text-right font-medium">
                      {grams(r.totalWeight)}
                    </td>
                    <td className="px-4 py-2 text-right text-blue-700">
                      <span className="sr-only">W: </span>{grams(r.workerShareWeight)}
                    </td>
                    <td className="px-4 py-2 text-right text-emerald-700">
                      <span className="sr-only">C: </span>{grams(r.companyShareWeight)}
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
