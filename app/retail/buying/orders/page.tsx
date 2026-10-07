"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, Skeleton } from "@corelithzw/react";

import { RecordListShell } from "@/components/crm/records/record-list-shell";
import { ColumnFigure, ColumnList, ColumnName, ColumnText, StatusDot } from "@/components/management/ui";
import { FILTER_ANY, ViewToolbarFilter } from "@/components/records/view-toolbar";
import { retailMoney } from "@/components/retail/sale-detail";
import { fetchJson } from "@/lib/api-client";
import { formatQuantity, formatRetailDate, orderStatusLabel } from "@/lib/retail/words";

import { OrderDialog } from "./_components/order-dialog";

type Order = {
  id: string;
  poNo: string;
  siteId: string;
  supplierName: string;
  status: string;
  expectedDate: string | null;
  totalValue: number;
  totalQuantity: number;
  receivedQuantity: number;
  site: { id: string; name: string; code: string } | null;
};

const STATUS_OPTIONS = new Map(
  ["DRAFT", "PARTIAL", "RECEIVED", "CLOSED"].map((status) => [status, orderStatusLabel(status)]),
);

/** A register's measure: wide enough for its figures, not the whole window. */
const WIDTH = 960;

/** Delivered is the finished case and draws nothing; the rest are one word. */
function orderStatusDot(status: string) {
  if (status === "RECEIVED") return null;
  return (
    <StatusDot tone={status === "PARTIAL" ? "warn" : "neutral"} label={orderStatusLabel(status)} />
  );
}

/**
 * Orders — what the shop has asked its suppliers for.
 *
 * Drawn as the products list is: the name in the app bar with the one verb, a
 * toolbar of search and status with the count, and a `ColumnList` under it —
 * the order number, the supplier and the site, then how much has arrived and
 * what it is worth. Receiving, editing and removing an order are on its record,
 * not in a menu on every row.
 */
export default function RetailOrdersPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>(FILTER_ANY);
  const [dialogOpen, setDialogOpen] = useState(false);
  // A new key per opening, so the form starts empty every time.
  const [opening, setOpening] = useState(0);

  const ordersQuery = useQuery({
    queryKey: ["retail-purchase-orders"],
    queryFn: () => fetchJson<{ data: Order[] }>("/api/v2/retail/purchasing/orders"),
  });
  const orders = useMemo(() => ordersQuery.data?.data ?? [], [ordersQuery.data]);

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return orders.filter((order) => {
      if (status !== FILTER_ANY && order.status !== status) return false;
      if (!needle) return true;
      return [order.poNo, order.supplierName].some((value) => value.toLowerCase().includes(needle));
    });
  }, [orders, search, status]);

  const create = () => {
    setOpening((current) => current + 1);
    setDialogOpen(true);
  };

  const narrowed = Boolean(search.trim()) || status !== FILTER_ANY;
  const empty = search.trim()
    ? "No order matches that search."
    : status !== FILTER_ANY
      ? "No order matches this filter."
      : "No orders yet.";

  return (
    <>
      <RecordListShell
        title="Orders"
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by order number or supplier"
        filters={
          <ViewToolbarFilter
            label="Status"
            value={status}
            anyLabel="Any status"
            options={STATUS_OPTIONS}
            onChange={setStatus}
          />
        }
        filterCount={status === FILTER_ANY ? 0 : 1}
        count={ordersQuery.isSuccess ? `${rows.length} of ${orders.length}` : null}
        createLabel="New order"
        onCreate={create}
        error={ordersQuery.error}
      >
        {ordersQuery.isPending ? (
          <div className="space-y-1.5" aria-busy="true" style={{ maxWidth: WIDTH }}>
            <Skeleton height={44} />
            <Skeleton height={44} />
            <Skeleton height={44} />
          </div>
        ) : (
          <div className="space-y-3">
            {/* A delivered order draws no state (rule 5); a part-delivered one
                says so, and its Delivered figure is amber until it is whole. */}
            <ColumnList
              label="Orders"
              maxWidth={WIDTH}
              empty={empty}
              columns={[
                { id: "order", label: "Order" },
                { id: "status", label: "Status", hideBelow: "sm" },
                { id: "expected", label: "Expected", hideBelow: "md" },
                { id: "delivered", label: "Delivered", align: "end", hideBelow: "sm" },
                { id: "value", label: "Value", align: "end" },
              ]}
              rows={rows.map((order) => {
                const whole = order.receivedQuantity >= order.totalQuantity;
                return {
                  id: order.id,
                  cells: {
                    order: (
                      <ColumnName
                        code={order.poNo}
                        name={order.supplierName}
                        meta={order.site?.name ?? "No site"}
                        href={`/retail/buying/orders/${order.id}`}
                      />
                    ),
                    status: orderStatusDot(order.status),
                    expected: <ColumnText>{formatRetailDate(order.expectedDate) || "No date"}</ColumnText>,
                    delivered: (
                      <ColumnFigure
                        tone={whole ? "default" : order.receivedQuantity > 0 ? "warn" : "muted"}
                      >
                        {`${formatQuantity(order.receivedQuantity)} of ${formatQuantity(order.totalQuantity)}`}
                      </ColumnFigure>
                    ),
                    value: <ColumnFigure>{retailMoney(order.totalValue)}</ColumnFigure>,
                  },
                };
              })}
            />
            {rows.length === 0 && !narrowed ? (
              <Button variant="primary" size="sm" onClick={create}>
                New order
              </Button>
            ) : null}
          </div>
        )}
      </RecordListShell>

      <OrderDialog key={opening} open={dialogOpen} onOpenChange={setDialogOpen} order={null} />
    </>
  );
}
