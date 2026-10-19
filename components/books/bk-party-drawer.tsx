"use client";

import * as React from "react";

import { Button, Drawer, DrawerSection, Field, Input, TextArea } from "@/components/core";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { EMPTY_PARTY, partyErrors, type PartyForm } from "@/lib/books/party-form";

/**
 * New customer or New supplier, as a drawer on the list (books-final §3.3):
 * name, contact, VAT number, TIN and address. Customers are the CRM's and the
 * shop's too; suppliers are the ones bills are from.
 */
export function PartyDrawer({
  kind,
  open,
  onOpenChange,
  onCreated,
}: {
  kind: "customer" | "supplier";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (party: { id: string; name: string }) => void | Promise<void>;
}) {
  const [form, setForm] = React.useState<PartyForm>(EMPTY_PARTY);
  const [shown, setShown] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setForm(EMPTY_PARTY);
    setShown(false);
    setError(null);
  }, [open]);

  const errors = shown ? partyErrors(form) : {};
  const set = (key: keyof PartyForm) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const save = async () => {
    setShown(true);
    if (Object.keys(partyErrors(form)).length > 0) return;
    setBusy(true);
    setError(null);
    try {
      const party = await fetchJson<{ id: string; name: string }>(kind === "customer" ? "/api/books/customers" : "/api/books/suppliers", { method: "POST", body: JSON.stringify(form) });
      setBusy(false);
      onOpenChange(false);
      await onCreated(party);
    } catch (caught) {
      setBusy(false);
      setError(getApiErrorMessage(caught, "They were not added. Check the connection and try again."));
    }
  };

  const id = (field: string) => `${kind}-${field}`;
  return (
    <Drawer
      open={open}
      onOpenChange={(next) => (busy ? undefined : onOpenChange(next))}
      title={kind === "customer" ? "New customer" : "New supplier"}
      sub={kind === "customer" ? "The CRM and the shop see them too." : "Bills and payments made name them."}
      width={480}
      footer={
        <>
          <Button disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" icon="plus" shortcut="Ctrl ↵" busy={busy} disabled={busy} onClick={save}>
            {kind === "customer" ? "Add the customer" : "Add the supplier"}
          </Button>
        </>
      }
    >
      <DrawerSection title="Who">
        <Field label="Name" htmlFor={id("name")} error={errors.name}>
          <Input id={id("name")} value={form.name} onChange={set("name")} autoFocus />
        </Field>
        <Field label={kind === "customer" ? "Accounts contact" : "Contact"} htmlFor={id("contact")} optional>
          <Input id={id("contact")} value={form.contactName} onChange={set("contactName")} />
        </Field>
        <div className="field-row">
          <Field label="Phone" htmlFor={id("phone")} optional>
            <Input id={id("phone")} inputMode="tel" value={form.phone} onChange={set("phone")} />
          </Field>
          <Field label="Email" htmlFor={id("email")} optional error={errors.email}>
            <Input id={id("email")} inputMode="email" value={form.email} onChange={set("email")} />
          </Field>
        </div>
      </DrawerSection>
      <DrawerSection title="Tax">
        <div className="field-row">
          <Field label="VAT number" htmlFor={id("vat")} optional>
            <Input id={id("vat")} value={form.vatNumber} onChange={set("vatNumber")} />
          </Field>
          <Field label="TIN" htmlFor={id("tin")} optional>
            <Input id={id("tin")} value={form.taxNumber} onChange={set("taxNumber")} />
          </Field>
        </div>
        <Field label="Address" htmlFor={id("address")} optional>
          <TextArea id={id("address")} rows={2} value={form.address} onChange={set("address")} />
        </Field>
        {error ? (
          <p role="alert" className="error" style={{ marginTop: "var(--space-8)" }}>
            {error}
          </p>
        ) : null}
      </DrawerSection>
    </Drawer>
  );
}
