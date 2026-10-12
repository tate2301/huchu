"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Button as DsButton, Skeleton } from "@corelithzw/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { RecordDialog } from "@/components/crm/records/record-dialog";
import { RecordListShell } from "@/components/crm/records/record-list-shell";
import { ColumnFigure, ColumnList, ColumnName, ColumnText, FormField } from "@/components/management/ui";
import { retailMoney } from "@/components/retail/money";
import { Button } from "@/components/ui/button";
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
import { formatQuantity, formatRetailDate } from "@/lib/retail/words";

/** A delivery as the API calls it: a goods receipt, numbered GRN-. */
type Delivery = {
  id: string;
  receiptNo: string;
  siteId: string;
  purchaseOrderId: string | null;
  poNo: string | null;
  supplierName: string;
  createdAt: string;
  notes: string | null;
  totalValue: number;
  totalQuantity: number;
  site: { id: string; name: string; code: string } | null;
};

type LineForm = {
  inventoryItemId: string;
  quantity: string;
  unitCost: string;
};

type DeliveryForm = {
  siteId: string;
  supplierName: string;
  notes: string;
  lines: LineForm[];
};

/** A register's measure: wide enough for its figures, not the whole window. */
const WIDTH = 960;

function emptyLine(): LineForm {
  return { inventoryItemId: "", quantity: "1", unitCost: "" };
}

function emptyForm(siteId = ""): DeliveryForm {
  return { siteId, supplierName: "", notes: "", lines: [emptyLine()] };
}

/**
 * Deliveries — goods arriving from a supplier, which put stock on the shelf
 * and set what it cost.
 *
 * Drawn as the products list is: the name in the app bar with the one verb,
 * search and the count in the toolbar, and a `ColumnList` under it — the GRN-
 * number, the supplier, and the site and order it came against, then when it
 * arrived and what it came to; each opens its record. A delivery against an
 * order is received from the order (the Receive page, BUY-06); the dialog
 * here takes in stock with no order, until BUY-08's intake sheet.
 */
