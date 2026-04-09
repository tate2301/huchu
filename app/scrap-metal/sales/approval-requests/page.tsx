"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useSession } from "next-auth/react";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ScrapShell } from "@/components/scrap-metal/scrap-shell";
import { StatusState } from "@/components/shared/status-state";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { hasRole } from "@/lib/roles";

type ApprovalRequestSale = {
  id: string;
  saleNumber: string;
  saleDate: string;
  buyerName: string;
  soldWeight: number;
  currency: string;
  totalAmount: number;
  status: string;
  notes?: string | null;
  createdBy?: { id: string; name: string } | null;
  batch: { batchNumber: string };
};

export default function ScrapSalesApprovalRequestsPage() {
  const { data: session } = useSession();
  const canManageSales = hasRole((session?.user as { role?: string } | undefined)?.role, ["SUPERADMIN", "MANAGER"]);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const requestsQuery = useQuery({
    queryKey: ["scrap-sale-approval-requests"],
    queryFn: async () => {
      const response = await fetchJson<{ data: ApprovalRequestSale[] }>("/api/scrap-metal/sales?status=DRAFT&limit=400");
      return response.data.filter((sale) => (sale.notes ?? "").includes("[APPROVAL_REQUESTED]"));
    },
  });

  const submitMutation = useMutation({
    mutationFn: (id: string) =>
      fetchJson(`/api/scrap-metal/sales/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "PENDING_APPROVAL" }),
      }),
    onSuccess: () => {
      toast({ title: "Request moved to pending approval", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["scrap-sale-approval-requests"] });
      queryClient.invalidateQueries({ queryKey: ["scrap-metal-sales"] });
    },
    onError: (error) => {
      toast({ title: "Unable to submit request", description: getApiErrorMessage(error), variant: "destructive" });
    },
  });

  const columns = useMemo<ColumnDef<ApprovalRequestSale>[]>(() => [
    { id: "ticket", header: "Ticket #", accessorKey: "saleNumber" },
    { id: "date", header: "Date", cell: ({ row }) => new Date(row.original.saleDate).toLocaleDateString() },
    { id: "lot", header: "Lot", cell: ({ row }) => row.original.batch.batchNumber },
    { id: "buyer", header: "Buyer", accessorKey: "buyerName" },
    { id: "requestedBy", header: "Requested By", cell: ({ row }) => row.original.createdBy?.name ?? "-" },
    { id: "amount", header: "Amount", cell: ({ row }) => `${row.original.currency} ${row.original.totalAmount.toFixed(2)}` },
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
            disabled={!canManageSales || submitMutation.isPending}
            title={!canManageSales ? "Manager approval is required to submit requests." : undefined}
            onClick={() => submitMutation.mutate(row.original.id)}
          >
            Submit
          </Button>
        </div>
      ),
    },
  ], [canManageSales, submitMutation]);

  if (requestsQuery.error) {
    return (
      <ScrapShell title="Approval Requests">
        <StatusState variant="error" title="Unable to load approval requests" />
      </ScrapShell>
    );
  }

  return (
    <ScrapShell
      title="Approval Requests"
     
      actions={
        <div className="flex gap-2">
          <Button asChild size="sm" variant="outline"><Link href="/scrap-metal/sales">Outbound Tickets</Link></Button>
          <Button asChild size="sm" variant="outline"><Link href="/scrap-metal/tickets/held">Held Tickets</Link></Button>
        </div>
      }
    >
      <DataTable
        data={requestsQuery.data ?? []}
        columns={columns}
        searchPlaceholder="Search approval requests"
        pagination={{ enabled: true }}
        emptyState={requestsQuery.isLoading ? "Loading approval requests..." : "No approval requests yet."}
      />
    </ScrapShell>
  );
}

