"use client";

import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { SectionHeading } from "@/components/management/ui";
import { useToast } from "@/components/ui/use-toast";
import { Plus, Receipt } from "@/lib/icons";
import { cn } from "@/lib/utils";

import styles from "./branding.module.css";

/**
 * The narrow window onto a `BankAccount` that branding is given: what the
 * paper says and the identifiers a payer's bank matches against. No balances,
 * no reconciliation state, no `isActive`. This is the shape
 * `/api/settings/branding/payment-accounts` returns.
 */
type PaymentAccount = {
  id: string;
  name: string;
  currency: string;
  accountName: string | null;
  accountNumber: string | null;
  bankName: string | null;
  showOnDocuments: boolean;
  documentPosition: number;
};

/**
 * Branding's own route onto the account list.
 *
 * These are the same `BankAccount` rows accounting reconciles — one list, not
 * two — but they are read and written through `/api/settings/branding/...`
 * rather than `/api/accounting/banking/...` because that is the surface built
 * for this decision: it carries the branding permission instead of the
 * `accounting.banking` gate, and it deliberately cannot touch balances or
 * delete an account. A tenant selling on quotations without running the ledger
 * can reach this and could not reach the other.
 */
const ENDPOINT = "/api/settings/branding/payment-accounts";
const ACCOUNTS_KEY = ["branding-payment-accounts"] as const;

async function readJson<T>(response: Response, fallback: string): Promise<T> {
  const payload = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok) throw new Error(payload?.error ?? fallback);
  return payload as T;
}

