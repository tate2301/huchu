"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Alert, Skeleton } from "@corelithzw/react";

import { RecordHeader, StatusBadge } from "@/components/management/ui";
import { RetailShell } from "@/components/retail/retail-shell";
import {
  RetailSaleDetailBody,
  SALE_WIDTH,
  saleExceptionLabel,
  type RetailSaleDetail,
} from "@/components/retail/sale-detail";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { ClipboardList } from "@/lib/icons";

/**
 * One sale, at its own address.
 *
 * An audit row names a `RetailSale` and an id, and "which one was RSL-0042?"
 * is answered by pasting a link — so a sale is a record page, and the sales
 * list's rows open it. Drawn as a management record: the header with the sale
 * number and a badge only for a refund, a void or a voided sale, then the
 * body's sections. The header carries no verb: a sale is refunded or voided on
 * the till, by the cashier who has the customer in front of them.
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
  const exception = sale ? saleExceptionLabel(sale) : null;

  return (
    <RetailShell title="Sales">
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
        <div className="space-y-6" style={{ maxWidth: SALE_WIDTH }}>
          <RecordHeader
            icon={ClipboardList}
            title={sale.saleNo}
            badge={
              exception ? (
                <StatusBadge tone={sale.saleType === "VOID" ? "warn" : "neutral"} context="header">
                  {exception}
                </StatusBadge>
              ) : null
            }
          />
          <RetailSaleDetailBody sale={sale} />
        </div>
      )}
    </RetailShell>
  );
}
