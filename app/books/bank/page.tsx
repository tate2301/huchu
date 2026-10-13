"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { BankPageView } from "@/components/books/bank-view";
import { BooksError, BooksLoading } from "@/components/books/books-state";
import { BooksPage } from "@/components/books/figures";
import { Button, Drawer, Empty, Field, Icon, Select } from "@/components/core";
import { PageChrome } from "@/components/layout/page-chrome";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import type { BankLineView, BankTab, BankView } from "@/lib/books/bank";
import type { Match } from "@/lib/books/matching";

const AGAIN = "Check the connection and try again.";

type Choice = { match: Match; title: string; detail: string };

function UploadDrawer({
  open,
  onOpenChange,
  accounts,
  accountId,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: BankView["accounts"];
  accountId: string | null;
  onDone: (account: string) => void;
}) {
  const { toast } = useToast();
  const [account, setAccount] = React.useState(accountId ?? accounts[0]?.id ?? "");
  const [file, setFile] = React.useState<File | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (open) {
      setAccount(accountId ?? accounts[0]?.id ?? "");
      setFile(null);
      setError(null);
    }
  }, [open, accountId, accounts]);

  const upload = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Choose the statement file.");
      const csv = await file.text();
      return fetchJson<{ added: number; repeated: number; skipped: number }>("/api/books/bank/statements", {
        method: "POST",
        body: JSON.stringify({ accountId: account, csv }),
      });
    },
    onSuccess: (result) => {
      toast({
        title: result.added === 0 ? "Every line was already there" : result.added === 1 ? "1 line added" : `${result.added} lines added`,
        description: result.repeated > 0 ? `${result.repeated} were uploaded before and were left out.` : undefined,
      });
      onDone(account);
    },
    onError: (failure) => setError(getApiErrorMessage(failure, AGAIN)),
  });

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title="Upload a statement"
      footer={
        <>
          <Button variant="quiet" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" icon="upload2" shortcut="Ctrl ↵" busy={upload.isPending} disabled={!file || !account || upload.isPending} onClick={() => upload.mutate()}>
            Upload
          </Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-16)", padding: "var(--space-16) var(--space-24)" }}>
        <Field label="Account" htmlFor="statement-account">
          <Select id="statement-account" value={account} onChange={(event) => setAccount(event.target.value)}>
            {accounts.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Statement"
          htmlFor="statement-file"
          error={error}
          help="The CSV from online banking, with a date, a description and the amounts. Lines uploaded before are left out."
        >
          <input
            id="statement-file"
            className="input"
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setError(null);
            }}
          />
        </Field>
      </div>
    </Drawer>
  );
}

function ChooseDrawer({
  line,
  onOpenChange,
  onPick,
  picking,
}: {
  line: BankLineView | null;
  onOpenChange: (open: boolean) => void;
  onPick: (choice: Choice) => void;
  picking: boolean;
}) {
  const choices = useQuery({
    queryKey: ["books", "bank", "choices", line?.id],
    queryFn: () => fetchJson<Choice[]>(`/api/books/bank/lines/${line!.id}/choices`),
    enabled: Boolean(line),
  });
  return (
    <Drawer open={Boolean(line)} onOpenChange={onOpenChange} title={line ? `${line.description}, ${line.amount}` : "Choose"}>
      {choices.data ? (
        choices.data.length === 0 ? (
          <Empty icon="search" title="Nothing it could be">
            No open invoice, bill or recorded transaction fits this amount.
          </Empty>
        ) : (
          <div className="list">
            {choices.data.map((choice, index) => (
              <div className="row" key={index}>
                <Icon name="arrow" />
                <span className="grow" style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                  <b className="truncate" style={{ fontWeight: 500, color: "var(--color-ink)" }}>
                    {choice.title}
                  </b>
                  <span className="muted" style={{ fontSize: "var(--text-13)" }}>
                    {choice.detail}
                  </span>
                </span>
                <Button icon="check" disabled={picking} onClick={() => onPick(choice)}>
                  This one
                </Button>
              </div>
            ))}
          </div>
        )
      ) : choices.isError ? (
        <Empty icon="warn" title="The choices did not load">
          {getApiErrorMessage(choices.error, AGAIN)}
        </Empty>
      ) : (
        <BooksLoading />
      )}
    </Drawer>
  );
}

