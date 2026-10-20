"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { downloadCsv, useListQuery } from "@/components/books/bk-list";
import { BkTaxDueView } from "@/components/books/bk-tax-due-view";
import { BooksError, BooksLoading } from "@/components/books/books-state";
import { BooksPage } from "@/components/books/figures";
import { Button, Kit } from "@/components/core";
import { PageChrome } from "@/components/layout/page-chrome";
import { fetchJson } from "@/lib/api-client";
import type { DuePage } from "@/lib/books/tax-due";
import { dueCalendar, type DueTax } from "@/lib/books/tax-labels";

type Query = { tax: DueTax | "all"; q: string; from: string | null; to: string | null };

/**
 * Books → Tax → What's due (BkTaxDue, BkTaxDuePhone). It only reads: Set
 * the dates opens the tax settings, where ZIMRA's dates and rates are kept
 * and each one still to confirm says so; Add to my calendar downloads the
 * dates as a calendar file.
 */
function BooksTaxDue() {
  const router = useRouter();
  const { search, params, onQuery } = useListQuery<Query>({ tax: "all", q: "" });
  const q = params.get("q") ?? "";
  const today = new Date().toISOString().slice(0, 10);
  const query = useQuery({
    queryKey: ["books", "tax-due", search],
    queryFn: () => fetchJson<DuePage>(`/api/books/tax${search ? `?${search}` : ""}`),
    placeholderData: (previous) => previous,
  });
  const data = query.data;
  const rows = data ? data.groups.flatMap((group) => group.rows) : [];
  const calendar = () => {
    const blob = new Blob([dueCalendar(rows.filter((row) => row.state !== "Paid" && row.state !== "Filed"), "ZIMRA dates")], { type: "text/calendar" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "tax-dates.ics";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const calendarRef = React.useRef(calendar);
  React.useEffect(() => {
    calendarRef.current = calendar;
  });
  const phoneMenu = React.useMemo(
    () => [
      { key: "calendar", label: "Add to my calendar", onSelect: () => calendarRef.current() },
      { key: "dates", label: "Set the dates", onSelect: () => router.push("/books/settings/tax?tab=dates") },
    ],
    [router],
  );
  return (
    <>
      <PageChrome title="What’s due" phoneMenu={phoneMenu}>
        <Kit contents>
          <Button icon="gear" onClick={() => router.push("/books/settings/tax?tab=dates")}>
            Set the dates
          </Button>
        </Kit>
      </PageChrome>
      <BooksPage screen="bk-b">
        {data ? (
          <BkTaxDueView
            data={data}
            q={q}
            today={today}
            onQuery={(next) => onQuery(next as Partial<Query>)}
            onCalendar={calendar}
            more={[
              {
                key: "csv",
                icon: "export",
                label: "Export as CSV",
                onSelect: () => downloadCsv("whats-due.csv", ["Date", "What", "Period", "Amount", "Settled by", "State", "To confirm"], rows.map((row) => [row.date, row.what, row.period, row.amount === null ? "" : row.amount.toFixed(2), row.settledBy, row.state, row.toConfirm ? "Yes" : ""])),
              },
            ]}
          />
        ) : query.isError ? (
          <BooksError what="What’s due" onRetry={() => query.refetch()} />
        ) : (
          <BooksLoading />
        )}
      </BooksPage>
    </>
  );
}

/** Books → Tax → What's due (design/core-modules/boards/view/BkTaxDue.html). */
export default function BooksTaxDuePage() {
  return (
    <React.Suspense
      fallback={
        <BooksPage screen="bk-b">
          <BooksLoading />
        </BooksPage>
      }
    >
      <BooksTaxDue />
    </React.Suspense>
  );
}
