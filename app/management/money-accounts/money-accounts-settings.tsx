"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button, Empty, Icon } from "@/components/core";
import { MoneyAccountDrawer, MoneyAccountsView, type MoneyAccountsData } from "@/components/management/money/money-views";
import { KitPage, OwnsChrome } from "@/components/management/ui";
import { ManagementShell } from "@/components/settings/management-shell";
import { useToast } from "@/components/ui/use-toast";
import { ApiError, fetchJson, getApiErrorMessage } from "@/lib/api-client";
import type { MoneyAccountRow } from "@/lib/books/core/money-accounts";

const KEY = ["books", "money-accounts"] as const;

/** Management → Money accounts: every money account and float, New money account (N) and each one's details. */
export function MoneyAccountsSettings() {
  const client = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [account, setAccount] = React.useState<MoneyAccountRow | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const query = useQuery({ queryKey: KEY, queryFn: () => fetchJson<MoneyAccountsData>("/api/books/money-accounts") });
  const save = useMutation({
    mutationFn: (form: Record<string, unknown>) => (account ? fetchJson(`/api/books/money-accounts/${account.id}`, { method: "PATCH", body: JSON.stringify(form) }) : fetchJson("/api/books/money-accounts", { method: "POST", body: JSON.stringify(form) })),
    onSuccess: () => {
      toast({ title: account ? "Saved" : "The account is added", variant: "success" });
      setOpen(false);
      void client.invalidateQueries({ queryKey: ["books"] });
    },
    onError: (failure) => setError(getApiErrorMessage(failure, "Check the connection and try again.")),
  });
  const openOne = (row: MoneyAccountRow | null) => {
    setAccount(row);
    setError(null);
    setOpen(true);
  };
  let body: React.ReactNode;
  if (query.data) body = <MoneyAccountsView data={query.data} onNew={() => openOne(null)} onOpen={openOne} />;
  else if (query.isError) {
    const refused = query.error instanceof ApiError && query.error.status === 403;
    body = (
      <KitPage title="Money accounts" mark={<Icon name="bank" />}>
        <Empty icon={refused ? "lock" : "warn"} title={refused ? "Only the owner, a manager or the accountant see the money accounts" : "Money accounts did not load"} action={refused ? null : <Button icon="history" onClick={() => void query.refetch()}>Try again</Button>}>
          {getApiErrorMessage(query.error, "Check the connection and try again.")}
        </Empty>
      </KitPage>
    );
  } else {
    body = (
      <KitPage title="Money accounts" mark={<Icon name="bank" />}>
        <div aria-busy="true" aria-label="Loading money accounts" style={{ display: "grid", gap: 16 }}>
          <div className="skeleton" style={{ height: 56, maxWidth: 720 }} />
          <div className="skeleton" style={{ height: 300 }} />
        </div>
      </KitPage>
    );
  }
  return (
    <ManagementShell>
      <OwnsChrome>{body}</OwnsChrome>
      {query.data ? <MoneyAccountDrawer open={open} account={account} data={query.data} saving={save.isPending} error={error} onOpenChange={setOpen} onSave={(form) => save.mutate(form)} /> : null}
    </ManagementShell>
  );
}
