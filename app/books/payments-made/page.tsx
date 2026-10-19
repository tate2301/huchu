"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { downloadCsv } from "@/components/books/bk-list";
import { BkPaymentsOutView } from "@/components/books/bk-payments-out-view";
import { ReasonDrawer } from "@/components/books/bk-reason-drawer";
import { BooksError, BooksLoading } from "@/components/books/books-state";
import { BooksPage } from "@/components/books/figures";
import type { MenuEntry } from "@/components/core/menu";
import { PageChrome } from "@/components/layout/page-chrome";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { bulkWords, eachOf } from "@/lib/books/bulk";
import type { PaymentOutQuery, PaymentOutRow, PaymentsOutPage } from "@/lib/books/payments-out";

const PAY_SUPPLIERS = { label: "Pay suppliers", icon: "plus" as const, href: "/books/payments-made/new", shortcut: "N" };

const MOVE_WORDS = { approve: ["approved", "Approve"], pay: ["paid", "Pay"], submit: ["sent for approval", "Send"] } as const;

/**
 * Books → Bills & spending → Payments made (BkPaymentsOut). A supplier payment
 * is a draft, sent for approval, approved (not by its maker; over the limit by
 * the owner), then paid (D5). A selection makes each move on every row it can,
 * one at a time through the payment's own route, and says what it skipped and
 * why. More holds Export, Delete for drafts and Void for one paid.
 */
function BooksPaymentsMade() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const search = params.toString();
  const { toast } = useToast();
  const client = useQueryClient();
  const [voiding, setVoiding] = React.useState<PaymentOutRow | null>(null);

  const payments = useQuery({
    queryKey: ["books", "payments-made", search],
    queryFn: () => fetchJson<PaymentsOutPage>(`/api/books/payments-made${search ? `?${search}` : ""}`),
    placeholderData: (previous) => previous,
  });

  const onQuery = React.useCallback(
    (next: Partial<PaymentOutQuery>) => {
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

  const label = (row: PaymentOutRow) => (row.number === "Draft" || row.number === "—" ? `the payment to ${row.supplier?.name ?? "a supplier"}` : row.number);

  const move = async (action: "approve" | "pay" | "submit", rows: PaymentOutRow[]) => {
    const outcome = await eachOf(
      rows,
      label,
      (row) => fetchJson(`/api/books/payments-made/${row.id}`, { method: "PATCH", body: JSON.stringify({ action }) }),
      (error) => getApiErrorMessage(error, "it did not go through"),
    );
    const words = bulkWords(outcome, MOVE_WORDS[action][0], ["payment", "payments"]);
    toast({ title: words.title.replace(/^the /, "The "), description: words.description, variant: words.ok ? "success" : "destructive" });
    await client.invalidateQueries({ queryKey: ["books"] });
  };

  const remove = async (rows: PaymentOutRow[]) => {
    const outcome = await eachOf(rows, label, (row) => fetchJson(`/api/books/payments-made/${row.id}`, { method: "DELETE" }), (error) => getApiErrorMessage(error, "it was not deleted"));
    const words = bulkWords(outcome, "deleted", ["draft", "drafts"]);
    toast({ title: words.title.replace(/^the /, "The "), description: words.description, variant: words.ok ? "success" : "destructive" });
    await client.invalidateQueries({ queryKey: ["books"] });
  };

  const more = (rows: PaymentOutRow[]): MenuEntry[] => {
    const unpaid = rows.filter((row) => row.status === "DRAFT" || row.status === "TO_APPROVE" || row.status === "APPROVED");
    const paid = rows.filter((row) => row.status === "PAID");
    const entries: MenuEntry[] = [
      {
        key: "export",
        icon: "export",
        label: `Export ${rows.length === 1 ? "1 row" : `${rows.length} rows`}`,
        onSelect: () =>
          downloadCsv(
            "payments-made.csv",
            ["Payment", "Date", "Paid to", "For", "From", "State", "Currency", "Amount"],
            rows.map((row) => [row.number, row.date, row.supplier?.name ?? "", row.forWhat, row.from ?? "", row.state, row.currency, row.amount.toFixed(2)]),
          ),
      },
    ];
    if (unpaid.length) entries.push({ key: "delete", icon: "x", danger: true, label: `Delete ${unpaid.length === 1 ? "1 unpaid" : `${unpaid.length} unpaid`}`, onSelect: () => void remove(unpaid) });
    if (payments.data?.can.void) {
      entries.push({
        key: "void",
        icon: "x",
        danger: true,
        label: paid.length === 1 ? `Void ${paid[0].number}` : "Void",
        disabled: paid.length !== 1,
        title: paid.length !== 1 ? "Void one paid payment at a time." : undefined,
        onSelect: () => setVoiding(paid[0] ?? null),
      });
    }
    return entries;
  };

  return (
    <>
      <PageChrome title="Payments made" primary={PAY_SUPPLIERS} />
      <BooksPage screen="bk-a">
        {payments.data ? (
          <BkPaymentsOutView
            data={payments.data}
            onQuery={onQuery}
            exportHref={`/api/books/payments-made?${new URLSearchParams([...params.entries(), ["format", "csv"]]).toString()}`}
            onMove={(action, rows) => void move(action, rows)}
            more={more}
          />
        ) : payments.isError ? (
          <BooksError what="Payments made" onRetry={() => payments.refetch()} />
        ) : (
          <BooksLoading />
        )}
      </BooksPage>
      <ReasonDrawer
        open={voiding !== null}
        onOpenChange={(open) => (open ? undefined : setVoiding(null))}
        title={voiding ? `Void ${voiding.number}` : "Void"}
        sub={voiding ? `${voiding.supplier?.name ?? "Supplier"}, ${voiding.amount.toFixed(2)} ${voiding.currency}` : undefined}
        what="Its posting is reversed by a mirror entry dated today, its bank line opens again, and the bill is owing again."
        label="Void the payment"
        placeholder="Paid twice"
        onConfirm={async (reason) => {
          await fetchJson(`/api/books/payments-made/${voiding!.id}`, { method: "PATCH", body: JSON.stringify({ action: "void", reason }) });
          toast({ title: `${voiding!.number} is void`, description: "The bill is owing again.", variant: "success" });
          await client.invalidateQueries({ queryKey: ["books"] });
        }}
      />
    </>
  );
}

/** Books → Bills & spending → Payments made (design/core-modules/boards/view/BkPaymentsOut.html). */
export default function BooksPaymentsMadePage() {
  return (
    <React.Suspense fallback={<BooksPage screen="bk-a"><BooksLoading /></BooksPage>}>
      <BooksPaymentsMade />
    </React.Suspense>
  );
}
