"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { AccountDrawer } from "@/components/books/bk-ledger-setup-drawers";
import { BkChartView } from "@/components/books/bk-ledger-setup-views";
import { downloadCsv, useListQuery } from "@/components/books/bk-list";
import { BooksError, BooksLoading } from "@/components/books/books-state";
import { BooksPage } from "@/components/books/figures";
import { PageChrome } from "@/components/layout/page-chrome";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson } from "@/lib/api-client";
import type { ChartPage, ChartQuery, ChartRow } from "@/lib/books/ledger-setup";

type Account = Extract<ChartRow, { kind: "account" }>;

/**
 * Books → Ledger → Chart of accounts (BkChart). New account (N) and each
 * account's drawer are for the owner or the accountant; `?action=new-account`
 * (the old page's dead link) opens New account.
 */
function Chart() {
  const client = useQueryClient();
  const { toast } = useToast();
  const { search, params, onQuery } = useListQuery<ChartQuery>({ q: "", type: "all", inactive: "hide", collapse: "no" });
  const [open, setOpen] = React.useState(() => params.get("action") === "new-account");
  const [account, setAccount] = React.useState<Account | null>(null);
  const list = new URLSearchParams(search);
  list.delete("action");
  const query = useQuery({ queryKey: ["books", "chart", list.toString()], queryFn: () => fetchJson<ChartPage>(`/api/books/chart?${list.toString()}`), placeholderData: (previous) => previous });
  const data = query.data;
  const exportRows = () =>
    downloadCsv(
      "chart-of-accounts.csv",
      ["Code", "Account", "Type", "Tax code", `Balance, ${data?.baseCurrency ?? "USD"}`, "Active"],
      (data?.rows ?? []).filter((row): row is Account => row.kind === "account").map((row) => [row.code, row.name, row.word, row.taxCode ?? "", row.balance.toFixed(2), row.active ? "Yes" : "No"]),
    );
  return (
    <>
      <PageChrome
        title="Chart of accounts"
        primary={{
          label: "New account",
          icon: "plus",
          shortcut: "N",
          disabled: data && !data.can.change ? "Only the owner or the accountant can change the chart" : undefined,
          onClick: () => {
            setAccount(null);
            setOpen(true);
          },
        }}
      />
      <BooksPage screen="bk-b">
        {data ? (
          <BkChartView
            data={data}
            onQuery={onQuery}
            onExport={exportRows}
            onOpen={(row) => {
              if (!data.can.change) return;
              setAccount(row);
              setOpen(true);
            }}
          />
        ) : query.isError ? (
          <BooksError what="The chart of accounts" error={query.error} onRetry={() => query.refetch()} />
        ) : (
          <BooksLoading />
        )}
      </BooksPage>
      <AccountDrawer
        open={open}
        account={account}
        groups={data?.groups ?? []}
        onOpenChange={setOpen}
        onSaved={(message) => {
          toast({ title: message, variant: "success" });
          client.invalidateQueries({ queryKey: ["books"] });
        }}
      />
    </>
  );
}

/** Books → Ledger → Chart of accounts (design/core-modules/boards/view/BkChart.html). */
export default function ChartPageRoute() {
  return (
    <React.Suspense
      fallback={
        <BooksPage screen="bk-b">
          <BooksLoading />
        </BooksPage>
      }
    >
      <Chart />
    </React.Suspense>
  );
}
