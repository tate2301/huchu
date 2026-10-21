"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";

import { useListQuery } from "@/components/books/bk-list";
import { BkOrdersView } from "@/components/books/bk-orders-view";
import { BooksError, BooksLoading } from "@/components/books/books-state";
import { BooksPage } from "@/components/books/figures";
import { PageChrome } from "@/components/layout/page-chrome";
import { fetchJson } from "@/lib/api-client";
import type { OrderQuery, OrdersPage } from "@/lib/books/orders";

const NEW_ORDER = { label: "New order", icon: "plus" as const, href: "/books/orders/new", shortcut: "N" };

/**
 * Books → Bills & spending → Purchase orders (design/books/html/bk-orders.html):
 * the shop's and Books' own in one table (D11). The shop's orders open in the
 * shop's buying screens, where they are received.
 */
function BooksOrders() {
  const { search, onQuery, exportHref } = useListQuery<OrderQuery>({ view: "sent", period: "any", sort: "newest" });

  const orders = useQuery({
    queryKey: ["books", "orders", search],
    queryFn: () => fetchJson<OrdersPage>(`/api/books/purchase-orders${search ? `?${search}` : ""}`),
    placeholderData: (previous) => previous,
  });

  return (
    <>
      <PageChrome title="Purchase orders" primary={orders.data && !orders.data.can.create ? { label: "New order", disabled: "Your role cannot make orders. A manager or the accountant can." } : NEW_ORDER} />
      <BooksPage screen="bk-a">
        {orders.data ? (
          <BkOrdersView data={orders.data} onQuery={onQuery} exportHref={exportHref("/api/books/purchase-orders")} />
        ) : orders.isError ? (
          <BooksError what="Purchase orders" onRetry={() => orders.refetch()} />
        ) : (
          <BooksLoading />
        )}
      </BooksPage>
    </>
  );
}

/** Books → Bills & spending → Purchase orders (design/core-modules/boards/view/BkOrders.html). */
export default function BooksOrdersPage() {
  return (
    <React.Suspense fallback={<BooksPage screen="bk-a"><BooksLoading /></BooksPage>}>
      <BooksOrders />
    </React.Suspense>
  );
}
