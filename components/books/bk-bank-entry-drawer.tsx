"use client";

import * as React from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { Button, Drawer, Field, Input, Select } from "@/components/core";
import type { MenuEntry } from "@/components/core/menu";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";

/**
 * Record ▾ on Bank & cash (books-final §4.13): a bank entry of its own, a
 * charge, IMTT, interest, a transfer or a tax payment, posted through the
 * core. It replaces the manual transaction of the old Banking page.
 */

export type BankEntryKind = "CHARGE" | "IMTT" | "INTEREST" | "TRANSFER" | "TAX";

const TITLE: Record<BankEntryKind, string> = {
  CHARGE: "Record a bank charge",
  IMTT: "Record IMTT",
  INTEREST: "Record interest",
  TRANSFER: "Record a transfer",
  TAX: "Record a tax payment",
};

type Options = {
  accounts: Array<{ id: string; label: string; currency: string; kind: string }>;
  taxAccounts: Array<{ id: string; code: string; name: string }>;
};

/** The Record menu's items: one line each, icon and label (calm rule 12). */
export function recordMenu(onPick: (kind: BankEntryKind) => void): MenuEntry[] {
  return [
    { key: "charge", icon: "bank2", label: "Bank charge", onSelect: () => onPick("CHARGE") },
    { key: "imtt", icon: "posting", label: "IMTT", onSelect: () => onPick("IMTT") },
    { key: "interest", icon: "payments", label: "Interest", onSelect: () => onPick("INTEREST") },
    { key: "transfer", icon: "move", label: "Transfer", onSelect: () => onPick("TRANSFER") },
    { key: "tax", icon: "vat", label: "Tax paid", onSelect: () => onPick("TAX") },
  ];
}

const today = () => new Date().toISOString().slice(0, 10);

export function BankEntryDrawer({
  kind,
  accountId,
  preset,
  onOpenChange,
  onDone,
}: {
  kind: BankEntryKind | null;
  accountId?: string | null;
  /** A payment to ZIMRA from a tax page: its amount, the tax account's code and what it was. */
  preset?: { amount?: number | null; taxCode?: string; description?: string } | null;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const options = useQuery({ queryKey: ["books", "bank", "entry-options"], queryFn: () => fetchJson<Options>("/api/books/bank/entries"), enabled: Boolean(kind) });
  const [form, setForm] = React.useState({ bankAccountId: "", toBankAccountId: "", accountId: "", date: today(), amount: "", reference: "", description: "" });
  const [error, setError] = React.useState<string | null>(null);
  const accounts = React.useMemo(() => options.data?.accounts ?? [], [options.data]);
  const presetKey = preset ? JSON.stringify(preset) : "";
  React.useEffect(() => {
    if (!kind) return;
    setError(null);
    const given = presetKey ? (JSON.parse(presetKey) as NonNullable<typeof preset>) : null;
    setForm({ bankAccountId: accountId ?? "", toBankAccountId: "", accountId: "", date: today(), amount: given?.amount ? given.amount.toFixed(2) : "", reference: "", description: given?.description ?? "" });
  }, [kind, accountId, presetKey]);
  React.useEffect(() => {
    if (!kind || !preset?.taxCode || form.accountId) return;
    const tax = options.data?.taxAccounts.find((row) => row.code === preset.taxCode);
    if (tax) setForm((current) => ({ ...current, accountId: tax.id }));
  }, [kind, preset?.taxCode, options.data, form.accountId]);
  React.useEffect(() => {
    if (kind && !form.bankAccountId && accounts.length) setForm((current) => ({ ...current, bankAccountId: accounts.find((row) => row.kind === "bank")?.id ?? accounts[0].id }));
  }, [kind, accounts, form.bankAccountId]);
  const from = accounts.find((row) => row.id === form.bankAccountId);

  const save = useMutation({
    mutationFn: () =>
      fetchJson("/api/books/bank/entries", {
        method: "POST",
        body: JSON.stringify({
          kind,
          bankAccountId: form.bankAccountId,
          date: form.date,
          amount: Number(form.amount),
          reference: form.reference || null,
          description: form.description || null,
          toBankAccountId: kind === "TRANSFER" ? form.toBankAccountId || null : null,
          accountId: kind === "TAX" ? form.accountId || null : null,
        }),
      }),
    onSuccess: () => onDone(),
    onError: (failure) => setError(getApiErrorMessage(failure, "Check the connection and try again.")),
  });
  const ready = Boolean(form.bankAccountId && Number(form.amount) > 0 && form.date && (kind !== "TRANSFER" || form.toBankAccountId) && (kind !== "TAX" || form.accountId));

  return (
    <Drawer
      open={Boolean(kind)}
      onOpenChange={onOpenChange}
      title={kind ? TITLE[kind] : "Record"}
      footer={
        <>
          <Button variant="quiet" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" icon="check" shortcut="Ctrl ↵" busy={save.isPending} disabled={!ready || save.isPending} onClick={() => save.mutate()}>
            Record
          </Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-16)", padding: "var(--space-16) var(--space-24)" }}>
        <Field label={kind === "TRANSFER" ? "From" : kind === "INTEREST" ? "Paid into" : "Account"} htmlFor="entry-account">
          <Select id="entry-account" value={form.bankAccountId} onChange={(event) => setForm({ ...form, bankAccountId: event.target.value })}>
            {accounts.map((row) => (
              <option key={row.id} value={row.id}>
                {row.label}
              </option>
            ))}
          </Select>
        </Field>
        {kind === "TRANSFER" ? (
          <Field label="To" htmlFor="entry-to" help="An account in the same currency.">
            <Select id="entry-to" value={form.toBankAccountId} onChange={(event) => setForm({ ...form, toBankAccountId: event.target.value })}>
              <option value="">Choose an account</option>
              {accounts
                .filter((row) => row.id !== form.bankAccountId && (!from || row.currency === from.currency))
                .map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.label}
                  </option>
                ))}
            </Select>
          </Field>
        ) : null}
        {kind === "TAX" ? (
          <Field label="Tax it pays" htmlFor="entry-tax">
            <Select id="entry-tax" value={form.accountId} onChange={(event) => setForm({ ...form, accountId: event.target.value })}>
              <option value="">Choose the tax</option>
              {(options.data?.taxAccounts ?? []).map((row) => (
                <option key={row.id} value={row.id}>
                  {row.code} {row.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        <div className="field-row">
          <Field label="Date" htmlFor="entry-date">
            <Input id="entry-date" type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} />
          </Field>
          <Field label={`Amount${from ? `, ${from.currency === "ZWG" ? "ZiG" : from.currency}` : ""}`} htmlFor="entry-amount">
            <Input id="entry-amount" inputMode="decimal" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value.replace(/[^\d.]/g, "") })} />
          </Field>
        </div>
        <Field label="Reference" htmlFor="entry-ref" help="Optional. As the statement shows it.">
          <Input id="entry-ref" value={form.reference} onChange={(event) => setForm({ ...form, reference: event.target.value })} />
        </Field>
        <Field label="What it was" htmlFor="entry-what" error={error} help="Optional.">
          <Input id="entry-what" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
        </Field>
      </div>
    </Drawer>
  );
}
