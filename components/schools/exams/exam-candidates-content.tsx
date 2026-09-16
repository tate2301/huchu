"use client";

import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, MobileList } from "@corelithzw/react";
import { Badge } from "@/components/schools/common/status-badge";

import { PageChrome } from "@/components/layout/page-chrome";
import { RecordCell } from "@/components/records/record-table";
import { RecordMark } from "@/components/records/record-mark";
import {
  LoadError,
  NothingLeftToDo,
  NothingMatched,
  NothingYet,
  SaveError,
  TableRowsSkeleton,
} from "@/components/records/states";
import { TableControls, TableSearch } from "@/components/records/table-controls";
import { ClassFilter } from "@/components/schools/common/class-filter";
import { activeFilterCount, FilterSelect } from "@/components/schools/common/filter-select";
import { PersonCell } from "@/components/schools/common/identity-cell";
import { RecordActions } from "@/components/schools/common/record-actions";
import { SchoolsPage } from "@/components/schools/common/schools-page";
import { PageCaption } from "@/components/schools/records/page-caption";
import { PopulationTabs } from "@/components/schools/records/population-tabs";
import { DataTable } from "@/components/ui/data-table";
import { getApiErrorMessage } from "@/lib/api-client";
import { recordType } from "@/lib/records/registry";
import {
  EXAM_LEVEL_LABELS,
  fetchCandidates,
  fetchSeries,
  registerCohort,
  type CandidateRow,
} from "@/lib/schools/exams-v2";
import { formatSchoolDate, formatSchoolMoney, spellCount } from "@/lib/schools/format";
import { ExamSeriesTabs } from "@/components/schools/exams/exam-series-tabs";
import { FixCandidateDialog } from "@/components/schools/exams/fix-candidate-dialog";

/**
 * The candidate roll.
 *
 * `What is stopping an entry` comes before `The roll`, and that ordering is the
 * screen: seven days before a deadline, the nine candidates who cannot be
 * registered are the work, and the other hundred and nine are context.
 *
 * Every blocker is a NOT NULL requirement on the board's entry file. The
 * commonest is the last one — the roll says one name and the birth certificate
 * says another — and the board prints what it is given, which is why
 * `certifiedName` is a column on the pupil rather than a comparison nobody can
 * make.
 */

const STATUS_OPTIONS = [
  { value: "ready", label: "Ready to register" },
  { value: "blocked", label: "Cannot be registered" },
  { value: "registered", label: "Registered" },
];

type Segment = "all" | "blocked" | "registered";

