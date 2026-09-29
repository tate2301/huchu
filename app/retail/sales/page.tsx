"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { Button, Skeleton } from "@corelithzw/react";

import { RecordListShell } from "@/components/crm/records/record-list-shell";
import { ColumnFigure, ColumnList, ColumnName, ColumnText, StatusDot } from "@/components/management/ui";
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

/** A register's measure: wide enough for its figures, not the whole window. */
const WIDTH = 960;

/**
 * Sales — every sale, refund and void the tills have posted.
 *
 * Drawn as the products list is: the name in the app bar, a toolbar of search
 * and two filters with the count, and a `ColumnList` under it — the sale
 * number, the customer and when, then the cashier, the tender and the total. A
 * refund or a void says so in its own row; the sale number opens the sale's
 * own page. Sales are rung on the till, so the list's one verb opens it.
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
  const narrowed = Boolean(search.trim()) || filterCount > 0;
  const empty = search.trim()
    ? "No sale matches that search."
    : filterCount > 0
      ? "No sale matches this filter."
      : "No sales yet.";

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
      {salesQuery.isPending ? (
        <div className="space-y-1.5" aria-busy="true" style={{ maxWidth: WIDTH }}>
          <Skeleton height={44} />
          <Skeleton height={44} />
          <Skeleton height={44} />
        </div>
      ) : (
        <div className="space-y-3">
          {/* A plain sale draws no state (rule 5); a refund, a void and a
              voided sale each say so in one word. */}
          <ColumnList
            label="Sales"
            maxWidth={WIDTH}
            empty={empty}
            columns={[
              { id: "sale", label: "Sale" },
              { id: "state", label: "Status", hideBelow: "sm" },
              { id: "cashier", label: "Cashier", hideBelow: "md" },
              { id: "tender", label: "Tender", hideBelow: "sm" },
              { id: "total", label: "Total", align: "end" },
            ]}
            rows={rows.map((sale) => ({
              id: sale.id,
              cells: {
                sale: (
                  <ColumnName
                    code={sale.saleNo}
                    name={sale.customerName ?? "Walk-in"}
                    meta={formatRetailDateTime(sale.postedAt)}
                    href={`/retail/sales/${sale.id}`}
                  />
                ),
                state: <SaleState sale={sale} />,
                cashier: <ColumnText>{sale.cashierName ?? "Not on file"}</ColumnText>,
                tender: <ColumnText>{tenders(sale)}</ColumnText>,
                total: <ColumnFigure>{formatSignedMoney(sale.totalAmount)}</ColumnFigure>,
              },
            }))}
          />
          {rows.length === 0 && !narrowed && canOpenPos ? (
            <Button variant="primary" size="sm" onClick={() => router.push("/portal/pos")}>
              Open the till
            </Button>
          ) : null}
        </div>
      )}
    </RecordListShell>
  );
}
