"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useListQuery } from "@/components/books/bk-list";
import { BkSettingsTaxView, type SettingsTaxTab } from "@/components/books/bk-settings-tax-view";
import { BooksError, BooksLoading } from "@/components/books/books-state";
import { BooksPage } from "@/components/books/figures";
import { TaxSetupWorkspace } from "@/components/accounting/tax/tax-setup-workspace";
import { Button, Drawer, Field, Input, Select } from "@/components/core";
import { PageChrome } from "@/components/layout/page-chrome";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import type { SettingsTaxPage, TaxCodeRow } from "@/lib/books/settings-tax";

const AGAIN = "Check the connection and try again.";
type Query = { tab: SettingsTaxTab; q: string; kind: string };

/**
 * Books → Settings → Tax codes & rules (BkSettingsTax). New tax code (N) on
 * the codes; categories, templates and rules keep their editors; Dates and
 * rates holds ZIMRA's dates, rates and thresholds, each still to confirm
 * marked so until it is saved (owner or accountant).
 */
function BooksSettingsTax() {
  const client = useQueryClient();
  const { toast } = useToast();
  const { search, params, onQuery, exportHref } = useListQuery<Query>({ tab: "codes", q: "", kind: "all" });
  const tab = (params.get("tab") as SettingsTaxTab | null) ?? "codes";
  const [adding, setAdding] = React.useState(false);
  const [form, setForm] = React.useState({ code: "", name: "", rate: "", type: "VAT", appliesTo: "BOTH", from: new Date().toISOString().slice(0, 10) });
  const [error, setError] = React.useState<string | null>(null);
  const query = useQuery({ queryKey: ["books", "settings-tax", search], queryFn: () => fetchJson<SettingsTaxPage>(`/api/books/settings/tax${search ? `?${search}` : ""}`), placeholderData: (previous) => previous });
  const refresh = () => client.invalidateQueries({ queryKey: ["books"] });
  const save = useMutation({
    mutationFn: (patch: Record<string, unknown>) => fetchJson("/api/books/settings/tax", { method: "POST", body: JSON.stringify(patch) }),
    onSuccess: () => {
      toast({ title: "Saved", description: "What’s due and the returns use them from now on.", variant: "success" });
      refresh();
    },
    onError: (failure) => toast({ title: "Not saved", description: getApiErrorMessage(failure, AGAIN), variant: "destructive" }),
  });
  const create = useMutation({
    mutationFn: () =>
      fetchJson("/api/accounting/tax", {
        method: "POST",
        body: JSON.stringify({ code: form.code.trim() || undefined, name: form.name.trim(), rate: Number(form.rate), type: form.type, appliesTo: form.appliesTo, effectiveFrom: new Date(`${form.from}T00:00:00.000Z`).toISOString() }),
      }),
    onSuccess: () => {
      setAdding(false);
      toast({ title: "The tax code is added", variant: "success" });
      refresh();
      client.invalidateQueries({ queryKey: ["accounting", "tax-codes"] });
    },
    onError: (failure) => setError(getApiErrorMessage(failure, AGAIN)),
  });
  const toggle = async (row: TaxCodeRow) => {
    try {
      await fetchJson(`/api/accounting/tax/${row.id}`, { method: "PATCH", body: JSON.stringify({ isActive: !row.active }) });
      toast({ title: row.active ? `${row.code} is inactive` : `${row.code} is active`, variant: "success" });
      refresh();
    } catch (failure) {
      toast({ title: "Not changed", description: getApiErrorMessage(failure, AGAIN), variant: "destructive" });
    }
  };
  const data = query.data;
  const legacy = tab === "categories" || tab === "templates" || tab === "rules" ? <TaxSetupWorkspace embedded={tab} /> : null;
  return (
    <>
      <PageChrome
        title="Tax codes & rules"
        primary={
          tab === "codes"
            ? {
                label: "New tax code",
                icon: "plus",
                shortcut: "N",
                onClick: () => {
                  setForm({ code: "", name: "", rate: "", type: "VAT", appliesTo: "BOTH", from: new Date().toISOString().slice(0, 10) });
                  setError(null);
                  setAdding(true);
                },
              }
            : null
        }
      />
      <BooksPage screen="bk-b">
        {data ? (
          <BkSettingsTaxView
            data={data}
            tab={tab}
            q={params.get("q") ?? ""}
            kind={params.get("kind") ?? "all"}
            onQuery={(next) => onQuery(next as Partial<Query>)}
            codeMenu={(row) => [{ key: "toggle", icon: row.active ? "pause" : "check", label: row.active ? "Make it inactive" : "Make it active", onSelect: () => toggle(row) }]}
            exportHref={exportHref("/api/books/settings/tax")}
            legacy={legacy}
            onSave={(patch) => save.mutate(patch)}
            saving={save.isPending}
          />
        ) : query.isError ? (
          <BooksError what="Tax codes & rules" onRetry={() => query.refetch()} />
        ) : (
          <BooksLoading />
        )}
      </BooksPage>
      <Drawer
        open={adding}
        onOpenChange={setAdding}
        title="New tax code"
        footer={
          <>
            <Button variant="quiet" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button variant="primary" icon="check" shortcut="Ctrl ↵" busy={create.isPending} disabled={!form.name.trim() || form.rate === "" || create.isPending} onClick={() => create.mutate()}>
              Add the code
            </Button>
          </>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "16px 24px" }}>
          <div className="field-row">
            <Field label="Code" htmlFor="tc-code" help="Optional: one is given.">
              <Input id="tc-code" value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })} />
            </Field>
            <Field label="Rate, %" htmlFor="tc-rate">
              <Input id="tc-rate" inputMode="decimal" value={form.rate} onChange={(event) => setForm({ ...form, rate: event.target.value.replace(/[^\d.]/g, "") })} />
            </Field>
          </div>
          <Field label="Name" htmlFor="tc-name">
            <Input id="tc-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </Field>
          <div className="field-row">
            <Field label="Kind" htmlFor="tc-type">
              <Select id="tc-type" value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}>
                <option value="VAT">VAT</option>
                <option value="WITHHOLDING">Withholding</option>
                <option value="OTHER">Other</option>
              </Select>
            </Field>
            <Field label="Used for" htmlFor="tc-applies">
              <Select id="tc-applies" value={form.appliesTo} onChange={(event) => setForm({ ...form, appliesTo: event.target.value })}>
                <option value="BOTH">Sales and bills</option>
                <option value="SALES">Sales</option>
                <option value="PURCHASE">Bills</option>
              </Select>
            </Field>
          </div>
          <Field label="From" htmlFor="tc-from" error={error} help="Documents dated from this day carry it.">
            <Input id="tc-from" type="date" value={form.from} onChange={(event) => setForm({ ...form, from: event.target.value })} />
          </Field>
        </div>
      </Drawer>
    </>
  );
}

/** Books → Settings → Tax codes & rules (design/core-modules/boards/view/BkSettingsTax.html). */
export default function BooksSettingsTaxPage() {
  return (
    <React.Suspense
      fallback={
        <BooksPage screen="bk-b">
          <BooksLoading />
        </BooksPage>
      }
    >
      <BooksSettingsTax />
    </React.Suspense>
  );
}
