"use client";

import * as React from "react";
import { useMutation } from "@tanstack/react-query";

import { Button, Drawer, Field, Input, Select } from "@/components/core";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";

export type AccountDetails = { id: string; name: string; bankName: string | null; accountNumber: string | null; currency: string };

/**
 * A money account's details: a new bank account, or one's name, bank and
 * number (what the old Banking page did). Its opening balance is set once,
 * when it is added. Cash floats and wallets are set up in Management.
 */
export function AccountDrawer({ open, account, onOpenChange, onDone }: { open: boolean; account: AccountDetails | null; onOpenChange: (open: boolean) => void; onDone: (id: string) => void }) {
  const [form, setForm] = React.useState({ name: "", bankName: "", accountNumber: "", currency: "USD", openingBalance: "" });
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!open) return;
    setError(null);
    setForm({ name: account?.name ?? "", bankName: account?.bankName ?? "", accountNumber: account?.accountNumber ?? "", currency: account?.currency ?? "USD", openingBalance: "" });
  }, [open, account]);
  const save = useMutation({
    mutationFn: () =>
      account
        ? fetchJson<{ id: string }>(`/api/accounting/banking/accounts/${account.id}`, { method: "PATCH", body: JSON.stringify({ name: form.name.trim(), bankName: form.bankName.trim() || undefined, accountNumber: form.accountNumber.trim() || undefined }) })
        : fetchJson<{ id: string }>("/api/accounting/banking/accounts", {
            method: "POST",
            body: JSON.stringify({ name: form.name.trim(), bankName: form.bankName.trim() || undefined, accountNumber: form.accountNumber.trim() || undefined, currency: form.currency, openingBalance: form.openingBalance ? Number(form.openingBalance) : undefined }),
          }),
    onSuccess: (saved) => onDone(saved.id ?? account?.id ?? ""),
    onError: (failure) => setError(getApiErrorMessage(failure, "Check the connection and try again.")),
  });
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title={account ? "The account’s details" : "New bank account"}
      footer={
        <>
          <Button variant="quiet" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" icon="check" shortcut="Ctrl ↵" busy={save.isPending} disabled={!form.name.trim() || save.isPending} onClick={() => save.mutate()}>
            {account ? "Save" : "Add the account"}
          </Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "16px 24px" }}>
        <Field label="Name" htmlFor="acc-name" help="As Books shows it: “CBZ current, USD”.">
          <Input id="acc-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
        </Field>
        <div className="field-row">
          <Field label="Bank" htmlFor="acc-bank">
            <Input id="acc-bank" value={form.bankName} onChange={(event) => setForm({ ...form, bankName: event.target.value })} />
          </Field>
          <Field label="Account number" htmlFor="acc-number">
            <Input id="acc-number" value={form.accountNumber} onChange={(event) => setForm({ ...form, accountNumber: event.target.value })} />
          </Field>
        </div>
        {account ? null : (
          <div className="field-row">
            <Field label="Currency" htmlFor="acc-currency">
              <Select id="acc-currency" value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value })}>
                <option value="USD">USD</option>
                <option value="ZWG">ZiG</option>
                <option value="ZAR">ZAR</option>
              </Select>
            </Field>
            <Field label="Opening balance" htmlFor="acc-opening" error={error} help="On the day Books starts.">
              <Input id="acc-opening" inputMode="decimal" value={form.openingBalance} onChange={(event) => setForm({ ...form, openingBalance: event.target.value.replace(/[^\d.]/g, "") })} />
            </Field>
          </div>
        )}
        {account && error ? <p className="help" style={{ color: "var(--color-danger)" }}>{error}</p> : null}
      </div>
    </Drawer>
  );
}
