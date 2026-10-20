"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { CostCentreDrawer } from "@/components/books/bk-ledger-setup-drawers";
import { BkCostCentresView } from "@/components/books/bk-ledger-setup-views";
import { downloadCsv, useListQuery } from "@/components/books/bk-list";
import { BooksError, BooksLoading } from "@/components/books/books-state";
import { BooksPage } from "@/components/books/figures";
import { PageChrome } from "@/components/layout/page-chrome";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson } from "@/lib/api-client";
import type { CostCentreQuery, CostCentreRow, CostCentresPage } from "@/lib/books/ledger-setup";

/**
 * Books → Ledger → Cost centres: list, New cost centre (N), rename and
 * deactivate (the owner or the accountant). CRM projects make their own.
 * Moved from `/accounting/cost-centers`.
 */
function CostCentres() {
  const client = useQueryClient();
  const { toast } = useToast();
  const { search, onQuery } = useListQuery<CostCentreQuery>({ q: "", view: "active" });
  const [open, setOpen] = React.useState(false);
  const [centre, setCentre] = React.useState<CostCentreRow | null>(null);
  const query = useQuery({ queryKey: ["books", "cost-centres", search], queryFn: () => fetchJson<CostCentresPage>(`/api/books/cost-centres${search ? `?${search}` : ""}`), placeholderData: (previous) => previous });
  const data = query.data;
  return (
    <>
      <PageChrome
        title="Cost centres"
        primary={{
          label: "New cost centre",
          icon: "plus",
          shortcut: "N",
          disabled: data && !data.can.change ? "Only the owner or the accountant can add a cost centre" : undefined,
          onClick: () => {
            setCentre(null);
            setOpen(true);
          },
        }}
      />
      <BooksPage screen="bk-b">
        {data ? (
          <BkCostCentresView
            data={data}
            onQuery={onQuery}
            onExport={() => downloadCsv("cost-centres.csv", ["Code", "Name", "Used by", data.month, "Active"], data.rows.map((row) => [row.code, row.name, row.usedBy ?? "", row.thisMonth.toFixed(2), row.active ? "Yes" : "No"]))}
            onOpen={(row) => {
              if (!data.can.change) return;
              setCentre(row);
              setOpen(true);
            }}
          />
        ) : query.isError ? (
          <BooksError what="Cost centres" error={query.error} onRetry={() => query.refetch()} />
        ) : (
          <BooksLoading />
        )}
      </BooksPage>
      <CostCentreDrawer
        open={open}
        centre={centre}
        onOpenChange={setOpen}
        onSaved={(message) => {
          toast({ title: message, variant: "success" });
          client.invalidateQueries({ queryKey: ["books"] });
        }}
      />
    </>
  );
}

/** Books → Ledger → Cost centres. */
export default function CostCentresPageRoute() {
  return (
    <React.Suspense
      fallback={
        <BooksPage screen="bk-b">
          <BooksLoading />
        </BooksPage>
      }
    >
      <CostCentres />
    </React.Suspense>
  );
}
