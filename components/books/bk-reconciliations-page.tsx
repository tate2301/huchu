"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { useListQuery } from "@/components/books/bk-list";
import { ReasonDrawer } from "@/components/books/bk-reason-drawer";
import { BkReconciliationsView } from "@/components/books/bk-reconciliations-view";
import { BooksError, BooksLoading } from "@/components/books/books-state";
import { BooksPage } from "@/components/books/figures";
import { Button, Drawer, Field, Input, Select } from "@/components/core";
import { PageChrome } from "@/components/layout/page-chrome";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import type { RecTab, ReconciliationsPage } from "@/lib/books/reconciliations";

const AGAIN = "Check the connection and try again.";
type Query = { tab: RecTab; q: string; account: string };

function StartDrawer({ open, onOpenChange, accounts, accountId, onDone }: { open: boolean; onOpenChange: (open: boolean) => void; accounts: ReconciliationsPage["accounts"]; accountId: string | null; onDone: (id: string) => void }) {
  const [form, setForm] = React.useState({ bankAccountId: "", statementEndDate: "", statementBalance: "" });
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (open) {
      setForm({ bankAccountId: accountId ?? accounts[0]?.id ?? "", statementEndDate: new Date().toISOString().slice(0, 10), statementBalance: "" });
      setError(null);
    }
  }, [open, accountId, accounts]);
  const start = useMutation({
    mutationFn: () => fetchJson<{ id: string }>("/api/books/reconciliations", { method: "POST", body: JSON.stringify({ bankAccountId: form.bankAccountId, statementEndDate: form.statementEndDate, statementBalance: Number(form.statementBalance) }) }),
    onSuccess: (rec) => onDone(rec.id),
    onError: (failure) => setError(getApiErrorMessage(failure, AGAIN)),
  });
  const account = accounts.find((row) => row.id === form.bankAccountId);
  const ready = Boolean(form.bankAccountId && form.statementEndDate && form.statementBalance !== "" && !Number.isNaN(Number(form.statementBalance)));
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title="Start a reconciliation"
      footer={
        <>
          <Button variant="quiet" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" icon="check" shortcut="Ctrl ↵" busy={start.isPending} disabled={!ready || start.isPending} onClick={() => start.mutate()}>
            Start
          </Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-16)", padding: "var(--space-16) var(--space-24)" }}>
        <Field label="Account" htmlFor="rec-account">
          <Select id="rec-account" value={form.bankAccountId} onChange={(event) => setForm({ ...form, bankAccountId: event.target.value })}>
            {accounts.map((row) => (
              <option key={row.id} value={row.id}>
                {row.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Statement ends on" htmlFor="rec-end" help="The last day the bank’s statement covers.">
          <Input id="rec-end" type="date" value={form.statementEndDate} onChange={(event) => setForm({ ...form, statementEndDate: event.target.value })} />
        </Field>
        <Field label={`Closing balance${account ? `, ${account.currency}` : ""}`} htmlFor="rec-balance" error={error} help="As the statement shows it on that day.">
          <Input id="rec-balance" inputMode="decimal" value={form.statementBalance} onChange={(event) => setForm({ ...form, statementBalance: event.target.value.replace(/[^\d.-]/g, "") })} />
        </Field>
      </div>
    </Drawer>
  );
}

/**
 * Books → Bank & cash → Reconciliations (BkReconciliation) and one of them
 * (`/books/reconciliations/<id>`, the same page with it selected). Start a
 * reconciliation is the primary (N); Close (Ctrl ↵) stays off until the
 * difference is 0.00; Reopen and Void are the owner's, with a reason.
 */
export function ReconciliationsScreen({ selectedId }: { selectedId: string | null }) {
  const router = useRouter();
  const client = useQueryClient();
  const { toast } = useToast();
  const { params, onQuery, exportHref } = useListQuery<Query>({ tab: "open", q: "", account: "" });
  const tab = (params.get("tab") as RecTab | null) ?? (selectedId ? "open" : "open");
  const q = params.get("q") ?? "";
  const account = params.get("account");
  const [starting, setStarting] = React.useState(false);
  const [owner, setOwner] = React.useState<"reopen" | "void" | null>(null);

  const query = useQuery({
    queryKey: ["books", "reconciliations", tab, q, account, selectedId],
    queryFn: () => fetchJson<ReconciliationsPage>(`/api/books/reconciliations?${new URLSearchParams({ tab, q, ...(account ? { account } : {}), ...(selectedId ? { selected: selectedId } : {}) }).toString()}`),
    placeholderData: (previous) => previous,
  });
  const refresh = () => client.invalidateQueries({ queryKey: ["books"] });
  const data = query.data;
  const sel = data?.selected ?? null;

  const close = useMutation({
    mutationFn: () => fetchJson(`/api/books/reconciliations/${sel!.id}`, { method: "POST", body: JSON.stringify({ action: "close" }) }),
    onSuccess: () => {
      toast({ title: `${sel?.account} is reconciled`, description: "Its lines and transactions are locked to it.", variant: "success" });
      refresh();
    },
    onError: (error) => toast({ title: "It did not close", description: getApiErrorMessage(error, AGAIN), variant: "destructive" }),
  });

  const ownerMenu = sel && data
    ? sel.status === "CLOSED"
      ? [{ key: "reopen", icon: "back" as const, label: "Reopen", disabled: !data.can.reopen, title: data.can.why.reopen ?? undefined, onSelect: () => setOwner("reopen") }]
      : [{ key: "void", icon: "x" as const, label: "Void", danger: true, disabled: !data.can.void, title: data.can.why.void ?? undefined, onSelect: () => setOwner("void") }]
    : [];

  return (
    <>
      <PageChrome title="Reconciliations" primary={{ label: "Start a reconciliation", icon: "plus", shortcut: "N", onClick: () => setStarting(true), disabled: data && !data.can.start ? "Only people with bank rights start one" : undefined }} />
      <BooksPage screen="bk-b">
        {data ? (
          <BkReconciliationsView
            data={data}
            q={q}
            account={account}
            onQuery={(next) => onQuery(next as Partial<Query>)}
            onSelect={(id) => router.replace(`/books/reconciliations/${id}${params.toString() ? `?${params.toString()}` : ""}`, { scroll: false })}
            onClose={() => close.mutate()}
            closing={close.isPending}
            ownerMenu={ownerMenu}
            exportHref={exportHref("/api/books/reconciliations")}
          />
        ) : query.isError ? (
          <BooksError what="The reconciliations" onRetry={() => query.refetch()} />
        ) : (
          <BooksLoading />
        )}
      </BooksPage>
      {data ? (
        <StartDrawer
          open={starting}
          onOpenChange={setStarting}
          accounts={data.accounts}
          accountId={account}
          onDone={(id) => {
            setStarting(false);
            refresh();
            router.push(`/books/reconciliations/${id}`);
          }}
        />
      ) : null}
      <ReasonDrawer
        open={Boolean(owner)}
        onOpenChange={(open) => !open && setOwner(null)}
        title={owner === "reopen" ? "Reopen this reconciliation" : "Void this reconciliation"}
        sub={sel ? `${sel.account}${sel.statementEnd ? `, to ${sel.statementEnd}` : ""}` : undefined}
        what={owner === "reopen" ? "Its lines and transactions unlock, and later lines join it again. The reason is kept." : "Its matches are undone and its statement lines removed, to upload again. For a reconciliation started in error."}
        label={owner === "reopen" ? "Reopen" : "Void it"}
        icon={owner === "reopen" ? "back" : "x"}
        danger={owner === "void"}
        onConfirm={async (reason) => {
          if (!sel || !owner) return;
          await fetchJson(`/api/books/reconciliations/${sel.id}`, { method: "POST", body: JSON.stringify({ action: owner, reason }) });
          toast({ title: owner === "reopen" ? "Reopened" : "Voided", variant: "success" });
          setOwner(null);
          await refresh();
        }}
      />
    </>
  );
}

export function ReconciliationsFallback() {
  return (
    <BooksPage screen="bk-b">
      <BooksLoading />
    </BooksPage>
  );
}
