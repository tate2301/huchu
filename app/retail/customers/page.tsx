"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import {
  AdminDistributionChart,
  AdminDualBarChart,
  AdminDonutChart,
} from "@/components/charts/admin-headless-charts";
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

  const spendRows = useMemo(
    () =>
      customerRows.slice(0, 8).map((customer) => ({
        id: customer.customerName,
        label: customer.customerName,
        primary: customer.totalSpend,
        secondary: customer.visits,
      })),
    [customerRows],
  );

  const loyaltyRows = useMemo(
    () => {
      const tierCounts = new Map<string, number>();
      for (const customer of customerRows) {
        tierCounts.set(customer.loyaltyTier, (tierCounts.get(customer.loyaltyTier) ?? 0) + 1);
      }
      return Array.from(tierCounts.entries()).map(([tier, value]) => ({
        id: tier,
        label: tier,
        value,
      }));
    },
    [customerRows],
  );

  const visitRows = useMemo(
    () =>
      customerRows
        .slice()
        .sort((left, right) => right.visits - left.visits)
        .slice(0, 8)
        .map((customer) => ({
          id: customer.customerName,
          label: customer.customerName,
          value: customer.visits,
        })),
    [customerRows],
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
      <section className="rounded-[28px] border border-[var(--edge-subtle)] bg-[var(--surface-base)] p-5 shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.18em] text-[var(--text-muted)]">Customer signal</p>
            <h2 className="mt-1 text-2xl font-semibold text-[var(--text-strong)]">Spend, visits, and loyalty depth</h2>
          </div>
          <div className="rounded-2xl bg-[var(--surface-subtle)] px-4 py-3 text-right">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">Top spender</p>
            <p className="font-mono text-3xl font-semibold text-[var(--text-strong)]">
              {customerRows[0] ? money(customerRows[0].totalSpend) : money(0)}
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.85fr)]">
          <AdminDualBarChart
            rows={spendRows}
            primaryLabel="Spend"
            secondaryLabel="Visits"
            height={300}
            valueFormatter={(value) => value.toFixed(0)}
            emptyLabel="Customer spend is loading"
          />
          <AdminDonutChart
            rows={loyaltyRows.length > 0 ? loyaltyRows : [{ id: "none", label: "No tiers", value: 0, tone: "warning" as const }]}
            valueLabel="Customers"
            valueFormatter={(value) => value.toString()}
            height={300}
            emptyLabel="Loyalty tiers are loading"
          />
        </div>
      </section>

      <section className="rounded-[28px] border border-[var(--edge-subtle)] bg-[var(--surface-base)] p-5 shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.18em] text-[var(--text-muted)]">Visit frequency</p>
            <h3 className="mt-1 text-xl font-semibold text-[var(--text-strong)]">Most frequent customers in the current window</h3>
          </div>
          <div className="rounded-2xl bg-[var(--surface-subtle)] px-4 py-3 text-right">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">Named customers</p>
            <p className="font-mono text-2xl font-semibold text-[var(--text-strong)]">
              {data?.summary.namedCustomerCount ?? 0}
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.75fr)]">
          <AdminDistributionChart
            rows={visitRows}
            valueLabel="Visits"
            valueFormatter={(value) => value.toString()}
            height={280}
            emptyLabel="Visit frequency is loading"
          />
          <div className="rounded-[24px] border border-[var(--edge-subtle)] bg-[var(--surface-subtle)] p-4">
            <p className="text-xs uppercase tracking-[0.16em] text-[var(--text-muted)]">Loyalty points</p>
            <p className="mt-2 font-mono text-3xl font-semibold text-[var(--text-strong)]">
              {data?.summary.totalLoyaltyPoints ?? 0}
            </p>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              The table remains for detail work, while the charts carry the scanning layer.
            </p>
          </div>
        </div>
      </section>

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
