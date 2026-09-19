"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";

export type PaymentAccount = {
  id: string;
  name: string;
  currency: string;
  accountName: string | null;
  accountNumber: string | null;
  bankName: string | null;
  showOnDocuments: boolean;
  documentPosition: number;
};

async function readJson<T>(response: Response, fallback: string): Promise<T> {
  const payload = (await response.json().catch(() => null)) as
    | (T & { error?: string })
    | null;
  if (!response.ok) throw new Error(payload?.error ?? fallback);
  return payload as T;
}

const ENDPOINT = "/api/settings/branding/payment-accounts";

/**
 * Which accounts a customer is asked to pay into.
 *
 * This lives on the branding page rather than in accounting for a reason
 * worth stating: `/accounting/banking` is gated on `accounting.banking`, so a
 * tenant who sells on quotations without running the ledger could fill in
 * every bank field and still never get one onto a document — the accounts
 * were there, nothing had opted them in, and no screen they could reach said
 * so.
 */
export function PaymentAccountsBlock() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState({ name: "", currency: "USD", accountName: "", accountNumber: "" });
  const [adding, setAdding] = useState(false);

  const accountsQuery = useQuery({
    queryKey: ["branding-payment-accounts"],
    queryFn: async () =>
      readJson<{ accounts: PaymentAccount[] }>(
        await fetch(ENDPOINT, { method: "GET" }),
        "Failed to load payment accounts",
      ),
  });

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["branding-payment-accounts"] });

  const updateAccount = useMutation({
    mutationFn: async ({ id, ...patch }: Partial<PaymentAccount> & { id: string }) =>
      readJson<{ account: PaymentAccount }>(
        await fetch(`${ENDPOINT}/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        }),
        "Failed to update the payment account",
      ),
    onSuccess: refresh,
    onError: (error: Error) =>
      toast({ title: "Could not save", description: error.message, variant: "destructive" }),
  });

  const addAccount = useMutation({
    mutationFn: async () =>
      readJson<{ account: PaymentAccount }>(
        await fetch(ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: draft.name.trim() || `${draft.currency.trim().toUpperCase()} Account`,
            currency: draft.currency.trim().toUpperCase(),
            accountName: draft.accountName.trim() || undefined,
            accountNumber: draft.accountNumber.trim() || undefined,
          }),
        }),
        "Failed to add the payment account",
      ),
    onSuccess: async () => {
      setDraft({ name: "", currency: "USD", accountName: "", accountNumber: "" });
      setAdding(false);
      await refresh();
      toast({ title: "Account added", description: "It will print on new documents." });
    },
    onError: (error: Error) =>
      toast({ title: "Could not add it", description: error.message, variant: "destructive" }),
  });

  const accounts = accountsQuery.data?.accounts ?? [];
  const shown = accounts.filter((account) => account.showOnDocuments);

  return (
    <section className="space-y-4 border-t border-[var(--border-subtle)] pt-6">
      <div>
        <h3 className="text-base font-semibold text-[var(--text-strong)]">
          Accounts shown on documents
        </h3>
        <p className="text-sm text-[var(--text-muted)]">
          Tick the accounts a customer should pay into. They print in the Payment details
          block on quotations and invoices, labelled by currency so nobody pays USD into a
          ZWG account. With none ticked, the single Bank Account Name and Number above are
          used instead; with neither, the block is left off the document entirely.
        </p>
      </div>

      {accountsQuery.isLoading ? (
        <p className="text-sm text-[var(--text-muted)]">Loading accounts…</p>
      ) : accountsQuery.isError ? (
        <p className="text-sm text-[var(--status-error-text)]">
          {(accountsQuery.error as Error).message}
        </p>
      ) : accounts.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">
          No accounts yet. Add one below, or fill in the single Bank Account Name and Number
          above if you only ever collect into one.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--border-subtle)]">
          {accounts.map((account) => (
            <li key={account.id} className="flex flex-wrap items-center gap-3 py-3">
              <Checkbox
                id={`show-${account.id}`}
                checked={account.showOnDocuments}
                disabled={updateAccount.isPending}
                onCheckedChange={(checked) =>
                  updateAccount.mutate({ id: account.id, showOnDocuments: checked === true })
                }
              />
              <label htmlFor={`show-${account.id}`} className="min-w-0 flex-1 cursor-pointer">
                <span className="font-medium text-[var(--text-strong)]">{account.name}</span>
                <span className="ml-2 font-mono text-sm text-[var(--text-muted)]">
                  {account.currency}
                </span>
                <span className="block text-sm text-[var(--text-muted)]">
                  {account.accountName || "No account name — a payer's bank matches on this"}
                  {account.accountNumber ? ` · ${account.accountNumber}` : ""}
                </span>
              </label>
              <Input
                aria-label={`Account name for ${account.name}`}
                className="w-full sm:w-56"
                placeholder="Account name"
                defaultValue={account.accountName ?? ""}
                onBlur={(event) => {
                  const value = event.target.value.trim();
                  if (value === (account.accountName ?? "")) return;
                  updateAccount.mutate({ id: account.id, accountName: value });
                }}
              />
              <Input
                aria-label={`Account number for ${account.name}`}
                className="w-full sm:w-48"
                placeholder="Account number"
                defaultValue={account.accountNumber ?? ""}
                onBlur={(event) => {
                  const value = event.target.value.trim();
                  if (value === (account.accountNumber ?? "")) return;
                  updateAccount.mutate({ id: account.id, accountNumber: value });
                }}
              />
            </li>
          ))}
        </ul>
      )}

      {accounts.length > 0 && shown.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">
          None are ticked, so documents fall back to the single account above.
        </p>
      ) : null}

      {adding ? (
        <div className="grid gap-3 rounded-[var(--card-radius)] border border-[var(--border)] p-3 sm:grid-cols-2">
          <Input
            placeholder="Label, e.g. USD Current"
            value={draft.name}
            onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
          />
          <Input
            placeholder="Currency, e.g. USD"
            value={draft.currency}
            onChange={(event) => setDraft((prev) => ({ ...prev, currency: event.target.value }))}
          />
          <Input
            placeholder="Account name"
            value={draft.accountName}
            onChange={(event) => setDraft((prev) => ({ ...prev, accountName: event.target.value }))}
          />
          <Input
            placeholder="Account number"
            value={draft.accountNumber}
            onChange={(event) =>
              setDraft((prev) => ({ ...prev, accountNumber: event.target.value }))
            }
          />
          <div className="flex gap-2 sm:col-span-2">
            <Button
              size="sm"
              disabled={addAccount.isPending || !draft.currency.trim()}
              onClick={() => addAccount.mutate()}
            >
              {addAccount.isPending ? "Adding…" : "Add account"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
          Add an account
        </Button>
      )}
    </section>
  );
}
