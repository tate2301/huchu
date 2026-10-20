"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { BkMoneyView } from "@/components/books/bk-money-view";
import { CiIcon } from "@/components/books/icons/ci-icon";
import { BkError, BkLoading, BkPage } from "@/components/books/ui";
import { ButtonLink, Kit } from "@/components/core";
import { MenuButton } from "@/components/core/menu";
import { PageChrome } from "@/components/layout/page-chrome";
import { fetchJson } from "@/lib/api-client";
import type { MoneyBoard } from "@/lib/books/money-board-view";

const NEW_INVOICE = { label: "New invoice", icon: "plus" as const, href: "/books/invoices/new", shortcut: "N" };

/** Books → Money (design/books/html/bk-money.html). */
export default function BooksMoneyPage() {
  const router = useRouter();
  const money = useQuery({ queryKey: ["books", "money"], queryFn: () => fetchJson<MoneyBoard>("/api/books/money") });
  // Record spending starts each kind of spending on its Books form.
  const spending = [
    { key: "bill", icon: "docs" as const, label: "Bill", href: "/books/bills/new" },
    { key: "claim", icon: "takings" as const, label: "Claim", href: "/books/claims/new" },
    { key: "voucher", icon: "expenses" as const, label: "Petty cash voucher", href: "/books/claims/new?paid=float" },
    { key: "requisition", icon: "hand" as const, label: "Requisition", href: "/books/requisitions?new=1" },
  ];
  return (
    <>
      <PageChrome title="Money" primary={NEW_INVOICE}>
        <Kit contents>
          <div className="btn-group" role="group" aria-label="Record">
            <ButtonLink href="/books/payments/new" shortcut="R">
              <CiIcon name="banknote" className="ic" />
              Payment received
            </ButtonLink>
            <ButtonLink href="/books/payments-made/new" shortcut="P">
              <CiIcon name="receipt" className="ic" />
              Pay a bill
            </ButtonLink>
            <MenuButton icon="camera" shortcut="E" label="Record spending" items={spending.map((item) => ({ key: item.key, icon: item.icon, label: item.label, onSelect: () => router.push(item.href) }))}>
              Record spending
            </MenuButton>
          </div>
        </Kit>
      </PageChrome>
      <BkPage screen="money">
        {money.data ? <BkMoneyView data={money.data} /> : money.isError ? <BkError what="Money" onRetry={() => money.refetch()} /> : <BkLoading />}
      </BkPage>
    </>
  );
}
