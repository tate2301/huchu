"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { RecordDialog } from "@/components/crm/records/record-dialog";
import { FormField } from "@/components/management/ui";
import { CatalogImageField } from "@/components/retail/catalog-image-field";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { fetchSites } from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";

/** A product as the products and prices screens read it. */
export type RetailProduct = {
  id: string;
  inventoryItemId: string;
  name: string;
  sku: string;
  barcode: string | null;
  description: string | null;
  unitPrice: number;
  compareAtPrice: number | null;
  taxPercent: number;
  imageUrl: string | null;
  status: string;
  inventoryItem: {
    id: string;
    itemCode: string;
    name: string;
    currentStock: number;
    unit: string;
  } | null;
  site: { id: string; name: string; code: string } | null;
};

/** Every query a product change can make stale, in one place. */
export function useInvalidateProducts() {
  const queryClient = useQueryClient();
  return () => {
    for (const key of [
      ["retail-catalog"],
      ["retail-catalog-item"],
      ["retail-pricing-catalog"],
      ["retail-dashboard"],
      ["retail-pos-catalog"],
    ]) {
      void queryClient.invalidateQueries({ queryKey: key });
    }
  };
}

type ProductForm = {
  name: string;
  price: string;
  was: string;
  vat: string;
  barcode: string;
  code: string;
  unit: string;
  siteId: string;
  description: string;
  imageUrl: string;
  onSale: boolean;
};

function formFor(product: RetailProduct | null, defaultVat: number): ProductForm {
  return {
    name: product?.name ?? "",
    price: product ? String(product.unitPrice) : "",
    was: product?.compareAtPrice ? String(product.compareAtPrice) : "",
    vat: String(product?.taxPercent ?? defaultVat),
    barcode: product?.barcode ?? "",
    code: product?.sku ?? "",
    unit: product?.inventoryItem?.unit ?? "each",
    siteId: product?.site?.id ?? "",
    description: product?.description ?? "",
    imageUrl: product?.imageUrl ?? "",
    onSale: product ? product.status === "ACTIVE" : true,
  };
}

