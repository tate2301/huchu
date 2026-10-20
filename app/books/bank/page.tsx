"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { BankEntryDrawer, type BankEntryKind } from "@/components/books/bk-bank-entry-drawer";
import { useListQuery } from "@/components/books/bk-list";
import { ReasonDrawer } from "@/components/books/bk-reason-drawer";
import { BkToMatchView } from "@/components/books/bk-to-match-view";
import { UploadDrawer } from "@/components/books/bk-upload-drawer";
import { BooksError, BooksLoading } from "@/components/books/books-state";
import { BooksPage } from "@/components/books/figures";
import { Button, Drawer, Empty, Icon } from "@/components/core";
import type { MenuEntry } from "@/components/core/menu";
import { PageChrome } from "@/components/layout/page-chrome";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import type { BankLineView, BankTab, BankView } from "@/lib/books/bank";
import type { Match } from "@/lib/books/matching";

const AGAIN = "Check the connection and try again.";

type Choice = { match: Match; title: string; detail: string };
type Query = { account: string; tab: BankTab; q: string };

function ChooseDrawer({ line, onOpenChange, onPick, picking }: { line: BankLineView | null; onOpenChange: (open: boolean) => void; onPick: (choice: Choice) => void; picking: boolean }) {
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
            No open invoice, bill, transfer or recorded transaction fits this amount.
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

/**
 * Books → Bank & cash → To match (BkToMatch, BkToMatchPhone). Upload a
 * statement is the primary (U); A accepts the selection's proposals. A line
 * becomes a payment, a bank charge, IMTT or a transfer through the core, or is
 * excluded with a reason; a matched line is unmatched and an excluded one put
 * back, refused in a closed reconciliation.
 */
function BooksBank() {
  const router = useRouter();
  const client = useQueryClient();
  const { toast } = useToast();
  const { params, onQuery, exportHref } = useListQuery<Query>({ tab: "to-match", q: "" });
  const account = params.get("account");
  const tab = (params.get("tab") as BankTab | null) ?? "to-match";
  const q = params.get("q") ?? "";
  const [uploading, setUploading] = React.useState(false);
  const [choosing, setChoosing] = React.useState<BankLineView | null>(null);
  const [excluding, setExcluding] = React.useState<BankLineView[] | null>(null);
  const [entry, setEntry] = React.useState<{ kind: BankEntryKind; line: BankLineView } | null>(null);

  const bank = useQuery({
    queryKey: ["books", "bank", account, tab, q],
    queryFn: () => fetchJson<BankView>(`/api/books/bank?${new URLSearchParams({ ...(account ? { account } : {}), tab, q }).toString()}`),
    placeholderData: (previous) => previous,
  });
  const refresh = () => client.invalidateQueries({ queryKey: ["books"] });

  const accept = useMutation({
    mutationFn: ({ line, match }: { line: BankLineView; match?: Match }) => fetchJson(`/api/books/bank/lines/${line.id}/accept`, { method: "POST", body: JSON.stringify(match ? { match } : {}) }),
    onSuccess: () => {
      setChoosing(null);
      refresh();
    },
    onError: (error) => toast({ title: "The match was not recorded", description: getApiErrorMessage(error, AGAIN), variant: "destructive" }),
  });

  const acceptMany = useMutation({
    mutationFn: (lineIds: string[]) => fetchJson<{ accepted: number; failed: Array<{ lineId: string; error: string }> }>("/api/books/bank/accept", { method: "POST", body: JSON.stringify({ lineIds }) }),
    onSuccess: (result) => {
      toast({
        title: result.accepted === 1 ? "1 match accepted" : `${result.accepted} matches accepted`,
        description: result.failed.length > 0 ? `${result.failed.length} could not be: ${result.failed[0].error}` : undefined,
      });
      refresh();
    },
    onError: (error) => toast({ title: "The matches were not accepted", description: getApiErrorMessage(error, AGAIN), variant: "destructive" }),
  });

  const lineAction = async (line: BankLineView, action: "unmatch" | "include") => {
    try {
      await fetchJson(`/api/books/bank/lines/${line.id}/${action}`, { method: "POST", body: "{}" });
      toast({ title: action === "unmatch" ? "Unmatched: it is back in To match" : "Back in To match", variant: "success" });
      await refresh();
    } catch (error) {
      toast({ title: "It was not changed", description: getApiErrorMessage(error, AGAIN), variant: "destructive" });
    }
  };

  const data = bank.data;
  const createMenu = (line: BankLineView): MenuEntry[] => [
    { heading: "Create from this line" },
    ...(line.moneyIn
      ? [{ key: "in", icon: "payments" as const, label: "Payment received", onSelect: () => router.push("/books/payments/new") }]
      : [{ key: "out", icon: "expenses" as const, label: "Payment made", onSelect: () => router.push("/books/payments-made/new") }]),
    ...(!line.moneyIn
      ? [
          { key: "charge", icon: "bank2" as const, label: "Bank charge", onSelect: () => accept.mutate({ line, match: { kind: "bank-charges", amount: Math.abs(line.value) } }) },
          { key: "imtt", icon: "posting" as const, label: "IMTT", onSelect: () => accept.mutate({ line, match: { kind: "bank-charges", amount: Math.abs(line.value), imtt: true } }) },
        ]
      : [{ key: "interest", icon: "bank2" as const, label: "Interest", onSelect: () => setEntry({ kind: "INTEREST", line }) }]),
    { key: "transfer", icon: "move", label: "Transfer", onSelect: () => setChoosing(line) },
  ];

  return (
    <>
      <PageChrome title="To match" primary={{ label: "Upload a statement", icon: "upload2", shortcut: "U", onClick: () => setUploading(true), disabled: data && data.accounts.length === 0 ? "Add a bank account in Management first" : undefined }} />
      <BooksPage screen="bk-b">
        {data ? (
          <BkToMatchView
            data={data}
            q={q}
            busyLine={accept.isPending ? (accept.variables?.line.id ?? null) : null}
            acceptingAll={acceptMany.isPending}
            onQuery={(next) => onQuery(next as Partial<Query>)}
            onAccept={(line) => accept.mutate({ line })}
            onAcceptMany={(lines) => acceptMany.mutate(lines.map((line) => line.id))}
            onChoose={setChoosing}
            onExclude={setExcluding}
            createMenu={createMenu}
            matchedMenu={(line) =>
              line.state === "matched"
                ? [{ key: "unmatch", icon: "back", label: "Unmatch", disabled: line.locked, title: line.locked ? "Its reconciliation is closed: the owner reopens it first." : undefined, onSelect: () => lineAction(line, "unmatch") }]
                : line.state === "excluded"
                  ? [{ key: "include", icon: "back", label: "Put it back", disabled: line.locked, title: line.locked ? "Its reconciliation is closed: the owner reopens it first." : undefined, onSelect: () => lineAction(line, "include") }]
                  : []
            }
            onUpload={() => setUploading(true)}
            exportHref={exportHref("/api/books/bank")}
          />
        ) : bank.isError ? (
          <BooksError what="To match" onRetry={() => bank.refetch()} />
        ) : (
          <BooksLoading />
        )}
      </BooksPage>
      <UploadDrawer
        open={uploading}
        accountId={data?.account?.id ?? null}
        onOpenChange={setUploading}
        onDone={(id) => {
          setUploading(false);
          onQuery({ account: id, tab: "to-match" });
          refresh();
        }}
      />
      <ChooseDrawer line={choosing} onOpenChange={(open) => !open && setChoosing(null)} picking={accept.isPending} onPick={(choice) => choosing && accept.mutate({ line: choosing, match: choice.match })} />
      <ReasonDrawer
        open={Boolean(excluding)}
        onOpenChange={(open) => !open && setExcluding(null)}
        title={excluding && excluding.length > 1 ? `Exclude ${excluding.length} lines` : "Exclude this line"}
        sub={excluding?.length === 1 ? `${excluding[0].description}, ${excluding[0].amount}` : undefined}
        what="It leaves To match and counts against the statement as excluded. Put it back any time before the reconciliation closes."
        label="Exclude"
        icon="x"
        danger={false}
        onConfirm={async (reason) => {
          for (const line of excluding ?? []) await fetchJson(`/api/books/bank/lines/${line.id}/exclude`, { method: "POST", body: JSON.stringify({ reason }) });
          toast({ title: excluding && excluding.length > 1 ? `${excluding.length} lines excluded` : "Excluded", variant: "success" });
          setExcluding(null);
          await refresh();
        }}
      />
      <BankEntryDrawer
        kind={entry?.kind ?? null}
        accountId={data?.account?.id ?? null}
        onOpenChange={(open) => !open && setEntry(null)}
        onDone={() => {
          setEntry(null);
          toast({ title: "Recorded and posted", description: "It is proposed against the line now.", variant: "success" });
          refresh();
        }}
      />
    </>
  );
}

/** Books → Bank & cash → To match (design/core-modules/boards/view/BkToMatch.html). */
export default function BooksBankPage() {
  return (
    <React.Suspense
      fallback={
        <BooksPage screen="bk-b">
          <BooksLoading />
        </BooksPage>
      }
    >
      <BooksBank />
    </React.Suspense>
  );
}
