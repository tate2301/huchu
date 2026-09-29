"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

import { RecordListShell } from "@/components/crm/records/record-list-shell";
import { StatusDot } from "@/components/management/ui";
import { RecordList } from "@/components/records/record-list";
import { RecordCell, RecordTable, RecordTableName } from "@/components/records/record-table";
import { FILTER_ANY, ViewToolbarFilter } from "@/components/records/view-toolbar";
import { saleExceptionLabel } from "@/components/retail/sale-detail";
import { fetchJson } from "@/lib/api-client";
import { canAccessPosPortal } from "@/lib/retail/pos-host";
import { formatRetailDateTime, formatSignedMoney, tenderLabel } from "@/lib/retail/words";

type SaleRow = {
  id: string;
  saleNo: string;
  saleType: string;
  status: string;
  cashierName: string | null;
  customerName: string | null;
  postedAt: string;
  totalAmount: number;
  tenderTypes: string[];
};

const TYPE_OPTIONS = new Map([
  ["SALE", "Sale"],
  ["REFUND", "Refund"],
  ["VOID", "Void"],
]);

function SaleState({ sale }: { sale: SaleRow }) {
  const label = saleExceptionLabel(sale);
  if (!label) return null;
  return <StatusDot tone={sale.saleType === "VOID" ? "warn" : "neutral"} label={label} />;
}

const tenders = (sale: SaleRow) => sale.tenderTypes.map(tenderLabel).join(", ");

/**
 * Sales — every sale, refund and void the tills have posted.
 *
 * Drawn as the products list is: the name in the app bar, a toolbar of search
 * and two filters, and the records flush under it. The tiles, the four charts
 * and the rail of queues that sat over the table are gone (D3); a refund or a
 * void says so in its own row, and a row opens the sale's own page.
 */
export default function RetailSalesPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const canOpenPos = canAccessPosPortal(session?.user?.role);
  const [search, setSearch] = useState("");
  const [type, setType] = useState<string>(FILTER_ANY);
  const [tender, setTender] = useState<string>(FILTER_ANY);

  const salesQuery = useQuery({
    queryKey: ["retail-sales-overview"],
    queryFn: () =>
      fetchJson<{ data: SaleRow[]; summary: Record<string, number> }>("/api/v2/retail/pos/sales?limit=120"),
  });
  const sales = useMemo(() => salesQuery.data?.data ?? [], [salesQuery.data]);

  const tenderOptions = useMemo(() => {
    const seen = new Set(sales.flatMap((sale) => sale.tenderTypes));
    return new Map([...seen].sort().map((value) => [value, tenderLabel(value)]));
  }, [sales]);

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return sales.filter((sale) => {
      if (type !== FILTER_ANY && sale.saleType !== type) return false;
      if (tender !== FILTER_ANY && !sale.tenderTypes.includes(tender)) return false;
      if (!needle) return true;
      return [sale.saleNo, sale.cashierName ?? "", sale.customerName ?? ""].some((value) =>
        value.toLowerCase().includes(needle),
      );
    });
  }, [sales, search, type, tender]);

  const filterCount = (type === FILTER_ANY ? 0 : 1) + (tender === FILTER_ANY ? 0 : 1);
  const emptyTitle = search.trim()
    ? "No sales match that search"
    : filterCount > 0
      ? "No sales match this filter"
      : "No sales yet";

  return (
    <RecordListShell
      title="Sales"
      search={search}
      onSearchChange={setSearch}
      searchPlaceholder="Search by sale number, cashier or customer"
      filters={
        <>
          <ViewToolbarFilter
            label="Type"
            value={type}
            anyLabel="Any type"
            options={TYPE_OPTIONS}
            onChange={setType}
          />
          <ViewToolbarFilter
            label="Tender"
            value={tender}
            anyLabel="Any tender"
            options={tenderOptions}
            onChange={setTender}
          />
        </>
      }
      filterCount={filterCount}
      count={salesQuery.isSuccess ? `${rows.length} of ${sales.length}` : null}
      createLabel={canOpenPos ? "Open the till" : undefined}
      onCreate={canOpenPos ? () => router.push("/portal/pos") : undefined}
      error={salesQuery.error}
    >
      <RecordTable
        rows={rows}
        isLoading={salesQuery.isPending}
        emptyTitle={emptyTitle}
        rowHref={(sale) => `/retail/sales/${sale.id}`}
        columns={[
          {
            id: "sale",
            label: "Sale",
            cell: (sale) => (
              <RecordTableName title={sale.saleNo} subtitle={formatRetailDateTime(sale.postedAt)} />
            ),
          },
          {
            id: "state",
            label: "Status",
            width: "7rem",
            cell: (sale) => <SaleState sale={sale} />,
          },
          {
            id: "cashier",
            label: "Cashier",
            cell: (sale) => <RecordCell value={sale.cashierName ?? "Not on file"} />,
          },
          {
            id: "customer",
            label: "Customer",
            cell: (sale) => <RecordCell value={sale.customerName ?? "Walk-in"} />,
          },
          {
            id: "tender",
            label: "Tender",
            cell: (sale) => <RecordCell value={tenders(sale)} />,
          },
          {
            id: "total",
            label: "Total",
            align: "end",
            width: "8rem",
            cell: (sale) => <RecordCell kind="money" value={formatSignedMoney(sale.totalAmount)} />,
          },
        ]}
        mobile={
          <RecordList
            rows={rows.map((sale) => ({
              id: sale.id,
              href: `/retail/sales/${sale.id}`,
              title: sale.saleNo,
              subtitle: formatRetailDateTime(sale.postedAt),
              status: <SaleState sale={sale} />,
              facts: [
                {
                  label: "Total",
                  value: formatSignedMoney(sale.totalAmount),
                  kind: "money",
                  primary: true,
                },
                { label: "Tender", value: tenders(sale) },
              ],
            }))}
            isLoading={salesQuery.isPending}
            emptyTitle={emptyTitle}
          />
        }
      />
    </RecordListShell>
  );
}
