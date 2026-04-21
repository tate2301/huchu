"use client";

import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import {
  AdminDistributionChart,
  AdminDualBarChart,
  AdminDonutChart,
} from "@/components/charts/admin-headless-charts";
import { RetailShell } from "@/components/retail/retail-shell";
import { ReportChartShell } from "@/components/retail/reports/report-chart-shell";
import { ReportFilterBar } from "@/components/retail/reports/report-filter-bar";
import { ReportBigNumber } from "@/components/retail/reports/report-big-number";
import { DataTable } from "@/components/ui/data-table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NumericCell } from "@/components/ui/numeric-cell";
import { fetchJson } from "@/lib/api-client";
import { Users } from "@/lib/icons";

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
    id: string; saleNo: string; saleType: string; postedAt: string;
    amount: number; earnedPoints: number; redeemedPoints: number; delta: number;
  }>;
};

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

export default function RetailCustomersPage() {
  const [activeCustomer, setActiveCustomer] = useState<{ id: string; name: string } | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ["retail-customers-overview"],
    queryFn: () => fetchJson<{ data: CustomerRow[]; summary: { namedCustomerCount: number; totalLoyaltyPoints: number } }>("/api/v2/retail/customers"),
  });
  const loyaltyDetailQuery = useQuery({
    queryKey: ["retail-customer-loyalty", activeCustomer?.id],
    queryFn: () => fetchJson<CustomerLoyaltyPayload>(`/api/v2/retail/customers/${activeCustomer?.id}/loyalty`),
    enabled: Boolean(activeCustomer?.id),
  });

  const customerRows = useMemo<CustomerRow[]>(
    () => (data?.data ?? []).sort((a, b) => b.totalSpend - a.totalSpend),
    [data?.data],
  );

  const spendRows = useMemo(
    () => customerRows.slice(0, 8).map((c) => ({
      id: c.customerId ?? c.customerName,
      label: c.customerName,
      primary: c.totalSpend,
      secondary: c.visits,
    })),
    [customerRows],
  );

  const tierRows = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of customerRows) counts.set(c.loyaltyTier, (counts.get(c.loyaltyTier) ?? 0) + 1);
    return Array.from(counts.entries()).map(([label, value]) => ({ id: label, label, value }));
  }, [customerRows]);

  const visitRows = useMemo(
    () => customerRows.slice().sort((a, b) => b.visits - a.visits).slice(0, 8).map((c) => ({
      id: c.customerId ?? c.customerName,
      label: c.customerName,
      value: c.visits,
    })),
    [customerRows],
  );

  const columns = useMemo<ColumnDef<CustomerRow>[]>(() => [
    { id: "customerName", header: "Customer", cell: ({ row }) => (
      <div>
        <div className="font-medium">{row.original.customerName}</div>
        <div className="font-mono text-xs text-[var(--text-muted)]">{row.original.lastSaleNo}</div>
      </div>
    )},
    { id: "visits", header: "Visits", cell: ({ row }) => <NumericCell>{row.original.visits}</NumericCell> },
    { id: "totalSpend", header: "Spend", cell: ({ row }) => <NumericCell>{money(row.original.totalSpend)}</NumericCell> },
    { id: "loyalty", header: "Loyalty", cell: ({ row }) => <NumericCell>{row.original.loyaltyPoints}</NumericCell> },
    { id: "tier", header: "Tier", cell: ({ row }) => row.original.loyaltyTier },
    { id: "actions", header: "", cell: ({ row }) => row.original.customerId ? (
      <button
        className="text-xs font-medium text-[var(--action-primary-bg)] hover:underline"
        onClick={() => setActiveCustomer({ id: row.original.customerId!, name: row.original.customerName })}
      >
        Ledger
      </button>
    ) : null },
  ], []);

  return (
    <RetailShell title="Customers" actions={undefined}>
      <ReportFilterBar onExport={() => {}} />

      {/* KPI row */}
      <div className="grid gap-5 xl:grid-cols-3">
        <ReportChartShell title="Customers" sourceTag={{ label: "CRM" }}>
          <ReportBigNumber label="Named customers" value={String(data?.summary.namedCustomerCount ?? 0)} />
        </ReportChartShell>
        <ReportChartShell title="Top spend" sourceTag={{ label: "Sales" }}>
          <ReportBigNumber label="Top customer" value={customerRows[0] ? money(customerRows[0].totalSpend) : money(0)} dotColor="var(--status-success-border)" />
        </ReportChartShell>
        <ReportChartShell title="Loyalty" sourceTag={{ label: "Rewards" }}>
          <ReportBigNumber label="Total points" value={String(data?.summary.totalLoyaltyPoints ?? 0)} dotColor="var(--status-warning-border)" />
        </ReportChartShell>
      </div>

      {/* Charts */}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(300px,0.8fr)]">
        <ReportChartShell title="Spend vs visits" sourceTag={{ label: "Sales" }} legend={[{ label: "Spend", color: "var(--action-primary-bg)" }, { label: "Visits", color: "var(--status-info-border)" }]}>
          <AdminDualBarChart rows={spendRows} primaryLabel="Spend" secondaryLabel="Visits" height={300} valueFormatter={(v) => v.toFixed(0)} />
        </ReportChartShell>
        <ReportChartShell title="Loyalty tiers" sourceTag={{ label: "Rewards" }}>
          <AdminDonutChart rows={tierRows.length ? tierRows : [{ id: "none", label: "No tiers", value: 0 }]} valueLabel="Customers" valueFormatter={(v) => v.toString()} height={300} />
        </ReportChartShell>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.8fr)]">
        <ReportChartShell title="Visit frequency" sourceTag={{ label: "CRM" }}>
          <AdminDistributionChart rows={visitRows} valueLabel="Visits" valueFormatter={(v) => v.toString()} height={280} />
        </ReportChartShell>
        <ReportChartShell title="Avg spend" sourceTag={{ label: "Sales" }}>
          <ReportBigNumber
            label="Avg per customer"
            value={money(customerRows.length ? customerRows.reduce((s, c) => s + c.totalSpend, 0) / customerRows.length : 0)}
            dotColor="var(--action-primary-bg)"
          />
        </ReportChartShell>
      </div>

      <DataTable
        data={customerRows}
        columns={columns}
        features={{ sorting: true, globalFilter: true, pagination: true }}
        pagination={{ enabled: true, server: false }}
        searchPlaceholder="Search customers"
        emptyState={isLoading ? "Loading customers..." : "No customers yet"}
      />

      {/* Loyalty Dialog */}
      <Dialog open={Boolean(activeCustomer)} onOpenChange={(open) => !open && setActiveCustomer(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Loyalty ledger — {activeCustomer?.name}</DialogTitle>
          </DialogHeader>
          {!loyaltyDetailQuery.data ? (
            <div className="py-6 text-sm text-[var(--text-muted)]">
              {loyaltyDetailQuery.isLoading ? "Loading..." : "No data"}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid gap-3 md:grid-cols-4">
                {(["earnedPoints", "redeemedPoints", "balance", "tier"] as const).map((key) => (
                  <div key={key} className="rounded-xl bg-[var(--surface-muted)] px-3 py-2">
                    <div className="text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]">{key.replace(/([A-Z])/g, " $1").trim()}</div>
                    <div className="font-mono text-base font-semibold">{String(loyaltyDetailQuery.data.loyalty[key])}</div>
                  </div>
                ))}
              </div>
              <div className="overflow-auto rounded-xl border border-[var(--edge-subtle)]">
                <table className="min-w-full text-sm">
                  <thead className="bg-[var(--surface-muted)] text-left text-xs uppercase tracking-[0.08em] text-[var(--text-muted)]">
                    <tr>{["Sale", "Date", "Amount", "Earned", "Redeemed", "Net"].map((h) => <th key={h} className="px-3 py-2 text-right">{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {loyaltyDetailQuery.data.ledger.map((e) => (
                      <tr key={e.id} className="border-t border-[var(--edge-subtle)]">
                        <td className="px-3 py-2 font-mono text-xs">{e.saleNo}</td>
                        <td className="px-3 py-2">{new Date(e.postedAt).toLocaleDateString()}</td>
                        <td className="px-3 py-2 text-right font-mono">{money(e.amount)}</td>
                        <td className="px-3 py-2 text-right font-mono">{e.earnedPoints}</td>
                        <td className="px-3 py-2 text-right font-mono">{e.redeemedPoints}</td>
                        <td className="px-3 py-2 text-right font-mono">{e.delta}</td>
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
