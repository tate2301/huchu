"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";

import { AccountDrawer } from "@/components/books/bk-account-drawer";
import { BkAccountView } from "@/components/books/bk-account-view";
import { BankEntryDrawer, recordMenu, type BankEntryKind } from "@/components/books/bk-bank-entry-drawer";
import { useListQuery } from "@/components/books/bk-list";
import { ReasonDrawer } from "@/components/books/bk-reason-drawer";
import { UploadDrawer } from "@/components/books/bk-upload-drawer";
import { BooksError, BooksLoading } from "@/components/books/books-state";
import { BooksPage } from "@/components/books/figures";
import { Empty, Kit } from "@/components/core";
import { MenuButton } from "@/components/core/menu";
import { PageChrome } from "@/components/layout/page-chrome";
import { useToast } from "@/components/ui/use-toast";
import { ApiError, fetchJson, getApiErrorMessage } from "@/lib/api-client";
import type { AccountLine, AccountPage, AccountTab, AccountTxn } from "@/lib/books/bank-accounts";

type Query = { tab: AccountTab; q: string; range: "since" | "all" };
type Reasoned = { kind: "exclude"; line: AccountLine } | { kind: "void"; txn: AccountTxn };

/**
 * One money account in Books (BkAccount): Upload a statement (U) is the
 * primary, Record holds its bank entries. A statement line is excluded with
 * a reason, put back or unmatched; a bank entry made here is voided with a
 * reason. A closed reconciliation refuses both until the owner reopens it.
 */
function BooksAccount() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const client = useQueryClient();
  const { toast } = useToast();
  const { params, onQuery, exportHref } = useListQuery<Query>({ tab: "transactions", q: "", range: "since" });
  const tab = (params.get("tab") as AccountTab | null) ?? "transactions";
  const q = params.get("q") ?? "";
  const range = params.get("range") === "all" ? "all" : "since";
  const [uploading, setUploading] = React.useState(false);
  const [entry, setEntry] = React.useState<BankEntryKind | null>(null);
  const [reasoned, setReasoned] = React.useState<Reasoned | null>(null);
  const [editing, setEditing] = React.useState(false);

  const query = useQuery({
    queryKey: ["books", "account", id, tab, q, range],
    queryFn: () => fetchJson<AccountPage>(`/api/books/accounts/${id}?${new URLSearchParams({ tab, q, range }).toString()}`),
    placeholderData: (previous) => previous,
  });
  const refresh = () => client.invalidateQueries({ queryKey: ["books"] });
  const post = async (url: string, body: unknown, done: string) => {
    try {
      await fetchJson(url, { method: "POST", body: JSON.stringify(body) });
      toast({ title: done, variant: "success" });
      await refresh();
    } catch (error) {
      toast({ title: "It was not changed", description: getApiErrorMessage(error, "Check the connection and try again."), variant: "destructive" });
    }
  };
  const data = query.data;
  const notFound = query.error instanceof ApiError && query.error.status === 404;

  return (
    <>
      <PageChrome title={data?.name ?? "Account"} backHref="/books/accounts" backLabel="Accounts" primary={{ label: "Upload a statement", icon: "upload2", shortcut: "U", onClick: () => setUploading(true) }}>
        <Kit contents>
          <MenuButton iconEnd="down" align="end" label="Record" items={[...recordMenu(setEntry), { separator: true }, { key: "details", icon: "edit", label: "The account’s details", onSelect: () => setEditing(true) }]}>
            Record
          </MenuButton>
        </Kit>
      </PageChrome>
      <BooksPage screen="bk-b">
        {data ? (
          <BkAccountView
            data={data}
            q={q}
            onQuery={onQuery}
            exportHref={exportHref(`/api/books/accounts/${id}`)}
            txnMenu={(row) =>
              row.entryId
                ? [{ key: "void", icon: "x", label: "Void this entry", danger: true, disabled: row.locked, title: row.locked ? "It is in a closed reconciliation." : undefined, onSelect: () => setReasoned({ kind: "void", txn: row }) }]
                : []
            }
            lineMenu={(row) =>
              row.state === "to-match"
                ? [
                    { key: "match", icon: "match", label: "Match it", onSelect: () => router.push(`/books/bank?account=${id}`) },
                    { key: "exclude", icon: "x", label: "Exclude", onSelect: () => setReasoned({ kind: "exclude", line: row }) },
                  ]
                : row.state === "excluded"
                  ? [{ key: "include", icon: "back", label: "Put it back", onSelect: () => post(`/api/books/bank/lines/${row.id}/include`, {}, "Back in To match") }]
                  : [{ key: "unmatch", icon: "back", label: "Unmatch", onSelect: () => post(`/api/books/bank/lines/${row.id}/unmatch`, {}, "Unmatched") }]
            }
          />
        ) : notFound ? (
          <Empty icon="bank" title="There is no such account here">
            It may have been closed, or it belongs to another workspace. Accounts lists every one this workspace has.
          </Empty>
        ) : query.isError ? (
          <BooksError what="This account" onRetry={() => query.refetch()} />
        ) : (
          <BooksLoading />
        )}
      </BooksPage>
      <UploadDrawer
        open={uploading}
        accountId={id}
        onOpenChange={setUploading}
        onDone={() => {
          setUploading(false);
          refresh();
          router.push(`/books/bank?account=${id}`);
        }}
      />
      <BankEntryDrawer
        kind={entry}
        accountId={id}
        onOpenChange={(open) => !open && setEntry(null)}
        onDone={() => {
          setEntry(null);
          toast({ title: "Recorded and posted", variant: "success" });
          refresh();
        }}
      />
      <AccountDrawer
        open={editing}
        account={data ? { id: data.id, name: data.name, bankName: data.bankName, accountNumber: data.accountNumber, currency: data.currency } : null}
        onOpenChange={setEditing}
        onDone={() => {
          setEditing(false);
          toast({ title: "Saved", variant: "success" });
          refresh();
        }}
      />
      <ReasonDrawer
        open={Boolean(reasoned)}
        onOpenChange={(open) => !open && setReasoned(null)}
        title={reasoned?.kind === "exclude" ? "Exclude this line" : "Void this entry"}
        sub={reasoned?.kind === "exclude" ? reasoned.line.what : reasoned?.kind === "void" ? reasoned.txn.what : undefined}
        what={reasoned?.kind === "exclude" ? "It leaves To match and counts against the statement as excluded. Put it back any time before the reconciliation closes." : "Its mirror posts and its bank side goes. The reason is kept."}
        label={reasoned?.kind === "exclude" ? "Exclude" : "Void it"}
        danger={reasoned?.kind === "void"}
        onConfirm={async (reason) => {
          if (!reasoned) return;
          const url = reasoned.kind === "exclude" ? `/api/books/bank/lines/${reasoned.line.id}/exclude` : `/api/books/bank/entries/${reasoned.txn.entryId}/void`;
          await fetchJson(url, { method: "POST", body: JSON.stringify({ reason }) });
          setReasoned(null);
          toast({ title: reasoned.kind === "exclude" ? "Excluded" : "Voided", variant: "success" });
          await refresh();
        }}
      />
    </>
  );
}

/** Books → Bank & cash → one account (design/core-modules/boards/view/BkAccount.html). */
export default function BooksAccountPage() {
  return (
    <React.Suspense
      fallback={
        <BooksPage screen="bk-b">
          <BooksLoading />
        </BooksPage>
      }
    >
      <BooksAccount />
    </React.Suspense>
  );
}
