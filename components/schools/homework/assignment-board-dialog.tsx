"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert, Badge, Button } from "@corelithzw/react";

import { RecordDialog } from "@/components/crm/records/record-dialog";
import { PersonAvatar } from "@/components/schools/common/person-avatar";
import { SendNoticeDialog } from "@/components/schools/common/send-notice-dialog";
import { LoadError, NothingLeftToDo, TableRowsSkeleton } from "@/components/schools/common/states";
import { useSchoolAccess } from "@/components/schools/common/use-school-access";
import { fetchJson } from "@/lib/api-client";

type SubmissionStatus = "DRAFT" | "SUBMITTED" | "LATE" | "RETURNED";

type BoardRow = {
  student: { id: string; studentNo: string; firstName: string; lastName: string };
  submission: {
    id: string;
    status: SubmissionStatus;
    submittedAt: string | null;
    score: number | null;
    feedback: string | null;
  } | null;
};

type Board = {
  assignment: {
    id: string;
    title: string;
    instructions: string | null;
    dueAt: string | null;
    maxScore: number | null;
    isPublished: boolean;
    classSubject: {
      id: string;
      classId: string;
      subject: { id: string; code: string; name: string };
      class: { id: string; code: string; name: string };
      stream: { id: string; code: string; name: string } | null;
    };
  };
  rows: BoardRow[];
  summary: { total: number; in: number; late: number; marked: number };
};

function statusBadge(submission: BoardRow["submission"]) {
  if (!submission) return <Badge tone="danger">Not handed in</Badge>;
  if (submission.status === "LATE") return <Badge tone="warn">In late</Badge>;
  if (submission.status === "RETURNED") return <Badge tone="success">Marked</Badge>;
  if (submission.status === "DRAFT") return <Badge tone="neutral">Started</Badge>;
  return <Badge tone="brand">Handed in</Badge>;
}

/** "21 Aug", or nothing at all where there is no deadline. */
function shortDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

/**
 * One piece of homework, opened from the oversight board.
 *
 * Every row of that board was a dead end: a deputy who spotted "4 of 31 handed
 * in" could read the number and do nothing about it. The two things they
 * actually want are here — the names of the children who have not handed in,
 * and one send to those children's families — and the missing names come first
 * because that is the list somebody has to work through. Who *has* handed in
 * follows, because "did Tanaka's come in" is the other question the same open
 * dialog gets asked.
 */
