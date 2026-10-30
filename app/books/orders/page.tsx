"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { downloadCsv, useListQuery } from "@/components/books/bk-list";
import { BkOrdersView } from "@/components/books/bk-orders-view";
import { BooksError, BooksLoading } from "@/components/books/books-state";
import { BooksPage } from "@/components/books/figures";
import type { MenuEntry } from "@/components/core/menu";
import { PageChrome } from "@/components/layout/page-chrome";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { bulkWords, eachOf } from "@/lib/books/bulk";
import type { OrderQuery, OrderRow, OrdersPage } from "@/lib/books/orders";

const NEW_ORDER = { label: "New order", icon: "plus" as const, href: "/books/orders/new", shortcut: "N" };
const VERB = { submit: "sent", approve: "approved", cancel: "cancelled", close: "closed" } as const;

/**
 * Books → Bills & spending → Purchase orders (BkOrders): the shop's and
 * Books' own in one table (D11). A selection is sent (over the limit it waits
 * for the owner), approved, cancelled or closed, each through the order's own
 * route; what could not be done is said with why. The shop's orders open in
 * the shop's buying screens, where they are received.
 */
function BooksOrders() {
  const { toast } = useToast();
  const client = useQueryClient();
  const { search, onQuery, exportHref } = useListQuery<OrderQuery>({ view: "sent", period: "any", sort: "newest" });

  const orders = useQuery({
    queryKey: ["books", "orders", search],
    queryFn: () => fetchJson<OrdersPage>(`/api/books/purchase-orders${search ? `?${search}` : ""}`),
    placeholderData: (previous) => previous,
  });

  const move = async (action: keyof typeof VERB, rows: OrderRow[]) => {
    const outcome = await eachOf(
      rows,
      (row) => row.number,
      (row) => fetchJson(`/api/books/purchase-orders/${row.id}`, { method: "PATCH", body: JSON.stringify({ action }) }),
      (error) => getApiErrorMessage(error, "it did not go through"),
    );
    const words = bulkWords(outcome, VERB[action], ["order", "orders"]);
    toast({ title: words.title, description: words.description, variant: words.ok ? "success" : "destructive" });
    await client.invalidateQueries({ queryKey: ["books"] });
  };

  const more = (rows: OrderRow[]): MenuEntry[] => {
    const cancellable = rows.filter((row) => row.status === "DRAFT" || row.status === "TO_APPROVE" || row.status === "SENT");
    const closable = rows.filter((row) => row.status === "PARTIAL" || row.status === "RECEIVED" || row.status === "SENT");
    return [
      {
        key: "export",
        icon: "export",
        label: `Export ${rows.length === 1 ? "1 row" : `${rows.length} rows`}`,
        onSelect: () => downloadCsv("purchase-orders.csv", ["Order", "Supplier", "For", "Expected", "Received", "Amount"], rows.map((row) => [row.number, row.supplier.name, row.forWhat ?? "", row.expected ?? "", `${row.received}%`, row.amount.toFixed(2)])),
      },
      { key: "close", icon: "check", label: closable.length ? `Close ${closable.length}` : "Close", disabled: !closable.length, title: closable.length ? undefined : "Close a sent or received order.", onSelect: () => void move("close", closable) },
      { separator: true },
      { key: "cancel", icon: "x", danger: true, label: cancellable.length ? `Cancel ${cancellable.length}` : "Cancel", disabled: !cancellable.length, title: cancellable.length ? undefined : "Only a draft, one waiting or one sent can be cancelled.", onSelect: () => void move("cancel", cancellable) },
    ];
  };

  return (
    <>
      <PageChrome title="Purchase orders" primary={orders.data && !orders.data.can.create ? { label: "New order", disabled: "Your role cannot make orders. A manager or the accountant can." } : NEW_ORDER} />
      <BooksPage screen="bk-a">
        {orders.data ? (
          <BkOrdersView data={orders.data} onQuery={onQuery} exportHref={exportHref("/api/books/purchase-orders")} onMove={(action, rows) => void move(action, rows)} more={more} />
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
