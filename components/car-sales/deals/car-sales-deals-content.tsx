"use client";

import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { NumericCell } from "@/components/ui/numeric-cell";
import { getApiErrorMessage } from "@/lib/api-client";
import { fetchAutosDeals, type AutosDeal } from "@/lib/autos/autos-v2";

function dealStatusBadge(status: AutosDeal["status"]) {
  if (status === "QUOTED") return <Badge variant="outline">Quoted</Badge>;
  if (status === "RESERVED") return <Badge variant="secondary">Reserved</Badge>;
  if (status === "CONTRACTED") return <Badge variant="secondary">Contracted</Badge>;
  if (status === "DELIVERY_READY") return <Badge variant="secondary">Delivery Ready</Badge>;
  if (status === "DELIVERED") return <Badge variant="outline">Delivered</Badge>;
  if (status === "DRAFT") return <Badge variant="outline">Draft</Badge>;
  return <Badge variant="destructive">{status}</Badge>;
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toISOString().slice(0, 10);
}

function formatMoney(value?: number | null) {
  if (typeof value !== "number" || Number.isNaN(value)) return "-";
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function CarSalesDealsContent() {
  const dealsQuery = useQuery({
    queryKey: ["autos", "deals", "page"],
    queryFn: () => fetchAutosDeals({ page: 1, limit: 250 }),
  });
  const rows = useMemo(() => dealsQuery.data?.data ?? [], [dealsQuery.data]);

  const columns = useMemo<ColumnDef<AutosDeal>[]>(
    () => [
      {
        id: "deal",
        header: "Deal",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.dealNo}</div>
            <div className="text-xs text-muted-foreground">
              {row.original.customerName} / {row.original.customerPhone}
            </div>
          </div>
        ),
      },
      {
        id: "vehicle",
        header: "Vehicle",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.vehicle.stockNo}</div>
            <div className="text-xs text-muted-foreground">
              {row.original.vehicle.make} {row.original.vehicle.model}
            </div>
          </div>
        ),
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => dealStatusBadge(row.original.status),
      },
      {
        id: "net",
        header: "Net",
        cell: ({ row }) => <NumericCell>{formatMoney(row.original.netAmount)}</NumericCell>,
      },
      {
        id: "paid",
        header: "Paid",
        cell: ({ row }) => <NumericCell>{formatMoney(row.original.paidAmount)}</NumericCell>,
      },
      {
        id: "balance",
        header: "Balance",
        cell: ({ row }) => <NumericCell>{formatMoney(row.original.balanceAmount)}</NumericCell>,
      },
      {
        id: "reservedUntil",
        header: "Reserved Until",
        cell: ({ row }) => <NumericCell>{formatDate(row.original.reservedUntil)}</NumericCell>,
      },
    ],
    [],
  );

  return (
    <div className="space-y-4">
      {dealsQuery.error ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load deals</AlertTitle>
          <AlertDescription>{getApiErrorMessage(dealsQuery.error)}</AlertDescription>
        </Alert>
      ) : null}
      <DataTable
        data={rows}
        columns={columns}
        searchPlaceholder="Search deals"
        searchSubmitLabel="Search"
        pagination={{ enabled: true }}
        emptyState={dealsQuery.isLoading ? "Loading deals..." : "No deals available."}
      />
    </div>
  );
}
