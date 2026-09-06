"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Alert, Skeleton } from "@corelithzw/react";

import { RetailShell } from "@/components/retail/retail-shell";
import {
  RetailSaleDetailBody,
  retailTypeLabel,
  type RetailSaleDetail,
} from "@/components/retail/sale-detail";
import { Button } from "@corelithzw/ui/components/button";
import { fetchJson, getApiErrorMessage } from "@corelithzw/platform/api-client";
import { ClipboardList } from "@corelithzw/ui/lib/icons";

/**
 * One receipt, at its own address.
 *
 * R-4.3. The sales list has always been able to open a transaction — in a
 * dialog, with no URL. Two things now need one:
 *
 *  - **R-3.3.** Every sale, refund and void writes a `PlatformAuditEvent`
 *    naming `RetailSale` and an id. An audit trail whose rows point at records
 *    nobody can open is a trail you cannot follow.
 *  - **A shopkeeper's Friday.** "Which one was RSL-0042?" is answered by
 *    pasting a link, not by describing which row to scroll to.
 *
 * The body is `RetailSaleDetailBody`, shared with the dialog. Two renderings of
 * one receipt that could disagree about what was sold would be worse than one.
 */
export default function RetailSaleDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const saleId = params?.id ?? "";

  const query = useQuery({
    queryKey: ["retail-sale", saleId],
    enabled: Boolean(saleId),
    queryFn: () => fetchJson<{ data: RetailSaleDetail }>(`/api/v2/retail/pos/sales/${saleId}`),
  });

  const sale = query.data?.data;

  return (
    <RetailShell
      area="sales"
      title={sale?.saleNo ?? "Transaction"}
      description={
        sale
          ? `${retailTypeLabel(sale.saleType)} · ${sale.status} · ${sale.cashierName ?? "Unknown cashier"}`
          : "One posted transaction, its lines and its tenders."
      }
      actions={
        <Button asChild size="sm" variant="outline">
          <Link href="/retail/sales">
            <ClipboardList className="h-4 w-4" />
            All transactions
          </Link>
        </Button>
      }
    >
      {query.isPending ? (
        <div aria-busy="true" aria-live="polite" className="space-y-4">
          <span className="sr-only">Fetching the transaction…</span>
          <Skeleton height={104} />
          <Skeleton height={280} />
        </div>
      ) : query.isError ? (
        /*
          A 404 here is the interesting case and it is worth its own words. The
          id in the URL came from somewhere — an audit row, a message, a
          bookmark — and "not found" should say which of those has gone stale
          rather than implying the shop's data is missing.
        */
        <Alert tone="danger" title="That transaction would not open">
          {getApiErrorMessage(query.error)}
        </Alert>
      ) : !sale ? (
        <Alert tone="warn" title="No transaction with that reference">
          The link may be from another shop, or the receipt may since have been
          removed. Open the transactions list and search for the receipt number.
        </Alert>
      ) : (
        <RetailSaleDetailBody
          sale={sale}
          onOpenSale={(id) => router.push(`/retail/sales/${id}`)}
        />
      )}
    </RetailShell>
  );
}