export function AssignmentBoardDialog({
  open,
  onOpenChange,
  assignmentId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignmentId: string;
}) {
  const access = useSchoolAccess();
  const [messaging, setMessaging] = useState(false);
  const [sent, setSent] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["schools", "assignments", "board", assignmentId],
    queryFn: () => fetchJson<Board>(`/api/v2/schools/assignments/${assignmentId}`),
    enabled: open,
  });

  const board = query.data;
  const missing = useMemo(
    () => (board?.rows ?? []).filter((row) => row.submission === null),
    [board],
  );
  const handedIn = useMemo(
    () => (board?.rows ?? []).filter((row) => row.submission !== null),
    [board],
  );

  const className = board
    ? [board.assignment.classSubject.class.name, board.assignment.classSubject.stream?.name]
        .filter(Boolean)
        .join(" ")
    : "the class";

  // Sending a notice is the head's grant, the same one the notices route
  // enforces — so the button says whose job it is rather than failing after
  // the dialog has been filled in.
  const canMessage = access.can("schools.reports", "create");
  const due = shortDate(board?.assignment.dueAt ?? null);

  return (
    <>
      <RecordDialog
        open={open}
        onOpenChange={onOpenChange}
        title={board?.assignment.title ?? "Homework"}
        description={
          board
            ? `${board.assignment.classSubject.subject.name} · ${className}${due ? ` · due ${due}` : " · no deadline"}`
            : "Reading the class list…"
        }
        size="lg"
        footer={
          <div className="flex flex-wrap items-center justify-end gap-2">
            {board ? (
              <span className="mr-auto text-[length:var(--type-body-sm)] tabular-nums text-[color:var(--text-muted)]">
                {board.summary.in} of {board.summary.total} handed in ·{" "}
                {board.summary.marked} marked
              </span>
            ) : null}
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button
              variant="primary"
              disabled={!canMessage || missing.length === 0}
              title={
                !canMessage
                  ? "Sending a notice to families is the head's to do."
                  : missing.length === 0
                    ? "Everybody has handed in — there is nobody to chase."
                    : undefined
              }
              onClick={() => setMessaging(true)}
            >
              Message the class
            </Button>
          </div>
        }
      >
        {sent ? (
          <Alert tone="success" title={sent} onDismiss={() => setSent(null)} />
        ) : null}

        {query.error ? (
          <LoadError
            what="the class list"
            error={query.error}
            onRetry={() => void query.refetch()}
          />
        ) : query.isPending ? (
          <TableRowsSkeleton columns={[{ avatar: true, twoLine: true }, { width: 120 }]} rows={6} />
        ) : !board ? null : (
          <div className="space-y-5">
            {board.assignment.instructions ? (
              <p className="text-[length:var(--type-body-sm)] text-[color:var(--text-body)]">
                {board.assignment.instructions}
              </p>
            ) : null}

            <section className="space-y-2">
              <h3 className="text-[length:var(--type-caption)] font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">
                Has not handed in · {missing.length}
              </h3>
              {missing.length === 0 ? (
                <NothingLeftToDo
                  title="Everybody has handed in"
                  body="There is nobody left to chase for this one."
                />
              ) : (
                <ul className="divide-y divide-[color:var(--border-subtle)] rounded-[var(--radius-lg)] border border-[color:var(--border)]">
                  {missing.map((row) => (
                    <li
                      key={row.student.id}
                      className="flex items-center gap-3 px-3 py-2"
                    >
                      <PersonAvatar
                        firstName={row.student.firstName}
                        lastName={row.student.lastName}
                        size="xs"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[length:var(--type-body-sm)] font-medium text-[color:var(--text-strong)]">
                          {row.student.lastName}, {row.student.firstName}
                        </p>
                        <p className="truncate font-[family-name:var(--font-mono)] text-[length:var(--type-caption)] text-[color:var(--text-muted)]">
                          {row.student.studentNo}
                        </p>
                      </div>
                      {statusBadge(null)}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="space-y-2">
              <h3 className="text-[length:var(--type-caption)] font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">
                In · {handedIn.length}
              </h3>
              {handedIn.length === 0 ? (
                <p className="text-[length:var(--type-body-sm)] text-[color:var(--text-muted)]">
                  Nothing has come back yet.
                </p>
              ) : (
                <ul className="divide-y divide-[color:var(--border-subtle)] rounded-[var(--radius-lg)] border border-[color:var(--border)]">
                  {handedIn.map((row) => (
                    <li
                      key={row.student.id}
                      className="flex items-center gap-3 px-3 py-2"
                    >
                      <PersonAvatar
                        firstName={row.student.firstName}
                        lastName={row.student.lastName}
                        size="xs"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[length:var(--type-body-sm)] font-medium text-[color:var(--text-strong)]">
                          {row.student.lastName}, {row.student.firstName}
                        </p>
                        <p className="truncate font-[family-name:var(--font-mono)] text-[length:var(--type-caption)] text-[color:var(--text-muted)]">
                          {row.student.studentNo}
                          {row.submission?.score !== null &&
                          row.submission?.score !== undefined
                            ? ` · ${row.submission.score}${board.assignment.maxScore ? ` of ${board.assignment.maxScore}` : ""}`
                            : ""}
                        </p>
                      </div>
                      {statusBadge(row.submission)}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </RecordDialog>

      {messaging && board ? (
        <SendNoticeDialog
          open
          onOpenChange={setMessaging}
          title="Message the class"
          audience={{
            // The families of the children who are actually missing, not the
            // whole form. Writing to thirty-one parents about four is how a
            // school teaches its families to stop opening the notices.
            studentIds: missing.map((row) => row.student.id),
            describe: `the families of the ${missing.length} in ${className} who have not handed in`,
          }}
          severity="WARNING"
          defaultSubject={`${board.assignment.classSubject.subject.name} homework still outstanding`}
          defaultBody={`"${board.assignment.title}" was set for ${className}${due ? ` and was due on ${due}` : ""}. It has not come back. Please make sure it is handed in at the next lesson.`}
          sendLabel="Send the reminder"
          onSent={(result) =>
            setSent(
              `Sent to ${result.recipients} ${result.recipients === 1 ? "family" : "families"}${
                result.withoutAccount > 0
                  ? ` · ${result.withoutAccount} have no portal account yet`
                  : ""
              }.`,
            )
          }
        />
      ) : null}
    </>
  );
}
