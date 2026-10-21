"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useListQuery } from "@/components/books/bk-list";
import { BkRatesView } from "@/components/books/bk-rates-view";
import { ReasonDrawer } from "@/components/books/bk-reason-drawer";
import { BooksError, BooksLoading } from "@/components/books/books-state";
import { BooksPage } from "@/components/books/figures";
import { Button, Drawer, Field, Input, Kit } from "@/components/core";
import { PageChrome } from "@/components/layout/page-chrome";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import type { RatesTab } from "@/lib/books/rates-labels";
import type { RatesPage } from "@/lib/books/rates-page";

const AGAIN = "Check the connection and try again.";

type Query = { tab: RatesTab; currency: string; page: number; q: string; month: string | null };

/**
 * Books → Close the month → Rates & revaluation (BkRates). Revalue (V) values
 * balances in other currencies at the month-end rate on the last day and
 * reverses it on the 1st; Reverse undoes a run at a wrong rate; Enter a rate
 * types one in when RBZ's feed is down.
 */
function BooksRates() {
  const client = useQueryClient();
  const { toast } = useToast();
  const { search, params, onQuery, exportHref } = useListQuery<Query>({ tab: "revaluation", currency: "ZWG", page: 1, q: "" });
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
        toast({ title: "The rate is in", variant: "success" });
      } else if (body.action === "revalue") toast({ title: "Revaluation posted", variant: "success" });
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
      <PageChrome
        title="Rates & revaluation"
        primary={
          plan
            ? {
                label: `Revalue ${plan.date.slice(8).replace(/^0/, "")} ${plan.label.slice(0, 3)}`,
                icon: "check",
                shortcut: "V",
                disabled: plan.posted ? `Posted as ${plan.posted.entry}` : plan.missingRates.length ? `Enter a ${plan.missingRates.join(", ")} rate first` : plan.items.length === 0 ? "Nothing is held in another currency" : act.isPending ? "Posting" : undefined,
                onClick: () => act.mutate({ action: "revalue", month: plan.month }),
              }
            : null
        }
      >
        <Kit contents>
          <Button
            onClick={() => {
              setForm({ date: new Date().toISOString().slice(0, 10), rate: "" });
              setError(null);
              setEntering(true);
            }}
          >
            Enter a rate
          </Button>
        </Kit>
      </PageChrome>
      <BooksPage screen="bk-b">
        {data ? (
          <BkRatesView
            data={data}
            q={params.get("q") ?? ""}
            onQuery={(next) => onQuery(next as Partial<Query>)}
            onRemove={(row) => act.mutate({ action: "remove", id: row.id })}
            onReverse={() => setReversing(true)}
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
          <Field label={`${currency === "ZWG" ? "ZiG" : currency} for one ${data?.baseCurrency ?? "USD"}`} htmlFor="rate-value" error={error}>
            <Input id="rate-value" inputMode="decimal" value={form.rate} onChange={(event) => setForm({ ...form, rate: event.target.value.replace(/[^\d.]/g, "") })} />
          </Field>
        </div>
      </Drawer>
      <ReasonDrawer
        open={reversing}
        onOpenChange={setReversing}
        title="Reverse the revaluation"
        sub={plan ? `${plan.label}, ${plan.posted?.entry ?? ""}` : undefined}
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

/** Books → Close the month → Rates & revaluation (design/books/html/bk-rates.html). */
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
