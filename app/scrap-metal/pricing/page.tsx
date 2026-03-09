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
import { Coins } from "@/lib/icons";

type Price = {
  id: string;
  category: string;
  effectiveDate: string;
  pricePerKg: number;
  currency: string;
  note?: string;
  createdAt: string;
};

async function fetchPrices(): Promise<Price[]> {
  const response = await fetchJson<{ data: Price[] }>("/api/scrap-metal/pricing?limit=200");
  return response.data;
}

export default function ScrapMetalPricingPage() {
  const {
    data: prices = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["scrap-metal-pricing"],
    queryFn: fetchPrices,
  });

  const columns = useMemo<ColumnDef<Price>[]>(
    () => [
      {
        id: "category",
        header: "Category",
        cell: ({ row }) => <Badge variant="secondary">{row.original.category}</Badge>,
        size: 140,
      },
      {
        id: "effectiveDate",
        header: "Effective Date",
        cell: ({ row }) => (
          <NumericCell align="left">
            {new Date(row.original.effectiveDate).toLocaleDateString()}
          </NumericCell>
        ),
        size: 120,
      },
      {
        id: "pricePerKg",
        header: "Price per kg",
        cell: ({ row }) => (
          <NumericCell>
            {row.original.currency} {row.original.pricePerKg.toFixed(2)}
          </NumericCell>
        ),
        size: 120,
      },
      {
        id: "note",
        header: "Note",
        accessorKey: "note",
        cell: ({ row }) => row.original.note || "-",
        size: 300,
      },
      {
        id: "createdAt",
        header: "Created",
        cell: ({ row }) => (
          <NumericCell align="left">
            {new Date(row.original.createdAt).toLocaleDateString()}
          </NumericCell>
        ),
        size: 120,
      },
    ],
    []
  );

  return (
    <div className="space-y-6">
      <PageIntro
        purpose="Set and manage price per kilogram by category—control pricing with effective dates"
        title="Scrap Metal Pricing"
        actions={
          <Button asChild size="sm">
            <Link href="/scrap-metal">Back to Dashboard</Link>
          </Button>
        }
      />

      {error ? (
        <StatusState
          variant="error"
          title="Unable to load prices"
          description={getApiErrorMessage(error)}
          action={
            <Button onClick={() => refetch()} variant="outline" size="sm">
              Try Again
            </Button>
          }
        />
      ) : (
        <DataTable
          data={prices}
          columns={columns}
          searchPlaceholder="Search by category"
          searchSubmitLabel="Search"
          tableClassName="text-sm"
          pagination={{ enabled: true }}
          emptyState={isLoading ? "Loading prices..." : "No prices configured yet"}
        />
      )}
    </div>
  );
}