export default function RetailDeliveriesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<DeliveryForm>(() => emptyForm(""));
  const [errors, setErrors] = useState<string[]>([]);

  const sitesQuery = useQuery({ queryKey: ["retail-receipt-sites"], queryFn: fetchSites });
  const inventoryQuery = useQuery({
    queryKey: ["retail-receipt-inventory"],
    queryFn: () => fetchInventoryItems({ limit: 500 }),
  });
  const deliveriesQuery = useQuery({
    queryKey: ["retail-receipts"],
    queryFn: () => fetchJson<{ data: Delivery[] }>("/api/v2/retail/purchasing/receipts"),
  });

  const { reservedId: receiptNo } = useReservedId({
    entity: "RETAIL_GOODS_RECEIPT",
    enabled: dialogOpen && Boolean(form.siteId),
    siteId: form.siteId || undefined,
  });

  const sites = useMemo(() => sitesQuery.data ?? [], [sitesQuery.data]);
  const inventory = useMemo(() => inventoryQuery.data?.data ?? [], [inventoryQuery.data]);
  const deliveries = useMemo(() => deliveriesQuery.data?.data ?? [], [deliveriesQuery.data]);

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return deliveries;
    return deliveries.filter((delivery) =>
      [delivery.receiptNo, delivery.supplierName].some((value) => value.toLowerCase().includes(needle)),
    );
  }, [deliveries, search]);

  const productOptions = useMemo<SearchableOption[]>(
    () =>
      inventory.map((item) => ({
        value: item.id,
        label: item.name,
        description: `${formatQuantity(item.currentStock, item.unit)} on hand`,
        meta: item.itemCode,
      })),
    [inventory],
  );
  const closeDialog = () => setDialogOpen(false);

  const setLine = (index: number, patch: Partial<LineForm>) =>
    setForm((current) => ({
      ...current,
      lines: current.lines.map((line, at) => (at === index ? { ...line, ...patch } : line)),
    }));

  const save = useMutation({
    mutationFn: async (payload: DeliveryForm) =>
      fetchJson("/api/v2/retail/purchasing/receipts", {
        method: "POST",
        body: JSON.stringify({
          receiptNo: receiptNo || undefined,
          siteId: payload.siteId,
          supplierName: payload.supplierName,
          notes: payload.notes.trim() || undefined,
          lines: payload.lines.map((line) => ({
            inventoryItemId: line.inventoryItemId,
            quantity: Number(line.quantity),
            unitCost: Number(line.unitCost),
          })),
        }),
      }),
    onSuccess: () => {
      toast({ title: "Delivery saved", variant: "success" });
      void queryClient.invalidateQueries({ queryKey: ["retail-receipts"] });
      void queryClient.invalidateQueries({ queryKey: ["retail-purchase-orders"] });
      void queryClient.invalidateQueries({ queryKey: ["retail-purchase-order"] });
      void queryClient.invalidateQueries({ queryKey: ["inventory-items"] });
      void queryClient.invalidateQueries({ queryKey: ["retail-dashboard"] });
      closeDialog();
      setForm(emptyForm(sites[0]?.id ?? ""));
    },
    onError: (error) => setErrors([`That delivery was not saved: ${getApiErrorMessage(error)}`]),
  });

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const problems: string[] = [];
    if (!form.supplierName.trim()) problems.push("Name the supplier.");
    if (!form.siteId) problems.push("Choose the site it arrived at.");
    if (form.lines.length === 0) problems.push("Add at least one product.");
    if (form.lines.some((line) => !line.inventoryItemId)) problems.push("Choose a product on every line.");
    if (form.lines.some((line) => !(Number(line.quantity) > 0)))
      problems.push("Every product needs a quantity above zero.");
    if (form.lines.some((line) => line.unitCost.trim() === "" || !(Number(line.unitCost) >= 0)))
      problems.push("Every product needs a cost, zero or more.");
    setErrors(problems);
    if (problems.length === 0) save.mutate(form);
  };

  const openBlank = () => {
    setForm(emptyForm(sites[0]?.id ?? ""));
    setErrors([]);
    setDialogOpen(true);
  };

  const narrowed = Boolean(search.trim());
  const empty = narrowed ? "No delivery matches that search." : "No deliveries yet.";

  return (
    <>
      <RecordListShell
        title="Deliveries"
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by delivery number or supplier"
        count={deliveriesQuery.isSuccess ? `${rows.length} of ${deliveries.length}` : null}
        createLabel="Take in stock"
        onCreate={openBlank}
        error={deliveriesQuery.error}
      >
        {deliveriesQuery.isPending ? (
          <div className="space-y-1.5" aria-busy="true" style={{ maxWidth: WIDTH }}>
            <Skeleton height={44} />
            <Skeleton height={44} />
            <Skeleton height={44} />
          </div>
        ) : (
          <div className="space-y-3">
            <ColumnList
              label="Deliveries"
              maxWidth={WIDTH}
              empty={empty}
              columns={[
                { id: "delivery", label: "Delivery" },
                { id: "received", label: "Received", hideBelow: "sm" },
                { id: "quantity", label: "Quantity", align: "end", hideBelow: "md" },
                { id: "value", label: "Value", align: "end" },
              ]}
              rows={rows.map((delivery) => ({
                id: delivery.id,
                cells: {
                  delivery: (
                    <Link href={`/retail/buying/deliveries/${delivery.id}`}>
                      <ColumnName
                        code={delivery.receiptNo}
                        name={delivery.supplierName}
                        meta={[delivery.site?.name ?? "No site", delivery.poNo].filter(Boolean).join(" · ")}
                      />
                    </Link>
                  ),
                  received: <ColumnText>{formatRetailDate(delivery.createdAt)}</ColumnText>,
                  quantity: <ColumnFigure>{formatQuantity(delivery.totalQuantity)}</ColumnFigure>,
                  value: <ColumnFigure>{retailMoney(delivery.totalValue)}</ColumnFigure>,
                },
              }))}
            />
            {rows.length === 0 && !narrowed ? (
              <DsButton variant="primary" size="sm" onClick={openBlank}>
                Take in stock
              </DsButton>
            ) : null}
          </div>
        )}
      </RecordListShell>

      <RecordDialog
        open={dialogOpen}
        onOpenChange={(open) => (open ? setDialogOpen(true) : closeDialog())}
        title="Take in stock with no order"
        size="lg"
        onSubmit={submit}
        errors={errors}
        footer={
          <>
            <Button type="button" variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              Save delivery
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Site">
            {(id) => (
              <Select
                value={form.siteId}
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
        </div>

        <FormField label="Supplier">
          {(id) => (
            <Input
              id={id}
              value={form.supplierName}
              placeholder="Delta Beverages"
              onChange={(event) => setForm((current) => ({ ...current, supplierName: event.target.value }))}
            />
          )}
        </FormField>

        <div className="space-y-2">
          <div className="grid grid-cols-[minmax(0,1fr)_90px_100px_32px] gap-2 text-sm font-medium text-[var(--text-strong)]">
            <span>Product</span>
            <span>Quantity</span>
            <span>Cost</span>
            <span />
          </div>
          {form.lines.map((line, index) => (
            <div key={index} className="grid grid-cols-[minmax(0,1fr)_90px_100px_32px] items-center gap-x-2 gap-y-1">
              <SearchableSelect
                value={line.inventoryItemId}
                options={productOptions}
                placeholder="Choose a product"
                searchPlaceholder="Search products"
                onValueChange={(value) => setLine(index, { inventoryItemId: value })}
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
                aria-label="Take this product off the delivery"
                disabled={form.lines.length === 1}
                onClick={() =>
                  setForm((current) => ({ ...current, lines: current.lines.filter((_, at) => at !== index) }))
                }
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setForm((current) => ({ ...current, lines: [...current.lines, emptyLine()] }))}
          >
            <Plus className="h-4 w-4" />
            Add a product
          </Button>
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
    </>
  );
}
