"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { useListQuery } from "@/components/books/bk-list";
import { BkSpendingView } from "@/components/books/bk-spending-view";
import { BooksError, BooksLoading } from "@/components/books/books-state";
import { BooksPage } from "@/components/books/figures";
import { Kit } from "@/components/core";
import { MenuButton, type MenuEntry } from "@/components/core/menu";
import { PageChrome } from "@/components/layout/page-chrome";
import { fetchJson } from "@/lib/api-client";
import type { SpendingPage, SpendingQuery } from "@/lib/books/spending";

/**
 * Books → Bills & spending → All spending (BkSpending): read only, every
 * money-out document this month. Record spending (N) is the one menu that
 * starts each kind: a bill, a claim, a petty cash voucher or a requisition.
 */
function BooksSpending() {
  const router = useRouter();
  const { search, onQuery, exportHref } = useListQuery<SpendingQuery>({ view: "all", month: "this", sort: "newest" });
  const spending = useQuery({
    queryKey: ["books", "spending", search],
    queryFn: () => fetchJson<SpendingPage>(`/api/books/expenses${search ? `?${search}` : ""}`),
    placeholderData: (previous) => previous,
  });
  const can = spending.data?.can;
  const record: MenuEntry[] = [
    { key: "bill", icon: "docs", label: "Bill", disabled: can ? !can.bill : false, onSelect: () => router.push("/books/bills/new") },
    { key: "claim", icon: "takings", label: "Claim", onSelect: () => router.push("/books/claims/new") },
    { key: "voucher", icon: "expenses", label: "Petty cash voucher", onSelect: () => router.push("/books/claims/new?paid=float") },
    { key: "requisition", icon: "hand", label: "Requisition", disabled: can ? !can.requisition : false, onSelect: () => router.push("/books/requisitions?new=1") },
  ];
  return (
    <>
      <PageChrome title="All spending">
        <Kit contents>
          <MenuButton variant="primary" icon="plus" shortcut="N" label="Record spending" items={record}>
            Record spending
          </MenuButton>
        </Kit>
      </PageChrome>
      <BooksPage screen="bk-a">
        {spending.data ? (
          <BkSpendingView data={spending.data} onQuery={onQuery} exportHref={exportHref("/api/books/expenses")} />
        ) : spending.isError ? (
          <BooksError what="All spending" onRetry={() => spending.refetch()} />
        ) : (
          <BooksLoading />
        )}
      </BooksPage>
    </>
  );
}

/** Books → Bills & spending → All spending (design/core-modules/boards/view/BkSpending.html). */
export default function BooksSpendingPage() {
  return (
    <React.Suspense fallback={<BooksPage screen="bk-a"><BooksLoading /></BooksPage>}>
      <BooksSpending />
    </React.Suspense>
  );
}
