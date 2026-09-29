"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { RecordDialog } from "@/components/crm/records/record-dialog";
import { RecordListShell } from "@/components/crm/records/record-list-shell";
import { FormField, StatusDot } from "@/components/management/ui";
import { RecordList } from "@/components/records/record-list";
import { RecordCell, RecordTable, RecordTableName } from "@/components/records/record-table";
import { FILTER_ANY, ViewToolbarFilter } from "@/components/records/view-toolbar";
import { RowMenu } from "@/components/retail/row-menu";
import { retailMoney } from "@/components/retail/sale-detail";
import { Button } from "@/components/ui/button";
import { dsConfirm } from "@/components/ui/ds-confirm";
import { Input } from "@/components/ui/input";
import { SearchableSelect, type SearchableOption } from "@/components/ui/searchable-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { useReservedId } from "@/hooks/use-reserved-id";
import { fetchInventoryItems, fetchSites } from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { Plus, Trash2 } from "@/lib/icons";
import { formatQuantity, formatRetailDate, orderStatusLabel } from "@/lib/retail/words";

type OrderLine = {
  inventoryItemId: string | null;
  itemName: string;
  quantity: number;
  unitCost: number;
  lineTotal: number;
  receivedQuantity: number;
};

type Order = {
  id: string;
  poNo: string;
  siteId: string;
  supplierName: string;
  status: string;
  expectedDate: string | null;
  notes: string | null;
  lines: OrderLine[];
  totalValue: number;
  totalQuantity: number;
  receivedQuantity: number;
  site: { id: string; name: string; code: string } | null;
};

type LineForm = { inventoryItemId: string; itemName: string; quantity: string; unitCost: string };

type OrderForm = {
  supplierName: string;
  siteId: string;
  expectedDate: string;
  notes: string;
  lines: LineForm[];
};

const STATUS_OPTIONS = new Map(
  ["DRAFT", "PARTIAL", "RECEIVED"].map((status) => [status, orderStatusLabel(status)]),
);

function emptyLine(): LineForm {
  return { inventoryItemId: "", itemName: "", quantity: "", unitCost: "" };
}

function formFor(order: Order | null): OrderForm {
  if (!order) {
    return { supplierName: "", siteId: "", expectedDate: "", notes: "", lines: [emptyLine()] };
  }
  return {
    supplierName: order.supplierName,
    siteId: order.siteId,
    expectedDate: order.expectedDate ? order.expectedDate.slice(0, 10) : "",
    notes: order.notes ?? "",
    lines: order.lines.map((line) => ({
      inventoryItemId: line.inventoryItemId ?? "",
      itemName: line.itemName,
      quantity: String(line.quantity),
      unitCost: String(line.unitCost),
    })),
  };
}

/** What the supplier still owes on this order. Zero means there is nothing to receive. */
function outstandingQuantity(order: Order) {
  return order.totalQuantity - order.receivedQuantity;
}

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
 * Drawn as the products list is: the name and the one verb in the app bar, a
 * toolbar of search and status, and the orders flush under it. The band of
 * tiles and two charts that sat over the table (order value, drafts, top
 * suppliers, a status donut) governed nothing on the page and are gone (D3),
 * with the Export button that exported nothing.
 */
