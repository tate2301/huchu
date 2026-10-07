"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { RecordDialog } from "@/components/crm/records/record-dialog";
import { FormField } from "@/components/management/ui";
import { retailMoney } from "@/components/retail/sale-detail";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
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
import { startOfDayIn } from "@/lib/reports/list-query";
import { DEFAULT_TIME_ZONE, dayKey, todayIn } from "@/lib/workspace/format";
import { Plus, Trash2 } from "@/lib/icons";

/**
 * The order form, shared by the Orders list (New order) and an order's record
 * (Edit order). It lives beside the pages rather than in either, because a
 * page file may export nothing but its page.
 */

/** What the form needs of an order: the list's rows and the record both carry it. */
export type EditableOrder = {
  id: string;
  poNo: string;
  siteId: string;
  supplierName: string;
  expectedDate: string | null;
  notes: string | null;
  lines: Array<{
    id: string;
    inventoryItemId: string | null;
    itemName: string;
    quantity: number;
    unitCost: number;
  }>;
};

/** `id` names a line already on the order, so an edit keeps what has come against it. */
type LineForm = { id: string | null; inventoryItemId: string; itemName: string; quantity: string; unitCost: string };

type OrderForm = {
  supplierName: string;
  siteId: string;
  expectedDate: string;
  notes: string;
  lines: LineForm[];
};

function emptyLine(): LineForm {
  return { id: null, inventoryItemId: "", itemName: "", quantity: "", unitCost: "" };
}

function formFor(order: EditableOrder | null): OrderForm {
  if (!order) {
    return { supplierName: "", siteId: "", expectedDate: "", notes: "", lines: [emptyLine()] };
  }
  return {
    supplierName: order.supplierName,
    siteId: order.siteId,
    expectedDate: order.expectedDate ? dayKey(new Date(order.expectedDate)) : "",
    notes: order.notes ?? "",
    lines: order.lines.map((line) => ({
      id: line.id,
      inventoryItemId: line.inventoryItemId ?? "",
      itemName: line.itemName,
      quantity: String(line.quantity),
      unitCost: String(line.unitCost),
    })),
  };
}

/**
 * New order, and the same form to edit one.
 *
 * The order number is reserved when the dialog opens and sent with the order;
 * it is not a field, because nobody types it. The Site field used to carry two
 * labels — the form's and the picker's own — and now carries one.
 */
export function OrderDialog({
  open,
  onOpenChange,
  order,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The order to edit, or null for a new one. */
  order: EditableOrder | null;
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
        // The day starts at the shop's midnight, not the browser's.
        expectedDate: form.expectedDate ? startOfDayIn(form.expectedDate, DEFAULT_TIME_ZONE).toISOString() : null,
        notes: form.notes.trim() || null,
        lines: form.lines.map((line) => ({
          ...(order && line.id ? { id: line.id } : {}),
          inventoryItemId: line.inventoryItemId || null,
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
            <DatePicker
              id={id}
              label="Expected"
              clearable
              earliest={todayIn()}
              value={form.expectedDate || null}
              onChange={(day) => setForm((current) => ({ ...current, expectedDate: day ?? "" }))}
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
