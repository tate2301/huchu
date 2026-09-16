"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@corelithzw/react";
import { Badge } from "@/components/schools/common/status-badge";

import { RecordDialog } from "@/components/crm/records/record-dialog";
import { RecordCell } from "@/components/records/record-table";
import { PersonCell } from "@/components/schools/common/identity-cell";
import { LoadError, NothingYet, TableRowsSkeleton } from "@/components/records/states";
import { NumericCell } from "@/components/ui/numeric-cell";
import { fetchResultSheet, type ResultModerationAction } from "@/lib/schools/results-v2";
import { SheetStateBadge, formatDay } from "@/components/schools/results/sheet-state";

/**
 * What is actually on a sheet, and what has happened to it.
 *
 * Every row in the results area used to be a dead end: a mark sheet listed its
 * average and its state and could not be opened, so "why was Shona 2A sent
 * back?" had no answer anywhere in the product even though the note was in the
 * database. This panel is the answer — the marks, and the moderation trail with
 * the note each step carried.
 */

const ACTION_WORDS: Record<ResultModerationAction["actionType"], string> = {
  SUBMIT: "Submitted",
  REQUEST_CHANGES: "Sent back",
  HOD_APPROVE: "Approved",
  PUBLISH: "Published",
  UNPUBLISH: "Pulled back",
};

export function SheetDetailDialog({
  sheetId,
  onOpenChange,
}: {
  sheetId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const query = useQuery({
    queryKey: ["schools", "results", "sheet", sheetId],
    queryFn: () => fetchResultSheet(sheetId as string),
    enabled: Boolean(sheetId),
  });

  const sheet = query.data ?? null;
  const average = useMemo(() => {
    if (!sheet || sheet.lines.length === 0) return null;
    const total = sheet.lines.reduce((sum, line) => sum + line.score, 0);
    return total / sheet.lines.length;
  }, [sheet]);

  return (
    <RecordDialog
      open={Boolean(sheetId)}
      onOpenChange={onOpenChange}
      size="xl"
      title={sheet?.title ?? "Mark sheet"}
      description={
        sheet
          ? `${sheet.class.name}${sheet.stream ? ` ${sheet.stream.name}` : ""} · ${sheet.term.name}`
          : "Opening the sheet…"
      }
      footer={
        <Button variant="secondary" onClick={() => onOpenChange(false)}>
          Close
        </Button>
      }
    >
      {query.error ? (
        <LoadError what="this mark sheet" error={query.error} onRetry={() => void query.refetch()} />
      ) : null}

      {query.isLoading ? (
        <TableRowsSkeleton columns={[{ twoLine: true }, { width: 90 }, { width: 70 }]} rows={6} />
      ) : null}

      {sheet ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <SheetStateBadge status={sheet.status} />
            <Badge tone="outline">
              {sheet.lines.length} mark{sheet.lines.length === 1 ? "" : "s"}
            </Badge>
            {average !== null ? <Badge tone="outline">Mean {average.toFixed(1)}</Badge> : null}
          </div>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold">What has happened to it</h3>
            {sheet.moderationActions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing yet — this sheet has not left the teacher&rsquo;s hands.
              </p>
            ) : (
              <ol className="space-y-2">
                {sheet.moderationActions.map((action) => (
                  <li
                    key={action.id}
                    className="rounded-[var(--radius-md)] border border-[color:var(--border-subtle)] px-3 py-2"
                  >
                    {/* Who, what and when on one fixed line, then the note
                        underneath at whatever length it runs to. Inline, the
                        two facts a reader scans a trail for were mixed into
                        the same run as the thing that was said. */}
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="text-sm font-medium text-[color:var(--text-strong)]">
                        {ACTION_WORDS[action.actionType]}
                      </span>
                      <span className="font-mono text-sm text-[color:var(--text-subtle)]">
                        {action.actor.name ?? "Somebody"} · {formatDay(action.actedAt)}
                      </span>
                    </div>
                    {action.comment ? (
                      <p className="mt-1.5 text-sm text-[color:var(--text-body)]">
                        {action.comment}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold">The marks</h3>
            {sheet.lines.length === 0 ? (
              <NothingYet
                title="Nothing marked on this sheet yet"
                body="Marks arrive here when the mark book is written to the result sheet, under the year group's assessments."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[color:var(--border-subtle)] text-left text-sm text-[color:var(--text-muted)]">
                      <th className="py-2 pr-3 font-medium">Pupil</th>
                      <th className="py-2 pr-3 font-medium">Subject</th>
                      <th className="py-2 pr-3 text-right font-medium">Mark</th>
                      <th className="py-2 pr-3 font-medium">Grade</th>
                      <th className="py-2 font-medium">Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sheet.lines.map((line) => (
                      <tr key={line.id} className="border-b border-[color:var(--border-subtle)]">
                        {/* The same cell the roll draws, minus the link. A
                            pupil's name is a record reference everywhere else
                            and peeks on a plain click — but the peek opens as
                            a sheet, and a sheet over a dialog is two overlays
                            deep before anybody has read a mark. Whoever has
                            this open came for the marks, not the children. */}
                        <td className="py-2 pr-3">
                          <PersonCell
                            kind="student"
                            firstName={line.student.firstName}
                            lastName={line.student.lastName}
                            displayName={`${line.student.lastName}, ${line.student.firstName}`}
                            reference={line.student.studentNo}
                          />
                        </td>
                        {/* A code is compared rather than read, so it gets
                            the face every other code in the product has —
                            mono and tabular, which is what lets the eye run
                            down the column and catch the one that differs. */}
                        <td className="py-2 pr-3">
                          <RecordCell kind="code" value={line.subjectCode} />
                        </td>
                        <td className="py-2 pr-3">
                          <NumericCell>{line.score.toFixed(1)}</NumericCell>
                        </td>
                        <td className="py-2 pr-3">{line.grade ?? "—"}</td>
                        <td className="py-2 text-[color:var(--text-muted)]">
                          {line.remarks ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : null}
    </RecordDialog>
  );
}