export default function RetailOrdersPage() {
  const { toast } = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>(FILTER_ANY);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Order | null>(null);
  // A new key per opening, so the form starts from the order it was opened on.
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

  const open = (order: Order | null) => {
    setEditing(order);
    setOpening((current) => current + 1);
    setDialogOpen(true);
  };

  const remove = useMutation({
    mutationFn: (order: Order) =>
      fetchJson(`/api/v2/retail/purchasing/orders/${order.id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Order removed", variant: "success" });
      void queryClient.invalidateQueries({ queryKey: ["retail-purchase-orders"] });
    },
    onError: (error) =>
      toast({
        title: "That order was not removed",
        description: getApiErrorMessage(error),
        variant: "destructive",
      }),
  });

  const confirmRemove = (order: Order) => {
    void dsConfirm({
      title: `Remove ${order.poNo}?`,
      description:
        "The order and its lines are deleted. Deliveries already received against it stay, and so does their stock.",
      confirmLabel: "Remove the order",
      variant: "danger",
    }).then((confirmed) => {
      if (confirmed) remove.mutate(order);
    });
  };

  // Deliveries arrive short as a matter of course, so this hands the order to
  // the delivery form to be counted rather than receiving it in full unseen.
  const receive = (order: Order) => router.push(`/retail/purchasing/receipts?orderId=${order.id}`);

  const menuFor = (order: Order) => (
    <RowMenu
      label={`More for ${order.poNo}`}
      items={[
        ...(outstandingQuantity(order) > 0
          ? [{ label: "Receive a delivery", onSelect: () => receive(order) }]
          : []),
        { label: "Edit order", onSelect: () => open(order) },
        { label: "Remove order", onSelect: () => confirmRemove(order), destructive: true },
      ]}
    />
  );

  const delivered = (order: Order) =>
    `${formatQuantity(order.receivedQuantity)} of ${formatQuantity(order.totalQuantity)}`;

  const emptyTitle = search.trim()
    ? "No orders match that search"
    : status !== FILTER_ANY
      ? "No orders match this filter"
      : "No orders yet";

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
        onCreate={() => open(null)}
        error={ordersQuery.error}
      >
        <RecordTable
          rows={rows}
          isLoading={ordersQuery.isPending}
          emptyTitle={emptyTitle}
          rowHref={(order) => `/retail/purchasing/orders/${order.id}`}
          columns={[
            {
              id: "order",
              label: "Order",
              cell: (order) => <RecordTableName title={order.poNo} subtitle={order.supplierName} />,
            },
            {
              id: "status",
              label: "Status",
              width: "9rem",
              cell: (order) => orderStatusDot(order.status),
            },
            {
              id: "site",
              label: "Site",
              width: "10rem",
              cell: (order) => <RecordCell value={order.site?.name ?? "No site"} />,
            },
            {
              id: "expected",
              label: "Expected",
              width: "9rem",
              cell: (order) => (
                <RecordCell kind="date" value={formatRetailDate(order.expectedDate) || "No date"} />
              ),
            },
            {
              id: "delivered",
              label: "Delivered",
              align: "end",
              width: "9rem",
              cell: (order) => <RecordCell kind="number" value={delivered(order)} />,
            },
            {
              id: "value",
              label: "Value",
              align: "end",
              width: "8rem",
              cell: (order) => <RecordCell kind="money" value={retailMoney(order.totalValue)} />,
            },
            {
              id: "menu",
              label: "",
              width: "3rem",
              align: "end",
              cell: menuFor,
            },
          ]}
          mobile={
            <RecordList
              rows={rows.map((order) => ({
                id: order.id,
                href: `/retail/purchasing/orders/${order.id}`,
                title: order.poNo,
                subtitle: order.supplierName,
                status: orderStatusDot(order.status),
                facts: [
                  { label: "Value", value: retailMoney(order.totalValue), kind: "money", primary: true },
                  { label: "Delivered", value: delivered(order), kind: "number" },
                ],
                actions: menuFor(order),
              }))}
              isLoading={ordersQuery.isPending}
              emptyTitle={emptyTitle}
            />
          }
        />
      </RecordListShell>

      <OrderDialog key={opening} open={dialogOpen} onOpenChange={setDialogOpen} order={editing} />
    </>
  );
}

/**
 * New order, and the same form to edit one.
 *
 * The order number is reserved when the dialog opens and sent with the order;
 * it is not a field, because nobody types it. The Site field used to carry two
 * labels — the form's and the picker's own — and now carries one.
 */
function OrderDialog({
  open,
  onOpenChange,
  order,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The order to edit, or null for a new one. */
  order: Order | null;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<OrderForm>(() => formFor(order));
  const [errors, setErrors] = useState<string[]>([]);

  const sitesQuery = useQuery({ queryKey: ["retail-sites"], queryFn: fetchSites });
  const inventoryQuery = useQuery({ queryKey: ["retail-inventory"], queryFn: () => fetchInventoryItems() });
  const inventory = useMemo(() => inventoryQuery.data?.data ?? [], [inventoryQuery.data]);
  const productOptions = useMemo<SearchableOption[]>(
    () => inventory.map((item) => ({ value: item.id, label: item.name, meta: item.itemCode })),
    [inventory],
  );

  // A shop with one site has nothing to choose: the order goes there.
  const onlySiteId = sitesQuery.data?.length === 1 ? sitesQuery.data[0].id : "";
  const siteId = form.siteId || onlySiteId;

  // The number is reserved against the site, as the reservation requires.
  const { reservedId: poNo } = useReservedId({
    entity: "RETAIL_PURCHASE_ORDER",
    enabled: open && !order && Boolean(siteId),
    siteId: siteId || undefined,
  });

  const setLine = (index: number, patch: Partial<LineForm>) =>
    setForm((current) => ({
      ...current,
      lines: current.lines.map((line, at) => (at === index ? { ...line, ...patch } : line)),
    }));

  const total = form.lines.reduce(
    (sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.unitCost) || 0),
    0,
  );

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        ...(order ? {} : { poNo: poNo || undefined }),
        supplierName: form.supplierName.trim(),
        siteId,
        expectedDate: form.expectedDate ? new Date(form.expectedDate).toISOString() : null,
        notes: form.notes.trim() || null,
        lines: form.lines.map((line) => ({
          inventoryItemId: line.inventoryItemId,
          itemName: line.itemName || undefined,
          quantity: Number(line.quantity),
          unitCost: Number(line.unitCost),
        })),
      };
      if (order) {
        return fetchJson(`/api/v2/retail/purchasing/orders/${order.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
      }
      return fetchJson("/api/v2/retail/purchasing/orders", { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: () => {
      toast({ title: order ? "Order saved" : "Order created", variant: "success" });
      void queryClient.invalidateQueries({ queryKey: ["retail-purchase-orders"] });
      void queryClient.invalidateQueries({ queryKey: ["retail-purchase-order"] });
      onOpenChange(false);
    },
    onError: (error) =>
      setErrors([
        `${order ? "That order was not saved" : "That order was not created"}: ${getApiErrorMessage(error)}`,
      ]),
  });

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const problems: string[] = [];
    if (!form.supplierName.trim()) problems.push("Name the supplier.");
    if (!siteId) problems.push("Choose the site it is delivered to.");
    if (form.lines.length === 0) problems.push("Add at least one product.");
    if (form.lines.some((line) => !line.inventoryItemId)) problems.push("Choose a product on every line.");
    if (form.lines.some((line) => !(Number(line.quantity) > 0)))
      problems.push("Every product needs a quantity above zero.");
    if (form.lines.some((line) => line.unitCost.trim() === "" || !(Number(line.unitCost) >= 0)))
      problems.push("Every product needs a cost, zero or more.");
    setErrors(problems);
    if (problems.length === 0) save.mutate();
  };

  const sites = sitesQuery.data ?? [];

  return (
    <RecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title={order ? order.poNo : "New order"}
      size="lg"
      onSubmit={submit}
      errors={errors}
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {order ? "Save order" : "Create order"}
          </Button>
        </>
      }
    >
      <FormField label="Supplier">
        {(id) => (
          <Input
            id={id}
            value={form.supplierName}
            onChange={(event) => setForm((current) => ({ ...current, supplierName: event.target.value }))}
            placeholder="Delta Beverages"
            autoFocus={!order}
          />
        )}
      </FormField>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Site">
          {(id) => (
            <Select
              value={siteId}
              onValueChange={(value) => setForm((current) => ({ ...current, siteId: value }))}
            >
              <SelectTrigger id={id}>
                <SelectValue placeholder="Choose a site" />
              </SelectTrigger>
              <SelectContent>
                {sites.map((site) => (
                  <SelectItem key={site.id} value={site.id}>
                    {site.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
        <FormField label="Expected">
          {(id) => (
            <Input
              id={id}
              type="date"
              value={form.expectedDate}
              onChange={(event) => setForm((current) => ({ ...current, expectedDate: event.target.value }))}
            />
          )}
        </FormField>
      </div>

      <div className="space-y-2">
        <div className="grid grid-cols-[minmax(0,1fr)_90px_100px_32px] gap-2 text-sm font-medium text-[var(--text-strong)]">
          <span>Product</span>
          <span>Quantity</span>
          <span>Cost</span>
          <span />
        </div>
        {form.lines.map((line, index) => (
          <div key={index} className="grid grid-cols-[minmax(0,1fr)_90px_100px_32px] items-center gap-2">
            <SearchableSelect
              options={productOptions}
              value={line.inventoryItemId}
              placeholder="Choose a product"
              searchPlaceholder="Search products"
              onValueChange={(value) => {
                const item = inventory.find((entry) => entry.id === value);
                setLine(index, {
                  inventoryItemId: value,
                  itemName: item?.name ?? "",
                  unitCost:
                    line.unitCost === "" && item?.unitCost != null ? String(item.unitCost) : line.unitCost,
                });
              }}
            />
            <Input
              aria-label="Quantity"
              inputMode="decimal"
              className="font-mono"
              value={line.quantity}
              onChange={(event) => setLine(index, { quantity: event.target.value })}
            />
            <Input
              aria-label="Cost"
              inputMode="decimal"
              className="font-mono"
              value={line.unitCost}
              onChange={(event) => setLine(index, { unitCost: event.target.value })}
            />
            <Button
              type="button"
              size="sm"
              variant="ghost"
              aria-label={`Take ${line.itemName || "this product"} off the order`}
              onClick={() =>
                setForm((current) => ({ ...current, lines: current.lines.filter((_, at) => at !== index) }))
              }
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <div className="flex items-center justify-between gap-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setForm((current) => ({ ...current, lines: [...current.lines, emptyLine()] }))}
          >
            <Plus className="h-4 w-4" />
            Add a product
          </Button>
          <span className="font-mono text-sm font-medium text-[var(--text-strong)]">{retailMoney(total)}</span>
        </div>
      </div>

      <FormField label="Notes">
        {(id) => (
          <Textarea
            id={id}
            rows={2}
            value={form.notes}
            onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
          />
        )}
      </FormField>
    </RecordDialog>
  );
}
