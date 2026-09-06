"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Alert, Skeleton, StatCard } from "@corelithzw/react";

import { RetailShell } from "@/components/retail/retail-shell";
import { retailMoney, retailTypeLabel } from "@/components/retail/sale-detail";
import { Button } from "@corelithzw/ui/components/button";
import { NumericCell } from "@corelithzw/ui/components/numeric-cell";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { LocalShipping, Package } from "@corelithzw/ui/lib/icons";

/**
 * One purchase order, and how much of it has actually turned up.
 *
 * R-4.3. The list could open an order in the edit dialog, which is a form: it
 * shows what was ordered and says nothing about what has been received against
 * it. `receivedQuantity` is on every line and no screen rendered it, so the
 * only way to answer "is this delivery complete" was to read the status badge
 * and trust it.
 */

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

function when(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString();
}

export default function RetailPurchaseOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const orderId = params?.id ?? "";

  const query = useQuery({
    queryKey: ["retail-purchase-order", orderId],
    enabled: Boolean(orderId),
    queryFn: () =>
      fetchJson<{ data: OrderDetail }>(`/api/v2/retail/purchasing/orders/${orderId}`),
  });

  const order = query.data?.data;

  const ordered = order?.lines.reduce((sum, line) => sum + Number(line.lineTotal), 0) ?? 0;
  const outstanding =
    order?.lines.reduce(
      (sum, line) =>
        sum + Math.max(Number(line.quantity) - Number(line.receivedQuantity), 0) * Number(line.unitCost),
      0,
    ) ?? 0;

  return (
    <RetailShell
      area="purchasing"
      title={order?.poNo ?? "Purchase order"}
      description={
        order
          ? `${order.supplierName} · ${retailTypeLabel(order.status)} · ${order.site?.name ?? "Unknown branch"}`
          : "One order, its lines, and what has been received against it."
      }
      actions={
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href="/retail/purchasing/orders">
              <Package className="h-4 w-4" />
              All orders
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href={`/retail/purchasing/receipts?orderId=${orderId}`}>
              <LocalShipping className="h-4 w-4" />
              Book a delivery in
            </Link>
          </Button>
        </div>
      }
    >
      {query.isPending ? (
        <div aria-busy="true" aria-live="polite" className="space-y-4">
          <span className="sr-only">Fetching the purchase order…</span>
          <Skeleton height={104} />
          <Skeleton height={280} />
        </div>
      ) : query.isError ? (
        <Alert tone="danger" title="That order would not open">
          {getApiErrorMessage(query.error)}
        </Alert>
      ) : !order ? (
        <Alert tone="warn" title="No order with that reference">
          The link may be from another shop, or the order may since have been
          removed. Open the orders list and search for the PO number.
        </Alert>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <StatCard label="Order value" value={retailMoney(ordered)} />
            <StatCard
              label="Still to come"
              value={retailMoney(outstanding)}
              tone={outstanding > 0 ? "warn" : "success"}
              footer={outstanding > 0 ? "At the ordered price" : "Fully received"}
            />
            <StatCard label="Expected" value={when(order.expectedDate)} />
            <StatCard label="Raised" value={when(order.createdAt)} />
          </div>

          {order.notes ? (
            <Alert tone="warn" title="Recorded against this order">
              {order.notes}
            </Alert>
          ) : null}

          {/*
            Ordered against received, per line, which is the thing the edit
            dialog could not show. A part-received order reads as PARTIAL in a
            badge; this says which line is holding it up.
          */}
          <section aria-labelledby="order-lines">
            <h3 id="order-lines" className="t-section t-strong">
              Lines
            </h3>
            <ul className="list-plain mt-2">
              {order.lines.map((line) => {
                const short = Number(line.quantity) - Number(line.receivedQuantity);
                return (
                  <li key={line.id} className="list-item">
                    <span className="lead" aria-hidden="true" />
                    <div>
                      <div className="title bold">{line.itemName}</div>
                      <div className="sub">
                        {Number(line.receivedQuantity).toFixed(2)} of{" "}
                        {Number(line.quantity).toFixed(2)} received at{" "}
                        {retailMoney(Number(line.unitCost))}
                        {short > 0 ? ` · ${short.toFixed(2)} outstanding` : " · complete"}
                      </div>
                    </div>
                    <NumericCell>{retailMoney(Number(line.lineTotal))}</NumericCell>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      )}
    </RetailShell>
  );
}
