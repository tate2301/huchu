"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { AccountDrawer } from "@/components/books/bk-account-drawer";
import { BankEntryDrawer, recordMenu, type BankEntryKind } from "@/components/books/bk-bank-entry-drawer";
import { useListQuery } from "@/components/books/bk-list";
import { BkAccountsView } from "@/components/books/bk-accounts-view";
import { UploadDrawer } from "@/components/books/bk-upload-drawer";
import { BooksError, BooksLoading } from "@/components/books/books-state";
import { BooksPage } from "@/components/books/figures";
import { Kit } from "@/components/core";
import { MenuButton } from "@/components/core/menu";
import { PageChrome } from "@/components/layout/page-chrome";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson } from "@/lib/api-client";
import type { AccountKindKey, AccountsPage } from "@/lib/books/bank-accounts";

type Query = { view: "all" | AccountKindKey; q: string };

/**
 * Books → Bank & cash → Accounts (BkAccounts). Upload a statement is the one
 * primary (U); Record holds the bank entries (a charge, IMTT, interest, a
 * transfer, tax paid). The accounts themselves are set up in Management.
 */
function BooksAccounts() {
  const router = useRouter();
  const client = useQueryClient();
  const { toast } = useToast();
  const { search, params, onQuery, exportHref } = useListQuery<Query>({ view: "all", q: "" });
  const view = (params.get("view") as Query["view"] | null) ?? "all";
  const q = params.get("q") ?? "";
  const [uploading, setUploading] = React.useState<string | null | false>(false);
  const [entry, setEntry] = React.useState<{ kind: BankEntryKind; account: string | null } | null>(null);
  const [adding, setAdding] = React.useState(false);

  // Management's "Add an account" lands here with the drawer open.
  const asked = params.get("action");
  React.useEffect(() => {
    if (asked !== "new-account") return;
    setAdding(true);
    onQuery({ action: null } as Partial<Query> & { action: null });
  }, [asked, onQuery]);

  const list = useQuery({
    queryKey: ["books", "accounts", search],
    queryFn: () => fetchJson<AccountsPage>(`/api/books/accounts${search ? `?${search}` : ""}`),
    placeholderData: (previous) => previous,
  });
  const refresh = () => client.invalidateQueries({ queryKey: ["books"] });

  return (
    <>
      <PageChrome title="Accounts" primary={{ label: "Upload a statement", icon: "upload2", shortcut: "U", onClick: () => setUploading(null) }}>
        <Kit contents>
          <MenuButton iconEnd="down" align="end" label="Record" items={[...recordMenu((kind) => setEntry({ kind, account: null })), { separator: true }, { key: "account", icon: "bank", label: "New bank account", onSelect: () => setAdding(true) }]}>
            Record
          </MenuButton>
        </Kit>
      </PageChrome>
      <BooksPage screen="bk-b">
        {list.data ? (
          <BkAccountsView
            data={list.data}
            view={view}
            q={q}
            onQuery={onQuery}
            exportHref={exportHref("/api/books/accounts")}
            more={(row) => [
              { key: "open", icon: "arrow", label: "Open", onSelect: () => router.push(`/books/accounts/${row.id}`) },
              ...(row.kind !== "cash"
                ? [
                    { key: "upload", icon: "upload" as const, label: "Upload a statement", onSelect: () => setUploading(row.id) },
                    { key: "match", icon: "match" as const, label: "Lines to match", onSelect: () => router.push(`/books/bank?account=${row.id}`) },
                    { key: "reconcile", icon: "check" as const, label: "Reconcile", onSelect: () => router.push(`/books/reconciliations?account=${row.id}`) },
                  ]
                : []),
              { key: "charge", icon: "bank2", label: "Record a charge", onSelect: () => setEntry({ kind: "CHARGE", account: row.id }) },
            ]}
          />
        ) : list.isError ? (
          <BooksError what="The accounts" onRetry={() => list.refetch()} />
        ) : (
          <BooksLoading />
        )}
      </BooksPage>
      <UploadDrawer
        open={uploading !== false}
        accountId={uploading || null}
        onOpenChange={(open) => !open && setUploading(false)}
        onDone={(account) => {
          setUploading(false);
          refresh();
          router.push(`/books/bank?account=${account}`);
        }}
      />
      <AccountDrawer
        open={adding}
        account={null}
        onOpenChange={setAdding}
        onDone={(id) => {
          setAdding(false);
          toast({ title: "The account is added", variant: "success" });
          refresh();
          if (id) router.push(`/books/accounts/${id}`);
        }}
      />
      <BankEntryDrawer
        kind={entry?.kind ?? null}
        accountId={entry?.account}
        onOpenChange={(open) => !open && setEntry(null)}
        onDone={() => {
          setEntry(null);
          toast({ title: "Recorded and posted", variant: "success" });
          refresh();
        }}
      />
    </>
  );
}

/** Books → Bank & cash → Accounts (design/core-modules/boards/view/BkAccounts.html). */
export default function BooksAccountsPage() {
  return (
    <React.Suspense
      fallback={
        <BooksPage screen="bk-b">
          <BooksLoading />
        </BooksPage>
      }
    >
      <BooksAccounts />
    </React.Suspense>
  );
}
