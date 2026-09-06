"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Alert, Button as DsButton, Card } from "@corelithzw/react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumericCell } from "@/components/ui/numeric-cell";
import { PageBand } from "@/components/schools/common/page-band";
import { PersonAvatar } from "@/components/schools/common/person-avatar";
import { SendNoticeDialog } from "@/components/schools/common/send-notice-dialog";
import { useSchoolAccess } from "@/components/schools/common/use-school-access";
import { LoadError, NothingMatched, NothingYet, StatsSkeleton } from "@/components/schools/common/states";
import { fetchJson } from "@/lib/api-client";
import { fetchSchoolsClasses, fetchSchoolsTerms } from "@/lib/schools/admin-v2";
import { formatSchoolMoney } from "@/lib/schools/format";

/**
 * Fees, starting from "which year group?".
 *
 * S-4.6. The year group is a route in this module, not a filter. What was here
 * was the shared `GradePicker` with a money line under each card, and it could
 * not carry what a bursar actually reads down this page: how much of what was
 * billed has come in, form by form, and which of the four is behind.
 *
 * So this is the design's own table rather than the shared cards. Four
 * decisions in it:
 *
 * **Collected is a proportion, not a total.** "Form 1 collected 61,040" says
 * nothing on its own; 70% of what it was billed says everything, and the bar
 * turns red below three quarters because that is the form to open first.
 *
 * **The ageing panel counts from each bill's own due date.** A single "overdue"
 * number hides the difference between a fortnight late and a year late, which
 * is the difference between a reminder and a conversation.
 *
 * **The longest-overdue panel is ordered by age, not by amount.** An old small
 * debt is a family nobody has rung.
 *
 * **The band's verb writes to the families the page has already named.** The
 * screen works out exactly who is late; making the bursar re-select them from a
 * dropdown afterwards is how a reminder meant for the overdue goes to a form.
 */

type ClassFees = {
  id: string;
  code: string;
  name: string;
  students: number;
  billed: number;
  collected: number;
  outstanding: number;
  overdue: number;
  owing: number;
  invoices: number;
};

type FeesByClass = {
  currency: string;
  data: ClassFees[];
  totals: { billed: number; collected: number; outstanding: number };
  ageing: {
    current: number;
    days1to30: number;
    days31to60: number;
    days61to90: number;
    over90: number;
    accounts: number;
  };
  longestOverdue: Array<{
    id: string;
    firstName: string;
    lastName: string;
    className: string | null;
    streamName: string | null;
    amount: number;
    daysOverdue: number;
  }>;
};

/** Green above 85, amber above 75, red below — the bursar's own triage. */
function collectionTone(percent: number) {
  if (percent >= 85) return "var(--tone-success)";
  if (percent >= 75) return "var(--tone-warn)";
  return "var(--tone-danger)";
}

