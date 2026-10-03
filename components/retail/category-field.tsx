"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { SearchableSelect } from "@/components/ui/searchable-select";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import type { RetailCategoryRow } from "@/lib/retail/categories";

export const RETAIL_CATEGORIES_KEY = ["retail-categories"] as const;

/** The shop's live categories, for every field that files a product. */
export function useRetailCategories(enabled = true) {
  return useQuery({
    queryKey: RETAIL_CATEGORIES_KEY,
    queryFn: () => fetchJson<{ data: RetailCategoryRow[] }>("/api/v2/retail/categories"),
    enabled,
  });
}

/**
 * Pick a category, or add one without leaving the form.
 *
 * Typing a name nothing matches offers "Add ‘Mixers’ as a category"; choosing
 * it creates the category at the standard rate and selects it. Its VAT, ID
 * check and deposit can be set later in Products › Categories — the product
 * form is not the place to stop and configure a category.
 */
export function CategoryField({
  value,
  onChange,
  disabled,
}: {
  value: string | null;
  onChange: (category: RetailCategoryRow | null) => void;
  disabled?: boolean;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const categories = useRetailCategories();
  const rows = categories.data?.data ?? [];

  const add = useMutation({
    mutationFn: (name: string) =>
      fetchJson<{ data: RetailCategoryRow }>("/api/v2/retail/categories", {
        method: "POST",
        body: JSON.stringify({ name }),
      }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: RETAIL_CATEGORIES_KEY });
      onChange(result.data);
    },
    onError: (error) =>
      toast({
        title: "That category was not added",
        description: getApiErrorMessage(error),
        variant: "destructive",
      }),
  });

  return (
    <SearchableSelect
      value={value ?? undefined}
      placeholder={categories.isPending ? "Loading categories" : "Choose a category"}
      searchPlaceholder="Search or type a new category"
      options={rows.map((row) => ({
        value: row.id,
        label: row.name,
        description: [
          `VAT ${Number(row.vatRate)}%`,
          row.ageRestricted ? "ID check" : null,
          row.returnable && row.depositAmount ? `Deposit ${row.depositAmount}` : null,
        ]
          .filter(Boolean)
          .join(" · "),
      }))}
      disabled={disabled || add.isPending}
      onValueChange={(id) => onChange(rows.find((row) => row.id === id) ?? null)}
      onAddOption={(query) => {
        const name = query.trim();
        if (!name) {
          toast({ title: "Type the new category's name first" });
          return;
        }
        add.mutate(name);
      }}
      addLabel={(query) => (query.trim() ? `Add ‘${query.trim()}’ as a category` : "Add a category")}
    />
  );
}
