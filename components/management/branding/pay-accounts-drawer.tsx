"use client";

import * as React from "react";

import { ButtonLink, Check, Drawer, Pill } from "@/components/core";
import type { PaymentAccount } from "@/lib/branding/form";

import styles from "./branding.module.css";

/** "CBZ Bank · Floorcode (Pvt) Ltd · 0112". */
function detailOf(account: PaymentAccount) {
  return [account.bankName, account.accountName, account.accountNumber]
    .map((part) => (part ?? "").trim())
    .filter(Boolean)
    .join(" · ");
}

/** The order the paper prints them in. */
export function byPosition(a: PaymentAccount, b: PaymentAccount) {
  return a.documentPosition - b.documentPosition || a.name.localeCompare(b.name);
}

/**
 * Other ways to pay: which of the ledger's accounts a quote or an invoice asks
 * customers to pay into, and in what order. Each change saves on its own, as
 * before; accounts are added in the ledger, which "Add an account" opens.
 * Drag a row, or focus its grip and use the arrow keys, to move it.
 */
export function PayAccountsDrawer({
  open,
  onOpenChange,
  accounts,
  loading,
  failed,
  busy,
  onShow,
  onOrder,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: PaymentAccount[];
  loading: boolean;
  failed: boolean;
  busy: boolean;
  onShow: (id: string, shown: boolean) => void;
  /** The new order, every account in it. */
  onOrder: (ordered: PaymentAccount[]) => void;
}) {
  const [dragId, setDragId] = React.useState<string | null>(null);
  const [overId, setOverId] = React.useState<string | null>(null);
  const sorted = React.useMemo(() => accounts.slice().sort(byPosition), [accounts]);

  const move = (from: number, to: number) => {
    if (from < 0 || to < 0 || to >= sorted.length || from === to) return;
    const ordered = sorted.slice();
    const [moved] = ordered.splice(from, 1);
    ordered.splice(to, 0, moved);
    onOrder(ordered);
  };

  const shown = sorted.filter((account) => account.showOnDocuments).length;

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title="Other ways to pay"
      sub={sorted.length ? `${shown} of ${sorted.length} accounts print on quotes and invoices, in this order.` : undefined}
      width={480}
      footer={
        <ButtonLink icon="plus" href="/books/accounts?action=new-account">
          Add an account
        </ButtonLink>
      }
    >
      {loading ? (
        <p className="muted">Loading the accounts</p>
      ) : failed ? (
        <p className="muted">The accounts did not load. Close this and open it again.</p>
      ) : sorted.length === 0 ? (
        <p className="muted">No accounts yet. Add one in the ledger and it can be printed here.</p>
      ) : (
        <ul className={styles.accounts}>
          {sorted.map((account, index) => (
            <li
              key={account.id}
              draggable
              className={styles.account}
              data-dragging={account.id === dragId ? "true" : "false"}
              data-drop={account.id === overId && account.id !== dragId ? "true" : "false"}
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
                const from = sorted.findIndex((row) => row.id === dragId);
                setDragId(null);
                setOverId(null);
                move(from, index);
              }}
            >
              <button
                type="button"
                className={styles.grip}
                aria-label={`Move ${account.name}`}
                disabled={sorted.length < 2 || busy}
                onKeyDown={(event) => {
                  if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                    event.preventDefault();
                    move(index, index + (event.key === "ArrowUp" ? -1 : 1));
                  }
                }}
              >
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  {[6, 12, 18].flatMap((y) => [9, 15].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.6" />))}
                </svg>
              </button>
              <Check
                checked={account.showOnDocuments}
                disabled={busy}
                aria-label={`Print ${account.name} on documents`}
                onCheckedChange={(checked) => onShow(account.id, checked)}
              />
              <span className={styles.accountBody}>
                <b data-off={account.showOnDocuments ? "false" : "true"} className="truncate">
                  {account.name}
                </b>
                {detailOf(account) ? <span>{detailOf(account)}</span> : null}
              </span>
              <Pill tone={account.showOnDocuments ? "info" : "plain"}>{account.currency}</Pill>
            </li>
          ))}
        </ul>
      )}
    </Drawer>
  );
}
