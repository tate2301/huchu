"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button } from "@corelithzw/react";
import { Badge } from "@/components/schools/common/status-badge";

import { PageChrome } from "@/components/layout/page-chrome";
import {
  LoadError,
  NothingLeftToDo,
  NothingMatched,
  NothingYet,
  SaveError,
  TableRowsSkeleton,
} from "@/components/records/states";
import { RecordActions } from "@/components/schools/common/record-actions";
import { SchoolsPage } from "@/components/schools/common/schools-page";
import { PageCaption } from "@/components/schools/records/page-caption";
import { PopulationTabs } from "@/components/schools/records/population-tabs";
import { getApiErrorMessage } from "@/lib/api-client";
import { Download } from "@/lib/icons";
import {
  EXAM_LEVEL_LABELS,
  buildEntryFile,
  fetchEntries,
  fetchSeries,
  invoiceEntries,
} from "@/lib/schools/exams-v2";
import { formatSchoolDayTime, formatSchoolMoney, spellCount } from "@/lib/schools/format";
import { EnterSubjectsDialog } from "@/components/schools/exams/enter-subjects-dialog";
import { ExamSeriesTabs } from "@/components/schools/exams/exam-series-tabs";

/**
 * Subject entries, and what they cost.
 *
 * The fee is per subject: ten subjects entered is ten fees, which is why
 * `Total fee` is a column beside `Entries` rather than a figure in the band.
 *
 * ## `Build the entry file` is not a submission
 *
 * `SCH-DEP-02` defers direct submission to the exam authority pending external
 * dependency and policy review, and the expansion plan re-confirms it. This
 * screen produces a file and **a human uploads it**. That is why the verb is a
 * band ghost rather than a primary action, why what it leaves behind is a
 * record of what was built rather than a receipt, and why nothing here may grow
 * a board integration. It is the first thing somebody will try to add and the
 * first thing a salesperson will promise; neither is allowed until the
 * dependency is lifted.
 */

type Segment = "subject" | "candidate";

