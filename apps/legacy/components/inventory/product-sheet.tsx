"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Alert, Button, Drawer, Field, Input, Select, TextArea } from "@corelithzw/react";

import { useToast } from "@corelithzw/ui/components/use-toast";
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

export function ProductSheet({
  open,
  product,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  product: ProductRecord | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState({ ...EMPTY });
  const [inventoryItemId, setInventoryItemId] = useState("");
  const [errors, setErrors] = useState<string[]>([]);

  // Seed from the record during render rather than in an effect, so there is
  // no flash of the previous item's details.
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
      toast({ title: product ? "Saved" : "Added to the catalogue" });
      onSaved();
      onOpenChange(false);
    },
    onError: (err) => setErrors([getApiErrorMessage(err)]),
  });

  const submit = () => {
    const found: string[] = [];
    if (!form.code.trim()) found.push("Give it a code");
    if (!form.name.trim()) found.push("Give it a name");
    if (form.standardPrice === "" || Number.isNaN(Number(form.standardPrice))) {
      found.push("Give it a standard price");
    }
    setErrors(found);
    if (found.length === 0) save.mutate();
  };

  return (
    <Drawer
      open={open}
      onClose={() => onOpenChange(false)}
      position="right"
      width="34rem"
      title={product ? product.name : "New catalogue item"}
      description="Sold by every module — quoted in the CRM, rung up in Retail, billed on a job card."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" loading={save.isPending} onClick={submit}>
            {product ? "Save" : "Add item"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {errors.length ? (
          <Alert tone="danger" title="Fix these first">
            <ul className="list-disc space-y-1 pl-5">
              {errors.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          </Alert>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Code or SKU" required>
            <Input value={form.code} onChange={(event) => set("code", event.target.value)} />
          </Field>
          <Select
            label="Type"
            value={form.kind}
            onChange={(event) => set("kind", event.target.value)}
          >
            {PRODUCT_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {PRODUCT_KIND_LABELS[kind]}
              </option>
            ))}
          </Select>
        </div>

        <Field label="Name" required>
          <Input value={form.name} onChange={(event) => set("name", event.target.value)} />
        </Field>

        <Field label="Description">
          <TextArea
            rows={2}
            value={form.description}
            onChange={(event) => set("description", event.target.value)}
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Standard price" required>
            <Input
              type="number"
              step="0.01"
              value={form.standardPrice}
              onChange={(event) => set("standardPrice", event.target.value)}
            />
          </Field>
          <Field label="Cost price">
            <Input
              type="number"
              step="0.01"
              value={form.costPrice}
              onChange={(event) => set("costPrice", event.target.value)}
            />
          </Field>
          <Field label="Tax %">
            <Input
              type="number"
              step="0.01"
              value={form.defaultTaxRate}
              onChange={(event) => set("defaultTaxRate", event.target.value)}
            />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Select
            label="Sold per"
            value={form.unit}
            onChange={(event) => set("unit", event.target.value)}
          >
            {UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {UNIT_LABELS[unit]}
              </option>
            ))}
          </Select>
          {form.unit === "OTHER" ? (
            <Field label="Unit name">
              <Input
                value={form.unitLabel}
                onChange={(event) => set("unitLabel", event.target.value)}
                placeholder="per pallet"
              />
            </Field>
          ) : null}
          <Field label="Category">
            <Input value={form.category} onChange={(event) => set("category", event.target.value)} />
          </Field>
          <Field label="Max discount %" description="Above this, a manager has to approve.">
            <Input
              type="number"
              step="0.1"
              value={form.maxDiscountPercent}
              onChange={(event) => set("maxDiscountPercent", event.target.value)}
            />
          </Field>
        </div>

        {stockable ? (
          <Select
            label="Stock item"
            hint="Optional. Link it and quotes will show what's on hand; leave it and the item simply isn't stocked."
            value={inventoryItemId}
            onChange={(event) => setInventoryItemId(event.target.value)}
          >
            <option value="">Not stocked</option>
            {(stockOptions?.data ?? []).map((option) => (
              <option key={option.id} value={option.id}>
                {option.name} — {option.siteName} ({option.currentStock})
              </option>
            ))}
          </Select>
        ) : (
          <p className="text-sm text-[var(--text-muted)]">
            {PRODUCT_KIND_LABELS[form.kind as ProductRecord["kind"]]} isn&apos;t something
            you hold in stock, so there&apos;s nothing to link.
          </p>
        )}

        {product?.stock?.sites.length ? (
          <div className="rounded-[var(--radius-md)] border border-[var(--border)] p-3 text-sm">
            <p className="font-medium">On hand</p>
            <ul className="mt-1 space-y-0.5 text-[var(--text-muted)]">
              {product.stock.sites.map((site) => (
                <li key={site.siteId}>
                  {site.siteName}: <span className="font-mono">{site.onHand}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </Drawer>
  );
}
