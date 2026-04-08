"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import { RetailShell } from "@/components/retail/retail-shell";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { NumericCell } from "@/components/ui/numeric-cell";
import { fetchJson } from "@/lib/api-client";
import { BarChart3, Payments, ReceiptLong } from "@/lib/icons";

type RetailDashboardPayload = {
  data: Array<{
    customerName: string;
    visits: number;
    lastPurchaseAt: string;
    lastSaleNo: string;
    totalSpend: number;
    loyaltyPoints: number;
    loyaltyTier: string;
  }>;
  summary: {
    namedCustomerCount: number;
    totalLoyaltyPoints: number;
  };
};

type CustomerRow = {
  customerName: string;
  visits: number;
  lastPurchaseAt: string;
  lastSaleNo: string;
  totalSpend: number;
  loyaltyPoints: number;
  loyaltyTier: string;
};

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export default function RetailCustomersPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["retail-customers-overview"],
    queryFn: () => fetchJson<RetailDashboardPayload>("/api/v2/retail/customers"),
  });

  const customerRows = useMemo<CustomerRow[]>(
    () => (data?.data ?? []).sort((left, right) => right.totalSpend - left.totalSpend),
    [data?.data],
  );

  const columns = useMemo<ColumnDef<CustomerRow>[]>(
    () => [
      {
        id: "customerName",
        header: "Customer",
        cell: ({ row }) => (
          <div>
            <div className="font-medium text-[var(--text-strong)]">{row.original.customerName}</div>
            <div className="font-mono text-xs text-[var(--text-muted)]">{row.original.lastSaleNo}</div>
          </div>
        ),
      },
      {
        id: "visits",
        header: "Visits",
        cell: ({ row }) => <NumericCell>{row.original.visits}</NumericCell>,
      },
      {
        id: "lastPurchaseAt",
        header: "Last purchase",
        cell: ({ row }) => (
          <NumericCell align="left">
            {new Date(row.original.lastPurchaseAt).toLocaleDateString()}
          </NumericCell>
        ),
      },
      {
        id: "totalSpend",
        header: "Spend",
        cell: ({ row }) => <NumericCell>{money(row.original.totalSpend)}</NumericCell>,
      },
      {
        id: "loyaltyPoints",
        header: "Loyalty",
        cell: ({ row }) => (
          <NumericCell>
            {row.original.loyaltyPoints} ({row.original.loyaltyTier})
          </NumericCell>
        ),
      },
    ],
    [],
  );

  return (
    <RetailShell
      title="Customers"
      description="Track repeat spend and customer touchpoints from recent sales."
      actions={
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm">
            <Link href="/portal/pos">
              <Payments className="h-4 w-4" />
              Open POS
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/retail/sales">
              <ReceiptLong className="h-4 w-4" />
              Sales
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/retail/reports">
              <BarChart3 className="h-4 w-4" />
              Insights
            </Link>
          </Button>
        </div>
      }
    >
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl bg-[var(--surface-muted)] px-3 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
            Named customers
          </div>
          <div className="mt-2 font-mono text-xl font-semibold text-[var(--text-strong)]">
            {data?.summary.namedCustomerCount ?? 0}
          </div>
        </div>
        <div className="rounded-2xl bg-[var(--surface-muted)] px-3 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
            Loyalty points
          </div>
          <div className="mt-2 font-mono text-xl font-semibold text-[var(--text-strong)]">
            {data?.summary.totalLoyaltyPoints ?? 0}
          </div>
        </div>
        <div className="rounded-2xl bg-[var(--surface-muted)] px-3 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
            Top spender
          </div>
          <div className="mt-2 font-mono text-xl font-semibold text-[var(--text-strong)]">
            {customerRows[0] ? money(customerRows[0].totalSpend) : money(0)}
          </div>
        </div>
      </div>

      <DataTable
        data={customerRows}
        columns={columns}
        features={{ sorting: true, globalFilter: true, pagination: true }}
        pagination={{ enabled: true, server: false }}
        searchPlaceholder="Search customers"
        emptyState={isLoading ? "Loading customers..." : "No customer activity yet"}
        toolbar={<span className="text-xs text-[var(--text-muted)]">Customer spend from recent sales</span>}
      />
    </RetailShell>
  );
}