export function ExamEntriesContent({ seriesId }: { seriesId: string }) {
  const queryClient = useQueryClient();
  const [segment, setSegment] = useState<Segment>("subject");
  const [outsideOnly, setOutsideOnly] = useState(false);
  const [enterOpen, setEnterOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [fileNote, setFileNote] = useState<string | null>(null);

  const seriesQuery = useQuery({
    queryKey: ["schools", "exams", "series", seriesId],
    queryFn: () => fetchSeries(seriesId),
  });

  const entriesQuery = useQuery({
    queryKey: ["schools", "exams", "entries", seriesId],
    queryFn: () => fetchEntries(seriesId),
  });

  const invoice = useMutation({
    mutationFn: () => invoiceEntries(seriesId),
    onSuccess: (result) => {
      setActionError(null);
      setFileNote(
        `${result.entries} entries invoiced across ${result.invoices} ${result.invoices === 1 ? "family" : "families"}.`,
      );
      void queryClient.invalidateQueries({ queryKey: ["schools", "exams"] });
    },
    onError: (error) => setActionError(getApiErrorMessage(error)),
  });

  const build = useMutation({
    mutationFn: () => buildEntryFile(seriesId),
    onSuccess: (result) => {
      setActionError(null);
      // The file goes to the person, not to the board. A download is the whole
      // of what this verb does.
      const blob = new Blob([result.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `entry-file-${seriesId}.csv`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
      setFileNote(
        `${result.entries} entries for ${result.candidates} candidates. Upload it to the board yourself — nothing has been sent.`,
      );
      void queryClient.invalidateQueries({ queryKey: ["schools", "exams"] });
    },
    onError: (error) => setActionError(getApiErrorMessage(error)),
  });

  const series = seriesQuery.data?.series;
  const page = entriesQuery.data;
  const rule = page?.rule;
  const outside = [...(rule?.below ?? []), ...(rule?.over ?? [])];

  return (
    <SchoolsPage>
      <PageChrome title="Subject entries" backHref="/schools/exams" backLabel="Exam series">
        <RecordActions
          layout="inline"
          resource="schools.exams"
          verbs={[
            {
              // The primary verb, because nothing else on this page can happen
              // until something is entered: the invoice, the entry file, the
              // seating and the results all read entries.
              label: "Enter a subject",
              action: "enter",
              onSelect: () => setEnterOpen(true),
            },
            {
              label: "Invoice the entries",
              action: "issue",
              loading: invoice.isPending,
              unavailable:
                Number(page?.totals.toInvoice ?? 0) === 0
                  ? "Every entry on this series has already been invoiced."
                  : undefined,
              confirm: {
                title: "Invoice the entry fees",
                description:
                  "One invoice per family, one line per subject, issued today. It goes onto the fee ledger like any other bill.",
                confirmLabel: "Invoice them",
              },
              onSelect: () => invoice.mutate(),
            },
            {
              // Rehoused off the band it used to hang from. Still not a
              // submission — it writes a file and hands it to you — so it
              // stays last, behind the two verbs that change the record.
              label: "Build the entry file",
              action: "enter",
              loading: build.isPending,
              confirm: {
                title: "Build the entry file",
                description:
                  "It writes a file of every entry on this series and downloads it to you. Nothing is sent to the board — submission is manual, and this is the record of what you built.",
                confirmLabel: "Build it",
              },
              onSelect: () => build.mutate(),
            },
          ]}
        />
      </PageChrome>

      {series ? (
        <PageCaption>
          {series.board.name} {series.name} · {EXAM_LEVEL_LABELS[series.level]}
          {series.feePerSubject ? ` · ${formatSchoolMoney(series.feePerSubject)} a subject` : ""}
        </PageCaption>
      ) : null}

      <ExamSeriesTabs seriesId={seriesId} />

      <EnterSubjectsDialog
        open={enterOpen}
        onOpenChange={setEnterOpen}
        seriesId={seriesId}
        onError={setActionError}
        onSaved={(entered) => {
          setEnterOpen(false);
          setActionError(null);
          setFileNote(
            `${entered} ${entered === 1 ? "subject" : "subjects"} entered. The fee follows on the next invoice run.`,
          );
          void queryClient.invalidateQueries({ queryKey: ["schools", "exams"] });
        }}
      />

      {actionError ? <SaveError what="That change" error={actionError} /> : null}
      {fileNote ? <Alert tone="info" title={fileNote} /> : null}

      {/* The rule, before the totals: a candidate entered for five subjects is
          a child short of a certificate, and it is not visible in a subject
          total. */}
      {rule && outside.length > 0 ? (
        <Alert
          tone="warn"
          title={`${outside.length} ${outside.length === 1 ? "candidate is" : "candidates are"} outside the rule — ${rule.below.length} below the minimum of ${rule.minimum}, ${rule.over.length} over the school maximum of ${rule.maximum}`}
          actions={
            <Button variant="ghost" size="sm" onClick={() => setOutsideOnly((only) => !only)}>
              {outsideOnly ? "Show everybody" : `Show the ${outside.length}`}
            </Button>
          }
        />
      ) : null}

      {entriesQuery.error ? (
        <LoadError
          what="the entries"
          error={entriesQuery.error}
          onRetry={() => void entriesQuery.refetch()}
        />
      ) : (
        <section className="space-y-2">
          <div className="flex items-center justify-between border-b border-[color:var(--border-subtle)] pb-1.5">
            <PopulationTabs<Segment>
              value={segment}
              onChange={setSegment}
              tabs={[
                { id: "subject", label: "By subject", count: page?.bySubject.length },
                { id: "candidate", label: "By candidate", count: page?.byCandidate.length },
              ]}
            />
            <span className="text-xs text-[color:var(--text-muted)]">
              {page ? `${page.totals.entries} entries` : ""}
            </span>
          </div>

          {entriesQuery.isPending ? (
            <TableRowsSkeleton
              rows={8}
              headers={["Subject", "Code", "Entries", "Total fee", "Invoiced", "Paid", "To invoice"]}
              columns={[
                {},
                { width: 70 },
                { width: 70, align: "right" },
                { width: 100, align: "right" },
                { width: 100, align: "right" },
                { width: 100, align: "right" },
                { width: 100, align: "right" },
              ]}
            />
          ) : segment === "subject" ? (
            page && page.bySubject.length > 0 ? (
              <table className="w-full text-sm">
                <caption className="sr-only">Subjects entered</caption>
                <thead>
                  <tr className="text-left text-xs text-[color:var(--text-muted)]">
                    <th className="py-1 font-normal">Subject</th>
                    <th className="w-[70px] py-1 font-normal">Code</th>
                    <th className="w-[70px] py-1 text-right font-normal">Entries</th>
                    <th className="w-[100px] py-1 text-right font-normal">Total fee</th>
                    <th className="w-[100px] py-1 text-right font-normal">Invoiced</th>
                    <th className="w-[100px] py-1 text-right font-normal">Paid</th>
                    <th className="w-[100px] py-1 text-right font-normal">To invoice</th>
                  </tr>
                </thead>
                <tbody>
                  {page.bySubject.map((row) => (
                    <tr key={row.examSubjectId} className="border-t border-[color:var(--border-subtle)]">
                      <td className="py-1.5">{row.subject}</td>
                      {/* The board's syllabus code, not the school's. */}
                      <td className="py-1.5 font-mono text-xs">{row.code}</td>
                      <td className="py-1.5 text-right font-mono text-xs">{row.entries}</td>
                      <td className="py-1.5 text-right font-mono text-xs">
                        {formatSchoolMoney(row.totalFee)}
                      </td>
                      <td className="py-1.5 text-right font-mono text-xs">
                        {formatSchoolMoney(row.invoiced)}
                      </td>
                      <td className="py-1.5 text-right font-mono text-xs text-[color:var(--tone-success)]">
                        {formatSchoolMoney(row.paid)}
                      </td>
                      <td
                        className={`py-1.5 text-right font-mono text-xs ${
                          Number(row.toInvoice) > 0 ? "text-[color:var(--tone-warn)]" : ""
                        }`}
                      >
                        {formatSchoolMoney(row.toInvoice)}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-[color:var(--border)]">
                    <td className="py-1.5 text-xs font-semibold" colSpan={2}>
                      {page.bySubject.length} subjects entered
                    </td>
                    <td className="py-1.5 text-right font-mono text-xs font-bold">
                      {page.totals.entries}
                    </td>
                    <td className="py-1.5 text-right font-mono text-xs font-bold">
                      {formatSchoolMoney(page.totals.totalFee)}
                    </td>
                    <td className="py-1.5 text-right font-mono text-xs font-bold">
                      {formatSchoolMoney(page.totals.invoiced)}
                    </td>
                    <td className="py-1.5 text-right font-mono text-xs font-bold">
                      {formatSchoolMoney(page.totals.paid)}
                    </td>
                    <td className="py-1.5 text-right font-mono text-xs font-bold">
                      {formatSchoolMoney(page.totals.toInvoice)}
                    </td>
                  </tr>
                </tbody>
              </table>
            ) : (
              <NothingYet
                title="Nothing has been entered yet"
                body="Enter a candidate for a subject and the fee it carries appears here."
              />
            )
          ) : outsideOnly && outside.length === 0 ? (
            <NothingMatched
              what="candidates"
              filters={["outside the subject rule"]}
              onClear={() => setOutsideOnly(false)}
            />
          ) : (
            <table className="w-full text-sm">
              <caption className="sr-only">Candidates and their subjects</caption>
              <thead>
                <tr className="text-left text-xs text-[color:var(--text-muted)]">
                  <th className="w-[80px] py-1 font-normal">Cand no</th>
                  <th className="py-1 font-normal">Pupil</th>
                  <th className="w-[120px] py-1 font-normal">Pupil number</th>
                  <th className="w-[120px] py-1 font-normal">Class</th>
                  <th className="w-[90px] py-1 text-right font-normal">Subjects</th>
                  <th className="w-[130px] py-1 text-right font-normal">Entry fees</th>
                </tr>
              </thead>
              <tbody>
                {(outsideOnly ? outside : (page?.byCandidate ?? [])).map((row) => {
                  const below = row.subjects < (rule?.minimum ?? 6);
                  const over = row.subjects > (rule?.maximum ?? 9);
                  return (
                    <tr key={row.id} className="border-t border-[color:var(--border-subtle)]">
                      <td className="py-1.5 font-mono text-xs font-semibold">
                        {row.candidateNumber ?? "—"}
                      </td>
                      <td className="py-1.5">
                        {row.student.lastName}, {row.student.firstName}
                      </td>
                      <td className="py-1.5 font-mono text-xs text-[color:var(--text-muted)]">
                        {row.student.studentNo}
                      </td>
                      <td className="py-1.5 text-xs text-[color:var(--text-muted)]">
                        {[row.student.className, row.student.streamName]
                          .filter(Boolean)
                          .join(" ") || "—"}
                      </td>
                      <td className="py-1.5 text-right">
                        <span className="flex items-center justify-end gap-2">
                          <span className="font-mono text-xs">{row.subjects}</span>
                          {below ? <Badge tone="danger">Below</Badge> : null}
                          {over ? <Badge tone="warn">Over</Badge> : null}
                        </span>
                      </td>
                      <td className="py-1.5 text-right font-mono text-xs">
                        {formatSchoolMoney(row.fees.total)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {rule && outside.length === 0 && !entriesQuery.isPending && page && page.totals.entries > 0 ? (
            <NothingLeftToDo
              title={`Every candidate is inside the rule — ${spellCount(rule.minimum)} to ${spellCount(rule.maximum)} subjects`}
              body="Nothing to chase before the file goes."
            />
          ) : null}
        </section>
      )}

      {/* The rule, drawn as two lists rather than two numbers. A candidate
          entered for five subjects is a child short of a certificate, and the
          only useful form of that fact is their name. */}
      {rule && outside.length > 0 ? (
        <section className="space-y-2">
          <h2 className="flex items-baseline justify-between border-b border-[color:var(--border-subtle)] pb-1.5">
            <span className="text-sm font-semibold text-[color:var(--text-strong)]">
              Candidates outside the rule
            </span>
            <span className="text-xs text-[color:var(--text-muted)]">
              {outside.length} of {page?.byCandidate.length ?? 0}
            </span>
          </h2>
          <div className="grid gap-6 lg:grid-cols-2">
            {[
              {
                key: "below",
                title: `Below the minimum of ${spellCount(rule.minimum)}`,
                rows: rule.below,
                tone: "danger" as const,
                note: "Short of a certificate. Enter them for more, or record why not.",
              },
              {
                key: "over",
                title: `Over the school maximum of ${spellCount(rule.maximum)}`,
                rows: rule.over,
                tone: "warn" as const,
                note: "The school's own ceiling, not the board's. Each extra subject is another fee.",
              },
            ].map((block) => (
              <div key={block.key} className="space-y-1.5">
                <h3 className="text-xs font-semibold text-[color:var(--text-strong)]">
                  {block.title}
                </h3>
                {block.rows.length === 0 ? (
                  <p className="text-xs text-[color:var(--text-muted)]">Nobody.</p>
                ) : (
                  <ul className="divide-y divide-[color:var(--border-subtle)]">
                    {block.rows.map((row) => (
                      <li key={row.id} className="flex items-baseline gap-2 py-1.5">
                        <span className="w-[70px] shrink-0 font-mono text-xs">
                          {row.candidateNumber ?? "—"}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm">
                          {row.student.lastName}, {row.student.firstName}
                        </span>
                        <Badge tone={block.tone}>{row.subjects} subjects</Badge>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-xs text-[color:var(--text-muted)]">{block.note}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-[color:var(--text-muted)]">
            Open each one on the candidate roll to fix it — the subjects are entered there,
            against the candidate.
          </p>
        </section>
      ) : null}

      {seriesQuery.data?.lastEntryFile ? (
        <p className="flex items-center gap-2 text-xs text-[color:var(--text-muted)]">
          <Download className="size-3.5" aria-hidden="true" />
          Last built {formatSchoolDayTime(seriesQuery.data.lastEntryFile.builtAt)} —{" "}
          {seriesQuery.data.lastEntryFile.entryCount} entries for{" "}
          {seriesQuery.data.lastEntryFile.candidateCount} candidates. A record of what was built,
          not a receipt from the board.
        </p>
      ) : null}
    </SchoolsPage>
  );
}