/** A money field's text as a number, or null for blank or nonsense. */
function amount(text: string): number | null {
  if (!text.trim()) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

const FIELD_ROW = "grid gap-4 sm:grid-cols-2";

/**
 * New product, and the same form to edit one.
 *
 * One dialog. A product used to need a stock item first, made in a second
 * dialog opened on top of this one and filed under a mining category (Spares,
 * PPE, Reagents). The API now makes the stock line itself when none is given,
 * so what a shopkeeper fills in is what the till will show: a name, a price,
 * the VAT, a barcode and a photo.
 */
export function ProductDialog({
  open,
  onOpenChange,
  product,
  defaultVat = 15,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The product to edit, or null for a new one. */
  product: RetailProduct | null;
  /** The VAT a new product starts at — the rate most of the range carries. */
  defaultVat?: number;
}) {
  const { toast } = useToast();
  const invalidate = useInvalidateProducts();
  const [form, setForm] = useState<ProductForm>(() => formFor(product, defaultVat));
  const [errors, setErrors] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [another, setAnother] = useState(false);

  /*
    The form is reset while rendering, when the dialog opens onto a different
    product — not in an effect. An effect runs after the dialog has painted,
    so a quick first tap (On sale, say) landed on the previous product's
    values and was then overwritten by the reset, and the product was saved
    the way it was before. Keyed on the id, not the object, so a caller that
    builds the product each render does not wipe the form on every keystroke.
  */
  const formKey = open ? (product?.id ?? "new") : null;
  const [shownKey, setShownKey] = useState<string | null>(formKey);
  if (formKey !== shownKey) {
    setShownKey(formKey);
    if (formKey) {
      setForm(formFor(product, defaultVat));
      setErrors([]);
    }
  }

  const sitesQuery = useQuery({
    queryKey: ["retail-product-sites"],
    queryFn: fetchSites,
    enabled: open && !product,
  });
  const sites = useMemo(
    () => (sitesQuery.data ?? []).filter((site: { isActive?: boolean }) => site.isActive !== false),
    [sitesQuery.data],
  );

  const set = <K extends keyof ProductForm>(key: K, value: ProductForm[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        name: form.name.trim(),
        unitPrice: amount(form.price) ?? 0,
        compareAtPrice: amount(form.was),
        taxPercent: amount(form.vat) ?? 0,
        barcode: form.barcode.trim() || null,
        sku: form.code.trim() || undefined,
        description: form.description.trim() || null,
        imageUrl: form.imageUrl.trim() || null,
        status: form.onSale ? "ACTIVE" : "INACTIVE",
      };
      if (product) {
        return fetchJson<RetailProduct>(`/api/v2/retail/catalog/${product.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
      }
      return fetchJson<RetailProduct>("/api/v2/retail/catalog", {
        method: "POST",
        body: JSON.stringify({
          ...body,
          unit: form.unit.trim() || undefined,
          siteId: form.siteId || undefined,
        }),
      });
    },
    onSuccess: () => {
      toast({ title: product ? "Product saved" : "Product created", variant: "success" });
      invalidate();
      if (another && !product) {
        setForm(formFor(null, defaultVat));
      } else {
        onOpenChange(false);
      }
    },
    onError: (error) => {
      setErrors([
        `${product ? "That product was not saved" : "That product was not created"}: ${getApiErrorMessage(error)}`,
      ]);
    },
  });

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const problems: string[] = [];
    if (!form.name.trim()) problems.push("Give the product a name.");
    const price = amount(form.price);
    if (price === null || price <= 0) problems.push("Give it a price above zero.");
    const vat = amount(form.vat);
    if (vat === null || vat < 0 || vat > 100) problems.push("VAT is a percentage between 0 and 100.");
    if (form.was.trim() && amount(form.was) === null) problems.push("Was is a price, or blank.");
    if (!product && sites.length > 1 && !form.siteId) problems.push("Say which site keeps its stock.");
    setErrors(problems);
    if (problems.length === 0) save.mutate();
  };

  const busy = save.isPending || uploading;

  return (
    <RecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title={product ? product.name : "New product"}
      description={product ? "Edit this product" : "Add a product the till can sell"}
      size="md"
      onSubmit={submit}
      errors={errors}
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {!product ? (
            <Button
              type="submit"
              variant="outline"
              disabled={busy}
              onClick={() => setAnother(true)}
            >
              Create and add another
            </Button>
          ) : null}
          <Button type="submit" disabled={busy} onClick={() => setAnother(false)}>
            {product ? "Save product" : "Create product"}
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
            placeholder="Castle Lager 340ml"
            autoFocus={!product}
          />
        )}
      </FormField>

      <div className={FIELD_ROW}>
        <FormField label="Price">
          {(id) => (
            <Input
              id={id}
              value={form.price}
              inputMode="decimal"
              className="font-mono"
              onChange={(event) => set("price", event.target.value)}
              placeholder="0.00"
            />
          )}
        </FormField>
        <FormField label="VAT %">
          {(id) => (
            <Input
              id={id}
              value={form.vat}
              inputMode="decimal"
              className="font-mono"
              onChange={(event) => set("vat", event.target.value)}
            />
          )}
        </FormField>
      </div>

      <div className={FIELD_ROW}>
        <FormField label="Barcode">
          {(id) => (
            <Input
              id={id}
              value={form.barcode}
              className="font-mono"
              onChange={(event) => set("barcode", event.target.value)}
            />
          )}
        </FormField>
        <FormField label="Code">
          {(id) => (
            <Input
              id={id}
              value={form.code}
              className="font-mono"
              onChange={(event) => set("code", event.target.value)}
            />
          )}
        </FormField>
      </div>

      {!product ? (
        <div className={FIELD_ROW}>
          <FormField label="Sold by the">
            {(id) => (
              <Input
                id={id}
                value={form.unit}
                onChange={(event) => set("unit", event.target.value)}
                placeholder="bottle"
              />
            )}
          </FormField>
          {sites.length > 1 ? (
            <FormField label="Site">
              {(id) => (
                <Select value={form.siteId} onValueChange={(value) => set("siteId", value)}>
                  <SelectTrigger id={id}>
                    <SelectValue placeholder="Choose a site" />
                  </SelectTrigger>
                  <SelectContent>
                    {sites.map((site: { id: string; name: string }) => (
                      <SelectItem key={site.id} value={site.id}>
                        {site.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
          ) : null}
        </div>
      ) : null}

      <FormField label="Was">
        {(id) => (
          <Input
            id={id}
            value={form.was}
            inputMode="decimal"
            className="font-mono"
            onChange={(event) => set("was", event.target.value)}
          />
        )}
      </FormField>

      <CatalogImageField
        value={form.imageUrl}
        onChange={(next) => set("imageUrl", next)}
        productId={product?.id}
        onUploadingChange={setUploading}
      />

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

      {product ? (
        <label className="flex items-center gap-2 text-sm text-[var(--text-strong)]">
          <Checkbox
            checked={form.onSale}
            onCheckedChange={(checked) => set("onSale", checked === true)}
          />
          On sale
        </label>
      ) : null}
    </RecordDialog>
  );
}

/**
 * Change price — the one field a shopkeeper changes most, on its own.
 *
 * The prices screen used to be a table of inputs with a Save on every row,
 * which is a form drawn as a table: nothing said which rows had been typed in
 * and not saved, and a price was changed by tabbing into a cell.
 */
export function ChangePriceDialog({
  product,
  onOpenChange,
}: {
  product: RetailProduct | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const invalidate = useInvalidateProducts();
  const [price, setPrice] = useState("");
  const [was, setWas] = useState("");
  const [vat, setVat] = useState("");
  const [errors, setErrors] = useState<string[]>([]);

  // Reset while rendering, for the reason given on ProductDialog.
  const productKey = product?.id ?? null;
  const [shownKey, setShownKey] = useState<string | null>(null);
  if (productKey !== shownKey) {
    setShownKey(productKey);
    if (product) {
      setPrice(String(product.unitPrice));
      setWas(product.compareAtPrice ? String(product.compareAtPrice) : "");
      setVat(String(product.taxPercent));
      setErrors([]);
    }
  }

  const save = useMutation({
    mutationFn: () =>
      fetchJson(`/api/v2/retail/catalog/${product?.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          unitPrice: amount(price) ?? 0,
          compareAtPrice: amount(was),
          taxPercent: amount(vat) ?? 0,
        }),
      }),
    onSuccess: () => {
      toast({ title: "Price saved", variant: "success" });
      invalidate();
      onOpenChange(false);
    },
    onError: (error) => setErrors([`That price was not saved: ${getApiErrorMessage(error)}`]),
  });

  return (
    <RecordDialog
      open={Boolean(product)}
      onOpenChange={onOpenChange}
      title={product ? `Change the price of ${product.name}` : "Change price"}
      size="sm"
      errors={errors}
      onSubmit={(event) => {
        event.preventDefault();
        const problems: string[] = [];
        const next = amount(price);
        if (next === null || next <= 0) problems.push("Give it a price above zero.");
        const rate = amount(vat);
        if (rate === null || rate < 0 || rate > 100) problems.push("VAT is a percentage between 0 and 100.");
        if (was.trim() && amount(was) === null) problems.push("Was is a price, or blank.");
        setErrors(problems);
        if (problems.length === 0) save.mutate();
      }}
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={save.isPending}>
            Save price
          </Button>
        </>
      }
    >
      <div className={FIELD_ROW}>
        <FormField label="Price">
          {(id) => (
            <Input
              id={id}
              value={price}
              inputMode="decimal"
              className="font-mono"
              autoFocus
              onChange={(event) => setPrice(event.target.value)}
            />
          )}
        </FormField>
        <FormField label="VAT %">
          {(id) => (
            <Input
              id={id}
              value={vat}
              inputMode="decimal"
              className="font-mono"
              onChange={(event) => setVat(event.target.value)}
            />
          )}
        </FormField>
      </div>
      <FormField label="Was">
        {(id) => (
          <Input
            id={id}
            value={was}
            inputMode="decimal"
            className="font-mono"
            onChange={(event) => setWas(event.target.value)}
          />
        )}
      </FormField>
    </RecordDialog>
  );
}
