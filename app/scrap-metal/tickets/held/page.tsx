"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

import { ScrapShell } from "@/components/scrap-metal/scrap-shell";
import { StatusState } from "@/components/shared/status-state";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { VerticalDataViews } from "@/components/ui/vertical-data-views";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { hasRole } from "@/lib/roles";

type HeldPurchase = {
  id: string;
  purchaseNumber: string;
  purchaseDate: string;
  sellerName?: string | null;
  category: string;
  weight: number;
  totalAmount: number;
  currency: string;
  status: string;
};

type HeldSale = {
  id: string;
  saleNumber: string;
  saleDate: string;
  buyerName: string;
  soldWeight: number;
  totalAmount: number;
  currency: string;
  status: string;
};

export default function HeldTicketsPage() {
  const { data: session } = useSession();
  const canManageSales = hasRole((session?.user as { role?: string } | undefined)?.role, ["SUPERADMIN", "MANAGER"]);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeView, setActiveView] = useState("inbound");

  const heldPurchasesQuery = useQuery({
    queryKey: ["scrap-held-inbound-tickets"],
    queryFn: async () => {
      const response = await fetchJson<{ data: HeldPurchase[] }>("/api/scrap-metal/purchases?status=DRAFT&limit=300");
      return response.data;
    },
  });

  const heldSalesQuery = useQuery({
    queryKey: ["scrap-held-outbound-tickets"],
    queryFn: async () => {
      const response = await fetchJson<{ data: HeldSale[] }>("/api/scrap-metal/sales?status=DRAFT&limit=300");
      return response.data;
    },
  });

  const finalizeInboundMutation = useMutation({
    mutationFn: (id: string) =>
      fetchJson(`/api/scrap-metal/purchases/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "POSTED" }),
      }),
    onSuccess: () => {
      toast({ title: "Inbound ticket finalized", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["scrap-held-inbound-tickets"] });
      queryClient.invalidateQueries({ queryKey: ["scrap-metal-purchases"] });
      queryClient.invalidateQueries({ queryKey: ["scrap-metal-dashboard-v2"] });
    },
    onError: (error) => {
      toast({
        title: "Unable to finalize inbound ticket",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const finalizeOutboundMutation = useMutation({
    mutationFn: (id: string) =>
      fetchJson(`/api/scrap-metal/sales/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "PENDING_APPROVAL" }),
      }),
    onSuccess: () => {
      toast({ title: "Outbound ticket submitted for approval", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["scrap-held-outbound-tickets"] });
      queryClient.invalidateQueries({ queryKey: ["scrap-metal-sales"] });
    },
    onError: (error) => {
      toast({
        title: "Unable to submit outbound ticket",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const inboundColumns = useMemo<ColumnDef<HeldPurchase>[]>(
    () => [
      { id: "ticket", header: "Ticket #", accessorKey: "purchaseNumber" },
      {
        id: "date",
        header: "Date",
        cell: ({ row }) => new Date(row.original.purchaseDate).toLocaleDateString(),
      },
      { id: "supplier", header: "Supplier", accessorFn: (row) => row.sellerName || "-" },
      { id: "material", header: "Material", accessorKey: "category" },
      {
        id: "amount",
        header: "Amount",
        cell: ({ row }) => `${row.original.currency} ${row.original.totalAmount.toFixed(2)}`,
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" asChild>
              <Link href={`/scrap-metal/purchases?edit=${row.original.id}`}>Resume</Link>
            </Button>
            <Button
              size="sm"
              onClick={() => finalizeInboundMutation.mutate(row.original.id)}
              disabled={finalizeInboundMutation.isPending}
            >
              Finalize
            </Button>
          </div>
        ),
      },
    ],
    [finalizeInboundMutation],
  );

  const outboundColumns = useMemo<ColumnDef<HeldSale>[]>(
    () => [
      { id: "ticket", header: "Ticket #", accessorKey: "saleNumber" },
      {
        id: "date",
        header: "Date",
        cell: ({ row }) => new Date(row.original.saleDate).toLocaleDateString(),
      },
      { id: "buyer", header: "Buyer", accessorKey: "buyerName" },
      {
        id: "amount",
        header: "Amount",
        cell: ({ row }) => `${row.original.currency} ${row.original.totalAmount.toFixed(2)}`,
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" asChild>
              <Link href={`/scrap-metal/sales?edit=${row.original.id}`}>Resume</Link>
            </Button>
            <Button
              size="sm"
              onClick={() => finalizeOutboundMutation.mutate(row.original.id)}
              disabled={finalizeOutboundMutation.isPending || !canManageSales}
              title={!canManageSales ? "Manager approval is required to submit outbound tickets." : undefined}
            >
              {canManageSales ? "Submit" : "Manager Needed"}
            </Button>
          </div>
        ),
      },
    ],
    [canManageSales, finalizeOutboundMutation],
  );

  const views = [
    { id: "inbound", label: "Inbound Drafts", count: heldPurchasesQuery.data?.length ?? 0 },
    { id: "outbound", label: "Outbound Drafts", count: heldSalesQuery.data?.length ?? 0 },
  ];

  return (
    <ScrapShell
      title="Held / Draft Tickets"
      actions={
        <div className="flex gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href="/scrap-metal/purchases">Inbound Tickets</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/scrap-metal/sales">Outbound Tickets</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/scrap-metal/sales/approval-requests">Approval Requests</Link>
          </Button>
        </div>
      }
    >
      <VerticalDataViews items={views} value={activeView} onValueChange={setActiveView} railLabel="Ticket Type">
        {activeView === "inbound" ? (
          heldPurchasesQuery.error ? (
            <StatusState variant="error" title="Unable to load held inbound tickets" description={getApiErrorMessage(heldPurchasesQuery.error)} />
          ) : (
            <DataTable
              data={heldPurchasesQuery.data ?? []}
              columns={inboundColumns}
              searchPlaceholder="Search inbound draft ticket"
              pagination={{ enabled: true }}
              emptyState={heldPurchasesQuery.isLoading ? "Loading held tickets..." : "No held inbound tickets."}
            />
          )
        ) : heldSalesQuery.error ? (
          <StatusState variant="error" title="Unable to load held outbound tickets" description={getApiErrorMessage(heldSalesQuery.error)} />
        ) : (
          <DataTable
            data={heldSalesQuery.data ?? []}
            columns={outboundColumns}
            searchPlaceholder="Search outbound draft ticket"
            pagination={{ enabled: true }}
            emptyState={heldSalesQuery.isLoading ? "Loading held tickets..." : "No held outbound tickets."}
          />
        )}
      </VerticalDataViews>
    </ScrapShell>
  );
}
