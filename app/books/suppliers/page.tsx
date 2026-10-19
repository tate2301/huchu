"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { downloadCsv, useListQuery } from "@/components/books/bk-list";
import { PartyDrawer } from "@/components/books/bk-party-drawer";
import { BkSuppliersView } from "@/components/books/bk-suppliers-view";
import { BooksError, BooksLoading } from "@/components/books/books-state";
import { BooksPage } from "@/components/books/figures";
import type { MenuEntry } from "@/components/core/menu";
import { PageChrome } from "@/components/layout/page-chrome";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson } from "@/lib/api-client";
import type { SupplierQuery, SupplierRow, SuppliersPage } from "@/lib/books/suppliers";

/**
 * Books → Bills & spending → Suppliers (BkSuppliers). New supplier is Books'
 * drawer (N, or `?action=new-vendor` from Accounting's old address). A
 * selection pays one supplier's open bills or exports.
 */
function BooksSuppliers() {
  const router = useRouter();
  const client = useQueryClient();
  const { toast } = useToast();
  const { search, params, onQuery, exportHref } = useListQuery<SupplierQuery>({ view: "all", sort: "owed" });
  const [adding, setAdding] = React.useState(false);

  const list = useQuery({
    queryKey: ["books", "suppliers", search],
    queryFn: () => fetchJson<SuppliersPage>(`/api/books/suppliers${search ? `?${search}` : ""}`),
    placeholderData: (previous) => previous,
  });

  // Accounting's New vendor lands here with the drawer open.
  const asked = params.get("action");
  React.useEffect(() => {
    if (asked !== "new-vendor" && asked !== "new-supplier") return;
    setAdding(true);
    onQuery({ action: null } as Partial<SupplierQuery> & { action: null });
  }, [asked, onQuery]);

  const more = (rows: SupplierRow[]): MenuEntry[] => [
    {
      key: "export",
      icon: "export",
      label: `Export ${rows.length === 1 ? "1 row" : `${rows.length} rows`}`,
      onSelect: () => downloadCsv("suppliers.csv", ["Supplier", "Open bills", "We owe", "Overdue", "Paid this year"], rows.map((row) => [row.name, row.openBills, row.owed.toFixed(2), row.overdue.toFixed(2), row.paidYear.toFixed(2)])),
    },
    ...(rows.length === 1 ? [{ key: "statement", icon: "print" as const, label: "Their statement", onSelect: () => router.push(`/books/suppliers/${rows[0].id}?tab=statement`) }] : []),
  ];

  return (
    <>
      <PageChrome title="Suppliers" primary={{ label: "New supplier", icon: "plus", shortcut: "N", onClick: () => setAdding(true) }} />
      <BooksPage screen="bk-a">
        {list.data ? (
          <BkSuppliersView data={list.data} onQuery={onQuery} exportHref={exportHref("/api/books/suppliers")} onPay={(row) => router.push(`/books/payments-made/new?supplier=${row.id}`)} more={more} />
        ) : list.isError ? (
          <BooksError what="Suppliers" onRetry={() => list.refetch()} />
        ) : (
          <BooksLoading />
        )}
      </BooksPage>
      <PartyDrawer
        kind="supplier"
        open={adding}
        onOpenChange={setAdding}
        onCreated={async (party) => {
          toast({ title: `${party.name} is added`, variant: "success" });
          await client.invalidateQueries({ queryKey: ["books", "suppliers"] });
        }}
      />
    </>
  );
}

/** Books → Bills & spending → Suppliers (design/core-modules/boards/view/BkSuppliers.html). */
export default function BooksSuppliersPage() {
  return (
    <React.Suspense fallback={<BooksPage screen="bk-a"><BooksLoading /></BooksPage>}>
      <BooksSuppliers />
    </React.Suspense>
  );
}
