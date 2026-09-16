"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button } from "@corelithzw/react";

import { PageChrome } from "@/components/layout/page-chrome";
import {
  LoadError,
  NothingMatched,
  NothingYet,
  SaveError,
  StatsSkeleton,
  TableRowsSkeleton,
} from "@/components/records/states";
import { FilterSelect } from "@/components/schools/common/filter-select";
import { PageBand } from "@/components/schools/common/page-band";
import { PrintDocumentButton } from "@/components/schools/common/print-document-button";
import { RecordActions } from "@/components/schools/common/record-actions";
import { SchoolsPage } from "@/components/schools/common/schools-page";
import { PageCaption } from "@/components/schools/records/page-caption";
import { PopulationTabs } from "@/components/schools/records/population-tabs";
import {
  EXAM_LEVEL_LABELS,
  fetchResults,
  fetchSeriesIndex,
} from "@/lib/schools/exams-v2";
import { ExamSeriesTabs } from "@/components/schools/exams/exam-series-tabs";
import { CaptureResultsDialog } from "@/components/schools/exams/capture-results-dialog";

/**
 * Public results, by subject and by candidate.
 *
 * A pass is `C or better`, and the rule lives in `lib/schools/exam-grades.ts`
 * so the column, the stat and the comparison against last November all count
 * the same thing.
 *
 * The distribution bar collapses nine grades into six bands — `A*–A`, `B`, `C`,
 * `D–E`, `F–G`, `U` — because nine at that width is a stripe nobody can read,
 * and "A* to C" is the sentence a head actually says. **The individual
 * statement draws the real letter, not the band.**
 *
 * `Against last November` compares pass *rates*, not counts: a subject sat by
 * forty this year and sixty last is not "down twenty", and a screen that said
 * so would send a head to interrogate a department about a timetable change.
 */

const BANDS = ["A*–A", "B", "C", "D–E", "F–G", "U"] as const;

const BAND_COLOURS: Record<string, string> = {
  "A*–A": "bg-[color:var(--tone-success)]",
  B: "bg-[color:var(--brand)]",
  C: "bg-[color:var(--brand-soft)]",
  "D–E": "bg-[color:var(--tone-warn)]",
  "F–G": "bg-[color:var(--tone-warn-soft)]",
  U: "bg-[color:var(--tone-danger)]",
};

function Distribution({ bands, sat }: { bands: Record<string, number>; sat: number }) {
  return (
    <span className="flex h-2 w-full overflow-hidden rounded-full bg-[color:var(--surface-muted)]">
      {BANDS.map((band) => {
        const count = bands[band] ?? 0;
        if (count === 0) return null;
        return (
          <span
            key={band}
            className={BAND_COLOURS[band]}
            style={{ width: `${(count / Math.max(1, sat)) * 100}%` }}
            title={`${band}: ${count}`}
          />
        );
      })}
    </span>
  );
}

type Segment = "subject" | "candidate";

