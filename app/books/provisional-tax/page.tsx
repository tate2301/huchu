"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { BankEntryDrawer } from "@/components/books/bk-bank-entry-drawer";
import { useListQuery } from "@/components/books/bk-list";
import { BkProvisionalView } from "@/components/books/bk-provisional-view";
import { BooksError, BooksLoading } from "@/components/books/books-state";
import { BooksPage } from "@/components/books/figures";
import { Button, Check, Drawer, Field, Input } from "@/components/core";
import { PageChrome } from "@/components/layout/page-chrome";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import type { ProvisionalPage } from "@/lib/books/provisional-page";

type Query = { year: string };

/**
 * Books → Tax → Provisional tax (BkProvisionalTax). Pay an instalment (P) is a
 * payment to ZIMRA against 2280 through the core; Revise the estimate keeps the
 * year's estimate in the tax settings, and the instalments follow from it.
 */
function BooksProvisional() {
  const router = useRouter();
  const client = useQueryClient();
  const { toast } = useToast();
  const { params, onQuery } = useListQuery<Query>({ year: String(new Date().getUTCFullYear()) });
  const year = Number(params.get("year")) || new Date().getUTCFullYear();
  const [paying, setPaying] = React.useState(false);
  const [revising, setRevising] = React.useState(false);
  const [form, setForm] = React.useState({ taxUsd: "", incomeUsd: "", split5050: false });
  const [error, setError] = React.useState<string | null>(null);
  const query = useQuery({ queryKey: ["books", "provisional", year], queryFn: () => fetchJson<ProvisionalPage>(`/api/books/provisional-tax?year=${year}`), placeholderData: (previous) => previous });
  const refresh = () => client.invalidateQueries({ queryKey: ["books"] });
  const data = query.data;
  const save = useMutation({
    mutationFn: () => fetchJson("/api/books/provisional-tax", { method: "POST", body: JSON.stringify({ year, taxUsd: Number(form.taxUsd), incomeUsd: form.incomeUsd ? Number(form.incomeUsd) : null, split5050: form.split5050 }) }),
    onSuccess: () => {
      setRevising(false);
      toast({ title: "The estimate is saved", variant: "success" });
      refresh();
    },
    onError: (failure) => setError(getApiErrorMessage(failure, "Check the connection and try again.")),
  });
  return (
    <>
      <PageChrome title="Provisional tax" primary={{ label: "Pay an instalment", icon: "payments", shortcut: "P", onClick: () => setPaying(true), disabled: data && !data.next ? "No instalment is waiting to be paid" : undefined }} />
      <BooksPage screen="bk-b">
        {data ? (
          <BkProvisionalView
            data={data}
            onYear={(next) => onQuery({ year: String(next) })}
            onRevise={() => {
              setForm({ taxUsd: data.estimate ? String(data.estimate.taxUsd) : "", incomeUsd: data.estimate?.incomeUsd ? String(data.estimate.incomeUsd) : "", split5050: data.estimate?.split5050 ?? false });
              setError(null);
              setRevising(true);
            }}
            onDates={() => router.push("/books/settings/tax?tab=dates")}
            exportHref={`data:text/csv;charset=utf-8,${encodeURIComponent(["Instalment,Date,Share,Amount,Paid by,State", ...data.rows.map((row) => [row.name, row.date, `${row.share}%`, row.amount?.toFixed(2) ?? "", row.paidBy ?? "", row.state].join(","))].join("\n"))}`}
          />
        ) : query.isError ? (
          <BooksError what="Provisional tax" onRetry={() => query.refetch()} />
        ) : (
          <BooksLoading />
        )}
      </BooksPage>
      <Drawer
        open={revising}
        onOpenChange={setRevising}
        title={`Revise the ${year} estimate`}
        footer={
          <>
            <Button variant="quiet" onClick={() => setRevising(false)}>
              Cancel
            </Button>
            <Button variant="primary" icon="check" shortcut="Ctrl ↵" busy={save.isPending} disabled={!form.taxUsd || save.isPending} onClick={() => save.mutate()}>
              Save the estimate
            </Button>
          </>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "16px 24px" }}>
          <Field label="Income for the year, about" htmlFor="qpd-income" help="Optional. In US dollars.">
            <Input id="qpd-income" inputMode="decimal" value={form.incomeUsd} onChange={(event) => setForm({ ...form, incomeUsd: event.target.value.replace(/[^\d.]/g, "") })} />
          </Field>
          <Field label="Tax for the year" htmlFor="qpd-tax" error={error} help="In US dollars. The four instalments are 10%, 25%, 30% and 35% of it.">
            <Input id="qpd-tax" inputMode="decimal" value={form.taxUsd} onChange={(event) => setForm({ ...form, taxUsd: event.target.value.replace(/[^\d.]/g, "") })} />
          </Field>
          <Check checked={form.split5050} onCheckedChange={(split5050) => setForm({ ...form, split5050 })} label="Pay half in ZiG (the 50/50 basis)" />
        </div>
      </Drawer>
      <BankEntryDrawer
        kind={paying ? "TAX" : null}
        preset={data?.next ? { amount: data.next.amount, taxCode: "2280", description: `Provisional tax, ${data.next.name}, ${year}` } : null}
        onOpenChange={(open) => !open && setPaying(false)}
        onDone={() => {
          setPaying(false);
          toast({ title: "Paid to ZIMRA", variant: "success" });
          refresh();
        }}
      />
    </>
  );
}

/** Books → Tax → Provisional tax (design/core-modules/boards/view/BkProvisionalTax.html). */
export default function BooksProvisionalPage() {
  return (
    <React.Suspense
      fallback={
        <BooksPage screen="bk-b">
          <BooksLoading />
        </BooksPage>
      }
    >
      <BooksProvisional />
    </React.Suspense>
  );
}
