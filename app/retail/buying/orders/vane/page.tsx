"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";

import { BooksLoading } from "@/components/books/books-state";
import { Button, Empty, Kit, KitScreen } from "@/components/core";
import { PageChrome } from "@/components/layout/page-chrome";
import { VaneOrdersPageView } from "@/components/retail/buying/vane-orders-view";
import { ApiError, fetchJson } from "@/lib/api-client";
import type { VaneOrdersView } from "@/lib/retail/buying/vane-orders";

const NEW_ORDER = { label: "New order", icon: "plus" as const, href: "/retail/buying/orders?sheet=order-new" };

/**
 * Orders Vane drafted (PageVaneRetail): Vane's reorders waiting to be sent,
 * from Stock to reorder, one per usual supplier. A person sends each, from
 * the order or by approving Vane's send on its card; the server refuses
 * Vane's draft any other way.
 */
export default function VaneOrdersPage() {
  const orders = useQuery({
    queryKey: ["retail", "orders", "vane"],
    queryFn: () => fetchJson<VaneOrdersView>("/api/v2/retail/buying/orders/vane"),
    retry: (count, error) => !(error instanceof ApiError && error.status === 403) && count < 2,
  });
  const refused = orders.error instanceof ApiError && orders.error.status === 403;

  return (
    <>
      <PageChrome title="Orders" backHref="/retail/buying/orders" backLabel="Orders" primary={NEW_ORDER} />
      <Kit className="kit-main">
        <KitScreen slug="retail-vane-orders">
          <div className="mn">
            {orders.data ? (
              <VaneOrdersPageView data={orders.data} />
            ) : refused ? (
              <Empty icon="lock" title="Orders are for whoever buys the stock">
                Your role cannot see purchase orders. The owner or a manager can.
              </Empty>
            ) : orders.isError ? (
              <Empty
                icon="warn"
                title="The orders did not load"
                action={
                  <Button icon="history" onClick={() => orders.refetch()}>
                    Try again
                  </Button>
                }
              >
                Check the connection and try again.
              </Empty>
            ) : (
              <BooksLoading />
            )}
          </div>
        </KitScreen>
      </Kit>
    </>
  );
}
