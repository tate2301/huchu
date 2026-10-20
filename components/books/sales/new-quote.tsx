"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { Drawer } from "@/components/core";
import { DocumentBuilderSheet } from "@/components/crm/documents/document-builder-sheet";
import type { LeadDocument } from "@/components/crm/documents/document-types";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import type { QuoteDeal } from "@/lib/books/quotes-view";

import { Amt, BkEmpty, BkLoading } from "../ui";

/**
 * New quote in Books: which deal it is for (a quote is written from a deal,
 * its lines from the deal's measurements), then the CRM's own quote builder on
 * that deal. Saved, the new quote opens at its Books address.
 */
export function NewQuote({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const { toast } = useToast();
  const [q, setQ] = React.useState("");
  const [deal, setDeal] = React.useState<QuoteDeal | null>(null);
  const deals = useQuery({
    queryKey: ["books", "quotes", "deals", q],
    queryFn: () => fetchJson<{ deals: QuoteDeal[] }>(`/api/books/quotes/deals${q ? `?q=${encodeURIComponent(q)}` : ""}`),
    enabled: open,
    placeholderData: (previous) => previous,
  });

  const opened = async (chosen: QuoteDeal) => {
    try {
      const fresh = await fetchJson<{ documents: LeadDocument[] }>(`/api/v2/crm/deals/${chosen.id}`);
      const quote = fresh.documents.find((doc) => doc.type === "QUOTATION");
      if (quote) router.push(`/books/quotes/${quote.id}`);
    } catch (error) {
      toast({ title: "The quote is saved", description: getApiErrorMessage(error, "Open it from Quotes."), variant: "destructive" });
    }
  };

  return (
    <>
      <Drawer open={open && !deal} onOpenChange={onOpenChange} title="New quote" sub="Which deal is it for?" width={480}>
        <label className="input-wrap" style={{ margin: "var(--space-12) var(--space-24)" }}>
          <input type="search" aria-label="Search deals" placeholder="Search deals" value={q} onChange={(event) => setQ(event.target.value)} />
        </label>
        {deals.data ? (
          deals.data.deals.length ? (
            <div role="list" aria-label="Open deals">
              {deals.data.deals.map((row) => (
                <button key={row.id} type="button" role="listitem" className="k-nr" style={{ width: "100%", textAlign: "left" }} onClick={() => setDeal(row)}>
                  <span className="mono muted">{row.dealNo}</span>
                  <span className="k-nl truncate">
                    {row.client} <span className="muted">{row.title}</span>
                  </span>
                  {row.value ? (
                    <span className="k-na">
                      <Amt value={row.value} currency={row.currency} />
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          ) : (
            <BkEmpty>{q ? "No open deal matches." : "No open deal with a company to quote."}</BkEmpty>
          )
        ) : (
          <BkLoading rows={6} />
        )}
      </Drawer>
      {deal ? (
        <DocumentBuilderSheet
          open
          onOpenChange={(next) => {
            if (!next) {
              setDeal(null);
              onOpenChange(false);
            }
          }}
          basePath={`/api/v2/crm/deals/${deal.id}`}
          mode="quotation"
          currency={deal.currency}
          onCreated={() => void opened(deal)}
        />
      ) : null}
    </>
  );
}
