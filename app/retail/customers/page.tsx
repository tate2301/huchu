"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert, Button, Skeleton } from "@corelithzw/react";

import { RecordDialog } from "@/components/crm/records/record-dialog";
import { RecordListShell } from "@/components/crm/records/record-list-shell";
import {
  ColumnFigure,
  ColumnList,
  ColumnName,
  ColumnRowAction,
  ColumnText,
  FactList,
  SectionHeading,
} from "@/components/management/ui";
import { retailMoney } from "@/components/retail/money";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import {
  enumLabel,
  formatQuantity,
  formatRetailDate,
  formatSignedMoney,
} from "@/lib/retail/words";

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

/** "+12", "−5" — a points movement is signed, with a true minus. */
function signedPoints(value: number) {
  if (value > 0) return `+${value}`;
  if (value < 0) return `−${Math.abs(value)}`;
  return "0";
}

const WIDTH = 960;
const LEDGER_WIDTH = 560;

const rowId = (customer: CustomerRow) => customer.customerId ?? customer.customerName;

/**
 * Customers — the named people the tills have sold to, and their points.
 *
 * Drawn as the products list is: search and the count in the toolbar, and a
 * `ColumnList` under it — the name and visits, tier, last visit, then points
 * and spend against the right edge. There is no customer page yet, so the
 * row's one verb, Points ledger, sits at its end and opens the ledger in a
 * dialog.
 */
export default function RetailCustomersPage() {
  const [search, setSearch] = useState("");
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

  const customers = useMemo(
    () =>
      (customersQuery.data?.data ?? []).map((customer) => ({ ...customer, id: rowId(customer) })),
    [customersQuery.data],
  );

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const sorted = customers.slice().sort((a, b) => b.totalSpend - a.totalSpend);
    if (!needle) return sorted;
    return sorted.filter((customer) => customer.customerName.toLowerCase().includes(needle));
  }, [customers, search]);

  const empty = search.trim() ? "No customer matches that search." : "No customers yet.";
  const visits = (customer: CustomerRow) => formatQuantity(customer.visits, "visit");

  const openLedger = (customer: CustomerRow) =>
    customer.customerId ? setActiveCustomer({ id: customer.customerId, name: customer.customerName }) : undefined;

  const ledger = loyaltyDetailQuery.data;

  return (
    <>
      <RecordListShell
        title="Customers"
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by name"
        count={customersQuery.isSuccess ? `${rows.length} of ${customers.length}` : null}
        error={customersQuery.error}
      >
        {customersQuery.isPending ? (
          <div className="space-y-1.5" aria-busy="true" style={{ maxWidth: WIDTH }}>
            <Skeleton height={44} />
            <Skeleton height={44} />
            <Skeleton height={44} />
          </div>
        ) : (
          <ColumnList
            label="Customers"
            maxWidth={WIDTH}
            empty={empty}
            columns={[
              { id: "customer", label: "Customer" },
              { id: "tier", label: "Tier", hideBelow: "md" },
              { id: "lastVisit", label: "Last visit", hideBelow: "md" },
              { id: "points", label: "Points", align: "end", hideBelow: "sm" },
              { id: "spend", label: "Spend", align: "end" },
              { id: "act", label: "" },
            ]}
            rows={rows.map((customer) => ({
              id: customer.id,
              cells: {
                customer: <ColumnName name={customer.customerName} meta={visits(customer)} />,
                tier: <ColumnText>{enumLabel(customer.loyaltyTier)}</ColumnText>,
                lastVisit: <ColumnFigure tone="muted">{formatRetailDate(customer.lastPurchaseAt)}</ColumnFigure>,
                points: (
                  <ColumnFigure tone={customer.loyaltyPoints ? "default" : "muted"}>
                    {customer.loyaltyPoints}
                  </ColumnFigure>
                ),
                spend: <ColumnFigure>{retailMoney(customer.totalSpend)}</ColumnFigure>,
                act: customer.customerId ? (
                  <ColumnRowAction>
                    <Button type="button" size="sm" variant="secondary" onClick={() => openLedger(customer)}>
                      Points ledger
                    </Button>
                  </ColumnRowAction>
                ) : null,
              },
            }))}
          />
        )}
      </RecordListShell>

      <RecordDialog
        open={Boolean(activeCustomer)}
        onOpenChange={(open) => !open && setActiveCustomer(null)}
        title={activeCustomer?.name ?? "Points ledger"}
        size="md"
      >
        {loyaltyDetailQuery.isPending ? (
          <div aria-busy="true" className="space-y-3">
            <span className="sr-only">Loading the points ledger</span>
            <Skeleton height={44} />
            <Skeleton height={44} />
            <Skeleton height={44} />
          </div>
        ) : loyaltyDetailQuery.isError ? (
          <Alert tone="danger" title="The points ledger would not load">
            {getApiErrorMessage(loyaltyDetailQuery.error)}
          </Alert>
        ) : ledger ? (
          <div>
            <FactList
              maxWidth={null}
              items={[
                { label: "Tier", value: enumLabel(ledger.loyalty.tier) },
                { label: "Balance", value: ledger.loyalty.balance, mono: true },
                { label: "Earned", value: ledger.loyalty.earnedPoints, mono: true },
                { label: "Redeemed", value: ledger.loyalty.redeemedPoints, mono: true },
                {
                  label: "Phone",
                  value: ledger.customer.phone ?? "Not on file",
                  mono: Boolean(ledger.customer.phone),
                  tone: ledger.customer.phone ? "default" : "muted",
                },
              ]}
            />
            <SectionHeading maxWidth={LEDGER_WIDTH} count={ledger.ledger.length}>
              Points ledger
            </SectionHeading>
            <ColumnList
              label="Points ledger"
              maxWidth={LEDGER_WIDTH}
              empty="No points earned or redeemed yet."
              columns={[
                { id: "sale", label: "Sale" },
                { id: "amount", label: "Amount", align: "end" },
                { id: "points", label: "Points", align: "end" },
              ]}
              rows={ledger.ledger.map((entry) => ({
                id: entry.id,
                cells: {
                  sale: (
                    <ColumnName
                      code={entry.saleNo}
                      name={formatRetailDate(entry.postedAt)}
                      href={`/retail/sales/${entry.id}`}
                    />
                  ),
                  amount: <ColumnFigure>{formatSignedMoney(entry.amount)}</ColumnFigure>,
                  points: <ColumnFigure>{signedPoints(entry.delta)}</ColumnFigure>,
                },
              }))}
            />
          </div>
        ) : null}
      </RecordDialog>
    </>
  );
}
