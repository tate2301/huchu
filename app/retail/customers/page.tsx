"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert, Skeleton } from "@corelithzw/react";

import { RecordDialog } from "@/components/crm/records/record-dialog";
import { RecordListShell } from "@/components/crm/records/record-list-shell";
import {
  ColumnFigure,
  ColumnList,
  ColumnName,
  FactList,
  SectionHeading,
} from "@/components/management/ui";
import { RecordCell, RecordTable, RecordTableName } from "@/components/records/record-table";
import { RowMenu } from "@/components/retail/row-menu";
import { retailMoney } from "@/components/retail/sale-detail";
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

const LEDGER_WIDTH = 560;

const rowId = (customer: CustomerRow) => customer.customerId ?? customer.customerName;

/**
 * Customers — the named people the tills have sold to, and their points.
 *
 * Drawn as the products list is: the name in the app bar, search and the count
 * in the toolbar, and the records under it. The tiles and the three charts
 * that sat over the table are gone (D3). A customer's points ledger opens from
 * the row's menu; there is no customer page to link to yet.
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

  const emptyTitle = search.trim() ? "No customers match that search" : "No customers yet";
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
        <RecordTable
          rows={rows}
          isLoading={customersQuery.isPending}
          emptyTitle={emptyTitle}
          columns={[
            {
              id: "customer",
              label: "Customer",
              cell: (customer) => <RecordTableName title={customer.customerName} subtitle={visits(customer)} />,
            },
            {
              id: "tier",
              label: "Tier",
              width: "7rem",
              cell: (customer) => <RecordCell value={enumLabel(customer.loyaltyTier)} />,
            },
            {
              id: "points",
              label: "Points",
              align: "end",
              width: "7rem",
              cell: (customer) => <RecordCell kind="number" value={customer.loyaltyPoints} />,
            },
            {
              id: "spend",
              label: "Spend",
              align: "end",
              width: "8rem",
              cell: (customer) => <RecordCell kind="money" value={retailMoney(customer.totalSpend)} />,
            },
            {
              id: "lastVisit",
              label: "Last visit",
              width: "9rem",
              cell: (customer) => <RecordCell kind="date" value={formatRetailDate(customer.lastPurchaseAt)} />,
            },
            {
              id: "menu",
              label: "",
              width: "3rem",
              align: "end",
              cell: (customer) =>
                customer.customerId ? (
                  <RowMenu
                    label={`More for ${customer.customerName}`}
                    items={[{ label: "Open the points ledger", onSelect: () => openLedger(customer) }]}
                  />
                ) : null,
            },
          ]}
        />
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
              empty="No points earned or redeemed yet"
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
