"use client";

import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { NumericCell } from "@/components/ui/numeric-cell";
import { getApiErrorMessage } from "@/lib/api-client";
import { fetchAutosInventory, type AutosVehicle } from "@/lib/autos/autos-v2";

function vehicleStatusBadge(status: AutosVehicle["status"]) {
  if (status === "IN_STOCK") return <Badge variant="outline">In Stock</Badge>;
  if (status === "RESERVED") return <Badge variant="secondary">Reserved</Badge>;
  if (status === "SOLD") return <Badge variant="secondary">Sold</Badge>;
  return <Badge variant="destructive">Delivered</Badge>;
}

function formatMoney(value?: number | null) {
  if (typeof value !== "number" || Number.isNaN(value)) return "-";
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function CarSalesInventoryContent() {
  const inventoryQuery = useQuery({
    queryKey: ["autos", "inventory", "page"],
    queryFn: () => fetchAutosInventory({ page: 1, limit: 250 }),
  });
  const rows = useMemo(() => inventoryQuery.data?.data ?? [], [inventoryQuery.data]);

  const columns = useMemo<ColumnDef<AutosVehicle>[]>(
    () => [
      {
        id: "vehicle",
        header: "Vehicle",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.stockNo}</div>
            <div className="text-xs text-muted-foreground">
              {row.original.make} {row.original.model} ({row.original.year})
            </div>
          </div>
        ),
      },
      {
        id: "vin",
        header: "VIN",
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.vin}</span>,
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => vehicleStatusBadge(row.original.status),
      },
      {
        id: "listing",
        header: "Listing Price",
        cell: ({ row }) => <NumericCell>{formatMoney(row.original.listingPrice)}</NumericCell>,
      },
      {
        id: "floor",
        header: "Approval Floor",
        cell: ({ row }) => <NumericCell>{formatMoney(row.original.minApprovalPrice)}</NumericCell>,
      },
      {
        id: "deals",
        header: "Deals",
        cell: ({ row }) => <NumericCell>{row.original._count.deals}</NumericCell>,
      },
    ],
    [],
  );

  return (
    <div className="space-y-4">
      {inventoryQuery.error ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load vehicle inventory</AlertTitle>
          <AlertDescription>{getApiErrorMessage(inventoryQuery.error)}</AlertDescription>
        </Alert>
      ) : null}
      <DataTable
        data={rows}
        columns={columns}
        searchPlaceholder="Search vehicles"
        searchSubmitLabel="Search"
        pagination={{ enabled: true }}
        emptyState={
          inventoryQuery.isLoading ? "Loading vehicles..." : "No vehicles in inventory."
        }
      />
    </div>
  );
}
