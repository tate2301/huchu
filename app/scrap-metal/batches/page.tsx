"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";

import { ScrapShell } from "@/components/scrap-metal/scrap-shell";
import { StatusState } from "@/components/shared/status-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { NumericCell } from "@/components/ui/numeric-cell";
import { StatusChip } from "@/components/ui/status-chip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";

type Batch = {
  id: string;
  batchNumber: string;
  category: string;
  status: string;
  totalWeight: number;
  collectionStartDate: string;
  collectionEndDate?: string | null;
  material?: { id: string; code: string; name: string; category: string } | null;
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
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const { data: batches = [], isLoading, error, refetch } = useQuery({
    queryKey: ["scrap-metal-batches"],
    queryFn: fetchBatches,
  });

  const filteredBatches = useMemo(() => {
    if (statusFilter === "all") return batches;
    return batches.filter((batch) => batch.status === statusFilter);
  }, [batches, statusFilter]);

  const columns = useMemo<ColumnDef<Batch>[]>(
    () => [
      {
        id: "batchNumber",
        header: "Batch #",
        cell: ({ row }) => <span className="font-mono font-semibold">{row.original.batchNumber}</span>,
        size: 120,
      },
      {
        id: "material",
        header: "Material",
        accessorFn: (row) => `${row.material?.name ?? row.category} ${row.site.code}`,
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.material?.name ?? row.original.category}</div>
            <div className="text-xs text-muted-foreground">{row.original.material?.code ?? row.original.category}</div>
          </div>
        ),
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
        id: "window",
        header: "Window",
        cell: ({ row }) => (
          <div className="text-sm">
            <div className="font-mono">{row.original.collectionStartDate.slice(0, 10)}</div>
            <div className="text-xs text-muted-foreground">
              {row.original.collectionEndDate?.slice(0, 10) ?? "Open"}
            </div>
          </div>
        ),
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

  return (
    <ScrapShell
      title="Yard Stock"
      description="Track open batches, ready stock, and lot consolidation across the yard."
      actions={
        <Button asChild size="sm" variant="outline">
          <Link href="/scrap-metal/trading/sales">Bulk Sales</Link>
        </Button>
      }
    >
      {error ? (
        <StatusState
          variant="error"
          title="Unable to load batches"
          description={getApiErrorMessage(error)}
          action={
            <Button onClick={() => refetch()} variant="outline" size="sm">
              Try Again
            </Button>
          }
        />
      ) : (
        <>
          <div className="flex items-center gap-3">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 w-[180px]">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="COLLECTING">Collecting</SelectItem>
                <SelectItem value="READY">Ready</SelectItem>
                <SelectItem value="SOLD">Sold</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">
              {filteredBatches.length} of {batches.length} batches
            </span>
          </div>

          <DataTable
            data={filteredBatches}
            columns={columns}
            searchPlaceholder="Search batch, material, or status"
            searchSubmitLabel="Search"
            tableClassName="text-sm"
            pagination={{ enabled: true }}
            emptyState={isLoading ? "Loading batches..." : "No batches created yet"}
          />
        </>
      )}
    </ScrapShell>
  );
}
