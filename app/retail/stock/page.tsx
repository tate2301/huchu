"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert, Skeleton } from "@corelithzw/react";

import {
  ColumnFigure,
  ColumnList,
  ColumnName,
  ColumnText,
  FactList,
  SectionHeading,
} from "@/components/management/ui";
import { RecordCell, RecordTable, RecordTableName } from "@/components/records/record-table";
import { RetailShell } from "@/components/retail/retail-shell";
import { retailMoney } from "@/components/retail/sale-detail";
import { Button } from "@/components/ui/button";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { ClipboardList } from "@/lib/icons";
import { formatQuantity, formatRetailDate } from "@/lib/retail/words";

type RetailDashboardPayload = {
  summary: {
    goodsReceivedValue: number;
    openOrderValue: number;
    lowStockCount: number;
  };
  lowStock: Array<{
    id: string;
    itemCode: string;
    name: string;
    currentStock: number;
    minStock: number;
    unit: string;
  }>;
};

type Delivery = {
  id: string;
  receiptNo: string;
  supplierName: string;
  createdAt: string;
  totalValue: number;
};

type Watch = {
  id: string;
  itemCode: string;
  name: string;
  onHand: number;
  reorderAt: number;
  shortBy: number;
  unit: string;
};

const WIDTH = 560;
const WIDE = 760;

/**
 * Stock — what needs attention.
 *
 * The products at or under their reorder point, most short first, then what
 * is on order and the last deliveries. The tile band and the three charts
 * that sat over the watchlist restated its own rows as shapes (D3), and the
 * bar's Receive stock and More were navigation (D5): the one verb here is
 * counting, which opens the stock counts page with its dialog up.
 */
export default function RetailStockPage() {
  const overview = useQuery({
    queryKey: ["retail-stock-overview"],
    queryFn: () => fetchJson<RetailDashboardPayload>("/api/v2/retail"),
  });
  const deliveries = useQuery({
    queryKey: ["retail-receipts"],
    queryFn: () => fetchJson<{ data: Delivery[] }>("/api/v2/retail/purchasing/receipts"),
  });

  const watch = useMemo<Watch[]>(
    () =>
      (overview.data?.lowStock ?? [])
        .map((item) => {
          const onHand = Number(item.currentStock);
          const reorderAt = Number(item.minStock);
          return {
            id: item.id,
            itemCode: item.itemCode,
            name: item.name,
            onHand,
            reorderAt,
            shortBy: Math.max(reorderAt - onHand, 0),
            unit: item.unit,
          };
        })
        .sort((left, right) => right.shortBy - left.shortBy),
    [overview.data?.lowStock],
  );

  const lastDeliveries = (deliveries.data?.data ?? []).slice(0, 5);

  const actions = (
    <Button asChild size="sm">
      <Link href="/retail/stock/count?new=1">
        <ClipboardList className="h-4 w-4" />
        Count stock
      </Link>
    </Button>
  );

  if (overview.isPending) {
    return (
      <RetailShell title="Stock" actions={actions}>
        <div aria-busy="true" aria-live="polite" className="space-y-2">
          <span className="sr-only">Loading the stock</span>
          <Skeleton height={36} />
          <Skeleton height={36} />
          <Skeleton height={36} />
        </div>
      </RetailShell>
    );
  }

  if (overview.isError) {
    return (
      <RetailShell title="Stock" actions={actions}>
        <Alert tone="danger" title="The stock would not load">
          {getApiErrorMessage(overview.error)}
        </Alert>
      </RetailShell>
    );
  }

  const { summary } = overview.data;

  return (
    <RetailShell title="Stock" actions={actions}>
      <SectionHeading maxWidth={WIDE} count={summary.lowStockCount}>
        Running low
      </SectionHeading>
      <div style={{ maxWidth: WIDE }}>
        <RecordTable
          rows={watch}
          emptyTitle="Nothing is running low"
          columns={[
            {
              id: "product",
              label: "Product",
              cell: (row) => <RecordTableName title={row.name} subtitle={row.itemCode} />,
            },
            {
              id: "onHand",
              label: "On hand",
              align: "end",
              width: "9rem",
              cell: (row) => <RecordCell kind="number" value={formatQuantity(row.onHand, row.unit)} />,
            },
            {
              id: "reorderAt",
              label: "Reorder at",
              align: "end",
              width: "9rem",
              cell: (row) => <RecordCell kind="number" value={formatQuantity(row.reorderAt, row.unit)} />,
            },
            {
              id: "shortBy",
              label: "Short by",
              align: "end",
              width: "9rem",
              cell: (row) => (
                <RecordCell kind="number" value={row.shortBy > 0 ? formatQuantity(row.shortBy, row.unit) : "—"} />
              ),
            },
          ]}
        />
      </div>

      <SectionHeading maxWidth={WIDTH}>Orders</SectionHeading>
      <FactList
        maxWidth={WIDTH}
        items={[
          { label: "On order", value: retailMoney(summary.openOrderValue), mono: true },
          { label: "Delivered this month", value: retailMoney(summary.goodsReceivedValue), mono: true },
        ]}
      />

      <SectionHeading maxWidth={WIDTH}>Last deliveries</SectionHeading>
      {deliveries.isPending ? (
        <div aria-busy="true" aria-live="polite" className="space-y-2" style={{ maxWidth: WIDTH }}>
          <span className="sr-only">Loading the deliveries</span>
          <Skeleton height={44} />
          <Skeleton height={44} />
        </div>
      ) : deliveries.isError ? (
        <Alert tone="danger" title="The deliveries would not load">
          {getApiErrorMessage(deliveries.error)}
        </Alert>
      ) : (
        <ColumnList
          label="Last deliveries"
          maxWidth={WIDTH}
          empty="No deliveries yet"
          columns={[
            { id: "delivery", label: "Delivery" },
            { id: "date", label: "Date", hideBelow: "sm" },
            { id: "value", label: "Value", align: "end" },
          ]}
          rows={lastDeliveries.map((delivery) => ({
            id: delivery.id,
            cells: {
              delivery: <ColumnName code={delivery.receiptNo} name={delivery.supplierName} />,
              date: <ColumnText>{formatRetailDate(delivery.createdAt)}</ColumnText>,
              value: <ColumnFigure>{retailMoney(Number(delivery.totalValue))}</ColumnFigure>,
            },
          }))}
        />
      )}
    </RetailShell>
  );
}