export function ExamCandidatesContent({ seriesId }: { seriesId: string }) {
  const queryClient = useQueryClient();
  const [segment, setSegment] = useState<Segment>("all");
  const [statusFilter, setStatusFilter] = useState("");
  const [classValue, setClassValue] = useState<{ classId: string; streamId: string }>({
    classId: "",
    streamId: "",
  });
  const [search, setSearch] = useState("");
  const [fixing, setFixing] = useState<CandidateRow | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const seriesQuery = useQuery({
    queryKey: ["schools", "exams", "series", seriesId],
    queryFn: () => fetchSeries(seriesId),
  });

  const rollQuery = useQuery({
    queryKey: ["schools", "exams", "candidates", seriesId, segment, statusFilter, classValue.classId, search],
    queryFn: () =>
      fetchCandidates(seriesId, {
        status:
          (statusFilter as "ready" | "blocked" | "registered") ||
          (segment === "all" ? undefined : segment),
        classId: classValue.classId || undefined,
        search: search.trim() || undefined,
      }),
  });

  const register = useMutation({
    mutationFn: () => registerCohort(seriesId),
    onSuccess: () => {
      setActionError(null);
      void queryClient.invalidateQueries({ queryKey: ["schools", "exams"] });
    },
    onError: (error) => setActionError(getApiErrorMessage(error)),
  });

  const series = seriesQuery.data?.series;
  const tallies = rollQuery.data?.tallies ?? seriesQuery.data?.tallies;
  const rows = rollQuery.data?.rows ?? [];
  const blockers = rollQuery.data?.blockers ?? [];

  const columns = useMemo<ColumnDef<CandidateRow>[]>(
    () => [
      {
        id: "candidateNumber",
        header: "Cand no",
        // Four digits, allocated by the school, unique inside this centre and
        // this series only. Not the pupil number — both are drawn, in that
        // order, because a board schedule carries one and the office carries
        // the other.
        cell: ({ row }) => (
          <span className="font-mono text-xs font-semibold">
            {row.original.candidateNumber ?? "—"}
          </span>
        ),
      },
      {
        id: "pupil",
        header: "Pupil",
        cell: ({ row }) => (
          <PersonCell
            firstName={row.original.student.firstName}
            lastName={row.original.student.lastName}
            href={recordType("STUDENT").href(row.original.student.id)}
            reference={row.original.student.studentNo}
            context={
              row.original.certifiedName &&
              row.original.certifiedName.toLowerCase() !==
                `${row.original.student.firstName} ${row.original.student.lastName}`.toLowerCase()
                ? `Certificate: ${row.original.certifiedName}`
                : undefined
            }
          />
        ),
      },
      {
        id: "identity",
        header: "ID or birth certificate",
        cell: ({ row }) => (
          <RecordCell
            value={row.original.student.nationalId ?? row.original.student.birthCertificateNo}
            className="font-mono text-xs"
          />
        ),
      },
      {
        id: "born",
        header: "Born",
        cell: ({ row }) => (
          <span className="font-mono text-xs text-[color:var(--text-muted)]">
            {formatSchoolDate(row.original.student.dateOfBirth)}
          </span>
        ),
      },
      {
        id: "sex",
        header: "Sex",
        cell: ({ row }) => (
          <RecordCell value={row.original.student.gender?.slice(0, 1).toUpperCase()} />
        ),
      },
      {
        id: "subjects",
        header: "Subjects",
        cell: ({ row }) => (
          <span className="block text-right font-mono text-xs">{row.original.subjects}</span>
        ),
      },
      {
        id: "fees",
        header: "Entry fees",
        cell: ({ row }) => (
          <span className="flex items-center justify-end gap-2">
            <span className="font-mono text-xs">{formatSchoolMoney(row.original.fees.total)}</span>
            {row.original.fees.paid ? (
              <Badge tone="success">Paid</Badge>
            ) : row.original.fees.invoiced ? (
              <Badge tone="warn">Invoiced</Badge>
            ) : (
              <Badge tone="neutral">To invoice</Badge>
            )}
          </span>
        ),
      },
      {
        id: "registration",
        header: "Registration",
        cell: ({ row }) => {
          if (row.original.blockers.length > 0) {
            return (
              <span className="flex items-center gap-2">
                <Badge tone="danger">{row.original.blockers[0]}</Badge>
                <RecordActions
                  layout="inline"
                  size="sm"
                  resource="schools.exams"
                  verbs={[
                    {
                      label: "Fix it",
                      action: "edit",
                      onSelect: () => setFixing(row.original),
                    },
                  ]}
                />
              </span>
            );
          }
          if (row.original.status === "ENTERED") return <Badge tone="success">Registered</Badge>;
          return <Badge tone="brand">Ready to register</Badge>;
        },
      },
    ],
    [],
  );

  return (
    <SchoolsPage>
      <PageChrome title="Candidates" backHref="/schools/exams" backLabel="Exam series">
        <RecordActions
          layout="inline"
          resource="schools.exams"
          verbs={[
            {
              label: "Register the year group",
              action: "enter",
              loading: register.isPending,
              confirm: {
                title: "Register the year group as candidates",
                description:
                  "Every pupil on the roll for this cohort becomes a candidate with a number, in surname order. Nobody is entered for a subject yet, and a pupil with a missing birth certificate is still created — that is work the office has to see, not work to hide.",
                confirmLabel: "Register them",
              },
              onSelect: () => register.mutate(),
            },
          ]}
        />
      </PageChrome>

      {series ? (
        <PageCaption>
          {series.board.name} {series.name} · {EXAM_LEVEL_LABELS[series.level]}
          {series.centre ? ` · centre ${series.centre.number}` : ""}
        </PageCaption>
      ) : null}

      <ExamSeriesTabs seriesId={seriesId} />

      {actionError ? <SaveError what="That change" error={actionError} /> : null}

      {/* Before the roll. Seven days out, this is the work. */}
      <section className="space-y-2">
        <h2 className="flex items-baseline justify-between border-b border-[color:var(--border-subtle)] pb-1.5">
          <span className="text-sm font-semibold text-[color:var(--text-strong)]">
            What is stopping an entry
          </span>
          <span className="text-xs text-[color:var(--text-muted)]">
            {blockers.length > 0
              ? `${blockers.reduce((total, row) => total + row.count, 0)} to fix`
              : ""}
          </span>
        </h2>
        {rollQuery.isPending ? (
          <TableRowsSkeleton
            rows={4}
            headers={["Blocker", "Candidates", "Count", ""]}
            columns={[{}, {}, { width: 80, align: "right" }, { width: 190 }]}
          />
        ) : blockers.length === 0 ? (
          <NothingLeftToDo
            title="Nothing is stopping an entry"
            body="Every candidate on this roll has what the board asks for."
          />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-[color:var(--text-muted)]">
                <th className="w-[300px] py-1 font-normal">Blocker</th>
                <th className="py-1 font-normal">Candidates</th>
                <th className="w-[80px] py-1 text-right font-normal">Count</th>
                <th className="w-[190px] py-1 text-right font-normal">
                  <span className="sr-only">What clears it</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {blockers.map((row) => (
                <tr key={row.blocker} className="border-t border-[color:var(--border-subtle)]">
                  <td className="py-1.5">
                    <Badge tone="danger">{row.blocker}</Badge>
                  </td>
                  <td className="py-1.5 text-xs text-[color:var(--text-muted)]">
                    <span className="block truncate">{row.candidates.join(", ")}</span>
                  </td>
                  <td className="py-1.5 text-right font-mono text-xs font-bold">{row.count}</td>
                  <td className="py-1.5 text-right">
                    {/* A blocker is cleared somewhere, and where differs: a
                        missing birth certificate is a phone call home, a name
                        that differs is a decision somebody makes with two
                        documents in front of them, and a photograph is a
                        morning with a camera. Naming the job is the difference
                        between a list and a plan. */}
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setStatusFilter("blocked");
                        setSegment("blocked");
                      }}
                    >
                      {row.blocker === "No national ID or birth certificate"
                        ? `Ring the guardians`
                        : row.blocker === "No photograph"
                          ? "Take the photographs"
                          : row.blocker === "Name differs from the birth certificate"
                            ? "Compare and correct"
                            : `Chase all ${spellCount(row.count)}`}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="border-b border-[color:var(--border-subtle)] pb-1.5 text-sm font-semibold text-[color:var(--text-strong)]">
          The roll
        </h2>

        {rollQuery.error ? (
          <LoadError
            what="the candidate roll"
            error={rollQuery.error}
            onRetry={() => void rollQuery.refetch()}
          />
        ) : (
          <>
            <TableControls
              sticky
              tabs={
                <PopulationTabs<Segment>
                  value={segment}
                  onChange={setSegment}
                  tabs={[
                    { id: "all", label: "The whole roll", count: tallies?.candidates },
                    { id: "blocked", label: "Blocked", count: tallies?.cannotBeRegistered },
                    {
                      id: "registered",
                      label: "Registered",
                      count: (tallies?.candidates ?? 0) - (tallies?.readyToRegister ?? 0) - (tallies?.cannotBeRegistered ?? 0),
                    },
                  ]}
                />
              }
              search={
                <TableSearch
                  value={search}
                  onChange={setSearch}
                  placeholder="Search candidates or centre numbers"
                />
              }
              filterCount={activeFilterCount(classValue.classId, statusFilter)}
              filters={
                <>
                  <ClassFilter
                    label="Class"
                    allLabel={
                      series?.cohortLevel != null
                        ? `All of Form ${series.cohortLevel}`
                        : "All of the cohort"
                    }
                    value={classValue}
                    onChange={setClassValue}
                  />
                  <FilterSelect
                    label="Status"
                    allLabel="Any status"
                    value={statusFilter}
                    options={STATUS_OPTIONS}
                    onChange={setStatusFilter}
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
                      key={row.id}
                      leading={
                        <RecordMark
                          kind="student"
                          name={`${row.student.firstName} ${row.student.lastName}`}
                          size="sm"
                        />
                      }
                      title={`${row.candidateNumber ?? "—"} · ${row.student.lastName}, ${row.student.firstName}`}
                      subtitle={
                        row.blockers.length > 0
                          ? row.blockers.join(" · ")
                          : `${row.subjects} subjects · ${formatSchoolMoney(row.fees.total)}`
                      }
                      onClick={() => setFixing(row)}
                    />
                  ))}
                </MobileList>
              )}
              emptyState={
                rollQuery.isPending ? (
                  <TableRowsSkeleton
                    rows={8}
                    headers={[
                      "Cand no",
                      "Pupil",
                      "ID or birth certificate",
                      "Born",
                      "Sex",
                      "Subjects",
                      "Entry fees",
                      "Registration",
                    ]}
                    columns={[
                      { width: 78 },
                      { avatar: true, twoLine: true },
                      { width: 160 },
                      { width: 96 },
                      { width: 48 },
                      { width: 74, align: "right" },
                      { width: 130, badge: true },
                      { width: 200, badge: true },
                    ]}
                  />
                ) : statusFilter || classValue.classId || search.trim() || segment !== "all" ? (
                  <NothingMatched
                    what="candidates"
                    filters={[
                      STATUS_OPTIONS.find((option) => option.value === statusFilter)?.label,
                      segment === "blocked" ? "Blocked" : segment === "registered" ? "Registered" : null,
                    ].filter((entry): entry is string => Boolean(entry))}
                    search={search}
                    onClear={() => {
                      setStatusFilter("");
                      setClassValue({ classId: "", streamId: "" });
                      setSearch("");
                      setSegment("all");
                    }}
                  />
                ) : (
                  <NothingYet
                    title="Nobody has been registered for this series"
                    body="Register the year group and every pupil on the roll becomes a candidate with a number."
                  />
                )
              }
            />
          </>
        )}
      </section>

      <FixCandidateDialog
        seriesId={seriesId}
        candidate={fixing}
        onOpenChange={(next) => {
          if (!next) setFixing(null);
        }}
        onSaved={() => {
          setFixing(null);
          void queryClient.invalidateQueries({ queryKey: ["schools", "exams"] });
        }}
      />
    </SchoolsPage>
  );
}