function BooksBank() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const client = useQueryClient();
  const { toast } = useToast();
  const account = params.get("account");
  const tab = (params.get("tab") as BankTab | null) ?? "to-match";
  const [uploading, setUploading] = React.useState(false);
  const [choosing, setChoosing] = React.useState<BankLineView | null>(null);

  const bank = useQuery({
    queryKey: ["books", "bank", account, tab],
    queryFn: () => fetchJson<BankView>(`/api/books/bank?${new URLSearchParams({ ...(account ? { account } : {}), tab }).toString()}`),
    placeholderData: (previous) => previous,
  });
  const refresh = () => client.invalidateQueries({ queryKey: ["books"] });

  const go = (next: { account?: string; tab?: BankTab }) => {
    const merged = new URLSearchParams(params.toString());
    if (next.account) merged.set("account", next.account);
    if (next.tab) {
      if (next.tab === "to-match") merged.delete("tab");
      else merged.set("tab", next.tab);
    }
    const query = merged.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  const accept = useMutation({
    mutationFn: ({ line, match }: { line: BankLineView; match?: Match }) =>
      fetchJson(`/api/books/bank/lines/${line.id}/accept`, { method: "POST", body: JSON.stringify(match ? { match } : {}) }),
    onSuccess: () => {
      setChoosing(null);
      refresh();
    },
    onError: (error) => toast({ title: "The match was not recorded", description: getApiErrorMessage(error, AGAIN), variant: "destructive" }),
  });

  const acceptAll = useMutation({
    mutationFn: (lineIds: string[]) =>
      fetchJson<{ accepted: number; failed: Array<{ lineId: string; error: string }> }>("/api/books/bank/accept", {
        method: "POST",
        body: JSON.stringify({ lineIds }),
      }),
    onSuccess: (result) => {
      toast({
        title: result.accepted === 1 ? "1 match accepted" : `${result.accepted} matches accepted`,
        description: result.failed.length > 0 ? `${result.failed.length} could not be: ${result.failed[0].error}` : undefined,
      });
      refresh();
    },
    onError: (error) => toast({ title: "The matches were not accepted", description: getApiErrorMessage(error, AGAIN), variant: "destructive" }),
  });

  const data = bank.data;
  const canUpload = Boolean(data && data.accounts.length > 0);
  return (
    <>
      <PageChrome
        title="Bank"
        primary={{
          label: "Upload a statement",
          icon: "upload2",
          shortcut: "U",
          onClick: () => setUploading(true),
          disabled: canUpload ? undefined : "Add a bank account first",
        }}
      />
      <BooksPage screen="books-bank">
        {data ? (
          <BankPageView
            data={data}
            busyLine={accept.isPending ? accept.variables?.line.id : null}
            acceptingAll={acceptAll.isPending}
            onAccount={(id) => go({ account: id })}
            onTab={(next) => go({ tab: next })}
            onAccept={(line) => accept.mutate({ line })}
            onAcceptAll={() => acceptAll.mutate(data.lines.filter((line) => line.state === "proposed").map((line) => line.id))}
            onChoose={setChoosing}
            onSuggestion={(line) => line.suggestion && accept.mutate({ line, match: line.suggestion.match })}
            onUpload={() => setUploading(true)}
          />
        ) : bank.isError ? (
          <BooksError what="The bank" onRetry={() => bank.refetch()} />
        ) : (
          <BooksLoading />
        )}
      </BooksPage>
      {data ? (
        <UploadDrawer
          open={uploading}
          onOpenChange={setUploading}
          accounts={data.accounts}
          accountId={data.account?.id ?? null}
          onDone={(id) => {
            setUploading(false);
            go({ account: id, tab: "to-match" });
            refresh();
          }}
        />
      ) : null}
      <ChooseDrawer
        line={choosing}
        onOpenChange={(open) => !open && setChoosing(null)}
        picking={accept.isPending}
        onPick={(choice) => choosing && accept.mutate({ line: choosing, match: choice.match })}
      />
    </>
  );
}

/** Books → Bank (design/core-modules/html/books-bank.html). */
export default function BooksBankPage() {
  return (
    <React.Suspense
      fallback={
        <BooksPage screen="books-bank">
          <BooksLoading />
        </BooksPage>
      }
    >
      <BooksBank />
    </React.Suspense>
  );
}