async function patchAccount(
  id: string,
  patch: { showOnDocuments?: boolean; documentPosition?: number },
) {
  return readJson<{ account: PaymentAccount }>(
    await fetch(`${ENDPOINT}/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }),
    "Failed to update the account",
  );
}

function byPosition(a: PaymentAccount, b: PaymentAccount) {
  if (a.documentPosition !== b.documentPosition) {
    return a.documentPosition - b.documentPosition;
  }
  return a.name.localeCompare(b.name);
}

function detailLine(account: PaymentAccount) {
  return [account.bankName, account.accountName, account.accountNumber]
    .map((part) => (part ?? "").trim())
    .filter(Boolean)
    .join(" · ");
}

/**
 * Which accounts a quotation or an invoice asks the customer to pay into, and
 * in what order they print.
 *
 * Two columns of one row each, not a form: `showOnDocuments` and
 * `documentPosition` are deliberately separate from `isActive` — a tenant
 * reconciles accounts it would never ask anyone to pay into — so each change
 * is its own write and there is nothing here for the page's Save to carry.
 *
 * Accounts themselves are created in the ledger, which is what the verb links
 * to. Inventing a second place to create one would leave two rows for the same
 * account the first time the two disagreed.
 */
export function PaymentAccounts({ maxWidth }: { maxWidth: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dragId, setDragId] = React.useState<string | null>(null);
  const [overId, setOverId] = React.useState<string | null>(null);

  const accountsQuery = useQuery({
    queryKey: ACCOUNTS_KEY,
    queryFn: async () =>
      readJson<{ accounts: PaymentAccount[] }>(
        await fetch(ENDPOINT),
        "Failed to load payment accounts",
      ),
  });

  const accounts = React.useMemo<PaymentAccount[]>(
    () => (accountsQuery.data?.accounts ?? []).slice().sort(byPosition),
    [accountsQuery.data],
  );

  const writeMutation = useMutation({
    mutationFn: async (
      writes: Array<{ id: string; showOnDocuments?: boolean; documentPosition?: number }>,
    ) => {
      for (const write of writes) {
        const { id, ...patch } = write;
        await patchAccount(id, patch);
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ACCOUNTS_KEY });
    },
    onError: (error: Error) => {
      void queryClient.invalidateQueries({ queryKey: ACCOUNTS_KEY });
      toast({
        title: "Unable to update the account",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  /** Writes only the rows whose position actually moved. */
  const commitOrder = React.useCallback(
    (ordered: PaymentAccount[]) => {
      const writes = ordered
        .map((account, index) => ({ id: account.id, documentPosition: index }))
        .filter((write, index) => (ordered[index].documentPosition ?? 0) !== write.documentPosition);
      if (writes.length) writeMutation.mutate(writes);
    },
    [writeMutation],
  );

  const move = React.useCallback(
    (id: string, delta: number) => {
      const from = accounts.findIndex((account) => account.id === id);
      const to = from + delta;
      if (from < 0 || to < 0 || to >= accounts.length) return;
      const ordered = accounts.slice();
      const [moved] = ordered.splice(from, 1);
      ordered.splice(to, 0, moved);
      commitOrder(ordered);
    },
    [accounts, commitOrder],
  );

  const drop = React.useCallback(
    (targetId: string) => {
      const sourceId = dragId;
      setDragId(null);
      setOverId(null);
      if (!sourceId || sourceId === targetId) return;
      const from = accounts.findIndex((account) => account.id === sourceId);
      const to = accounts.findIndex((account) => account.id === targetId);
      if (from < 0 || to < 0) return;
      const ordered = accounts.slice();
      const [moved] = ordered.splice(from, 1);
      ordered.splice(to, 0, moved);
      commitOrder(ordered);
    },
    [accounts, commitOrder, dragId],
  );

  return (
    <>
      <SectionHeading
        icon={Receipt}
        variant="form"
        maxWidth={maxWidth}
        count={accounts.length}
        className={cn(styles.heading, styles.headingOk)}
      >
        Accounts shown on documents
      </SectionHeading>

      {accounts.length ? (
        <ul className={styles.accounts}>
          {accounts.map((account) => {
            const shown = account.showOnDocuments;
            const detail = detailLine(account);
            return (
              <li
                key={account.id}
                draggable
                data-dragging={account.id === dragId ? "true" : "false"}
                data-drop={account.id === overId && account.id !== dragId ? "true" : "false"}
                className={styles.account}
                onDragStart={() => setDragId(account.id)}
                onDragEnd={() => {
                  setDragId(null);
                  setOverId(null);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  setOverId(account.id);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  drop(account.id);
                }}
              >
                {/* A real button: the order is reachable with the arrow keys,
                    not only by dragging. */}
                <button
                  type="button"
                  aria-label={`Move ${account.name}`}
                  className={styles.grip}
                  disabled={accounts.length < 2}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowUp") {
                      event.preventDefault();
                      move(account.id, -1);
                    }
                    if (event.key === "ArrowDown") {
                      event.preventDefault();
                      move(account.id, 1);
                    }
                  }}
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <circle cx="9" cy="6" r="1.6" />
                    <circle cx="15" cy="6" r="1.6" />
                    <circle cx="9" cy="12" r="1.6" />
                    <circle cx="15" cy="12" r="1.6" />
                    <circle cx="9" cy="18" r="1.6" />
                    <circle cx="15" cy="18" r="1.6" />
                  </svg>
                </button>

                <input
                  type="checkbox"
                  className={styles.check}
                  checked={shown}
                  aria-label={`Show ${account.name} on documents`}
                  disabled={writeMutation.isPending}
                  onChange={(event) =>
                    writeMutation.mutate([
                      { id: account.id, showOnDocuments: event.currentTarget.checked },
                    ])
                  }
                />

                <span className={styles.accountBody}>
                  <span className={styles.accountName} data-off={shown ? "false" : "true"}>
                    {account.name}
                  </span>
                  {detail ? <span className={styles.accountMeta}>{detail}</span> : null}
                </span>

                <span className={styles.pill} data-tone={shown ? "brand" : "neutral"}>
                  {account.currency}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className={styles.accountsEmpty}>
          {accountsQuery.isLoading
            ? "Loading"
            : accountsQuery.isError
              ? "Couldn’t load the accounts"
              : "No accounts yet"}
        </p>
      )}

      <Link href="/accounting/banking" className={styles.accountsAdd}>
        <Plus />
        Add an account
      </Link>
    </>
  );
}
