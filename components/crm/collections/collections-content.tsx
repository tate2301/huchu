"use client";

/**
 * Collections: every invoice with money still owed on it, and who to ring.
 *
 * The page is the chase list and nothing else. How late a debt is decides
 * how it is chased, so the ageing bands are the tabs — the accountant's aged
 * receivables, each with its count — and the list under them is ordered by
 * how urgently each one needs a call: a promise that came and went first,
 * then age and size. The band is in the URL, so "everything over ninety
 * days" is a link somebody can send.
 *
 * What is owed is the total under the column it adds up, not a row of tiles
 * above it. An invoice opens onto its own page, where the payments against
 * it and every chase so far are; a chase is logged from either place with
 * the same dialog.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { Button, Skeleton } from "@corelithzw/react";
import {
  ColumnFigure,
  ColumnList,
  ColumnName,
  ColumnRowAction,
  ColumnText,
  StatusDot,
} from "@/components/management/ui";
import { RecordListShell } from "@/components/crm/records/record-list-shell";
import { formatDate, formatMoney } from "@/components/crm/money/money";
import { SectionTab, SectionTabs } from "@/components/ui/section-tabs";
import { useDebounced } from "@/hooks/use-debounced";
import { useIsMobile } from "@/hooks/use-mobile";
import { fetchJson } from "@/lib/api-client";
import {
  AGEING_BUCKETS,
  AGEING_LABELS,
  COLLECTION_OUTCOME_LABELS,
  type AgeingBucket,
} from "@/lib/crm/collections";

import { ChaseDialog, type ChaseTarget } from "./chase-dialog";

type ChaseRow = {
  documentId: string;
  invoiceNumber: string;
  customer: string | null;
  currency: string;
  total: number;
  outstanding: number;
  dueDate: string | null;
  daysOverdue: number;
  bucket: AgeingBucket;
  record: { kind: "lead" | "deal"; id: string; label: string } | null;
  lastNote: {
    outcome: keyof typeof COLLECTION_OUTCOME_LABELS;
    promisedAt: string | null;
    notes: string | null;
    createdAt: string;
  } | null;
  promiseKept: boolean;
};

/** The route answers this shape bare — `successResponse` adds no envelope. */
type CollectionsResponse = {
  data: ChaseRow[];
  ageing: { bucket: AgeingBucket; label: string; count: number; amount: number }[];
};

type Band = "ALL" | AgeingBucket;

const BAND_PARAM = "age";

/** A register's measure: wide enough for its figures, not the whole window. */
const WIDTH = 1040;

const EMPTY: Record<Band, string> = {
  ALL: "Nothing is owed. Every invoice issued has been paid.",
  CURRENT: "Nothing owed that is not yet due.",
  D1_30: "Nothing between one and thirty days late.",
  D31_60: "Nothing between thirty-one and sixty days late.",
  D61_90: "Nothing between sixty-one and ninety days late.",
  D90_PLUS: "Nothing more than ninety days late.",
};

/**
 * How late, in the ink of how much it matters: amber for the first month,
 * red once it is past sixty days and on the way to a write-off.
 */
function LateFigure({ row, suffix = "" }: { row: ChaseRow; suffix?: string }) {
  if (row.daysOverdue === 0) return <ColumnFigure tone="muted">—</ColumnFigure>;
  const tone = row.bucket === "D61_90" || row.bucket === "D90_PLUS" ? "danger" : "warn";
  return (
    <ColumnFigure tone={tone}>
      {row.daysOverdue} {row.daysOverdue === 1 ? "day" : "days"}
      {suffix}
    </ColumnFigure>
  );
}

/**
 * Where the chasing has got to. A broken promise is the loudest thing on the
 * page, and a late invoice nobody has rung about is the next loudest; the
 * rest is what was said last and when.
 */
