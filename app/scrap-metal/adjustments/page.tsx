"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ScrapMobileCard, ScrapMobileCardActions, ScrapMobileCardHeader, ScrapMobileMetricStrip } from "@/components/scrap-metal/mobile-list-card";
import { ScrapShell } from "@/components/scrap-metal/scrap-shell";
import { StatusState } from "@/components/shared/status-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { Calendar, ReceiptLong, Scale, User } from "@/lib/icons";

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
          <ScrapMobileCard>
            <ScrapMobileCardHeader
              title={row.saleNumber}
              subtitle={row.batch.batchNumber}
              aside={row.reviewed ? <Badge>Reviewed</Badge> : <Badge variant="outline">Open</Badge>}
            />
            <ScrapMobileMetricStrip
              items={[
                { icon: Scale, value: `${row.weightDiscrepancy.toFixed(2)} kg`, srLabel: "Variance" },
                { icon: ReceiptLong, value: row.status, srLabel: "Status" },
                { icon: User, value: row.buyerName, srLabel: "Buyer" },
                { icon: Calendar, value: new Date(row.saleDate).toLocaleDateString(), srLabel: "Date" },
              ]}
            />
            {!row.reviewed ? (
              <ScrapMobileCardActions>
                <Button size="sm" variant="outline" onClick={() => reviewMutation.mutate(row)} disabled={reviewMutation.isPending}>
                  Mark Reviewed
                </Button>
              </ScrapMobileCardActions>
            ) : null}
          </ScrapMobileCard>
        )}
      />
    </ScrapShell>
  );
}
