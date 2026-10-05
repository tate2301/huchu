"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, Skeleton } from "@corelithzw/react";

import { RecordListShell } from "@/components/crm/records/record-list-shell";
import { ColumnFigure, ColumnList, ColumnName, ColumnRowAction, StatusDot } from "@/components/management/ui";
import { FILTER_ANY, ViewToolbarFilter } from "@/components/records/view-toolbar";
import { CategoryDialog } from "@/components/retail/category-dialog";
import { RETAIL_CATEGORIES_KEY } from "@/components/retail/category-field";
import { retailMoney } from "@/components/retail/sale-detail";
import { fetchJson } from "@/lib/api-client";
import type { RetailCategoryRow } from "@/lib/retail/categories";

const STATE_OPTIONS = new Map([
  ["LIVE", "In use"],
  ["ARCHIVED", "Archived"],
]);

const WIDTH = 860;

/** What sets a category apart, said once under its name. */
function categoryMeta(category: RetailCategoryRow): string {
  const parts: string[] = [];
  if (category.ageRestricted) parts.push("ID check");
  if (category.returnable) {
    parts.push(category.depositAmount ? `${retailMoney(Number(category.depositAmount))} deposit` : "Returnable");
  }
  return parts.join(" · ");
}

/**
 * Products › Categories — the shop's own list.
 *
 * Seeded from the business type the first time it is read, then the owner's.
 * Every product field that asks for a category reads it from here, and a
 * category carries the VAT, ID check and deposit its products start from.
 */
export default function RetailCategoriesPage() {
  const [search, setSearch] = useState("");
  const [state, setState] = useState<string>("LIVE");
  const [editing, setEditing] = useState<RetailCategoryRow | null>(null);
  const [open, setOpen] = useState(false);

  const query = useQuery({
    queryKey: [...RETAIL_CATEGORIES_KEY, "with-archived"],
    queryFn: () => fetchJson<{ data: RetailCategoryRow[] }>("/api/v2/retail/categories?archived=true"),
  });
  const categories = useMemo(() => query.data?.data ?? [], [query.data]);

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return categories.filter((category) => {
      if (state === "LIVE" && category.archivedAt) return false;
      if (state === "ARCHIVED" && !category.archivedAt) return false;
      return !needle || category.name.toLowerCase().includes(needle);
    });
  }, [categories, search, state]);

  const edit = (category: RetailCategoryRow | null) => {
    setEditing(category);
    setOpen(true);
  };

  return (
    <>
      <RecordListShell
        title="Categories"
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search categories"
        filters={
          <ViewToolbarFilter
            label="Status"
            value={state}
            anyLabel="Any status"
            options={STATE_OPTIONS}
            onChange={setState}
          />
        }
        filterCount={state === FILTER_ANY ? 0 : 1}
        count={query.isSuccess ? `${rows.length} of ${categories.length}` : null}
        createLabel="New category"
        onCreate={() => edit(null)}
        error={query.error}
      >
        {query.isPending ? (
          <div className="space-y-1.5" aria-busy="true" style={{ maxWidth: WIDTH }}>
            <Skeleton height={44} />
            <Skeleton height={44} />
            <Skeleton height={44} />
          </div>
        ) : (
          <div className="space-y-3">
            <ColumnList
              label="Categories"
              maxWidth={WIDTH}
              empty={state === "ARCHIVED" ? "Nothing archived." : "No category matches."}
              columns={[
                { id: "category", label: "Category" },
                { id: "status", label: "Status", hideBelow: "sm" },
                { id: "products", label: "Products", align: "end" },
                { id: "vat", label: "VAT", align: "end", hideBelow: "sm" },
                { id: "margin", label: "Target margin", align: "end", hideBelow: "md" },
                { id: "act", label: "", align: "end" },
              ]}
              rows={rows.map((category) => ({
                id: category.id,
                cells: {
                  category: <ColumnName name={category.name} meta={categoryMeta(category) || null} />,
                  status: category.archivedAt ? <StatusDot tone="neutral" label="Archived" /> : null,
                  products: <ColumnFigure>{category.productCount}</ColumnFigure>,
                  vat: <ColumnFigure tone="muted">{`${Number(category.vatRate)}%`}</ColumnFigure>,
                  margin: (
                    <ColumnFigure tone={category.targetMarginPercent ? "default" : "muted"}>
                      {category.targetMarginPercent ? `${Number(category.targetMarginPercent)}%` : "—"}
                    </ColumnFigure>
                  ),
                  act: (
                    <ColumnRowAction>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        aria-label={`Edit ${category.name}`}
                        onClick={() => edit(category)}
                      >
                        Edit
                      </Button>
                    </ColumnRowAction>
                  ),
                },
              }))}
            />
          </div>
        )}
      </RecordListShell>

      <CategoryDialog open={open} onOpenChange={setOpen} category={editing} />
    </>
  );
}
