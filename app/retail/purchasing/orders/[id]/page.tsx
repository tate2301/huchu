"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Skeleton } from "@corelithzw/react";

import {
  ColumnFigure,
  ColumnList,
  ColumnName,
  FactList,
  HeaderAction,
  RecordHeader,
  SectionHeading,
  StatusBadge,
} from "@/components/management/ui";
import { RetailShell } from "@/components/retail/retail-shell";
import { retailMoney } from "@/components/retail/sale-detail";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { dsConfirm } from "@/components/ui/ds-confirm";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { LocalShipping, Package } from "@/lib/icons";
import { formatQuantity, formatRetailDate, orderStatusLabel } from "@/lib/retail/words";

import { OrderDialog } from "../_components/order-dialog";

type OrderDetail = {
  id: string;
  poNo: string;
  siteId: string;
  supplierName: string;
  status: string;
  expectedDate: string | null;
  notes: string | null;
  createdAt: string;
  site: { id: string; name: string; code: string } | null;
  lines: Array<{
    id: string;
    inventoryItemId: string | null;
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
 * Drawn as a management record: the header with the order number, a badge
 * only while the order is not fully delivered, the one verb (Receive a
 * delivery, while anything is still owed) and the rare ones behind its "…"
 * (Edit, Remove); then the facts in 44px rows and the lines as a list of
 * ordered against delivered.
 */
export default function RetailOrderPage() {
  const params = useParams<{ id: string }>();
  const orderId = params?.id ?? "";
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  // A new key per opening, so the form starts from the order as it now is.
  const [opening, setOpening] = useState(0);

  const query = useQuery({
    queryKey: ["retail-purchase-order", orderId],
    enabled: Boolean(orderId),
    queryFn: () => fetchJson<{ data: OrderDetail }>(`/api/v2/retail/purchasing/orders/${orderId}`),
  });

  const order = query.data?.data;

  const remove = useMutation({
    mutationFn: () => fetchJson(`/api/v2/retail/purchasing/orders/${orderId}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Order removed", variant: "success" });
      void queryClient.invalidateQueries({ queryKey: ["retail-purchase-orders"] });
      router.push("/retail/purchasing/orders");
    },
    onError: (error) =>
      toast({
        title: "That order was not removed",
        description: getApiErrorMessage(error),
        variant: "destructive",
      }),
  });

  const confirmRemove = () => {
    if (!order) return;
    void dsConfirm({
      title: `Remove ${order.poNo}?`,
      description:
        "The order and its lines are deleted. Deliveries already received against it stay, and so does their stock.",
      confirmLabel: "Remove the order",
      variant: "danger",
    }).then((confirmed) => {
      if (confirmed) remove.mutate();
    });
  };

  const edit = () => {
    setOpening((current) => current + 1);
    setEditing(true);
  };

  const value = order?.lines.reduce((sum, line) => sum + Number(line.lineTotal), 0) ?? 0;
  const stillToCome =
    order?.lines.reduce(
      (sum, line) =>
        sum + Math.max(Number(line.quantity) - Number(line.receivedQuantity), 0) * Number(line.unitCost),
      0,
    ) ?? 0;
  const owed =
    order?.lines.some((line) => Number(line.quantity) - Number(line.receivedQuantity) > 0) ?? false;

  return (
    <RetailShell title="Orders">
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
        <div className="space-y-6" style={{ maxWidth: WIDTH }}>
          <RecordHeader
            icon={Package}
            title={order.poNo}
            badge={
              order.status !== "RECEIVED" ? (
                <StatusBadge tone={order.status === "PARTIAL" ? "warn" : "neutral"} context="header">
                  {orderStatusLabel(order.status)}
                </StatusBadge>
              ) : null
            }
            action={
              owed ? (
                // Deliveries arrive short as a matter of course, so this hands
                // the order to the delivery form to be counted rather than
                // receiving it in full unseen.
                <HeaderAction
                  icon={LocalShipping}
                  onClick={() => router.push(`/retail/purchasing/receipts?orderId=${order.id}`)}
                >
                  Receive a delivery
                </HeaderAction>
              ) : null
            }
            overflow={
              <>
                <DropdownMenuItem onSelect={edit}>Edit order</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={confirmRemove}
                  className="text-[var(--tone-danger-strong)]"
                >
                  Remove order
                </DropdownMenuItem>
              </>
            }
          />

          <div>
            <SectionHeading maxWidth={WIDTH} className="mt-0">
              Order
            </SectionHeading>
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

            <SectionHeading maxWidth={WIDTH} count={order.lines.length}>
              Products
            </SectionHeading>
            <ColumnList
              label="Products"
              maxWidth={WIDTH}
              empty="No products on this order."
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
        </div>
      )}

      <OrderDialog key={opening} open={editing} onOpenChange={setEditing} order={order ?? null} />
    </RetailShell>
  );
}
