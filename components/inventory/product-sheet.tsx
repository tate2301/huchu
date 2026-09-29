"use client";

import { useState, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { RecordDialog } from "@/components/crm/records/record-dialog";
import { FactList, FormField } from "@/components/management/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import {
  PRODUCT_KINDS,
  PRODUCT_KIND_LABELS,
  UNITS,
  UNIT_LABELS,
  isStockable,
  type CatalogueProduct,
} from "@/lib/inventory/catalogue";

export type ProductRecord = CatalogueProduct & {
  category: string | null;
  imageUrl: string | null;
  isActive: boolean;
  line: { unitPrice: number; priceSource: string };
  stock: { onHand: number; sites: { siteId: string; siteName: string; onHand: number }[] } | null;
};

type StockOption = {
  id: string;
  name: string;
  itemCode: string;
  currentStock: number;
  siteName: string;
};

/** No stock item chosen, as a select value — "" would read as nothing chosen. */
const NOT_STOCKED = "__none";

const EMPTY = {
  code: "",
  name: "",
  description: "",
  kind: "GOODS",
  category: "",
  unit: "EACH",
  unitLabel: "",
  standardPrice: "",
  costPrice: "",
  defaultTaxRate: "0",
  maxDiscountPercent: "",
  notes: "",
};

const FIELD_ROW = "grid gap-4 sm:grid-cols-2";

/**
 * New catalogue product, and the same form to edit one.
 *
 * It was a drawer from the right, under a sentence about every module selling
 * it, with a hint under the stock picker and a paragraph standing in for it
 * when the product was a service. A service simply has no stock field now.
 */
