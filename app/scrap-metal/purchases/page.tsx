"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";

import { PageIntro } from "@/components/shared/page-intro";
import { StatusState } from "@/components/shared/status-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { NumericCell } from "@/components/ui/numeric-cell";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { Payments } from "@/lib/icons";

type Purchase = {
  id: string;
  purchaseNumber: string;
  purchaseDate: string;
  category: string;
  weight: number;
  pricePerKg: number;
  totalAmount: number;
  currency: string;
  sellerName?: string;
  employee: {
    name: string;
    employeeId: string;
  };
  site: {
    name: string;
    code: string;
  };
};

async function fetchPurchases(): Promise<Purchase[]> {
  const response = await fetchJson<{ data: Purchase[] }>("/api/scrap-metal/purchases?limit=200");
  return response.data;
}

export default function ScrapMetalPurchasesPage() {
  const {
    data: purchases = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["scrap-metal-purchases"],
    queryFn: fetchPurchases,
  });

  const columns = useMemo<ColumnDef<Purchase>[]>(
    () => [
      {
        id: "purchaseNumber",
        header: "Purchase #",
        cell: ({ row }) => (
          <span className="font-mono font-semibold">{row.original.purchaseNumber}</span>
        ),
        size: 120,
      },
      {
        id: "purchaseDate",
        header: "Date",
        cell: ({ row }) => (
          <NumericCell align="left">
            {new Date(row.original.purchaseDate).toLocaleDateString()}
          </NumericCell>
        ),
        size: 100,
      },
      {
        id: "category",
        header: "Category",
        cell: ({ row }) => <Badge variant="secondary">{row.original.category}</Badge>,
        size: 120,
      },
      {
        id: "employee",
        header: "Employee",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.employee.name}</div>
            <div className="text-xs text-muted-foreground font-mono">
              {row.original.employee.employeeId}
            </div>
          </div>
        ),
        size: 180,
      },
      {
        id: "sellerName",
        header: "Seller",
        accessorKey: "sellerName",
        cell: ({ row }) => row.original.sellerName || "-",
        size: 150,
      },
      {
        id: "weight",
        header: "Weight (kg)",
        cell: ({ row }) => <NumericCell>{row.original.weight.toFixed(2)}</NumericCell>,
        size: 100,
      },
      {
        id: "pricePerKg",
        header: "Price/kg",
        cell: ({ row }) => (
          <NumericCell>
            {row.original.currency} {row.original.pricePerKg.toFixed(2)}
          </NumericCell>
        ),
        size: 100,
      },
      {
        id: "totalAmount",
        header: "Total",
        cell: ({ row }) => (
          <NumericCell>
            {row.original.currency} {row.original.totalAmount.toFixed(2)}
          </NumericCell>
        ),
        size: 110,
      },
      {
        id: "site",
        header: "Site",
        accessorKey: "site.code",
        size: 80,
      },
    ],
    []
  );

  return (
    <div className="space-y-6">
      <PageIntro
        purpose="Record all scrap metal purchases from sellers—track employee transactions and inventory weight"
        title="Scrap Metal Purchases"
        actions={
          <Button asChild size="sm">
            <Link href="/scrap-metal">Back to Dashboard</Link>
          </Button>
        }
      />

      {error ? (
        <StatusState
          variant="error"
          title="Unable to load purchases"
          description={getApiErrorMessage(error)}
          action={
            <Button onClick={() => refetch()} variant="outline" size="sm">
              Try Again
            </Button>
          }
        />
      ) : (
        <DataTable
          data={purchases}
          columns={columns}
          searchPlaceholder="Search by purchase number, employee, or seller"
          searchSubmitLabel="Search"
          tableClassName="text-sm"
          pagination={{ enabled: true }}
          emptyState={isLoading ? "Loading purchases..." : "No purchases recorded yet"}
        />
      )}
    </div>
  );
}
