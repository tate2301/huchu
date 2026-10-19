"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { BooksError, BooksLoading } from "@/components/books/books-state";
import { BooksPage } from "@/components/books/figures";
import { downloadCsv } from "@/components/books/bk-list";
import { BkPaymentsView } from "@/components/books/bk-payments-view";
import { ButtonLink, Kit } from "@/components/core";
import { ReceiptVoidDrawer } from "@/components/books/receipt-actions";
import { PageChrome } from "@/components/layout/page-chrome";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson } from "@/lib/api-client";
import { money } from "@/lib/books/format";
import type { PaymentQuery, PaymentsPage } from "@/lib/books/payments";
import type { ReceiptVoidResult } from "@/lib/books/void-receipt";

/** Books' own form (BkPaymentNew). */
const RECORD_PAYMENT = { label: "Record a payment", icon: "plus" as const, href: "/books/payments/new", shortcut: "N" };

/** What the toast says once a payment is void: where its money went and what opened again. */
function voidedSentence(done: ReceiptVoidResult): string {
  const parts = [
    done.invoice
      ? done.invoice.owed > 0
        ? `${done.invoice.number} is owed ${money(done.invoice.owed, done.currency)} now.`
        : null
      : `${done.customer ? `${done.customer}'s` : "The customer's"} money on account is ${money(done.amount, done.currency)} less.`,
    done.bankLine ? `The ${done.bankLine.bank} line of ${done.bankLine.day} is open again in Bank.` : null,
  ];
  return parts.filter(Boolean).join(" ");
}

/**
 * Books → Payments: what customers paid, from Receivables' receipts. The list's
 * filters live in the address. The owner voids a payment from its row's menu;
 * `?void=<id>` opens that drawer (from a void invoice's page).
 */
function BooksPayments() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const search = params.toString();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [voiding, setVoiding] = React.useState<{ id: string; number: string } | null>(null);

  const payments = useQuery({
    queryKey: ["books", "payments", search],
    queryFn: () => fetchJson<PaymentsPage>(`/api/books/payments${search ? `?${search}` : ""}`),
    placeholderData: (previous) => previous,
  });

  const canVoid = Boolean(payments.data?.can.void);

  // Void from a void invoice's page opens here with the drawer open.
  const asked = params.get("void");
  React.useEffect(() => {
    if (!asked || !canVoid) return;
    setVoiding({ id: asked, number: params.get("number") ?? "the payment" });
    const rest = new URLSearchParams(params.toString());
    rest.delete("void");
    rest.delete("number");
    router.replace(rest.toString() ? `${pathname}?${rest.toString()}` : pathname, { scroll: false });
  }, [asked, canVoid, params, pathname, router]);

  const voided = async (done: ReceiptVoidResult) => {
    toast({ title: `${done.number} is void`, description: voidedSentence(done) || undefined, variant: "success" });
    if (done.fiscalised && done.invoice) toast({ title: "The fiscal device is unchanged", description: `It still holds ${done.invoice.number}.` });
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["books"] }),
      queryClient.invalidateQueries({ queryKey: ["accounting"] }),
    ]);
  };

  const onQuery = React.useCallback(
    (next: Partial<PaymentQuery>) => {
      const merged = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(next)) {
        const empty = value === null || value === "" || (key === "view" && value === "all") || (key === "period" && value === "any") || (key === "sort" && value === "newest") || (key === "page" && value === 1);
        if (empty) merged.delete(key);
        else merged.set(key, String(value));
      }
      const query = merged.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  return (
    <>
      <PageChrome title="Payments received" primary={RECORD_PAYMENT}>
        <Kit contents>
          <ButtonLink href="/books/bank" icon="match">
            Match bank lines
          </ButtonLink>
        </Kit>
      </PageChrome>
      <BooksPage screen="bk-a">
        {payments.data ? (
          <BkPaymentsView
            data={payments.data}
            onQuery={onQuery}
            canVoid={canVoid}
            onVoid={(row) => setVoiding({ id: row.id, number: row.number })}
            onExport={(rows) =>
              downloadCsv(
                "payments.csv",
                ["Payment", "Date", "Customer", "For", "Into", "Currency", "Amount"],
                rows.map((row) => [row.number, row.received, row.customer ?? "", row.voided ? "Void" : (row.invoice ?? "On account"), row.into ?? "", row.currency, row.amount.toFixed(2)]),
              )
            }
            exportHref={`/api/books/payments?${new URLSearchParams([...params.entries(), ["format", "csv"]]).toString()}`}
          />
        ) : payments.isError ? (
          <BooksError what="Payments" onRetry={() => payments.refetch()} />
        ) : (
          <BooksLoading />
        )}
      </BooksPage>
      {voiding ? (
        <ReceiptVoidDrawer receiptId={voiding.id} number={voiding.number} open onOpenChange={(open) => (open ? undefined : setVoiding(null))} onDone={voided} />
      ) : null}
    </>
  );
}

export default function BooksPaymentsPage() {
  // The filters are read from the address, which is only known in the browser.
  return (
    <React.Suspense fallback={<BooksPage screen="bk-a"><BooksLoading /></BooksPage>}>
      <BooksPayments />
    </React.Suspense>
  );
}