export function CatalogueProductDialog({
  open,
  product,
  onOpenChange,
  onSaved,
  footerStart,
}: {
  open: boolean;
  product: ProductRecord | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  /**
   * The rare verbs on an existing one — Archive — drawn at the footer's left,
   * away from Save. The list has no record page to put them on.
   */
  footerStart?: ReactNode;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState({ ...EMPTY });
  const [inventoryItemId, setInventoryItemId] = useState("");
  const [errors, setErrors] = useState<string[]>([]);

  // Seed from the record during render rather than in an effect, so there is
  // no flash of the previous product's details.
  const [seededFor, setSeededFor] = useState<string | null>(null);
  const seedKey = open ? (product?.id ?? "new") : null;
  if (seedKey !== seededFor) {
    setSeededFor(seedKey);
    setErrors([]);
    setInventoryItemId("");
    setForm(
      product
        ? {
            code: product.code,
            name: product.name,
            description: product.description ?? "",
            kind: product.kind,
            category: product.category ?? "",
            unit: product.unit,
            unitLabel: product.unitLabel ?? "",
            standardPrice: String(product.standardPrice),
            costPrice: product.costPrice === null || product.costPrice === undefined ? "" : String(product.costPrice),
            defaultTaxRate: String(product.defaultTaxRate),
            maxDiscountPercent:
              product.maxDiscountPercent === null || product.maxDiscountPercent === undefined
                ? ""
                : String(product.maxDiscountPercent),
            notes: "",
          }
        : { ...EMPTY },
    );
  }

  const stockable = isStockable(form.kind as ProductRecord["kind"]);

  // The stock picker only loads for things that can actually be stocked.
  const { data: stockOptions } = useQuery({
    queryKey: ["inventory-stock-options"],
    enabled: open && stockable,
    queryFn: () => fetchJson<{ data: StockOption[] }>("/api/v2/inventory/stock-items"),
    staleTime: 5 * 60_000,
  });

  const set = (key: keyof typeof form, value: string) =>
    setForm((previous) => ({ ...previous, [key]: value }));

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        code: form.code.trim(),
        name: form.name.trim(),
        description: form.description.trim() || null,
        kind: form.kind,
        category: form.category.trim() || null,
        unit: form.unit,
        unitLabel: form.unit === "OTHER" ? form.unitLabel.trim() || null : null,
        standardPrice: Number(form.standardPrice) || 0,
        costPrice: form.costPrice === "" ? null : Number(form.costPrice),
        defaultTaxRate: Number(form.defaultTaxRate) || 0,
        maxDiscountPercent:
          form.maxDiscountPercent === "" ? null : Number(form.maxDiscountPercent),
        notes: form.notes.trim() || null,
        ...(inventoryItemId ? { inventoryItemId } : {}),
      };

      return product
        ? fetchJson(`/api/v2/inventory/products/${product.id}`, {
            method: "PATCH",
            body: JSON.stringify(body),
          })
        : fetchJson("/api/v2/inventory/products", {
            method: "POST",
            body: JSON.stringify(body),
          });
    },
    onSuccess: () => {
      toast({
        title: product ? "Catalogue product saved" : "Catalogue product created",
        variant: "success",
      });
      onSaved();
      onOpenChange(false);
    },
    onError: (err) =>
      setErrors([
        `${product ? "That catalogue product was not saved" : "That catalogue product was not created"}: ${getApiErrorMessage(err)}`,
      ]),
  });

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const found: string[] = [];
    if (!form.code.trim()) found.push("Give it a code.");
    if (!form.name.trim()) found.push("Give it a name.");
    if (form.standardPrice === "" || Number.isNaN(Number(form.standardPrice))) {
      found.push("Give it a price.");
    }
    setErrors(found);
    if (found.length === 0) save.mutate();
  };

  return (
    <RecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title={product ? product.name : "New catalogue product"}
      size="md"
      onSubmit={submit}
      errors={errors}
      footer={
        <>
          {footerStart ? <div className="mr-auto flex flex-wrap gap-2">{footerStart}</div> : null}
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {product ? "Save catalogue product" : "Create catalogue product"}
          </Button>
        </>
      }
    >
      <FormField label="Name">
        {(id) => (
          <Input
            id={id}
            value={form.name}
            onChange={(event) => set("name", event.target.value)}
            autoFocus={!product}
          />
        )}
      </FormField>

      <div className={FIELD_ROW}>
        <FormField label="Code">
          {(id) => (
            <Input
              id={id}
              className="font-mono"
              value={form.code}
              onChange={(event) => set("code", event.target.value)}
            />
          )}
        </FormField>
        <FormField label="Type">
          {(id) => (
            <Select value={form.kind} onValueChange={(value) => set("kind", value)}>
              <SelectTrigger id={id}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRODUCT_KINDS.map((kind) => (
                  <SelectItem key={kind} value={kind}>
                    {PRODUCT_KIND_LABELS[kind]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
      </div>

      <FormField label="Description">
        {(id) => (
          <Textarea
            id={id}
            rows={2}
            value={form.description}
            onChange={(event) => set("description", event.target.value)}
          />
        )}
      </FormField>

      <div className="grid gap-4 sm:grid-cols-3">
        <FormField label="Price">
          {(id) => (
            <Input
              id={id}
              type="number"
              step="0.01"
              className="font-mono"
              value={form.standardPrice}
              onChange={(event) => set("standardPrice", event.target.value)}
            />
          )}
        </FormField>
        <FormField label="Cost">
          {(id) => (
            <Input
              id={id}
              type="number"
              step="0.01"
              className="font-mono"
              value={form.costPrice}
              onChange={(event) => set("costPrice", event.target.value)}
            />
          )}
        </FormField>
        <FormField label="VAT %">
          {(id) => (
            <Input
              id={id}
              type="number"
              step="0.01"
              className="font-mono"
              value={form.defaultTaxRate}
              onChange={(event) => set("defaultTaxRate", event.target.value)}
            />
          )}
        </FormField>
      </div>

      <div className={FIELD_ROW}>
        <FormField label="Sold per">
          {(id) => (
            <Select value={form.unit} onValueChange={(value) => set("unit", value)}>
              <SelectTrigger id={id}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {UNITS.map((unit) => (
                  <SelectItem key={unit} value={unit}>
                    {UNIT_LABELS[unit]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
        {form.unit === "OTHER" ? (
          <FormField label="Unit name">
            {(id) => (
              <Input
                id={id}
                value={form.unitLabel}
                onChange={(event) => set("unitLabel", event.target.value)}
                placeholder="pallet"
              />
            )}
          </FormField>
        ) : null}
      </div>

      <div className={FIELD_ROW}>
        <FormField label="Category">
          {(id) => (
            <Input
              id={id}
              value={form.category}
              onChange={(event) => set("category", event.target.value)}
            />
          )}
        </FormField>
        <FormField label="Discount before approval %">
          {(id) => (
            <Input
              id={id}
              type="number"
              step="0.1"
              className="font-mono"
              value={form.maxDiscountPercent}
              onChange={(event) => set("maxDiscountPercent", event.target.value)}
            />
          )}
        </FormField>
      </div>

      {stockable ? (
        <FormField label="Stock item">
          {(id) => (
            <Select
              value={inventoryItemId || NOT_STOCKED}
              onValueChange={(value) => setInventoryItemId(value === NOT_STOCKED ? "" : value)}
            >
              <SelectTrigger id={id}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {/* Leaving it alone sends nothing, so an edit keeps whatever
                    stock item the product is already linked to. */}
                <SelectItem value={NOT_STOCKED}>
                  {product?.stock ? "Keep the one linked now" : "Not stocked"}
                </SelectItem>
                {(stockOptions?.data ?? []).map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.name} · {option.siteName} · {option.currentStock} on hand
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
      ) : null}

      {product?.stock?.sites.length ? (
        <FactList
          maxWidth={null}
          align="end"
          items={product.stock.sites.map((site) => ({
            id: site.siteId,
            label: `On hand at ${site.siteName}`,
            value: String(site.onHand),
            mono: true,
          }))}
        />
      ) : null}
    </RecordDialog>
  );
}
