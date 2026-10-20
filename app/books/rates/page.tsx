"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { useListQuery } from "@/components/books/bk-list";
import { BkRatesView } from "@/components/books/bk-rates-view";
import { ReasonDrawer } from "@/components/books/bk-reason-drawer";
import { BooksError, BooksLoading } from "@/components/books/books-state";
import { BooksPage } from "@/components/books/figures";
import { Button, Drawer, Field, Input } from "@/components/core";
import { PageChrome } from "@/components/layout/page-chrome";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import type { RatesTab } from "@/lib/books/rates-labels";
import type { RatesPage } from "@/lib/books/rates-page";

const AGAIN = "Check the connection and try again.";
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** The three months before this one: a revaluation is posted after its month ends. */
function lastMonths() {
  const now = new Date();
  return [1, 2, 3].map((back) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
    return { key: date.toISOString().slice(0, 7), label: `${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}` };
  });
}
type Query = { tab: RatesTab; currency: string; page: number; q: string; month: string | null };

/**
 * Books → Close the month → Rates & revaluation (BkRates). Enter a rate (N)
 * types one in when RBZ's feed is down; Post the revaluation (Ctrl ↵) values
 * balances in other currencies at the month-end rate on the last day and
 * reverses it on the 1st; its menu reverses one run at a wrong rate.
 */
function BooksRates() {
  const router = useRouter();
  const client = useQueryClient();
  const { toast } = useToast();
  const { search, params, onQuery, exportHref } = useListQuery<Query>({ tab: "rates", currency: "ZWG", page: 1, q: "" });
  const [entering, setEntering] = React.useState(false);
  const [form, setForm] = React.useState({ date: new Date().toISOString().slice(0, 10), rate: "" });
  const [error, setError] = React.useState<string | null>(null);
  const [reversing, setReversing] = React.useState(false);
  const query = useQuery({ queryKey: ["books", "rates", search], queryFn: () => fetchJson<RatesPage>(`/api/books/rates${search ? `?${search}` : ""}`), placeholderData: (previous) => previous });
  const refresh = () => client.invalidateQueries({ queryKey: ["books"] });
  const data = query.data;
  const currency = data?.currency ?? "ZWG";
  const act = useMutation({
    mutationFn: (body: Record<string, unknown>) => fetchJson("/api/books/rates", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (_result, body) => {
      if (body.action === "rate") {
        setEntering(false);
        toast({ title: "The rate is in", description: "Documents made from now on that day freeze it.", variant: "success" });
      } else if (body.action === "revalue") toast({ title: "Revaluation posted", description: "It reverses on the 1st.", variant: "success" });
      else if (body.action === "remove") toast({ title: "The rate is removed", variant: "success" });
      refresh();
    },
    onError: (failure, body) => {
      if (body.action === "rate") setError(getApiErrorMessage(failure, AGAIN));
      else toast({ title: "Not done", description: getApiErrorMessage(failure, AGAIN), variant: "destructive" });
    },
  });
  const plan = data?.plan ?? null;
  return (
    <>
      <PageChrome title="Rates & revaluation" primary={{ label: "Enter a rate", icon: "plus", shortcut: "N", onClick: () => { setForm({ date: new Date().toISOString().slice(0, 10), rate: "" }); setError(null); setEntering(true); } }} />
      <BooksPage screen="bk-b">
        {data ? (
          <BkRatesView
            data={data}
            q={params.get("q") ?? ""}
            onQuery={(next) => onQuery(next as Partial<Query>)}
            onPost={() => plan && act.mutate({ action: "revalue", month: plan.month })}
            posting={act.isPending && act.variables?.action === "revalue"}
            planMenu={[
              { key: "lines", icon: "list", label: "See the lines", disabled: !plan?.posted, title: plan?.posted ? undefined : "It is not posted yet.", onSelect: () => router.push(`/books/journals?q=${encodeURIComponent(plan?.posted?.entry ?? "")}`) },
              ...lastMonths().map((month) => ({ key: month.key, icon: "calendar" as const, label: `Revalue ${month.label}`, checked: plan?.month === month.key, onSelect: () => onQuery({ month: month.key }) })),
              { key: "reverse", icon: "x", label: "Reverse the revaluation", danger: true, disabled: !plan?.posted, title: plan?.posted ? undefined : "Nothing is posted to reverse.", onSelect: () => setReversing(true) },
            ]}
            rateMenu={(row) => [
              { key: "remove", icon: "x", label: "Remove this rate", danger: true, disabled: row.source !== "MANUAL", title: row.source !== "MANUAL" ? "RBZ’s rates stay." : undefined, onSelect: () => act.mutate({ action: "remove", id: row.id }) },
            ]}
            exportHref={exportHref("/api/books/rates")}
          />
        ) : query.isError ? (
          <BooksError what="The rates" onRetry={() => query.refetch()} />
        ) : (
          <BooksLoading />
        )}
      </BooksPage>
      <Drawer
        open={entering}
        onOpenChange={setEntering}
        title="Enter a rate"
        footer={
          <>
            <Button variant="quiet" onClick={() => setEntering(false)}>
              Cancel
            </Button>
            <Button variant="primary" icon="check" shortcut="Ctrl ↵" busy={act.isPending} disabled={!(Number(form.rate) > 0) || !form.date || act.isPending} onClick={() => act.mutate({ action: "rate", currency, date: form.date, rate: Number(form.rate) })}>
              Save the rate
            </Button>
          </>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "16px 24px" }}>
          <Field label="Day" htmlFor="rate-day">
            <Input id="rate-day" type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} />
          </Field>
          <Field label={`${currency} for one ${data?.baseCurrency ?? "USD"}`} htmlFor="rate-value" error={error} help="RBZ’s interbank rate for the day. Documents keep the rate of their own day.">
            <Input id="rate-value" inputMode="decimal" value={form.rate} onChange={(event) => setForm({ ...form, rate: event.target.value.replace(/[^\d.]/g, "") })} />
          </Field>
        </div>
      </Drawer>
      <ReasonDrawer
        open={reversing}
        onOpenChange={setReversing}
        title="Reverse the revaluation"
        sub={plan ? `${plan.label}, ${plan.posted?.entry ?? ""}` : undefined}
        what="Both its entries are voided on their own dates, so the month can be revalued again at the right rate."
        label="Reverse it"
        onConfirm={async (reason) => {
          if (!plan) return;
          await fetchJson("/api/books/rates", { method: "POST", body: JSON.stringify({ action: "reverse", month: plan.month, reason }) });
          setReversing(false);
          toast({ title: "Reversed", variant: "success" });
          await refresh();
        }}
      />
    </>
  );
}

/** Books → Close the month → Rates & revaluation (design/core-modules/boards/view/BkRates.html). */
export default function BooksRatesPage() {
  return (
    <React.Suspense
      fallback={
        <BooksPage screen="bk-b">
          <BooksLoading />
        </BooksPage>
      }
    >
      <BooksRates />
    </React.Suspense>
  );
}
