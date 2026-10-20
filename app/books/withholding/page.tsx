"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { BankEntryDrawer } from "@/components/books/bk-bank-entry-drawer";
import { useListQuery } from "@/components/books/bk-list";
import { BkWithholdingView } from "@/components/books/bk-withholding-view";
import { BooksError, BooksLoading } from "@/components/books/books-state";
import { BooksPage } from "@/components/books/figures";
import { PageChrome } from "@/components/layout/page-chrome";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import type { WithholdingTab } from "@/lib/books/withholding-labels";
import type { WithholdingPage, WhtRow } from "@/lib/books/withholding-page";

type Query = { tab: WithholdingTab; q: string; supplier: string | null };

/**
 * Books → Tax → Withholding (BkWithholding). Pay the withheld tax (P) is a
 * payment to ZIMRA that clears 2180 through the core; a certificate is issued
 * for each paid payment that withheld tax; the month's return downloads.
 */
function BooksWithholding() {
  const client = useQueryClient();
  const { toast } = useToast();
  const { search, params, onQuery, exportHref } = useListQuery<Query>({ tab: "income", q: "" });
  const q = params.get("q") ?? "";
  const supplier = params.get("supplier");
  const [paying, setPaying] = React.useState(false);
  const query = useQuery({
    queryKey: ["books", "withholding", search],
    queryFn: () => fetchJson<WithholdingPage>(`/api/books/withholding${search ? `?${search}` : ""}`),
    placeholderData: (previous) => previous,
  });
  const refresh = () => client.invalidateQueries({ queryKey: ["books"] });
  const certificate = useMutation({
    mutationFn: (row: WhtRow) => fetchJson<{ certificateNo: string }>("/api/books/withholding/certificates", { method: "POST", body: JSON.stringify({ paymentId: row.id }) }),
    onSuccess: (result) => {
      toast({ title: `${result.certificateNo} is issued`, variant: "success" });
      refresh();
    },
    onError: (error) => toast({ title: "The certificate was not issued", description: getApiErrorMessage(error, "Check the connection and try again."), variant: "destructive" }),
  });
  const data = query.data;
  return (
    <>
      <PageChrome title="Withholding" primary={{ label: "Pay the withheld tax", icon: "payments", shortcut: "P", onClick: () => setPaying(true) }} />
      <BooksPage screen="bk-b">
        {data ? (
          <BkWithholdingView
            data={data}
            q={q}
            supplier={supplier}
            onQuery={(next) => onQuery(next as Partial<Query>)}
            onCertificate={(row) => certificate.mutate(row)}
            issuing={certificate.isPending ? (certificate.variables?.id ?? null) : null}
            exportHref={exportHref("/api/books/withholding")}
          />
        ) : query.isError ? (
          <BooksError what="Withholding" onRetry={() => query.refetch()} />
        ) : (
          <BooksLoading />
        )}
      </BooksPage>
      <BankEntryDrawer
        kind={paying ? "TAX" : null}
        preset={data ? { amount: data.sums.waiting, taxCode: "2180", description: `Withholding tax for ${data.returnMonth.name}` } : null}
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

/** Books → Tax → Withholding (design/core-modules/boards/view/BkWithholding.html). */
export default function BooksWithholdingPage() {
  return (
    <React.Suspense
      fallback={
        <BooksPage screen="bk-b">
          <BooksLoading />
        </BooksPage>
      }
    >
      <BooksWithholding />
    </React.Suspense>
  );
}