function LastChase({ row, today }: { row: ChaseRow; today: string }) {
  const note = row.lastNote;
  if (!note) {
    return row.daysOverdue > 0 ? (
      <StatusDot tone="warn" label="Never chased" />
    ) : (
      <ColumnText>Not chased yet</ColumnText>
    );
  }
  if (note.outcome === "PROMISED_TO_PAY" && note.promisedAt) {
    const day = note.promisedAt.slice(0, 10);
    return day < today && !row.promiseKept ? (
      <StatusDot tone="danger" label={`Promised ${formatDate(day)}, not paid`} />
    ) : (
      <StatusDot tone="neutral" label={`Promised by ${formatDate(day)}`} />
    );
  }
  if (note.outcome === "DISPUTED") {
    return <StatusDot tone="warn" label={`Disputed, ${formatDate(note.createdAt)}`} />;
  }
  return (
    <ColumnText>
      {COLLECTION_OUTCOME_LABELS[note.outcome]}, {formatDate(note.createdAt)}
    </ColumnText>
  );
}

/** What the shown rows come to, a line per currency — never one sum across them. */
function totalsByCurrency(rows: ChaseRow[]): string[] {
  const totals = new Map<string, number>();
  for (const row of rows) totals.set(row.currency, (totals.get(row.currency) ?? 0) + row.outstanding);
  return [...totals].map(([currency, amount]) => formatMoney(Math.round(amount * 100) / 100, currency));
}

/**
 * The same debts on a phone: who owes it and how much on the first line, the
 * invoice and how late under it, then where the chasing has got to. Four
 * columns of figures do not fit 390px, and a table that squeezes the
 * customer's name down to its first letter hides the thing you ring about.
 */
