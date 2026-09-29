"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { RecordDialog } from "@/components/crm/records/record-dialog";
import { FormField } from "@/components/management/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { useReservedId } from "@/hooks/use-reserved-id";
import { fetchSites, fetchStockLocations, type InventoryItem } from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";

import { STOCK_CATEGORIES } from "./stock-words";

type StockItemForm = {
  name: string;
  category: string;
  siteId: string;
  locationId: string;
  unit: string;
  currentStock: string;
  minStock: string;
  maxStock: string;
  unitCost: string;
};

const figure = (value: number | null | undefined) =>
  value === null || value === undefined ? "" : String(value);

function formFor(
  item: InventoryItem | null,
  defaults: { siteId: string; category: string },
): StockItemForm {
  return {
    name: item?.name ?? "",
    category: item?.category ?? defaults.category,
    siteId: item?.siteId ?? defaults.siteId,
    locationId: item?.locationId ?? "",
    unit: item?.unit ?? "",
    currentStock: figure(item?.currentStock),
    minStock: figure(item?.minStock),
    maxStock: figure(item?.maxStock),
    unitCost: figure(item?.unitCost),
  };
}

/** A number field's text as a number, or undefined for blank or nonsense. */
function optionalNumber(value: string): number | undefined {
  if (value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

const FIELD_ROW = "grid gap-4 sm:grid-cols-2";

/**
 * New stock item, and the same form to edit one.
 *
 * It was a side sheet under a line about consumables, with a note beneath the
 * code saying it could not be changed and a "+ Add new location" choice that
 * opened a second sheet on top of the first. The code is read-only and shows
 * it; a location is made on the Locations page, in its own dialog.
 */
export function StockItemDialog({
  open,
  onOpenChange,
  item,
  defaultSiteId,
  defaultCategory = "CONSUMABLES",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The stock item to edit, or null for a new one. */
  item: InventoryItem | null;
  defaultSiteId: string;
  defaultCategory?: string;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<StockItemForm>(() =>
    formFor(item, { siteId: defaultSiteId, category: defaultCategory }),
  );
  const [errors, setErrors] = useState<string[]>([]);

  const [seededFor, setSeededFor] = useState<string | null>(null);
  const seedKey = open ? (item?.id ?? "new") : null;
  if (seedKey !== seededFor) {
    setSeededFor(seedKey);
    setErrors([]);
    setForm(formFor(item, { siteId: defaultSiteId, category: defaultCategory }));
  }

  const set = <K extends keyof StockItemForm>(key: K, value: StockItemForm[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const sitesQuery = useQuery({ queryKey: ["sites"], queryFn: fetchSites, enabled: open });
  const sites = sitesQuery.data ?? [];

  const locationsQuery = useQuery({
    queryKey: ["stock-locations", "active", form.siteId],
    queryFn: () => fetchStockLocations({ siteId: form.siteId, active: true, limit: 200 }),
    enabled: open && Boolean(form.siteId),
  });
  const locations = locationsQuery.data?.data ?? [];

  const {
    reservedId,
    isReserving,
    error: reserveError,
  } = useReservedId({
    entity: "INVENTORY_ITEM",
    enabled: open && !item && Boolean(form.siteId),
    siteId: form.siteId || undefined,
  });
  const code = item ? item.itemCode : reservedId;

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        name: form.name.trim(),
        category: form.category,
        siteId: form.siteId,
        locationId: form.locationId,
        unit: form.unit.trim(),
        currentStock: optionalNumber(form.currentStock),
        minStock: optionalNumber(form.minStock),
        maxStock: optionalNumber(form.maxStock),
        unitCost: optionalNumber(form.unitCost),
      };
      return item
        ? fetchJson(`/api/inventory/items/${item.id}` as const, {
            method: "PATCH",
            body: JSON.stringify(payload),
          })
        : fetchJson("/api/inventory/items", {
            method: "POST",
            body: JSON.stringify({ ...payload, itemCode: reservedId.trim() }),
          });
    },
    onSuccess: () => {
      toast({ title: item ? "Stock item saved" : "Stock item created", variant: "success" });
      void queryClient.invalidateQueries({ queryKey: ["inventory-items"] });
      void queryClient.invalidateQueries({ queryKey: ["inventory-locations"] });
      onOpenChange(false);
    },
    onError: (error) =>
      setErrors([
        `${item ? "That stock item was not saved" : "That stock item was not created"}: ${getApiErrorMessage(error)}`,
      ]),
  });

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const problems: string[] = [];
    if (!form.name.trim()) problems.push("Give the stock item a name.");
    if (!form.unit.trim()) problems.push("Say what it is counted in.");
    if (!form.siteId) problems.push("Choose the site that holds it.");
    if (!form.locationId) {
      problems.push(
        form.siteId && !locationsQuery.isLoading && locations.length === 0
          ? "This site has no locations yet. Add one on the Locations page first."
          : "Choose the location it is kept in.",
      );
    }
    if (!item && !reservedId.trim()) {
      problems.push(
        reserveError ? `No code was reserved for it: ${reserveError}` : "Its code is still being reserved.",
      );
    }
    setErrors(problems);
    if (problems.length === 0) save.mutate();
  };

  return (
    <RecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title={item ? item.name : "New stock item"}
      size="md"
      onSubmit={submit}
      errors={errors}
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={save.isPending || (!item && isReserving)}>
            {item ? "Save stock item" : "Create stock item"}
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
            placeholder="Grinding media"
            autoFocus={!item}
          />
        )}
      </FormField>

      <div className={FIELD_ROW}>
        <FormField label="Code">
          {(id) => (
            <Input
              id={id}
              value={code || (isReserving ? "Reserving…" : "")}
              readOnly
              className="font-mono"
            />
          )}
        </FormField>
        <FormField label="Category">
          {(id) => (
            <Select value={form.category} onValueChange={(value) => set("category", value)}>
              <SelectTrigger id={id}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[...STOCK_CATEGORIES].map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
      </div>

      <div className={FIELD_ROW}>
        <FormField label="Site">
          {(id) => (
            <Select
              value={form.siteId || undefined}
              onValueChange={(value) =>
                setForm((current) => ({ ...current, siteId: value, locationId: "" }))
              }
            >
              <SelectTrigger id={id}>
                <SelectValue placeholder={sitesQuery.isLoading ? "Loading…" : "Choose a site"} />
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
        <FormField label="Location">
          {(id) => (
            <Select
              value={form.locationId || undefined}
              onValueChange={(value) => set("locationId", value)}
            >
              <SelectTrigger id={id}>
                <SelectValue
                  placeholder={locationsQuery.isLoading ? "Loading…" : "Choose a location"}
                />
              </SelectTrigger>
              <SelectContent>
                {locations.length === 0 ? (
                  <SelectItem value="__none__" disabled>
                    No locations at this site yet
                  </SelectItem>
                ) : (
                  locations.map((location) => (
                    <SelectItem key={location.id} value={location.id}>
                      {location.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          )}
        </FormField>
      </div>

      <div className={FIELD_ROW}>
        <FormField label="Counted in">
          {(id) => (
            <Input
              id={id}
              value={form.unit}
              onChange={(event) => set("unit", event.target.value)}
              placeholder="litres"
            />
          )}
        </FormField>
        <FormField label="Unit cost">
          {(id) => (
            <Input
              id={id}
              type="number"
              step="0.01"
              min={0}
              className="font-mono"
              value={form.unitCost}
              onChange={(event) => set("unitCost", event.target.value)}
              placeholder="0.00"
            />
          )}
        </FormField>
      </div>

      <FormField label="On hand">
        {(id) => (
          <Input
            id={id}
            type="number"
            min={0}
            className="font-mono"
            value={form.currentStock}
            onChange={(event) => set("currentStock", event.target.value)}
            placeholder="0"
          />
        )}
      </FormField>

      <div className={FIELD_ROW}>
        <FormField label="Minimum">
          {(id) => (
            <Input
              id={id}
              type="number"
              min={0}
              className="font-mono"
              value={form.minStock}
              onChange={(event) => set("minStock", event.target.value)}
            />
          )}
        </FormField>
        <FormField label="Maximum">
          {(id) => (
            <Input
              id={id}
              type="number"
              min={0}
              className="font-mono"
              value={form.maxStock}
              onChange={(event) => set("maxStock", event.target.value)}
            />
          )}
        </FormField>
      </div>
    </RecordDialog>
  );
}
