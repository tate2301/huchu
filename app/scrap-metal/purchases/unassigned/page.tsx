"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";

import { ScrapShell } from "@/components/scrap-metal/scrap-shell";
import { StatusState } from "@/components/shared/status-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { NumericCell } from "@/components/ui/numeric-cell";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";

type UnassignedPurchase = {
  id: string;
  purchaseNumber: string;
  purchaseDate: string;
  category: string;
  weight: number;
  totalAmount: number;
  currency: string;
  sellerName?: string | null;
  material?: { id: string; code: string; name: string; category: string } | null;
  employee: { id: string; name: string; employeeId: string };
  site: { id: string; name: string; code: string };
};

async function fetchUnassignedPurchases(): Promise<UnassignedPurchase[]> {
  const response = await fetchJson<{ data: UnassignedPurchase[] }>(
    "/api/scrap-metal/purchases?status=POSTED&unbatched=true&limit=500",
  );
  return response.data;
}

export default function ScrapUnassignedPurchasesPage() {
  const purchasesQuery = useQuery({
    queryKey: ["scrap-unassigned-purchases-page"],
    queryFn: fetchUnassignedPurchases,
  });

  const columns = useMemo<ColumnDef<UnassignedPurchase>[]>(
    () => [
      {
        id: "purchaseNumber",
        header: "Ticket #",
        cell: ({ row }) => <span className="font-mono font-semibold">{row.original.purchaseNumber}</span>,
        size: 120,
      },
      {
        id: "purchaseDate",
        header: "Date",
        cell: ({ row }) => <NumericCell align="left">{row.original.purchaseDate.slice(0, 10)}</NumericCell>,
        size: 100,
      },
      {
        id: "material",
        header: "Material",
        accessorFn: (row) => `${row.material?.name ?? row.category} ${row.sellerName ?? ""}`,
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.material?.name ?? row.original.category}</div>
            <div className="text-xs text-muted-foreground">{row.original.material?.code ?? row.original.category}</div>
          </div>
        ),
      },
      {
        id: "supplier",
        header: "Supplier",
        accessorFn: (row) => row.sellerName ?? "",
        cell: ({ row }) => row.original.sellerName ?? "-",
        size: 180,
      },
      {
        id: "weight",
        header: "Weight (kg)",
        cell: ({ row }) => <NumericCell>{row.original.weight.toFixed(2)}</NumericCell>,
        size: 120,
      },
      {
        id: "amount",
        header: "Amount",
        cell: ({ row }) => (
          <NumericCell>
            {row.original.currency} {row.original.totalAmount.toFixed(2)}
          </NumericCell>
        ),
        size: 130,
      },
      {
        id: "buyer",
        header: "Buyer / Cashier",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.employee.name}</div>
            <div className="font-mono text-xs text-muted-foreground">{row.original.employee.employeeId}</div>
          </div>
        ),
        size: 180,
      },
      {
        id: "site",
        header: "Site",
        cell: ({ row }) => <Badge variant="outline">{row.original.site.code}</Badge>,
        size: 80,
      },
    ],
    [],
  );

  const purchases = purchasesQuery.data ?? [];

  return (
    <ScrapShell
      title="Unassigned Purchases"
     
      actions={
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm">
            <Link href="/scrap-metal/batches">Open Lots</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/scrap-metal/purchases">Inbound Tickets</Link>
          </Button>
        </div>
      }
    >
      {purchasesQuery.error ? (
        <StatusState
          variant="error"
          title="Unable to load unassigned purchases"
         
          action={
            <Button onClick={() => purchasesQuery.refetch()} variant="outline" size="sm">
              Try Again
            </Button>
          }
        />
      ) : (
        <DataTable
          data={purchases}
          columns={columns}
          searchPlaceholder="Search ticket, supplier, material, buyer, or site"
          searchSubmitLabel="Search"
          tableClassName="text-sm"
          pagination={{ enabled: true }}
          emptyState={purchasesQuery.isLoading ? "Loading unassigned purchases..." : "No unassigned purchases."}
        />
      )}
    </ScrapShell>
  );
}
