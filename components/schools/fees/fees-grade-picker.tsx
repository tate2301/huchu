"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@corelithzw/react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumericCell } from "@/components/ui/numeric-cell";
import { PageBand } from "@/components/schools/common/page-band";
import { PersonAvatar } from "@/components/schools/common/person-avatar";
import { LoadError, NothingMatched, NothingYet, StatsSkeleton } from "@/components/schools/common/states";
import { fetchJson } from "@/lib/api-client";
import { formatSchoolMoney } from "@/lib/schools/format";

/**
 * Fees, starting from "which year group?".
 *
 * S-4.6. The year group is a route in this module, not a filter. What was here
 * was the shared `GradePicker` with a money line under each card, and it could
 * not carry what a bursar actually reads down this page: how much of what was
 * billed has come in, form by form, and which of the four is behind.
 *
 * So this is the design's own table rather than the shared cards. Three
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
  const [search, setSearch] = useState("");

  const feesQuery = useQuery({
    queryKey: ["schools", "fees", "by-class"],
    queryFn: () => fetchJson<FeesByClass>("/api/v2/schools/fees/by-class"),
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
        ]}
        actions={
          <Link
            href="/schools/finance/ledger"
            className="text-sm font-medium text-primary hover:underline"
          >
            Whole-school ledger
          </Link>
        }
      />

      <div className="min-w-0 sm:max-w-[320px]">
        <Label htmlFor="fees-grade-search" className="text-sm text-muted-foreground">
          Find a year group
        </Label>
        <Input
          id="fees-grade-search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Form 2, Grade 5…"
        />
      </div>

      <Card
        title="Collection by year group"
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
              from each bill&rsquo;s due date
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
    </div>
  );
}
