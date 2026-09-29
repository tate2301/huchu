"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Alert, Skeleton } from "@corelithzw/react";

import { RetailShell } from "@/components/retail/retail-shell";
import {
  RetailSaleDetailBody,
  SALE_WIDTH,
  type RetailSaleDetail,
} from "@/components/retail/sale-detail";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";

/**
 * One sale, at its own address.
 *
 * An audit row names a `RetailSale` and an id, and "which one was RSL-0042?"
 * is answered by pasting a link — so a sale is a record page, and the sales
 * list's rows open it. The page carries no verb: a sale is refunded or voided
 * on the till, by the cashier who has the customer in front of them.
 */
export default function RetailSalePage() {
  const params = useParams<{ id: string }>();
  const saleId = params?.id ?? "";

  const query = useQuery({
    queryKey: ["retail-sale", saleId],
    enabled: Boolean(saleId),
    queryFn: () => fetchJson<{ data: RetailSaleDetail }>(`/api/v2/retail/pos/sales/${saleId}`),
  });

  const sale = query.data?.data;

  return (
    <RetailShell title={sale?.saleNo ?? "Sale"}>
      {query.isPending ? (
        <div aria-busy="true" aria-live="polite" className="space-y-3" style={{ maxWidth: SALE_WIDTH }}>
          <span className="sr-only">Loading the sale</span>
          <Skeleton height={44} />
          <Skeleton height={44} />
          <Skeleton height={44} />
        </div>
      ) : query.isError ? (
        <Alert tone="danger" title="The sale would not load">
          {getApiErrorMessage(query.error)}
        </Alert>
      ) : !sale ? (
        <p className="text-sm text-[var(--text-muted)]">There is no sale at this address.</p>
      ) : (
        <RetailSaleDetailBody sale={sale} />
      )}
    </RetailShell>
  );
}
