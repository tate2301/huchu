"use client";

import { useQuery } from "@tanstack/react-query";

import { BkMoneyView } from "@/components/books/bk-money-view";
import { BooksError, BooksLoading } from "@/components/books/books-state";
import { BooksPage } from "@/components/books/figures";
import { ButtonLink, Kit } from "@/components/core";
import { PageChrome } from "@/components/layout/page-chrome";
import { fetchJson } from "@/lib/api-client";
import type { MoneyBoard } from "@/lib/books/money-board-view";

const NEW_INVOICE = { label: "New invoice", icon: "plus" as const, href: "/books/invoices/new", shortcut: "N" };

/** The page's own actions, each with its key: money in, a bill paid, spending recorded. */
const ACTIONS = [
  { label: "Payment received", icon: "payments", href: "/books/payments/new", shortcut: "R" },
  { label: "Pay a bill", icon: "docs", href: "/books/payments-made/new", shortcut: "P" },
  { label: "Record spending", icon: "camera", href: "/books/expenses", shortcut: "E" },
] as const;

/** Books → Money (design/core-modules/boards/view/BkMoney.html). */
export default function BooksMoneyPage() {
  const money = useQuery({ queryKey: ["books", "money"], queryFn: () => fetchJson<MoneyBoard>("/api/books/money") });
  return (
    <>
      <PageChrome title="Money" primary={NEW_INVOICE}>
        <Kit contents>
          {ACTIONS.map((action) => (
            <ButtonLink key={action.label} href={action.href} icon={action.icon} shortcut={action.shortcut}>
              {action.label}
            </ButtonLink>
          ))}
        </Kit>
      </PageChrome>
      <BooksPage screen="bk-a">
        {money.data ? (
          <BkMoneyView data={money.data} />
        ) : money.isError ? (
          <BooksError what="Money" onRetry={() => money.refetch()} />
        ) : (
          <BooksLoading />
        )}
      </BooksPage>
    </>
  );
}
