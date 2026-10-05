"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

import { RecordDialog } from "@/components/crm/records/record-dialog";
import { FormField } from "@/components/management/ui";
import { RETAIL_CATEGORIES_KEY } from "@/components/retail/category-field";
import { useShopFeatures } from "@/components/retail/use-shop-features";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import type { RetailCategoryRow } from "@/lib/retail/categories";
import { canRetailSessionDo } from "@/lib/retail/permission-matrix";

type Form = {
  name: string;
  vat: string;
  margin: string;
  ageRestricted: boolean;
  returnable: boolean;
  deposit: string;
};

function initialForm(category: RetailCategoryRow | null): Form {
  return {
    name: category?.name ?? "",
    vat: category ? String(Number(category.vatRate)) : "15",
    margin: category?.targetMarginPercent ? String(Number(category.targetMarginPercent)) : "",
    ageRestricted: category?.ageRestricted ?? false,
    returnable: category?.returnable ?? false,
    deposit: category?.depositAmount ? String(Number(category.depositAmount)) : "",
  };
}

function numberOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

/**
 * Add or change a category.
 *
 * What a product filed under it starts from: its VAT, whether the till asks
 * for ID, and — when the shop charges deposits — the deposit on its empty. The
 * target margin is what Insights measures the category's prices against.
 * Archiving is here too: it hides the category from every product field and
 * leaves the products already in it where they are.
 */
export function CategoryDialog({
  open,
  onOpenChange,
  category,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: RetailCategoryRow | null;
}) {
  const [form, setForm] = useState<Form>(() => initialForm(category));
  const [errors, setErrors] = useState<string[]>([]);
  const [shownFor, setShownFor] = useState<RetailCategoryRow | null>(category);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const shop = useShopFeatures();
  const liquor = shop.liquor;
  const deposits = shop.features.emptiesAndDeposits;

  // A different row opened the same dialog: start from its values.
  if (shownFor !== category) {
    setShownFor(category);
    setForm(initialForm(category));
    setErrors([]);
  }

  const set = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      category
        ? fetchJson(`/api/v2/retail/categories/${category.id}`, { method: "PATCH", body: JSON.stringify(body) })
        : fetchJson("/api/v2/retail/categories", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: async () => {
      toast({ title: category ? "Category saved" : "Category added", variant: "success" });
      await queryClient.invalidateQueries({ queryKey: RETAIL_CATEGORIES_KEY });
      await queryClient.invalidateQueries({ queryKey: ["retail-catalog"] });
      onOpenChange(false);
    },
    onError: (error) => setErrors([getApiErrorMessage(error)]),
  });

  // In and out of the bin through the bin, which writes who moved it (W-63).
  const bin = useMutation({
    mutationFn: (move: "bin" | "restore") =>
      fetchJson(move === "bin" ? "/api/v2/retail/bin" : "/api/v2/retail/bin/restore", {
        method: "POST",
        body: JSON.stringify({ kind: "category", id: category?.id }),
      }),
    onSuccess: async (_result, move) => {
      toast({ title: move === "bin" ? "Category moved to the bin" : "Category restored", variant: "success" });
      await queryClient.invalidateQueries({ queryKey: RETAIL_CATEGORIES_KEY });
      await queryClient.invalidateQueries({ queryKey: ["retail-catalog"] });
      await queryClient.invalidateQueries({ queryKey: ["retail-bin"] });
      onOpenChange(false);
    },
    onError: (error) => setErrors([getApiErrorMessage(error)]),
  });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const problems: string[] = [];
    const vat = numberOrNull(form.vat);
    const margin = numberOrNull(form.margin);
    const deposit = numberOrNull(form.deposit);
    if (!form.name.trim()) problems.push("Give the category a name.");
    if (vat === null || Number.isNaN(vat) || vat < 0 || vat > 100) problems.push("VAT is a percentage from 0 to 100.");
    if (margin !== null && (Number.isNaN(margin) || margin < 0 || margin >= 100)) {
      problems.push("The target margin is a percentage under 100.");
    }
    if (deposits && form.returnable && (deposit === null || Number.isNaN(deposit) || deposit < 0)) {
      problems.push("Give the deposit on a returnable bottle.");
    }
    setErrors(problems);
    if (problems.length > 0) return;

    save.mutate({
      name: form.name.trim(),
      vatRate: vat,
      targetMarginPercent: margin,
      ageRestricted: form.ageRestricted,
      ...(deposits ? { returnable: form.returnable, depositAmount: form.returnable ? deposit : null } : {}),
    });
  };

  const archived = Boolean(category?.archivedAt);
  const user = session?.user as { role?: string; supportSessionId?: string | null } | undefined;
  // Into the bin is the category's delete right; out of it is Bin update.
  const canMove =
    Boolean(user) &&
    canRetailSessionDo({ user: { role: user?.role, supportSessionId: user?.supportSessionId } }, archived ? "retail.bin" : "retail.categories", archived ? "update" : "delete");

  return (
    <RecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title={category ? category.name : "New category"}
      description={category ? "Edit this category" : "Add a category products can be filed under"}
      size="sm"
      onSubmit={submit}
      errors={errors}
      footer={
        <>
          {category && canMove ? (
            <Button
              type="button"
              variant="outline"
              className="mr-auto"
              disabled={save.isPending || bin.isPending}
              onClick={() => bin.mutate(archived ? "restore" : "bin")}
            >
              {archived ? "Restore" : "Move to the bin"}
            </Button>
          ) : null}
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {category ? "Save category" : "Add category"}
          </Button>
        </>
      }
    >
      <FormField label="Name">
        {(id) => (
          <Input
            id={id}
            value={form.name}
            placeholder="Spirits"
            onChange={(event) => set("name", event.target.value)}
          />
        )}
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="VAT %">
          {(id) => (
            <Input
              id={id}
              inputMode="decimal"
              className="font-mono"
              value={form.vat}
              onChange={(event) => set("vat", event.target.value)}
            />
          )}
        </FormField>
        <FormField label="Target margin %">
          {(id) => (
            <Input
              id={id}
              inputMode="decimal"
              className="font-mono"
              value={form.margin}
              onChange={(event) => set("margin", event.target.value)}
            />
          )}
        </FormField>
      </div>
      {liquor || form.ageRestricted ? (
        <label className="flex items-center gap-2 text-sm text-[var(--text-strong)]">
          <Checkbox
            checked={form.ageRestricted}
            onCheckedChange={(checked) => set("ageRestricted", checked === true)}
          />
          Check ID before selling
        </label>
      ) : null}
      {deposits ? (
        <>
          <label className="flex items-center gap-2 text-sm text-[var(--text-strong)]">
            <Checkbox
              checked={form.returnable}
              onCheckedChange={(checked) => set("returnable", checked === true)}
            />
            Returnable bottles
          </label>
          {form.returnable ? (
            <FormField label="Deposit">
              {(id) => (
                <Input
                  id={id}
                  inputMode="decimal"
                  className="font-mono"
                  placeholder="0.00"
                  value={form.deposit}
                  onChange={(event) => set("deposit", event.target.value)}
                />
              )}
            </FormField>
          ) : null}
        </>
      ) : null}
    </RecordDialog>
  );
}
