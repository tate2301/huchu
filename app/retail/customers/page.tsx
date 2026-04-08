"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import { RetailShell } from "@/components/retail/retail-shell";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NumericCell } from "@/components/ui/numeric-cell";
import { fetchJson } from "@/lib/api-client";
import { BarChart3, Payments, ReceiptLong } from "@/lib/icons";

type RetailDashboardPayload = {
  data: Array<{
    customerId: string | null;
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
  customerId: string | null;
  customerName: string;
  visits: number;
  lastPurchaseAt: string;
  lastSaleNo: string;
  totalSpend: number;
  loyaltyPoints: number;
  loyaltyTier: string;
};

type CustomerLoyaltyPayload = {
  customer: { id: string; name: string; phone: string | null; email: string | null };
  loyalty: { earnedPoints: number; redeemedPoints: number; balance: number; tier: string };
  ledger: Array<{
    id: string;
    saleNo: string;
    saleType: string;
    postedAt: string;
    amount: number;
    earnedPoints: number;
    redeemedPoints: number;
    delta: number;
  }>;
};

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export default function RetailCustomersPage() {
  const [activeCustomer, setActiveCustomer] = useState<{ id: string; name: string } | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ["retail-customers-overview"],
    queryFn: () => fetchJson<RetailDashboardPayload>("/api/v2/retail/customers"),
  });
  const loyaltyDetailQuery = useQuery({
    queryKey: ["retail-customer-loyalty", activeCustomer?.id],
    queryFn: () =>
      fetchJson<CustomerLoyaltyPayload>(`/api/v2/retail/customers/${activeCustomer?.id}/loyalty`),
    enabled: Boolean(activeCustomer?.id),
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
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => (
          <Button
            size="sm"
            variant="outline"
            disabled={!row.original.customerId}
            onClick={() =>
              row.original.customerId
                ? setActiveCustomer({
                    id: row.original.customerId,
                    name: row.original.customerName,
                  })
                : null
            }
          >
            Loyalty ledger
          </Button>
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

      <Dialog open={Boolean(activeCustomer)} onOpenChange={(open) => !open && setActiveCustomer(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Loyalty ledger - {activeCustomer?.name}</DialogTitle>
          </DialogHeader>
          {!loyaltyDetailQuery.data ? (
            <div className="py-6 text-sm text-[var(--text-muted)]">
              {loyaltyDetailQuery.isLoading ? "Loading loyalty ledger..." : "No loyalty data available"}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid gap-3 md:grid-cols-4">
                <div className="rounded-xl bg-[var(--surface-muted)] px-3 py-2">
                  <div className="text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]">Earned</div>
                  <div className="font-mono text-base font-semibold">
                    {loyaltyDetailQuery.data.loyalty.earnedPoints}
                  </div>
                </div>
                <div className="rounded-xl bg-[var(--surface-muted)] px-3 py-2">
                  <div className="text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]">Redeemed</div>
                  <div className="font-mono text-base font-semibold">
                    {loyaltyDetailQuery.data.loyalty.redeemedPoints}
                  </div>
                </div>
                <div className="rounded-xl bg-[var(--surface-muted)] px-3 py-2">
                  <div className="text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]">Balance</div>
                  <div className="font-mono text-base font-semibold">
                    {loyaltyDetailQuery.data.loyalty.balance}
                  </div>
                </div>
                <div className="rounded-xl bg-[var(--surface-muted)] px-3 py-2">
                  <div className="text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]">Tier</div>
                  <div className="font-mono text-base font-semibold">
                    {loyaltyDetailQuery.data.loyalty.tier}
                  </div>
                </div>
              </div>
              <div className="overflow-auto rounded-xl border border-[var(--border-subtle)]">
                <table className="min-w-full text-sm">
                  <thead className="bg-[var(--surface-muted)] text-left text-xs uppercase tracking-[0.08em] text-[var(--text-muted)]">
                    <tr>
                      <th className="px-3 py-2">Sale</th>
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2 text-right">Amount</th>
                      <th className="px-3 py-2 text-right">Earned</th>
                      <th className="px-3 py-2 text-right">Redeemed</th>
                      <th className="px-3 py-2 text-right">Net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loyaltyDetailQuery.data.ledger.map((entry) => (
                      <tr key={entry.id} className="border-t border-[var(--border-subtle)]">
                        <td className="px-3 py-2 font-mono text-xs">
                          {entry.saleNo} ({entry.saleType})
                        </td>
                        <td className="px-3 py-2">{new Date(entry.postedAt).toLocaleDateString()}</td>
                        <td className="px-3 py-2 text-right font-mono">{money(entry.amount)}</td>
                        <td className="px-3 py-2 text-right font-mono">{entry.earnedPoints}</td>
                        <td className="px-3 py-2 text-right font-mono">{entry.redeemedPoints}</td>
                        <td className="px-3 py-2 text-right font-mono">{entry.delta}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </RetailShell>
  );
}