function PhoneChaseList({
  rows,
  today,
  empty,
  totals,
  onChase,
}: {
  rows: ChaseRow[];
  today: string;
  empty: string;
  totals: string[];
  onChase: (row: ChaseRow) => void;
}) {
  if (rows.length === 0) return <p className="py-2 text-sm text-[var(--text-muted)]">{empty}</p>;
  return (
    <>
      <ul aria-label="Invoices owed">
        {rows.map((row) => (
          <li
            key={row.documentId}
            className="flex items-start gap-3 border-b border-[var(--border-subtle)] py-3"
          >
            <div className="min-w-0 flex-1 space-y-1">
              <Link
                href={`/crm/invoices/${row.documentId}`}
                className="block truncate text-sm font-medium text-[var(--text-strong)]"
              >
                {row.customer ?? row.record?.label ?? "No customer on record"}
              </Link>
              <p className="flex flex-wrap items-baseline gap-x-2 text-sm text-[var(--text-muted)]">
                <span className="font-mono">{row.invoiceNumber}</span>
                {row.daysOverdue > 0 ? <LateFigure row={row} suffix=" late" /> : <span>not yet due</span>}
              </p>
              <LastChase row={row} today={today} />
            </div>
            <div className="flex flex-none flex-col items-end gap-2">
              <ColumnFigure>{formatMoney(row.outstanding, row.currency)}</ColumnFigure>
              <Button type="button" size="sm" variant="secondary" onClick={() => onChase(row)}>
                Chase
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {rows.length > 1 ? (
        <div className="flex items-start justify-between gap-3 py-3 text-sm font-semibold text-[var(--text-strong)]">
          <span>Total owed</span>
          <span className="flex flex-col items-end">
            {totals.map((line) => (
              <ColumnFigure key={line}>{line}</ColumnFigure>
            ))}
          </span>
        </div>
      ) : null}
    </>
  );
}

export function CollectionsContent() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requested = searchParams.get(BAND_PARAM);
  const band: Band = AGEING_BUCKETS.find((bucket) => bucket === requested) ?? "ALL";

  const [search, setSearch] = useState("");
  const [chasing, setChasing] = useState<ChaseTarget | null>(null);
  const needle = useDebounced(search, 300).trim().toLowerCase();

  const query = useQuery({
    queryKey: ["crm", "collections"],
    queryFn: () => fetchJson<CollectionsResponse>("/api/v2/crm/collections"),
  });

  const rows = useMemo(() => query.data?.data ?? [], [query.data]);
  const inBand = useMemo(
    () => (band === "ALL" ? rows : rows.filter((row) => row.bucket === band)),
    [band, rows],
  );
  const shown = useMemo(
    () =>
      needle
        ? inBand.filter((row) =>
            [row.invoiceNumber, row.customer, row.record?.label]
              .filter(Boolean)
              .some((value) => value!.toLowerCase().includes(needle)),
          )
        : inBand,
    [inBand, needle],
  );

  const counts = useMemo(() => {
    const byBand = new Map<Band, number>([["ALL", rows.length]]);
    for (const summary of query.data?.ageing ?? []) byBand.set(summary.bucket, summary.count);
    return byBand;
  }, [query.data, rows.length]);

  const bandHref = (value: Band) => {
    const next = new URLSearchParams(searchParams.toString());
    if (value === "ALL") next.delete(BAND_PARAM);
    else next.set(BAND_PARAM, value);
    const rendered = next.toString();
    return rendered ? `${pathname}?${rendered}` : pathname;
  };

  const today = new Date().toISOString().slice(0, 10);
  const totals = totalsByCurrency(shown);
  const phone = useIsMobile();
  const chase = (row: ChaseRow) =>
    setChasing({
      documentId: row.documentId,
      invoiceNumber: row.invoiceNumber,
      owedBy: row.customer ?? row.record?.label ?? null,
    });
  const empty = needle ? "Nothing owed matches." : EMPTY[band];

  return (
    <div className="space-y-3">
      <SectionTabs label="How late">
        {(["ALL", ...AGEING_BUCKETS] as Band[]).map((value) => (
          <SectionTab
            key={value}
            to={bandHref(value)}
            active={band === value}
            count={counts.get(value) || undefined}
          >
            {value === "ALL" ? "All owed" : AGEING_LABELS[value]}
          </SectionTab>
        ))}
      </SectionTabs>

      <RecordListShell
        title="Collections"
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by invoice or customer"
        searchNoun="invoices"
        error={query.error}
        count={query.data ? `${shown.length} of ${inBand.length}` : undefined}
      >
        {query.isLoading ? (
          <div className="space-y-1.5 pt-2" aria-busy="true" style={{ maxWidth: WIDTH }}>
            <Skeleton height={44} />
            <Skeleton height={44} />
            <Skeleton height={44} />
          </div>
        ) : (
          <div className="space-y-3">
            {phone ? (
              <PhoneChaseList rows={shown} today={today} empty={empty} totals={totals} onChase={chase} />
            ) : (
              <ColumnList
                label="Invoices owed"
                maxWidth={WIDTH}
                empty={empty}
                columns={[
                  { id: "invoice", label: "Invoice" },
                  { id: "due", label: "Due", hideBelow: "md" },
                  { id: "late", label: "Late" },
                  { id: "chase", label: "Last chase", hideBelow: "md" },
                  { id: "owed", label: "Owed", align: "end" },
                  { id: "act", label: "" },
                ]}
                rows={shown.map((row) => ({
                  id: row.documentId,
                  cells: {
                    invoice: (
                      <ColumnName
                        code={row.invoiceNumber}
                        name={row.customer ?? row.record?.label ?? "No customer on record"}
                        meta={row.customer ? row.record?.label : undefined}
                        href={`/crm/invoices/${row.documentId}`}
                      />
                    ),
                    due: (
                      <ColumnFigure tone="muted">
                        {row.dueDate ? formatDate(row.dueDate) : "—"}
                      </ColumnFigure>
                    ),
                    late: <LateFigure row={row} />,
                    chase: <LastChase row={row} today={today} />,
                    owed: <ColumnFigure>{formatMoney(row.outstanding, row.currency)}</ColumnFigure>,
                    act: (
                      <ColumnRowAction>
                        <Button type="button" size="sm" variant="secondary" onClick={() => chase(row)}>
                          Chase
                        </Button>
                      </ColumnRowAction>
                    ),
                  },
                }))}
                total={
                  shown.length > 1
                    ? {
                        invoice: "Total owed",
                        owed: (
                          <span className="flex flex-col items-end">
                            {totals.map((line) => (
                              <ColumnFigure key={line}>{line}</ColumnFigure>
                            ))}
                          </span>
                        ),
                      }
                    : undefined
                }
              />
            )}
            {needle && shown.length === 0 ? (
              <Button variant="secondary" size="sm" onClick={() => setSearch("")}>
                Clear the search
              </Button>
            ) : null}
          </div>
        )}
      </RecordListShell>

      <ChaseDialog target={chasing} onOpenChange={(open) => (!open ? setChasing(null) : undefined)} />
    </div>
  );
}