export function ExamResultsContent({ seriesId }: { seriesId: string }) {
  const queryClient = useQueryClient();
  const [segment, setSegment] = useState<Segment>("subject");
  const [compareId, setCompareId] = useState("");
  const [captureOpen, setCaptureOpen] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);

  const indexQuery = useQuery({
    queryKey: ["schools", "exams", "series", "all"],
    queryFn: () => fetchSeriesIndex({ status: "all" }),
  });

  const resultsQuery = useQuery({
    queryKey: ["schools", "exams", "results", seriesId, compareId],
    queryFn: () => fetchResults(seriesId, compareId || undefined),
  });

  const page = resultsQuery.data;

  const compareOptions = useMemo(
    () =>
      (indexQuery.data?.rows ?? [])
        .filter((row) => row.id !== seriesId)
        .map((row) => ({ value: row.id, label: `${row.board.name} ${row.name}` })),
    [indexQuery.data, seriesId],
  );

  return (
    <SchoolsPage
      band={
        <PageBand
          chips={[
            {
              label: "Statement received",
              value: page ? (page.statementReceived ? "Yes" : "Not yet") : "—",
              tone: page?.statementReceived ? "success" : "warn",
            },
            {
              label: compareId ? "Against that series" : "Against last series",
              value:
                page && page.subjects.length > 0
                  ? `${page.subjects.filter((row) => (row.against ?? 0) >= 0).length} held or rose`
                  : "—",
            },
            {
              label: "Subjects that fell",
              value: page?.subjectsThatFell ?? "—",
              tone: (page?.subjectsThatFell ?? 0) > 0 ? "warn" : "neutral",
            },
            {
              label: "Grades amended",
              value: page?.amended ?? "—",
              tone: (page?.amended ?? 0) > 0 ? "brand" : "neutral",
            },
          ]}
          actions={
            page ? (
              <PrintDocumentButton
                sourceKey="schools.report-card"
                filters={{ seriesId }}
                label="Print the statement"
              />
            ) : null
          }
        />
      }
    >
      <PageChrome title="Public results" backHref="/schools/exams" backLabel="Exam series">
        <RecordActions
          layout="inline"
          resource="schools.exams"
          verbs={[
            {
              label: "Capture results",
              action: "capture",
              onSelect: () => setCaptureOpen(true),
            },
          ]}
        />
      </PageChrome>

      {page ? (
        <PageCaption>
          {page.series.board.name} {page.series.name} · {EXAM_LEVEL_LABELS[page.series.level]} ·{" "}
          {page.candidates} candidates
        </PageCaption>
      ) : null}

      <ExamSeriesTabs seriesId={seriesId} />

      {captureError ? <SaveError what="Those grades" error={captureError} /> : null}

      {resultsQuery.error ? (
        <LoadError
          what="the results"
          error={resultsQuery.error}
          onRetry={() => void resultsQuery.refetch()}
        />
      ) : resultsQuery.isPending ? (
        <StatsSkeleton count={4} label="Reading the results" />
      ) : page && page.subjects.length === 0 ? (
        <NothingYet
          title="No grades have been captured for this series"
          body="A public exam grade is a letter with no score. Capture them off the board's statement and this page starts answering."
          action={<Button onClick={() => setCaptureOpen(true)}>Capture results</Button>}
        />
      ) : page ? (
        <>
          {/* Four stats, and `Five or more at C` is the one a head reads out. */}
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Candidates", value: page.stats.candidates },
              { label: "Five or more at C", value: page.stats.fiveOrMoreAtC },
              { label: "A* and A grades", value: page.stats.aStarAndA },
              { label: "Ungraded", value: page.stats.ungraded },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color:var(--surface-base)] p-3"
              >
                <dt className="text-xs text-[color:var(--text-muted)]">{stat.label}</dt>
                <dd className="font-mono text-xl font-bold tabular-nums">{stat.value}</dd>
              </div>
            ))}
          </dl>

          <section className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[color:var(--border-subtle)] pb-1.5">
              <PopulationTabs<Segment>
                value={segment}
                onChange={setSegment}
                tabs={[
                  { id: "subject", label: "By subject", count: page.subjects.length },
                  { id: "candidate", label: "By candidate", count: page.byCandidate.length },
                ]}
              />
              <FilterSelect
                label="Compare with"
                allLabel="Nothing"
                value={compareId}
                options={compareOptions}
                onChange={setCompareId}
              />
            </div>

            {compareId && page.subjects.every((row) => row.against == null) ? (
              <NothingMatched
                what="comparisons"
                filters={["that series"]}
                onClear={() => setCompareId("")}
              />
            ) : null}
            {segment === "subject" ? (
              <table className="w-full text-sm">
                <caption className="sr-only">Grades by subject</caption>
                <thead>
                  <tr className="text-left text-xs text-[color:var(--text-muted)]">
                    <th className="py-1 font-normal">Subject</th>
                    <th className="w-[70px] py-1 font-normal">Code</th>
                    <th className="w-[60px] py-1 text-right font-normal">Sat</th>
                    <th className="w-[200px] py-1 font-normal">A* to U</th>
                    <th className="w-[110px] py-1 text-right font-normal">C or better</th>
                    <th className="w-[120px] py-1 text-right font-normal">
                      {compareId ? "Against it" : "Against last"}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {page.subjects.map((row) => (
                    <tr key={row.code} className="border-t border-[color:var(--border-subtle)]">
                      <td className="py-1.5">{row.subject}</td>
                      <td className="py-1.5 font-mono text-xs">{row.code}</td>
                      <td className="py-1.5 text-right font-mono text-xs">{row.sat}</td>
                      <td className="py-1.5">
                        <Distribution bands={row.bands} sat={row.sat} />
                      </td>
                      <td className="py-1.5 text-right font-mono text-xs font-bold">
                        {row.passRate}%
                      </td>
                      <td
                        className={`py-1.5 text-right font-mono text-xs ${
                          row.against == null
                            ? "text-[color:var(--text-faint)]"
                            : row.against < 0
                              ? "text-[color:var(--status-error-text)]"
                              : "text-[color:var(--tone-success)]"
                        }`}
                      >
                        {row.against == null
                          ? "—"
                          : `${row.against > 0 ? "+" : ""}${row.against} pts`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="space-y-3">
                {page.byCandidate.map((candidate) => (
                  <div
                    key={candidate.candidateId}
                    className="rounded-[var(--radius-md)] border border-[color:var(--border)] p-3"
                  >
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="font-mono text-xs font-semibold">
                        {candidate.candidateNumber ?? "—"}
                      </span>
                      <span className="text-[12.5px] font-semibold">{candidate.name}</span>
                      <span className="text-xs text-[color:var(--text-muted)]">
                        {candidate.passes} at C or better
                        {candidate.ungraded > 0 ? ` · ${candidate.ungraded} ungraded` : ""}
                      </span>
                    </div>
                    <ul className="mt-1.5 flex flex-wrap gap-1.5">
                      {/* The real letter, not the band. */}
                      {candidate.grades.map((grade) => (
                        <li key={`${candidate.candidateId}-${grade.code}`}>
                          <Badge tone={grade.isRemark ? "brand" : "neutral"}>
                            {grade.subject} {grade.grade}
                            {grade.points != null ? ` · ${grade.points}` : ""}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      ) : (
        <TableRowsSkeleton
          rows={8}
          headers={["Subject", "Code", "Sat", "A* to U", "C or better", "Against last"]}
          columns={[
            {},
            { width: 70 },
            { width: 60, align: "right" },
            { width: 200 },
            { width: 110, align: "right" },
            { width: 120, align: "right" },
          ]}
        />
      )}

      {page && page.byCandidate.length > 0 ? (
        <section className="space-y-2">
          <h2 className="flex items-baseline justify-between border-b border-[color:var(--border-subtle)] pb-1.5">
            <span className="text-sm font-semibold text-[color:var(--text-strong)]">
              Where these grades came from
            </span>
            <span className="text-xs text-[color:var(--text-muted)]">
              {page.amended > 0
                ? `${page.amended} amended after a remark`
                : "None amended"}
            </span>
          </h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-[color:var(--text-muted)]">
                <th className="py-1 font-normal">What</th>
                <th className="w-[220px] py-1 font-normal">Who</th>
                <th className="w-[160px] py-1 font-normal">When</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-[color:var(--border-subtle)]">
                <td className="py-1.5">
                  The board&rsquo;s statement of results
                  <span className="block text-xs text-[color:var(--text-muted)]">
                    Captured by hand off the statement. Nothing arrives from the board over a
                    wire — direct submission and direct retrieval are both deferred.
                  </span>
                </td>
                <td className="py-1.5 text-xs">{page.series.board.name}</td>
                <td className="py-1.5 font-mono text-xs">
                  {page.statementReceived ? "Received" : "Not yet received"}
                </td>
              </tr>
              <tr className="border-t border-[color:var(--border-subtle)]">
                <td className="py-1.5">
                  Grades on the system
                  <span className="block text-xs text-[color:var(--text-muted)]">
                    A letter and no score. A pass is C or better, counted the same way in the
                    column, the stat and the comparison.
                  </span>
                </td>
                <td className="py-1.5 text-xs">
                  {page.byCandidate.reduce((total, row) => total + row.grades.length, 0)} grades
                  across {page.byCandidate.length} candidates
                </td>
                <td className="py-1.5 font-mono text-xs">
                  {page.subjects.length} subjects
                </td>
              </tr>
              {page.amended > 0 ? (
                <tr className="border-t border-[color:var(--border-subtle)]">
                  <td className="py-1.5">
                    Amended after a remark
                    <span className="block text-xs text-[color:var(--text-muted)]">
                      Kept beside the original rather than over it, so the first grade is still on
                      the record.
                    </span>
                  </td>
                  <td className="py-1.5 text-xs">{page.amended} grades</td>
                  <td className="py-1.5 font-mono text-xs">On the candidate</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>
      ) : null}

      <CaptureResultsDialog
        open={captureOpen}
        onOpenChange={setCaptureOpen}
        seriesId={seriesId}
        onError={setCaptureError}
        onSaved={() => {
          setCaptureOpen(false);
          setCaptureError(null);
          void queryClient.invalidateQueries({ queryKey: ["schools", "exams", "results"] });
        }}
      />
    </SchoolsPage>
  );
}
