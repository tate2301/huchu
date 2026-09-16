"use client";

import { Fragment, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, MobileList } from "@corelithzw/react";

import { PageChrome } from "@/components/layout/page-chrome";
import { RecordCell } from "@/components/records/record-table";
import { RecordMark } from "@/components/records/record-mark";
import {
  LoadError,
  NothingMatched,
  NothingYet,
  SaveError,
  TableRowsSkeleton,
} from "@/components/records/states";
import { TableControls, TableSearch } from "@/components/records/table-controls";
import { ClassFilter } from "@/components/schools/common/class-filter";
import { activeFilterCount, FilterSelect } from "@/components/schools/common/filter-select";
import { PageBand } from "@/components/schools/common/page-band";
import { PersonCell } from "@/components/schools/common/identity-cell";
import { CreateButton, RecordActions } from "@/components/schools/common/record-actions";
import { SchoolsPage } from "@/components/schools/common/schools-page";
import { DataTable } from "@/components/ui/data-table";
import { getApiErrorMessage } from "@/lib/api-client";
import { Download } from "@/lib/icons";
import { recordType } from "@/lib/records/registry";
import {
  awardMerit,
  fetchMeritLedger,
  fetchMeritReasons,
  fetchMeritSummary,
  type MeritKind,
  type MeritPupilRow,
} from "@/lib/schools/conduct-v2";
import { formatSchoolDayShort } from "@/lib/schools/format";
import { AwardMeritDialog } from "@/components/schools/conduct/award-merit-dialog";
import { PupilLedgerDialog } from "@/components/schools/conduct/pupil-ledger-dialog";

/**
 * Merits and demerits.
 *
 * Rudo Makoni in the week before prize giving, deciding whether Form 3's net of
 * +96 against Form 2's +268 is a year group with a problem or a year group
 * whose teachers do not write things down. The second question is the one this
 * screen is built to make askable, which is why `By year group` sits beside
 * `What gets written down` rather than under it.
 *
 * `Net` is deliberately untoned in the band. A net is not good news or bad
 * news, and a screen that coloured it would answer the reader's question for
 * them.
 *
 * ## Four verbs, not one
 *
 * The artboard draws `Award a merit` and nothing else. `conduct.md` open
 * question 4 flags that as an omission rather than an intent — demerits are
 * half the table, half the chips and half the arithmetic, and nothing created
 * one; nothing opened a pupil; nothing corrected an entry made in error, which
 * is the thing that happens with merit points more than with anything else in a
 * school. So this ships with the four the screen contract asks for.
 */

const SORT_OPTIONS = [
  { value: "net-desc", label: "Net, highest first" },
  { value: "net-asc", label: "Net, lowest first" },
  { value: "merits-desc", label: "Most merits" },
  { value: "demerits-desc", label: "Most demerits" },
  { value: "name", label: "By surname" },
];

/** The proportional bar the two summary tables draw in their `Share` column. */
function ShareBar({ value, total, tone }: { value: number; total: number; tone: "ok" | "warn" | "brand" }) {
  const share = total > 0 ? Math.min(100, Math.round((Math.abs(value) / total) * 100)) : 0;
  const colour =
    tone === "ok"
      ? "bg-[color:var(--tone-success)]"
      : tone === "warn"
        ? "bg-[color:var(--tone-warn)]"
        : "bg-[color:var(--brand)]";
  return (
    <span className="flex items-center gap-2">
      <span
        className="h-[7px] w-[120px] overflow-hidden rounded-full bg-[color:var(--surface-muted)]"
        aria-hidden="true"
      >
        <span className={`block h-full rounded-full ${colour}`} style={{ width: `${share}%` }} />
      </span>
      <span className="font-mono text-[11px] text-[color:var(--text-muted)]">{share}%</span>
    </span>
  );
}