export function FeesGradePicker() {
  const router = useRouter();
  const access = useSchoolAccess();
  const [search, setSearch] = useState("");
  const [reminding, setReminding] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const feesQuery = useQuery({
    queryKey: ["schools", "fees", "by-class"],
    queryFn: () => fetchJson<FeesByClass>("/api/v2/schools/fees/by-class"),
  });

  // A "class" in the band's sense is a stream — Form 2A, not Form 2 — and the
  // fee endpoint groups by year group, so the stream count comes from the class
  // ladder itself. The term is what the collection table is a collection *of*.
  const classesQuery = useQuery({
    queryKey: ["schools", "grades"],
    queryFn: () => fetchSchoolsClasses({ page: 1, limit: 100 }),
  });
  const termsQuery = useQuery({
    queryKey: ["schools", "terms"],
    queryFn: () => fetchSchoolsTerms({ page: 1, limit: 100 }),
  });

  const currency = feesQuery.data?.currency ?? "USD";
  const rows = useMemo(() => {
    const all = feesQuery.data?.data ?? [];
    const term = search.trim().toLowerCase();
    if (!term) return all;
    return all.filter(
      (row) =>
        row.name.toLowerCase().includes(term) || row.code.toLowerCase().includes(term),
    );
  }, [feesQuery.data, search]);

  if (feesQuery.error) {
    return (
      <LoadError
        what="the fee summary"
        error={feesQuery.error}
        onRetry={() => feesQuery.refetch()}
      />
    );
  }

  const totals = feesQuery.data?.totals;
  const ageing = feesQuery.data?.ageing;
  const overdue = feesQuery.data?.longestOverdue ?? [];
  const allRows = feesQuery.data?.data ?? [];

  // The canvas band counts the school, not the filtered view: a bursar who has
  // typed "Form 3" into the search still wants to know how many year groups,
  // classes and pupils the school has behind it.
  const yearGroups = allRows.length;
  const students = allRows.reduce((sum, row) => sum + row.students, 0);
  const classes = (classesQuery.data?.data ?? []).reduce(
    (sum, row) => sum + row._count.streams,
    0,
  );
  const activeTerm = (termsQuery.data?.data ?? []).find((term) => term.isActive) ?? null;

  /**
   * Export, fetched rather than opened. `window.open` on an API URL means a
   * refused export is a blank tab with nothing to report; fetching it puts the
   * failure on the screen the button is on.
   */
  const runExport = async () => {
    setExportError(null);
    setExporting(true);
    try {
      const response = await fetch(
        "/api/v2/schools/reports/export?reportType=arrears&format=csv",
        { credentials: "include" },
      );
      if (!response.ok) throw new Error(`The export failed (${response.status}).`);
      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") ?? "";
      const named = /filename="([^"]+)"/.exec(disposition)?.[1];
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = named ?? "fees-by-year-group.csv";
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(href), 0);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "The export failed.");
    } finally {
      setExporting(false);
    }
  };

  const canRemind = access.can("schools.fees", "create");

  const ageingBands = ageing
    ? [
        { label: "Current", amount: ageing.current, tone: "var(--tone-success)" },
        { label: "1–30 days", amount: ageing.days1to30, tone: "var(--text-muted)" },
        { label: "31–60 days", amount: ageing.days31to60, tone: "var(--tone-warn)" },
        { label: "61–90 days", amount: ageing.days61to90, tone: "var(--tone-danger)" },
        { label: "Over 90 days", amount: ageing.over90, tone: "var(--tone-danger)" },
      ]
    : [];

  return (
    <div className="space-y-4">
      <PageBand
        chips={[
          { label: "Billed", value: formatSchoolMoney(totals?.billed ?? 0, currency) },
          {
            label: "Collected",
            value: formatSchoolMoney(totals?.collected ?? 0, currency),
            tone: "success",
          },
          {
            label: "Outstanding",
            value: formatSchoolMoney(totals?.outstanding ?? 0, currency),
            tone: "danger",
          },
          { label: "Year groups", value: yearGroups },
          { label: "Classes", value: classes },
          { label: "Students", value: students },
          {
            label: "Overdue",
            value: ageing?.accounts ?? 0,
            tone: "danger",
            href: "/schools/finance/arrears",
          },
        ]}
        actions={
          <>
            {/* Both are secondary verbs on somebody else's numbers, so they sit
                in the band rather than the app bar — the law keeps one primary
                action per page and this page's is opening a year group. */}
            <DsButton
              size="sm"
              variant="secondary"
              disabled={!canRemind || (ageing?.accounts ?? 0) === 0}
              title={
                !canRemind
                  ? "Writing to families is the bursar's to do."
                  : (ageing?.accounts ?? 0) === 0
                    ? "Nothing is late, so there is nobody to remind."
                    : undefined
              }
              onClick={() => {
                setSent(null);
                setReminding(true);
              }}
            >
              Send reminders
            </DsButton>
            <DsButton
              size="sm"
              variant="secondary"
              loading={exporting}
              onClick={() => void runExport()}
            >
              Export
            </DsButton>
            <Link
              href="/schools/finance/ledger"
              className="text-sm font-medium text-primary hover:underline"
            >
              Whole-school ledger
            </Link>
          </>
        }
      />

      {sent ? (
        <Alert tone="success" title="Reminders sent" onDismiss={() => setSent(null)}>
          {sent}
        </Alert>
      ) : null}
      {exportError ? (
        <Alert tone="danger" title="The export failed" onDismiss={() => setExportError(null)}>
          {exportError}
        </Alert>
      ) : null}

      <div className="min-w-0 sm:max-w-[320px]">
        <Label htmlFor="fees-grade-search" className="text-sm text-muted-foreground">
          Find a year group
        </Label>
        <Input
          id="fees-grade-search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search year group or class"
        />
      </div>

      <Card
        title={`${activeTerm ? `${activeTerm.name} ` : ""}collection by year group`}
        actions={
          <span className="text-[length:var(--type-caption)] text-[color:var(--text-muted)]">
            {currency} · excludes waivers and refunds
          </span>
        }
        flush
      >
        {feesQuery.isPending ? (
          <div className="p-4">
            <StatsSkeleton count={3} />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-4">
            {search ? (
              <NothingMatched
                what="year groups"
                filters={[search]}
                onClear={() => setSearch("")}
              />
            ) : (
              <NothingYet
                title="No year groups yet"
                body="Fees are billed against a class. Set the class ladder up under Academics first."
              />
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-[color:var(--border)] text-left text-[length:var(--type-caption)] uppercase tracking-wide text-[color:var(--text-muted)]">
                  <th className="px-3 py-2 font-semibold">Year group</th>
                  <th className="px-3 py-2 text-right font-semibold">Students</th>
                  <th className="px-3 py-2 text-right font-semibold">Billed</th>
                  <th className="px-3 py-2 text-right font-semibold">Collected</th>
                  <th className="px-3 py-2 text-right font-semibold">Outstanding</th>
                  <th className="px-3 py-2 font-semibold">Collected</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  // Nothing billed is not nought per cent collected — it is a
                  // year group that has not been invoiced yet, and colouring it
                  // red would send a bursar chasing money nobody asked for.
                  const percent =
                    row.billed > 0 ? Math.round((row.collected / row.billed) * 100) : null;
                  return (
                    <tr
                      key={row.id}
                      className="cursor-pointer border-b border-[color:var(--border-subtle)] hover:bg-[color:var(--surface-muted)]"
                      onClick={() => router.push(`/schools/finance/class/${row.id}`)}
                    >
                      <td className="px-3 py-2">
                        <Link
                          href={`/schools/finance/class/${row.id}`}
                          className="font-medium hover:underline"
                          onClick={(event) => event.stopPropagation()}
                        >
                          {row.name}
                        </Link>
                      </td>
                      <td className="px-3 py-2">
                        <NumericCell>{row.students}</NumericCell>
                      </td>
                      <td className="px-3 py-2">
                        <NumericCell>{formatSchoolMoney(row.billed, currency)}</NumericCell>
                      </td>
                      <td className="px-3 py-2">
                        <NumericCell>
                          {formatSchoolMoney(row.collected, currency)}
                        </NumericCell>
                      </td>
                      <td className="px-3 py-2">
                        <NumericCell className="text-[color:var(--tone-danger)]">
                          {formatSchoolMoney(row.outstanding, currency)}
                        </NumericCell>
                      </td>
                      <td className="px-3 py-2">
                        {percent === null ? (
                          <span className="text-[color:var(--text-muted)]">
                            Nothing billed yet
                          </span>
                        ) : (
                          <div className="flex items-center gap-2">
                            <div
                              className="h-1.5 flex-1 overflow-hidden rounded-full bg-[color:var(--surface-muted)]"
                              role="img"
                              aria-label={`${percent}% collected`}
                            >
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${Math.min(percent, 100)}%`,
                                  background: collectionTone(percent),
                                }}
                              />
                            </div>
                            <span className="w-10 shrink-0 text-right font-[family-name:var(--font-mono)] text-[length:var(--type-caption)] tabular-nums">
                              {percent}%
                            </span>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title="Ageing"
          actions={
            <span className="text-[length:var(--type-caption)] text-[color:var(--text-muted)]">
              from due date
            </span>
          }
        >
          {feesQuery.isPending ? (
            <StatsSkeleton count={3} />
          ) : (
            <ul className="divide-y divide-[color:var(--border-subtle)]">
              {ageingBands.map((band) => (
                <li key={band.label} className="flex items-center gap-3 py-2">
                  <span className="flex-1 text-sm">{band.label}</span>
                  <span className="font-[family-name:var(--font-mono)] text-sm font-semibold tabular-nums">
                    {formatSchoolMoney(band.amount, currency)}
                  </span>
                  <span
                    aria-hidden="true"
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: band.tone }}
                  />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title="Longest overdue"
          actions={
            <span className="text-[length:var(--type-caption)] text-[color:var(--text-muted)]">
              {ageing ? `${ageing.accounts} accounts` : null}
            </span>
          }
        >
          {feesQuery.isPending ? (
            <StatsSkeleton count={3} />
          ) : overdue.length === 0 ? (
            <NothingYet
              title="Nothing is late"
              body="Every bill that has fallen due has been settled."
            />
          ) : (
            <ul className="divide-y divide-[color:var(--border-subtle)]">
              {overdue.map((person) => (
                <li key={person.id} className="flex items-center gap-3 py-2">
                  <PersonAvatar firstName={person.firstName} lastName={person.lastName} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {person.firstName} {person.lastName}
                    </div>
                    <div className="truncate text-[length:var(--type-caption)] text-[color:var(--text-muted)]">
                      {person.streamName ?? person.className ?? "No year group"}
                    </div>
                  </div>
                  <span className="font-[family-name:var(--font-mono)] text-sm font-semibold tabular-nums">
                    {formatSchoolMoney(person.amount, currency)}
                  </span>
                  <span className="w-12 shrink-0 text-right font-[family-name:var(--font-mono)] text-[length:var(--type-caption)] tabular-nums text-[color:var(--tone-danger)]">
                    {person.daysOverdue}d
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/*
        The audience is the pupils this page has already named as overdue, sent
        by id — not "the whole school", and not a class the bursar picks again
        in the dialog. `longestOverdue` is the top of that list; anybody in
        arrears beyond it is reached from the arrears report, which carries the
        full set and its own filters.
      */}
      {reminding ? (
        <SendNoticeDialog
          open
          onOpenChange={setReminding}
          title={`Remind the ${overdue.length}`}
          audience={{
            studentIds: overdue.map((person) => person.id),
            describe: `the families of the ${overdue.length} longest overdue`,
          }}
          severity="WARNING"
          defaultSubject="School fees outstanding"
          defaultBody="Our records show school fees still outstanding on your child's account. Please settle the balance, or come and see the bursar to arrange terms. Your statement is on the portal."
          sendLabel={`Remind the ${overdue.length}`}
          onSent={(result) => {
            setSent(
              `Sent to ${result.recipients} ${result.recipients === 1 ? "family" : "families"}${
                result.withoutAccount > 0
                  ? ` · ${result.withoutAccount} have no portal account yet, so ring them`
                  : ""
              }.`,
            );
          }}
        />
      ) : null}
    </div>
  );
}
