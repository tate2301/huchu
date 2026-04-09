"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ScrapShell } from "@/components/scrap-metal/scrap-shell";
import { StatusState } from "@/components/shared/status-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";

type Sale = {
  id: string;
  saleNumber: string;
  saleDate: string;
  buyerName: string;
  weightDiscrepancy: number;
  status: string;
  notes?: string | null;
  batch: { batchNumber: string };
};

const ADJUSTMENT_REVIEW_TAG = "[ADJUSTMENT_REVIEWED]";

export default function ScrapAdjustmentsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["scrap-adjustment-register"],
    queryFn: async () => {
      const response = await fetchJson<{ data: Sale[] }>("/api/scrap-metal/sales?limit=600");
      return response.data.filter((sale) => Math.abs(sale.weightDiscrepancy) > 0.0001);
    },
  });

  const reviewMutation = useMutation({
    mutationFn: (sale: Sale) => {
      const existingNotes = sale.notes?.trim() ?? "";
      const mergedNotes = existingNotes.includes(ADJUSTMENT_REVIEW_TAG)
        ? existingNotes
        : `${existingNotes}\n${ADJUSTMENT_REVIEW_TAG}`.trim();
      return fetchJson(`/api/scrap-metal/sales/${sale.id}`, {
        method: "PATCH",
        body: JSON.stringify({ notes: mergedNotes }),
      });
    },
    onSuccess: () => {
      toast({ title: "Adjustment marked as reviewed", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["scrap-adjustment-register"] });
      queryClient.invalidateQueries({ queryKey: ["scrap-metal-sales"] });
    },
    onError: (error) => {
      toast({ title: "Unable to update adjustment", description: getApiErrorMessage(error), variant: "destructive" });
    },
  });

  const rows = useMemo(
    () =>
      (query.data ?? []).map((row) => ({
        ...row,
        reviewed: (row.notes ?? "").includes(ADJUSTMENT_REVIEW_TAG),
      })),
    [query.data],
  );

  const columns = useMemo<ColumnDef<(typeof rows)[number]>[]>(() => [
    { id: "ticket", header: "Outbound Ticket", accessorKey: "saleNumber" },
    { id: "date", header: "Date", cell: ({ row }) => new Date(row.original.saleDate).toLocaleDateString() },
    { id: "lot", header: "Lot", cell: ({ row }) => row.original.batch.batchNumber },
    { id: "buyer", header: "Buyer", accessorKey: "buyerName" },
    {
      id: "variance",
      header: "Variance (kg)",
      cell: ({ row }) => (
        <span className={row.original.weightDiscrepancy > 0 ? "font-mono text-destructive" : "font-mono"}>
          {row.original.weightDiscrepancy.toFixed(2)}
        </span>
      ),
    },
    {
      id: "review",
      header: "Review",
      cell: ({ row }) =>
        row.original.reviewed ? <Badge>Reviewed</Badge> : <Badge variant="outline">Pending</Badge>,
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" asChild>
            <Link href={`/scrap-metal/sales?edit=${row.original.id}`}>Open</Link>
          </Button>
          <Button
            size="sm"
            disabled={reviewMutation.isPending || row.original.reviewed}
            onClick={() => reviewMutation.mutate(row.original)}
          >
            Mark Reviewed
          </Button>
        </div>
      ),
    },
  ], [reviewMutation]);

  if (query.error) {
    return (
      <ScrapShell title="Adjustments / Write-offs">
        <StatusState variant="error" title="Unable to load adjustment register" />
      </ScrapShell>
    );
  }

  return (
    <ScrapShell
      title="Adjustments / Write-offs"
     
      actions={
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline"><Link href="/scrap-metal/sales">Outbound Tickets</Link></Button>
          <Button asChild size="sm" variant="outline"><Link href="/scrap-metal/reports/variance-aging">Variance & Aging</Link></Button>
        </div>
      }
    >
      <DataTable
        data={rows}
        columns={columns}
        searchPlaceholder="Search by ticket, lot, or buyer"
        pagination={{ enabled: true }}
        emptyState={query.isLoading ? "Loading adjustments..." : "No adjustment entries yet."}
        mobileCardRenderer={({ row }) => (
          <article className="space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold">{row.saleNumber}</p>
                <p className="text-xs text-muted-foreground">{row.batch.batchNumber}</p>
              </div>
              {row.reviewed ? <Badge>Reviewed</Badge> : <Badge variant="outline">Open</Badge>}
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Variance (kg)</p>
                <p className="font-semibold">{row.weightDiscrepancy.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Status</p>
                <p className="font-semibold">{row.status}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Buyer</p>
                <p className="font-semibold">{row.buyerName}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Date</p>
                <p className="font-semibold">{new Date(row.saleDate).toLocaleDateString()}</p>
              </div>
            </div>
            {!row.reviewed ? (
              <Button size="sm" variant="outline" onClick={() => reviewMutation.mutate(row)} disabled={reviewMutation.isPending}>
                Mark Reviewed
              </Button>
            ) : null}
          </article>
        )}
      />
    </ScrapShell>
  );
}
