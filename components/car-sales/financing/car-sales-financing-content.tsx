"use client";

import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { NumericCell } from "@/components/ui/numeric-cell";
import { getApiErrorMessage } from "@/lib/api-client";
import { fetchAutosPayments, type AutosPayment } from "@/lib/autos/autos-v2";

function paymentStatusBadge(status: AutosPayment["status"]) {
  if (status === "POSTED") return <Badge variant="secondary">Posted</Badge>;
  if (status === "REFUNDED") return <Badge variant="outline">Refunded</Badge>;
  return <Badge variant="destructive">Voided</Badge>;
}

function paymentMethodBadge(method: AutosPayment["paymentMethod"]) {
  if (method === "BANK_TRANSFER") return <Badge variant="outline">Bank Transfer</Badge>;
  if (method === "MOBILE_MONEY") return <Badge variant="outline">Mobile Money</Badge>;
  if (method === "CARD") return <Badge variant="outline">Card</Badge>;
  return <Badge variant="outline">Cash</Badge>;
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

export function CarSalesFinancingContent() {
  const paymentsQuery = useQuery({
    queryKey: ["autos", "payments", "page"],
    queryFn: () => fetchAutosPayments({ page: 1, limit: 250 }),
  });
  const rows = useMemo(() => paymentsQuery.data?.data ?? [], [paymentsQuery.data]);

  const columns = useMemo<ColumnDef<AutosPayment>[]>(
    () => [
      {
        id: "payment",
        header: "Payment",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.paymentNo}</div>
            <div className="text-xs text-muted-foreground">
              {formatDate(row.original.paymentDate)}
            </div>
          </div>
        ),
      },
      {
        id: "deal",
        header: "Deal",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.deal.dealNo}</div>
            <div className="text-xs text-muted-foreground">{row.original.deal.customerName}</div>
          </div>
        ),
      },
      {
        id: "method",
        header: "Method",
        cell: ({ row }) => paymentMethodBadge(row.original.paymentMethod),
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => paymentStatusBadge(row.original.status),
      },
      {
        id: "amount",
        header: "Amount",
        cell: ({ row }) => <NumericCell>{formatMoney(row.original.amount)}</NumericCell>,
      },
      {
        id: "dealBalance",
        header: "Deal Balance",
        cell: ({ row }) => (
          <NumericCell>{formatMoney(row.original.deal.balanceAmount)}</NumericCell>
        ),
      },
      {
        id: "receivedBy",
        header: "Received By",
        cell: ({ row }) => row.original.receivedBy?.name || "-",
      },
      {
        id: "reference",
        header: "Reference",
        cell: ({ row }) => row.original.reference || "-",
      },
    ],
    [],
  );

  return (
    <div className="space-y-4">
      {paymentsQuery.error ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load financing and payments</AlertTitle>
          <AlertDescription>{getApiErrorMessage(paymentsQuery.error)}</AlertDescription>
        </Alert>
      ) : null}
      <DataTable
        data={rows}
        columns={columns}
        searchPlaceholder="Search payments"
        searchSubmitLabel="Search"
        pagination={{ enabled: true }}
        emptyState={paymentsQuery.isLoading ? "Loading payments..." : "No payments found."}
      />
    </div>
  );
}
