"use client";

import { useMemo, useState } from "react";
import { Alert, Card, EmptyState, Skeleton, StatCard } from "@corelithzw/react";
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
import { Badge } from "@/components/ui/badge";
import { retailMoney } from "@/components/retail/sale-detail";
import {
  MobileListCard,
  MobileListCardHeader,
  MobileListMetricStrip,
} from "@/components/ui/mobile-list-card";
import { NumericCell } from "@/components/ui/numeric-cell";
import { Payments, ReceiptLong, Users } from "@/lib/icons";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";

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
  const customersQuery = useQuery({
    queryKey: ["retail-customers-overview"],
    queryFn: () =>
      fetchJson<{
        data: CustomerRow[];
        summary: { namedCustomerCount: number; totalLoyaltyPoints: number };
      }>("/api/v2/retail/customers"),
  });
  const loyaltyDetailQuery = useQuery({
    queryKey: ["retail-customer-loyalty", activeCustomer?.id],
    queryFn: () =>
      fetchJson<CustomerLoyaltyPayload>(`/api/v2/retail/customers/${activeCustomer?.id}/loyalty`),
    enabled: Boolean(activeCustomer?.id),
  });

  const customerRows = useMemo<CustomerRow[]>(
    () => (customersQuery.data?.data ?? []).slice().sort((a, b) => b.totalSpend - a.totalSpend),
    [customersQuery.data?.data],
  );

  const spendRows = useMemo(
    () =>
      customerRows.slice(0, 8).map((c) => ({
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
    () =>
      customerRows
        .slice()
        .sort((a, b) => b.visits - a.visits)
        .slice(0, 8)
        .map((c) => ({
          id: c.customerId ?? c.customerName,
          label: c.customerName,
          value: c.visits,
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
            <div className="font-medium">{row.original.customerName}</div>
            <div className="t-caption t-muted font-mono">{row.original.lastSaleNo}</div>
          </div>
        ),
      },
      {
        id: "visits",
        header: "Visits",
        cell: ({ row }) => <NumericCell>{row.original.visits}</NumericCell>,
      },
      {
        id: "totalSpend",
        header: "Spend",
        cell: ({ row }) => <NumericCell>{money(row.original.totalSpend)}</NumericCell>,
      },
      {
        id: "loyalty",
        header: "Loyalty",
        cell: ({ row }) => <NumericCell>{row.original.loyaltyPoints}</NumericCell>,
      },
      { id: "tier", header: "Tier", cell: ({ row }) => row.original.loyaltyTier },
      {
        id: "actions",
        header: "",
        cell: ({ row }) =>
          row.original.customerId ? (
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setActiveCustomer({
                    id: row.original.customerId!,
                    name: row.original.customerName,
                  })
                }
              >
                Ledger
              </Button>
            </div>
          ) : null,
      },
    ],
    [],
  );

  const averageSpend = customerRows.length
    ? customerRows.reduce((total, c) => total + c.totalSpend, 0) / customerRows.length
    : 0;

  if (customersQuery.isPending) {
    return (
      <RetailShell title="Customers" actions={undefined}>
        <div aria-busy="true" aria-live="polite" className="space-y-5">
          <span className="sr-only">Fetching the customer list…</span>
          <div className="grid gap-5 xl:grid-cols-3">
            <Skeleton height={104} />
            <Skeleton height={104} />
            <Skeleton height={104} />
          </div>
          <Skeleton height={340} />
          <Skeleton height={280} />
        </div>
      </RetailShell>
    );
  }

  if (customersQuery.isError) {
    return (
      <RetailShell title="Customers" actions={undefined}>
        <Alert tone="danger" title="Customers would not load">
          {getApiErrorMessage(customersQuery.error)}
        </Alert>
      </RetailShell>
    );
  }

  return (
    <RetailShell title="Customers" actions={undefined}>
      {customerRows.length === 0 ? (
        <EmptyState
          title="No named customers yet"
          body="A customer appears here once a cashier attaches a name or a loyalty number to a sale. Walk-in trade is not listed."
        />
      ) : (
        <>
          <div className="grid gap-5 xl:grid-cols-3">
            <StatCard
              label="Named customers"
              value={String(customersQuery.data.summary.namedCustomerCount)}
              footer="Walk-in trade excluded"
            />
            <StatCard
              label="Top spend"
              value={money(customerRows[0]?.totalSpend ?? 0)}
              footer={customerRows[0]?.customerName ?? "No customer yet"}
            />
            <StatCard
              label="Loyalty points"
              value={String(customersQuery.data.summary.totalLoyaltyPoints)}
              footer={`Average spend ${money(averageSpend)}`}
            />
          </div>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(300px,0.8fr)]">
            <Card title="Spend against visits" subtitle="The eight biggest accounts">
              <AdminDualBarChart
                rows={spendRows}
                primaryLabel="Spend"
                secondaryLabel="Visits"
                height={300}
                valueFormatter={(v) => v.toFixed(0)}
                emptyLabel="No customer spend to show."
              />
            </Card>
            <Card title="Loyalty tiers">
              <AdminDonutChart
                rows={tierRows}
                valueLabel="Customers"
                valueFormatter={(v) => v.toString()}
                height={300}
                emptyLabel="No tiers assigned yet."
              />
            </Card>
          </div>

          <Card title="Visit frequency" subtitle="Who comes back most often">
            <AdminDistributionChart
              rows={visitRows}
              valueLabel="Visits"
              valueFormatter={(v) => v.toString()}
              height={280}
              emptyLabel="No visits to show."
            />
          </Card>

          <DataTable
            data={customerRows}
            columns={columns}
            features={{ sorting: true, globalFilter: true, pagination: true }}
            pagination={{ enabled: true, server: false }}
            searchPlaceholder="Search customers"
            emptyState="No customers match that search."
            /*
              R-4.5. Below `md`, the row becomes a card.

              Retail had none of these — twelve tables, zero
              `mobileCardRenderer`, while ten scrap-metal screens had used the
              pattern for months. A shopkeeper checking stock is doing it on a
              phone in the storeroom, which is the one place a horizontally
              scrolling eight-column table is worst.
            */
            mobileCardRenderer={({ row }) => (
              <MobileListCard>
                <MobileListCardHeader
                  title={row.customerName}
                  subtitle={row.lastSaleNo}
                  aside={<Badge variant="outline">{row.loyaltyTier}</Badge>}
                />
                <MobileListMetricStrip
                  items={[
                    { icon: Payments, value: retailMoney(row.totalSpend), srLabel: "Total spend" },
                    { icon: ReceiptLong, value: `${row.visits} visit(s)`, srLabel: "Visits" },
                    { icon: Users, value: `${row.loyaltyPoints} pts`, srLabel: "Loyalty points" },
                  ]}
                />
              </MobileListCard>
            )}
          />
        </>
      )}

      <Dialog
        open={Boolean(activeCustomer)}
        onOpenChange={(open) => !open && setActiveCustomer(null)}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Loyalty ledger — {activeCustomer?.name}</DialogTitle>
          </DialogHeader>
          {loyaltyDetailQuery.isPending ? (
            <div aria-busy="true" className="space-y-3">
              <Skeleton height={88} />
              <Skeleton height={200} />
            </div>
          ) : loyaltyDetailQuery.isError ? (
            <Alert tone="danger" title="The loyalty ledger would not load">
              {getApiErrorMessage(loyaltyDetailQuery.error)}
            </Alert>
          ) : (
            <div className="space-y-3">
              <div className="grid gap-3 md:grid-cols-4">
                <StatCard label="Earned" value={String(loyaltyDetailQuery.data.loyalty.earnedPoints)} />
                <StatCard
                  label="Redeemed"
                  value={String(loyaltyDetailQuery.data.loyalty.redeemedPoints)}
                />
                <StatCard label="Balance" value={String(loyaltyDetailQuery.data.loyalty.balance)} />
                <StatCard label="Tier" value={loyaltyDetailQuery.data.loyalty.tier} />
              </div>
              {loyaltyDetailQuery.data.ledger.length === 0 ? (
                <EmptyState
                  title="No points movement yet"
                  body="Points earned and redeemed against this customer will be listed here."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="table">
                    <caption className="sr-only">
                      Points earned and redeemed against {activeCustomer?.name}
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">Sale</th>
                        <th scope="col">Date</th>
                        <th scope="col" className="num">
                          Amount
                        </th>
                        <th scope="col" className="num">
                          Earned
                        </th>
                        <th scope="col" className="num">
                          Redeemed
                        </th>
                        <th scope="col" className="num">
                          Net
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {loyaltyDetailQuery.data.ledger.map((entry) => (
                        <tr key={entry.id}>
                          <td className="font-mono">{entry.saleNo}</td>
                          <td>{new Date(entry.postedAt).toLocaleDateString()}</td>
                          <td className="num">{money(entry.amount)}</td>
                          <td className="num">{entry.earnedPoints}</td>
                          <td className="num">{entry.redeemedPoints}</td>
                          <td className="num">{entry.delta}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </RetailShell>
  );
}
