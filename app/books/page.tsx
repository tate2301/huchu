"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { BkMoneyView } from "@/components/books/bk-money-view";
import { BooksError, BooksLoading } from "@/components/books/books-state";
import { BooksPage } from "@/components/books/figures";
import { Kit } from "@/components/core";
import { MenuButton } from "@/components/core/menu";
import { PageChrome } from "@/components/layout/page-chrome";
import { fetchJson } from "@/lib/api-client";
import type { MoneyBoard } from "@/lib/books/money-board-view";

const NEW_INVOICE = { label: "New invoice", icon: "plus" as const, href: "/books/invoices/new", shortcut: "N" };

/** What Record ▾ records: money in, money out, and spending, each on its Books form. */
const RECORD = [
  { key: "payment", icon: "payments", label: "A payment received", href: "/books/payments/new" },
  { key: "bill", icon: "docs", label: "A bill", href: "/books/bills/new" },
  { key: "pay", icon: "expenses", label: "A payment to a supplier", href: "/books/payments-made/new" },
] as const;

/** Books → Money (design/core-modules/boards/view/BkMoney.html). */
export default function BooksMoneyPage() {
  const router = useRouter();
  const money = useQuery({ queryKey: ["books", "money"], queryFn: () => fetchJson<MoneyBoard>("/api/books/money") });
  return (
    <>
      <PageChrome title="Money" primary={NEW_INVOICE}>
        <Kit contents>
          <MenuButton label="Record" align="end" items={RECORD.map((item) => ({ key: item.key, icon: item.icon, label: item.label, onSelect: () => router.push(item.href) }))}>
            Record
          </MenuButton>
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
