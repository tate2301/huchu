"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Alert, Skeleton } from "@corelithzw/react";

import {
  ColumnFigure,
  ColumnList,
  ColumnName,
  FactList,
  SectionHeading,
  StatusBadge,
} from "@/components/management/ui";
import { RetailShell } from "@/components/retail/retail-shell";
import { retailMoney } from "@/components/retail/sale-detail";
import { Button } from "@/components/ui/button";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { LocalShipping } from "@/lib/icons";
import { formatQuantity, formatRetailDate, orderStatusLabel } from "@/lib/retail/words";

type OrderDetail = {
  id: string;
  poNo: string;
  supplierName: string;
  status: string;
  expectedDate: string | null;
  notes: string | null;
  createdAt: string;
  site: { id: string; name: string; code: string } | null;
  lines: Array<{
    id: string;
    itemName: string;
    quantity: number;
    receivedQuantity: number;
    unitCost: number;
    lineTotal: number;
  }>;
};

const WIDTH = 640;

/**
 * One order, and how much of it has actually turned up.
 *
 * Drawn as a management record: the order number in the app bar with its one
 * verb, the facts in 44px rows, and the lines as a list of ordered against
 * delivered. The four tiles that opened the page are gone (D3); what they
 * said — value, still to come, expected, raised — is in the facts.
 */
export default function RetailOrderPage() {
  const params = useParams<{ id: string }>();
  const orderId = params?.id ?? "";

  const query = useQuery({
    queryKey: ["retail-purchase-order", orderId],
    enabled: Boolean(orderId),
    queryFn: () => fetchJson<{ data: OrderDetail }>(`/api/v2/retail/purchasing/orders/${orderId}`),
  });

  const order = query.data?.data;

  const value = order?.lines.reduce((sum, line) => sum + Number(line.lineTotal), 0) ?? 0;
  const stillToCome =
    order?.lines.reduce(
      (sum, line) =>
        sum + Math.max(Number(line.quantity) - Number(line.receivedQuantity), 0) * Number(line.unitCost),
      0,
    ) ?? 0;

  return (
    <RetailShell
      title={order?.poNo ?? "Order"}
      actions={
        order && stillToCome > 0 ? (
          <Button asChild size="sm">
            <Link href={`/retail/purchasing/receipts?orderId=${order.id}`}>
              <LocalShipping className="h-4 w-4" />
              Receive a delivery
            </Link>
          </Button>
        ) : null
      }
    >
      {query.isPending ? (
        <div aria-busy="true" aria-live="polite" className="space-y-3" style={{ maxWidth: WIDTH }}>
          <span className="sr-only">Loading the order</span>
          <Skeleton height={44} />
          <Skeleton height={44} />
          <Skeleton height={44} />
        </div>
      ) : query.isError ? (
        <Alert tone="danger" title="The order would not load">
          {getApiErrorMessage(query.error)}
        </Alert>
      ) : !order ? (
        <p className="text-sm text-[var(--text-muted)]">There is no order at this address.</p>
      ) : (
        <div>
          {order.status !== "RECEIVED" ? (
            <div className="flex flex-wrap gap-2">
              <StatusBadge tone={order.status === "PARTIAL" ? "warn" : "neutral"} context="header">
                {orderStatusLabel(order.status)}
              </StatusBadge>
            </div>
          ) : null}

          <SectionHeading maxWidth={WIDTH}>Order</SectionHeading>
          <FactList
            maxWidth={WIDTH}
            items={[
              { label: "Supplier", value: order.supplierName },
              {
                label: "Site",
                value: order.site?.name ?? "No site",
                tone: order.site ? "default" : "muted",
              },
              {
                label: "Expected",
                value: formatRetailDate(order.expectedDate) || "No date",
                mono: Boolean(order.expectedDate),
                tone: order.expectedDate ? "default" : "muted",
              },
              { label: "Raised", value: formatRetailDate(order.createdAt), mono: true },
              { label: "Value", value: retailMoney(value), mono: true },
              {
                label: "Still to come",
                value: stillToCome > 0 ? retailMoney(stillToCome) : "Nothing",
                mono: stillToCome > 0,
                tone: stillToCome > 0 ? "warn" : "muted",
              },
              ...(order.notes ? [{ label: "Notes", value: order.notes }] : []),
            ]}
          />

          <SectionHeading maxWidth={WIDTH}>Products</SectionHeading>
          <ColumnList
            label="Products"
            maxWidth={WIDTH}
            empty="No products on this order"
            columns={[
              { id: "product", label: "Product" },
              { id: "ordered", label: "Ordered", align: "end" },
              { id: "delivered", label: "Delivered", align: "end" },
              { id: "cost", label: "Cost", align: "end", hideBelow: "sm" },
              { id: "value", label: "Value", align: "end" },
            ]}
            rows={order.lines.map((line) => {
              const received = Number(line.receivedQuantity);
              const ordered = Number(line.quantity);
              return {
                id: line.id,
                cells: {
                  product: <ColumnName name={line.itemName} />,
                  ordered: <ColumnFigure>{formatQuantity(ordered)}</ColumnFigure>,
                  delivered: (
                    <ColumnFigure tone={received >= ordered ? "default" : received > 0 ? "warn" : "muted"}>
                      {formatQuantity(received)}
                    </ColumnFigure>
                  ),
                  cost: <ColumnFigure>{retailMoney(Number(line.unitCost))}</ColumnFigure>,
                  value: <ColumnFigure>{retailMoney(Number(line.lineTotal))}</ColumnFigure>,
                },
              };
            })}
            total={{
              product: <ColumnName name="Total" />,
              value: <ColumnFigure>{retailMoney(value)}</ColumnFigure>,
            }}
          />
        </div>
      )}
    </RetailShell>
  );
}