export function ConductMeritsContent() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [classValue, setClassValue] = useState<{ classId: string; streamId: string }>({
    classId: "",
    streamId: "",
  });
  const [sort, setSort] = useState("net-desc");
  const [awarding, setAwarding] = useState<{ kind: MeritKind } | null>(null);
  const [ledgerFor, setLedgerFor] = useState<MeritPupilRow | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const ledgerQuery = useQuery({
    queryKey: [
      "schools",
      "conduct",
      "merits",
      classValue.classId,
      classValue.streamId,
      sort,
      search,
    ],
    queryFn: () =>
      fetchMeritLedger({
        // The class goes to the query. Filtering in the browser for "has any
        // class at all" reported an active filter and narrowed nothing.
        classId: classValue.classId || undefined,
        streamId: classValue.streamId || undefined,
        search: search.trim() || undefined,
        sort: sort as "net-desc",
      }),
  });

  const summaryQuery = useQuery({
    queryKey: ["schools", "conduct", "merits", "summary"],
    queryFn: () => fetchMeritSummary(),
  });

  const reasonsQuery = useQuery({
    queryKey: ["schools", "conduct", "merits", "reasons"],
    queryFn: () => fetchMeritReasons(),
  });

  const award = useMutation({
    mutationFn: (input: {
      studentId: string;
      reasonId: string;
      kind: MeritKind;
      points?: number;
      note?: string | null;
    }) => awardMerit(input),
    onSuccess: () => {
      setAwarding(null);
      setActionError(null);
      void queryClient.invalidateQueries({ queryKey: ["schools", "conduct"] });
    },
    onError: (error) => setActionError(getApiErrorMessage(error)),
  });

  const rows = useMemo(() => ledgerQuery.data?.rows ?? [], [ledgerQuery.data]);

  const tallies = ledgerQuery.data?.tallies;
  const summary = summaryQuery.data;

  const namedFilters = [
    classValue.classId ? "a year group" : null,
    SORT_OPTIONS.find((option) => option.value === sort && sort !== "net-desc")?.label,
  ].filter((entry): entry is string => Boolean(entry));

  const columns = useMemo<ColumnDef<MeritPupilRow>[]>(
    () => [
      {
        id: "pupil",
        header: "Pupil",
        cell: ({ row }) => (
          <PersonCell
            firstName={row.original.student.firstName}
            lastName={row.original.student.lastName}
            href={recordType("STUDENT").href(row.original.student.id)}
            reference={row.original.student.studentNo}
          />
        ),
      },
      {
        id: "year",
        header: "Year",
        cell: ({ row }) => (
          <RecordCell
            value={
              [row.original.student.className, row.original.student.streamName]
                .filter(Boolean)
                .join(" ") || null
            }
            className="text-[color:var(--text-muted)]"
          />
        ),
      },
      {
        id: "merits",
        header: "Merits",
        cell: ({ row }) => (
          <span className="block text-right font-mono text-sm font-bold text-[color:var(--tone-success)]">
            {row.original.merits}
          </span>
        ),
      },
      {
        id: "demerits",
        header: "Demerits",
        // Grey at nought. An amber zero reads as a warning about a pupil who
        // has done nothing wrong.
        cell: ({ row }) => (
          <span
            className={`block text-right font-mono text-sm font-bold ${
              row.original.demerits === 0
                ? "text-[color:var(--text-faint)]"
                : "text-[color:var(--tone-warn)]"
            }`}
          >
            {row.original.demerits}
          </span>
        ),
      },
      {
        id: "net",
        header: "Net",
        cell: ({ row }) => (
          <span
            className={`block text-right font-mono text-[12.5px] ${
              row.original.net < 0
                ? "text-[color:var(--status-error-text)]"
                : "text-[color:var(--tone-success)]"
            }`}
          >
            {row.original.net > 0 ? `+${row.original.net}` : row.original.net}
          </span>
        ),
      },
      {
        id: "last",
        header: "The last thing recorded",
        // What stops the table being a scoreboard. A pupil at −7 whose last
        // recorded thing is "Set out the hall for prize giving, unasked" is a
        // different pupil from one at −7 whose last recorded thing is a fight.
        cell: ({ row }) => {
          const last = row.original.lastRecorded;
          if (!last) return <span className="text-sm text-[color:var(--text-faint)]">—</span>;
          return (
            <span className="flex min-w-0 items-center gap-2">
              <Badge tone={last.kind === "MERIT" ? "success" : "warn"}>
                {last.kind === "MERIT" ? "Merit" : "Demerit"}
              </Badge>
              <span className="min-w-0 truncate text-sm">{last.note || last.reason}</span>
              <span className="shrink-0 font-mono text-[11px] text-[color:var(--text-muted)]">
                {formatSchoolDayShort(last.at)}
              </span>
            </span>
          );
        },
      },
      {
        id: "verbs",
        header: () => <span className="sr-only">Row actions</span>,
        cell: ({ row }) => (
          <RecordActions
            layout="menu"
            label={`Row actions for ${row.original.student.firstName} ${row.original.student.lastName}`}
            resource="schools.conduct"
            verbs={[
              {
                label: "Open the ledger",
                action: "view",
                onSelect: () => setLedgerFor(row.original),
              },
              {
                label: "Award a merit",
                action: "award",
                onSelect: () => setAwarding({ kind: "MERIT" }),
              },
              {
                label: "Record a demerit",
                action: "award",
                onSelect: () => setAwarding({ kind: "DEMERIT" }),
              },
            ]}
          />
        ),
      },
    ],
    [],
  );

  return (
    <SchoolsPage
      band={
        <PageBand
          chips={[
            { label: "Merits", value: tallies?.merits ?? "—", tone: "success" },
            { label: "Demerits", value: tallies?.demerits ?? "—", tone: "warn" },
            {
              label: "Net",
              // Untoned on purpose.
              value:
                tallies == null
                  ? "—"
                  : tallies.net > 0
                    ? `+${tallies.net}`
                    : String(tallies.net),
            },
            { label: "Pupils with neither", value: tallies?.pupilsWithNeither ?? "—" },
          ]}
          actions={
            <Button variant="secondary" size="sm" onClick={() => window.print()}>
              <Download className="size-4" />
              Export the term
            </Button>
          }
        />
      }
    >
      <PageChrome title="Merits and demerits">
        <CreateButton
          resource="schools.conduct"
          label="Award a merit"
          onSelect={() => setAwarding({ kind: "MERIT" })}
        />
      </PageChrome>

      {actionError ? <SaveError what="That entry" error={actionError} /> : null}

      {ledgerQuery.error ? (
        <LoadError
          what="the merit ledger"
          error={ledgerQuery.error}
          onRetry={() => void ledgerQuery.refetch()}
        />
      ) : (
        <>
          <TableControls
            sticky
            search={
              <TableSearch value={search} onChange={setSearch} placeholder="Search by pupil" />
            }
            filterCount={activeFilterCount(
              classValue.classId,
              classValue.streamId,
              sort === "net-desc" ? "" : sort,
            )}
            count={ledgerQuery.isPending ? null : `${rows.length} pupils`}
            filters={
              <>
                <ClassFilter
                  label="Year group"
                  allLabel="Every year group"
                  value={classValue}
                  onChange={setClassValue}
                />
                <FilterSelect
                  label="Sort by"
                  allLabel="Net, highest first"
                  value={sort === "net-desc" ? "" : sort}
                  options={SORT_OPTIONS.filter((option) => option.value !== "net-desc")}
                  onChange={(next) => setSort(next || "net-desc")}
                />
              </>
            }
          />

          <DataTable
            data={rows}
            columns={columns}
            pagination={{ enabled: true }}
            features={{ sorting: false, globalFilter: false, pagination: true }}
            mobileListRenderer={({ rows: mobileRows }) => (
              <MobileList>
                {mobileRows.map(({ row }) => (
                  <MobileList.Row
                    key={row.student.id}
                    leading={
                      <RecordMark
                        kind="student"
                        name={`${row.student.firstName} ${row.student.lastName}`}
                        size="sm"
                      />
                    }
                    title={`${row.student.lastName}, ${row.student.firstName}`}
                    subtitle={`${row.merits} merits · ${row.demerits} demerits · net ${row.net > 0 ? `+${row.net}` : row.net}`}
                    onClick={() => setLedgerFor(row)}
                  />
                ))}
              </MobileList>
            )}
            emptyState={
              ledgerQuery.isPending ? (
                <TableRowsSkeleton
                  rows={8}
                  headers={[
                    "Pupil",
                    "Year",
                    "Merits",
                    "Demerits",
                    "Net",
                    "The last thing recorded",
                    "",
                  ]}
                  columns={[
                    { avatar: true, twoLine: true },
                    { width: 62 },
                    { width: 68, align: "right" },
                    { width: 78, align: "right" },
                    { width: 58, align: "right" },
                    {},
                    { width: 44 },
                  ]}
                />
              ) : namedFilters.length > 0 || search.trim() ? (
                <NothingMatched
                  what="pupils"
                  filters={namedFilters}
                  search={search}
                  onClear={() => {
                    setSearch("");
                    setSort("net-desc");
                    setClassValue({ classId: "", streamId: "" });
                  }}
                />
              ) : (
                <NothingYet
                  title="Nothing has been recorded this term"
                  body="A merit is the cheapest thing a school can give and the first thing it forgets to write down. Award one and the term's ledger starts here."
                />
              )
            }
          />

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <section className="space-y-2">
              <h2 className="flex items-baseline justify-between border-b border-[color:var(--border-subtle)] pb-1.5">
                <span className="text-sm font-semibold text-[color:var(--text-strong)]">
                  What gets written down
                </span>
                <span className="text-xs text-[color:var(--text-muted)]">This term</span>
              </h2>
              {summaryQuery.error ? (
                <LoadError
                  what="the reason summary"
                  error={summaryQuery.error}
                  onRetry={() => void summaryQuery.refetch()}
                />
              ) : summaryQuery.isPending ? (
                <TableRowsSkeleton
                  rows={8}
                  headers={["Reason", "Times", "Points", "Share"]}
                  columns={[
                    {},
                    { width: 70, align: "right" },
                    { width: 70, align: "right" },
                    { width: 150 },
                  ]}
                />
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-[color:var(--text-muted)]">
                      <th className="py-1 font-normal">Reason</th>
                      {/* Two columns because they are two facts. "Times" used to
                          render the point sum, so a reason worth three points
                          awarded once read as 3. */}
                      <th className="w-[70px] py-1 text-right font-normal">Times</th>
                      <th className="w-[70px] py-1 text-right font-normal">Points</th>
                      <th className="w-[150px] py-1 font-normal">Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* One table, two group headers: merits and demerits are
                        one question. Each header carries two numbers because
                        they are not the same number — the reasons shown are a
                        slice of the whole. */}
                    {(["merit", "demerit"] as const).map((kind) => {
                      const block = summary?.[kind];
                      if (!block || block.rows.length === 0) return null;
                      return (
                        <Fragment key={kind}>
                          <tr className="bg-[color:var(--surface-muted)]">
                            <th
                              colSpan={4}
                              className="py-1.5 text-left text-xs font-semibold text-[color:var(--text-muted)]"
                            >
                              {kind === "merit" ? "Merits" : "Demerits"} ·{" "}
                              {block.shownTimes.toLocaleString()} of{" "}
                              {block.totalTimes.toLocaleString()}
                            </th>
                          </tr>
                          {block.rows.map((row) => (
                            <tr
                              key={`${kind}-${row.reason}`}
                              className="border-t border-[color:var(--border-subtle)]"
                            >
                              <td className="py-1.5">{row.reason}</td>
                              <td className="py-1.5 text-right font-mono text-xs">{row.times}</td>
                              <td className="py-1.5 text-right font-mono text-xs text-[color:var(--text-muted)]">
                                {row.points}
                              </td>
                              <td className="py-1.5">
                                {/* Share of occasions, so the bar and the Times
                                    column beside it are measuring one thing. */}
                                <ShareBar
                                  value={row.times}
                                  total={block.totalTimes}
                                  tone={kind === "merit" ? "ok" : "warn"}
                                />
                              </td>
                            </tr>
                          ))}
                        </Fragment>
                      );
                    })}
                    {summary ? (
                      <tr className="border-t-2 border-[color:var(--border)]">
                        <td className="py-1.5 text-xs font-semibold">Recorded this term</td>
                        <td className="py-1.5 text-right font-mono text-xs font-bold">
                          {summary.recordedThisTerm.toLocaleString()}
                        </td>
                        <td className="py-1.5 text-right font-mono text-xs text-[color:var(--text-muted)]">
                          {(
                            summary.merit.totalPoints + summary.demerit.totalPoints
                          ).toLocaleString()}
                        </td>
                        <td className="py-1.5 text-xs text-[color:var(--text-muted)]">
                          {summary.merit.totalTimes.toLocaleString()} merits ·{" "}
                          {summary.demerit.totalTimes.toLocaleString()} demerits
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              )}
            </section>

            <section className="space-y-2">
              <h2 className="flex items-baseline justify-between border-b border-[color:var(--border-subtle)] pb-1.5">
                <span className="text-sm font-semibold text-[color:var(--text-strong)]">
                  By year group
                </span>
                <span className="text-xs text-[color:var(--text-muted)]">This term</span>
              </h2>
              {summaryQuery.isPending ? (
                <TableRowsSkeleton
                  rows={6}
                  headers={["Year group", "Net", "Share"]}
                  columns={[{}, { width: 70, align: "right" }, { width: 150 }]}
                />
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-[color:var(--text-muted)]">
                      <th className="py-1 font-normal">Year group</th>
                      <th className="w-[70px] py-1 text-right font-normal">Net</th>
                      <th className="w-[150px] py-1 font-normal">Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(summary?.byYearGroup ?? []).map((group) => (
                      <tr
                        key={group.label}
                        className="border-t border-[color:var(--border-subtle)]"
                      >
                        <td className="py-1.5">{group.label}</td>
                        <td className="py-1.5 text-right font-mono text-xs">
                          {group.net > 0 ? `+${group.net}` : group.net}
                        </td>
                        <td className="py-1.5">
                          <ShareBar
                            value={group.net}
                            total={Math.max(
                              1,
                              ...(summary?.byYearGroup ?? []).map((entry) => Math.abs(entry.net)),
                            )}
                            tone="brand"
                          />
                        </td>
                      </tr>
                    ))}
                    {summary && summary.byYearGroup.length > 0 ? (
                      <tr className="border-t-2 border-[color:var(--border)]">
                        <td className="py-1.5 text-xs font-semibold">
                          All {summary.byYearGroup.length} year groups
                        </td>
                        <td className="py-1.5 text-right font-mono text-xs font-bold">
                          {(() => {
                            const total = summary.byYearGroup.reduce(
                              (sum, group) => sum + group.net,
                              0,
                            );
                            return total > 0 ? `+${total}` : total;
                          })()}
                        </td>
                        <td />
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              )}
            </section>
          </div>
        </>
      )}

      <AwardMeritDialog
        kind={awarding?.kind ?? null}
        onOpenChange={(next) => {
          if (!next) setAwarding(null);
        }}
        reasons={reasonsQuery.data?.rows ?? []}
        isSaving={award.isPending}
        onSubmit={(values) => award.mutate(values)}
      />

      <PupilLedgerDialog
        pupil={ledgerFor}
        onOpenChange={(next) => {
          if (!next) setLedgerFor(null);
        }}
      />
    </SchoolsPage>
  );
}
