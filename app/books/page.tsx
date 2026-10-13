"use client";

import { useQuery } from "@tanstack/react-query";

import { BooksError, BooksLoading } from "@/components/books/books-state";
import { BooksPage } from "@/components/books/figures";
import { MoneyPageView } from "@/components/books/money-view";
import { ButtonGroup, ButtonLink, Kit } from "@/components/core";
import { PageChrome } from "@/components/layout/page-chrome";
import { useShell } from "@/components/layout/shell-state";
import { fetchJson } from "@/lib/api-client";
import type { MoneyView } from "@/lib/books/money";

const NEW_INVOICE = { label: "New invoice", icon: "plus" as const, href: "/accounting/sales?action=new-invoice" };

/** Books → Money (design/core-modules/html/books-money.html; books-vane.html with Vane open). */
export default function BooksMoneyPage() {
  const shell = useShell();
  const money = useQuery({ queryKey: ["books", "money"], queryFn: () => fetchJson<MoneyView>("/api/books/money") });
  return (
    <>
      <PageChrome title="Money" primary={NEW_INVOICE}>
        {shell.vaneOpen ? undefined : (
          <Kit contents>
            <ButtonGroup aria-label="Record">
              <ButtonLink href="/accounting/sales?action=new-receipt" icon="photo">
                Add a receipt
              </ButtonLink>
              <ButtonLink href="/accounting/purchases?action=new-payment" icon="payments">
                Record a payment
              </ButtonLink>
            </ButtonGroup>
          </Kit>
        )}
      </PageChrome>
      <BooksPage screen={shell.vaneOpen ? "books-vane" : "books-money"}>
        {money.data ? (
          <MoneyPageView data={money.data} vaneOpen={shell.vaneOpen} />
        ) : money.isError ? (
          <BooksError what="Money" onRetry={() => money.refetch()} />
        ) : (
          <BooksLoading />
        )}
      </BooksPage>
    </>
  );
}
