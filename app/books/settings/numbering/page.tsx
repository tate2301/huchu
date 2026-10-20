"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { downloadCsv } from "@/components/books/bk-list";
import { BkNumberingView } from "@/components/books/bk-settings-views";
import { BooksError, BooksLoading } from "@/components/books/books-state";
import { BooksPage } from "@/components/books/figures";
import { PageChrome } from "@/components/layout/page-chrome";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import type { NumberingPage, SeriesRow } from "@/lib/books/settings-pages";

/** Books → Settings → Numbering (BkSettingsNumbering): next numbers are fixed; a series' prefix can change from the next year. */
function Numbering() {
  const client = useQueryClient();
  const { toast } = useToast();
  const [selected, setSelected] = React.useState("invoice");
  const query = useQuery({ queryKey: ["books", "numbering"], queryFn: () => fetchJson<NumberingPage>("/api/books/settings/numbering") });
  const save = useMutation({
    mutationFn: ({ row, prefix }: { row: SeriesRow; prefix: string }) => fetchJson<{ prefix: string; from: string }>("/api/books/settings/numbering", { method: "POST", body: JSON.stringify({ entity: row.entity, prefix }) }),
    onSuccess: (result, { row }) => {
      toast({ title: result.prefix ? `${row.label}s start at ${result.prefix.replace(/-?$/, "-")}0001 on ${result.from}` : `${row.label}s keep ${row.prefix}`, variant: "success" });
      client.invalidateQueries({ queryKey: ["books", "numbering"] });
    },
    onError: (error) => toast({ title: "The prefix was not saved", description: getApiErrorMessage(error, "Check the connection and try again."), variant: "destructive" }),
  });
  const data = query.data;
  return (
    <>
      <PageChrome title="Numbering" />
      <BooksPage screen="bk-b">
        {data ? (
          <BkNumberingView
            data={data}
            selected={selected}
            onSelect={setSelected}
            saving={save.isPending}
            onSave={(row, prefix) => save.mutate({ row, prefix })}
            onExport={() => downloadCsv("numbering.csv", ["Document", "Prefix", "Next number", "Last issued", "Issued so far"], data.rows.map((row) => [row.label, row.prefix, row.next, row.last ?? "", row.issued]))}
          />
        ) : query.isError ? (
          <BooksError what="Numbering" error={query.error} onRetry={() => query.refetch()} />
        ) : (
          <BooksLoading />
        )}
      </BooksPage>
    </>
  );
}

/** Books → Settings → Numbering (design/core-modules/boards/view/BkSettingsNumbering.html). */
export default function NumberingPageRoute() {
  return (
    <React.Suspense
      fallback={
        <BooksPage screen="bk-b">
          <BooksLoading />
        </BooksPage>
      }
    >
      <Numbering />
    </React.Suspense>
  );
}
