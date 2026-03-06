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
import { StatusChip } from "@/components/ui/status-chip";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { Package } from "@/lib/icons";

type Batch = {
  id: string;
  batchNumber: string;
  category: string;
  status: string;
  totalWeight: number;
  collectionStartDate: string;
  collectionEndDate?: string;
  _count: {
    items: number;
  };
  site: {
    name: string;
    code: string;
  };
};

async function fetchBatches(): Promise<Batch[]> {
  const response = await fetchJson<{ data: Batch[] }>("/api/scrap-metal/batches?limit=200");
  return response.data;
}

export default function ScrapMetalBatchesPage() {
  const {
    data: batches = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["scrap-metal-batches"],
    queryFn: fetchBatches,
  });

  const columns = useMemo<ColumnDef<Batch>[]>(
    () => [
      {
        id: "batchNumber",
        header: "Batch #",
        cell: ({ row }) => (
          <span className="font-mono font-semibold">{row.original.batchNumber}</span>
        ),
        size: 120,
      },
      {
        id: "category",
        header: "Category",
        cell: ({ row }) => <Badge variant="secondary">{row.original.category}</Badge>,
        size: 120,
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => (
          <StatusChip
            status={
              row.original.status === "SOLD"
                ? "passing"
                : row.original.status === "READY"
                  ? "in_review"
                  : "pending"
            }
            label={row.original.status}
          />
        ),
        size: 120,
      },
      {
        id: "totalWeight",
        header: "Total Weight (kg)",
        cell: ({ row }) => <NumericCell>{row.original.totalWeight.toFixed(2)}</NumericCell>,
        size: 140,
      },
      {
        id: "itemCount",
        header: "Items",
        cell: ({ row }) => <NumericCell>{row.original._count.items}</NumericCell>,
        size: 80,
      },
      {
        id: "collectionStartDate",
        header: "Start Date",
        cell: ({ row }) => (
          <NumericCell align="left">
            {new Date(row.original.collectionStartDate).toLocaleDateString()}
          </NumericCell>
        ),
        size: 100,
      },
      {
        id: "collectionEndDate",
        header: "End Date",
        cell: ({ row }) =>
          row.original.collectionEndDate ? (
            <NumericCell align="left">
              {new Date(row.original.collectionEndDate).toLocaleDateString()}
            </NumericCell>
          ) : (
            <span className="text-muted-foreground">-</span>
          ),
        size: 100,
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
        purpose=""
        title="Scrap Metal Batches"
        actions={
          <Button asChild size="sm">
            <Link href="/scrap-metal">Back to Dashboard</Link>
          </Button>
        }
      />

      {error ? (
        <StatusState
          variant="error"
          title="Unable to load batches"
        />
      ) : (
        <DataTable
          data={batches}
          columns={columns}
          searchPlaceholder="Search by batch number or category"
          searchSubmitLabel="Search"
          tableClassName="text-sm"
          pagination={{ enabled: true }}
          emptyState={isLoading ? "Loading batches..." : "No batches created yet"}
        />
      )}
    </div>
  );
}
