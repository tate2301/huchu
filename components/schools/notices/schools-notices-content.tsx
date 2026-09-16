"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Badge, Button, Card } from "@corelithzw/react";

import { PageChrome } from "@/components/layout/page-chrome";
import { EntityLink } from "@/components/records/entity-link";
import { recordCellTone } from "@/components/records/record-table";
import { DataTable } from "@/components/ui/data-table";
import { NumericCell } from "@/components/ui/numeric-cell";
import { FilterSelect } from "@/components/schools/common/filter-select";
import { CreateButton, RecordActions } from "@/components/schools/common/record-actions";
import {
  LoadError,
  NothingMatched,
  NothingYet,
  SaveError,
  TableRowsSkeleton,
} from "@/components/records/states";
import { RecordDialog } from "@/components/crm/records/record-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { recordType } from "@/lib/records/registry";
import { updateSentNotice, type NoticeSeverity } from "@/lib/schools/notices-v2";
import {
  fetchSchoolsClasses,
  fetchSchoolsGuardians,
  fetchSchoolsStudents,
  fetchSchoolsTerms,
} from "@/lib/schools/admin-v2";
import { formatSchoolDate } from "@/lib/schools/format";

import { SendNoticeDialog, type Correcting, type NoticeDraft } from "./send-notice-dialog";
import { useClassVocabulary } from "@/components/schools/common/use-class-vocabulary";

/**
 * What the school has told people, and the way to tell them something.
 *
 * This screen used to be the signed-in administrator's own inbox — the notices
 * *they* had received — which is a strange thing to put under a school's
 * Notices heading and left the office with no way to send anything at all. The
 * portals have rendered a notice board since S-6.x; nothing could write to it.
 *
 * So it is the sent list now, with the reach beside each row. "Read by 12 of
 * 58" is the only honest measure of whether a notice landed, and the count of
 * families with no portal account is the school's to-do list: a notice cannot
 * reach a guardian who was never invited.
 *
 * ── Two verbs, and the difference between them ─────────────────────────────
 *
 * A notice cannot be recalled, and there is no delete here for that reason: a
 * letter the school demonstrably sent may not vanish out of the school's own
 * record. But there are two different things an office means by "that notice is
 * wrong", and for a long time this screen offered only one of them.
 *
 * *Fix the wording* edits the stored row. It is the right verb for a typo, a
 * wrong room number, a name spelled wrong — and it is smaller than the word
 * "edit" usually implies, which the dialog says out loud. Nothing in this
 * product delivers a notice; the portals read the row. So an edit changes what
 * a family sees the next time they open the app and tells nobody: the hundreds
 * who read it this morning keep the version they read and get no second ping.
 * Before this existed, "Sports day moved to Firday" was in eleven hundred
 * portals for the rest of the year.
 *
 * *Send a correction* is the verb for anything that changes what a family has
 * to do. It is a second notice, addressed to exactly the people the first one
 * reached, carrying a link back to it — the only correction that actually
 * arrives anywhere.
 *
 * An edited notice carries "Edited" in the list, because the office's own list
 * is the only place the change is visible at all.
 *
 * ── The filter row ─────────────────────────────────────────────────────────
 *
 * Four filters, each named here with the unnarrowed choice the canvas gives it:
 *
 *   Who it was for = Every audience
 *   Class = The whole school
 *   Importance = Any importance
 *   When = This term
 *
 * All four narrow the sent list in the browser rather than at the endpoint: a
 * term's notices are tens of rows, not thousands, and the reach panel beside
 * the table has to count the same set the table is drawn from.
 *
 * ── Why this is a table and not a record list ──────────────────────────────
 *
 * Classes, subjects and the rest of the campus registers are lists: rows you
 * open, where the whole row is a link and the underline on the title promises
 * a page. A notice has no page. It is written, sent, and read in the portals;
 * there is nowhere in the office for a row to go, and a list row that opens
 * nothing is an underline making a promise it cannot keep.
 *
 * What the reader is doing here is a column question besides: four of the six
 * columns — when it went, how far it reached, how urgent it was, when it stops
 * showing — are compared down the column rather than read across one row. That
 * is what the reach bar is for; "894 of 1,106" and "44 of 48" are the same
 * story and only one of them looks like it. So the shape is a register, and
 * the verb sits behind one trigger at the end of the row like every other.
 */

type SentNotice = {
  id: string;
  title: string;
  summary: string;
  severity: string;
  audience: string;
  audienceCode: "ALL" | "PARENTS" | "STUDENTS" | "TEACHERS";
  classId: string | null;
  className: string | null;
  createdAt: string;
  expiresAt: string | null;
  /** Set once the wording has been put right in place. See the verbs above. */
  editedAt: string | null;
  recipients: number;
  read: number;
};

/** A notice being reworded, as the list knows it. */
type Editing = {
  id: string;
  title: string;
  body: string;
  severity: NoticeSeverity;
  sentOn: string;
  recipients: number;
  read: number;
};

const AUDIENCES = [
  { value: "PARENTS", label: "Parents and guardians" },
  { value: "STUDENTS", label: "Pupils" },
  { value: "TEACHERS", label: "Teachers" },
  { value: "ALL", label: "Everyone" },
];

const IMPORTANCE = [
  { value: "CRITICAL", label: "Urgent" },
  { value: "WARNING", label: "Important" },
  { value: "INFO", label: "Notice" },
];

const WHEN = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "all", label: "Everything the school has sent" },
];

const SHORT_DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

function severityBadge(severity: string) {
  if (severity === "CRITICAL") return <Badge tone="danger">Urgent</Badge>;
  if (severity === "WARNING") return <Badge tone="warn">Important</Badge>;
  return <Badge tone="outline">Notice</Badge>;
}

function severityCode(severity: string): NoticeDraft["severity"] {
  return severity === "CRITICAL" ? "CRITICAL" : severity === "WARNING" ? "WARNING" : "INFO";
}

export function SchoolsNoticesContent() {
  const queryClient = useQueryClient();
  const [composing, setComposing] = useState(false);
  const [correcting, setCorrecting] = useState<Correcting | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [sent, setSent] = useState<{ recipients: number; withoutAccount: number } | null>(
    null,
  );

  const [audience, setAudience] = useState("");
  const [classId, setClassId] = useState("");
  const [importance, setImportance] = useState("");
  const [when, setWhen] = useState("");

  const query = useQuery({
    queryKey: ["schools", "notices", "sent"],
    queryFn: () => fetchJson<{ data: SentNotice[] }>("/api/v2/schools/notices?scope=sent"),
  });

  const classesQuery = useQuery({
    queryKey: ["schools", "classes", "notices"],
    queryFn: () => fetchSchoolsClasses({ limit: 100 }),
  });

  const termsQuery = useQuery({
    queryKey: ["schools", "terms", "notices"],
    queryFn: () => fetchSchoolsTerms({ limit: 100 }),
  });

  /**
   * Who a notice structurally cannot reach. Two counts rather than one, because
   * the fix differs: a guardian is invited from Guardians, a pupil from
   * Students, and "61 people" with no breakdown tells an office nothing about
   * where to start.
   */
  const unreachableQuery = useQuery({
    queryKey: ["schools", "notices", "unreachable"],
    queryFn: () =>
      Promise.all([
        fetchSchoolsGuardians({ limit: 1, hasPortalAccount: false }),
        fetchSchoolsStudents({ limit: 1, status: "ACTIVE", hasPortalAccount: false }),
      ]).then(([guardians, students]) => ({
        guardians: guardians.pagination.total,
        students: students.pagination.total,
      })),
  });

  const send = useMutation({
    mutationFn: (draft: NoticeDraft) =>
      fetchJson<{ recipients: number; withoutAccount: number }>("/api/v2/schools/notices", {
        method: "POST",
        body: JSON.stringify({
          title: draft.title.trim(),
          body: draft.body.trim(),
          audience: draft.audience,
          classId: draft.classId || null,
          severity: draft.severity,
          correctsNoticeId: draft.correctsNoticeId,
        }),
      }),
    onSuccess: (result) => {
      setComposing(false);
      setCorrecting(null);
      setSent(result);
      void queryClient.invalidateQueries({ queryKey: ["schools", "notices"] });
    },
  });

  const edit = useMutation({
    mutationFn: (draft: { id: string; title: string; body: string; severity: NoticeSeverity }) =>
      updateSentNotice({
        id: draft.id,
        title: draft.title.trim(),
        body: draft.body.trim(),
        severity: draft.severity,
      }),
    onSuccess: () => {
      setEditing(null);
      void queryClient.invalidateQueries({ queryKey: ["schools", "notices"] });
    },
  });

  const rows = useMemo(() => query.data?.data ?? [], [query.data]);
  const classes = classesQuery.data?.data ?? [];
  const activeTerm = useMemo(() => {
    const terms = termsQuery.data?.data ?? [];
    return terms.find((term) => term.isActive) ?? terms[0] ?? null;
  }, [termsQuery.data]);

  /** The term's own window, so "this term" means the term and not thirty days. */
  const termWindow = useMemo(() => {
    if (!activeTerm) return null;
    return { from: activeTerm.startDate.slice(0, 10), to: activeTerm.endDate.slice(0, 10) };
  }, [activeTerm]);

  const thisTerm = useMemo(() => {
    // "This term" is the term's own dates rather than a rolling thirty days,
    // because a head asking what has gone out this term means the term.
    if (when === "all") return rows;
    if (when === "7" || when === "30") {
      const cut = new Date();
      cut.setDate(cut.getDate() - Number(when));
      const from = cut.toISOString().slice(0, 10);
      return rows.filter((notice) => notice.createdAt.slice(0, 10) >= from);
    }
    if (!termWindow) return rows;
    return rows.filter((notice) => {
      const on = notice.createdAt.slice(0, 10);
      return on >= termWindow.from && on <= termWindow.to;
    });
  }, [rows, when, termWindow]);

  const filtered = useMemo(
    () =>
      thisTerm.filter((notice) => {
        if (audience && notice.audienceCode !== audience) return false;
        if (classId && notice.classId !== classId) return false;
        if (importance && severityCode(notice.severity) !== importance) return false;
        return true;
      }),
    [thisTerm, audience, classId, importance],
  );

  const reach = useMemo(() => {
    const recipients = thisTerm.reduce((total, row) => total + row.recipients, 0);
    const read = thisTerm.reduce((total, row) => total + row.read, 0);
    return {
      sent: thisTerm.length,
      recipients,
      read,
      unread: recipients - read,
      averageRead: recipients > 0 ? Math.round((read / recipients) * 100) : 0,
    };
  }, [thisTerm]);

  const unreachable = unreachableQuery.data ?? null;
  const anyFilter = Boolean(audience || classId || importance);

  /**
   * What the reach panel is counting, named.
   *
   * The panel is drawn from `thisTerm` — the When filter's window — so the
   * heading has to move with it. "Reach, this term" over a set narrowed to the
   * last seven days is the panel lying about its own scope, and this is the
   * card an office quotes at a governors' meeting.
   */
  const reachWindowLabel =
    when === "7"
      ? "Reach, the last 7 days"
      : when === "30"
        ? "Reach, the last 30 days"
        : when === "all"
          ? "Reach, everything sent"
          : activeTerm
            ? `Reach, ${activeTerm.name.toLowerCase()}`
            : "Reach, this term";

  const words = useClassVocabulary();
  const columns = useMemo<ColumnDef<SentNotice>[]>(
    () => [
      {
        id: "createdAt",
        header: "Sent",
        cell: ({ row }) => (
          <NumericCell>{SHORT_DATE.format(new Date(row.original.createdAt))}</NumericCell>
        ),
      },
      {
        id: "title",
        header: "Notice",
        // Not `RecordNameCell`, and this is the one place in the module that
        // is not. That cell sets its supporting line in mono, which is right
        // where the line is an identifier read character by character — an
        // admission number, a subject code — and wrong here, where it is the
        // first sentence of a letter. A notice has no reference to put there
        // instead; what tells two of them apart is what they say.
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="font-medium">{row.original.title}</div>
            <div className="line-clamp-1 text-[length:var(--type-caption)] text-[color:var(--text-muted)]">
              {row.original.summary}
              {/* The office's list is the only place an edit shows. Nobody who
                  received the notice is told it was reworded, so a row that
                  did not say so would leave the school unable to tell what it
                  sent on Monday from what it says now. */}
              {row.original.editedAt ? (
                <span className="ml-1 italic">
                  · Edited {SHORT_DATE.format(new Date(row.original.editedAt))}
                </span>
              ) : null}
            </div>
          </div>
        ),
      },
      {
        id: "audience",
        header: "Audience",
        cell: ({ row }) => (
          // `block truncate` on the cell rather than on the link: the link is
          // an inline child and will not clamp itself, and a long year-group
          // name wrapping makes its row twice as tall as its neighbours.
          <span className="block truncate">
            {row.original.audience}
            {row.original.classId && row.original.className ? (
              <>
                {" · "}
                {/* "What else has Form 2 been told" is the question this cell
                    gets asked, so the class is the way there. */}
                <EntityLink
                  href={recordType("CLASS").href(row.original.classId)}
                  className={recordCellTone("relation")}
                >
                  {row.original.className}
                </EntityLink>
              </>
            ) : null}
          </span>
        ),
      },
      {
        id: "severity",
        header: "Importance",
        cell: ({ row }) => severityBadge(row.original.severity),
      },
      {
        id: "reach",
        header: "Read",
        cell: ({ row }) => {
          const record = row.original;
          const pct = record.recipients > 0 ? (record.read / record.recipients) * 100 : 0;
          return (
            <div className="min-w-[110px]">
              <NumericCell>
                {record.read.toLocaleString()} of {record.recipients.toLocaleString()}
              </NumericCell>
              {/* The bar earns its place: "894 of 1,106" and "44 of 48" are the
                  same story, and only one of them looks like it. */}
              <div className="mt-1 h-1 w-full rounded-full bg-[color:var(--border-subtle)]">
                <div
                  className="h-1 rounded-full bg-[color:var(--tone-success)]"
                  style={{ width: `${Math.round(pct)}%` }}
                />
              </div>
            </div>
          );
        },
      },
      {
        id: "expiresAt",
        header: "Expires",
        cell: ({ row }) => (
          <NumericCell>
            {row.original.expiresAt
              ? SHORT_DATE.format(new Date(row.original.expiresAt))
              : "—"}
          </NumericCell>
        ),
      },
      {
        id: "verbs",
        // An affordance, not a field — but the head still needs the cell, or
        // every column below it shifts by one.
        header: () => <span className="sr-only">Row actions</span>,
        cell: ({ row }) => (
          <div className="flex justify-end">
            <RecordActions
              layout="menu"
              resource="schools.reports"
              label={`Actions for “${row.original.title}”`}
              verbs={[
                {
                  // Named for what it actually does. "Edit" would promise the
                  // families are told; they are not, and the dialog says so
                  // before anything is saved.
                  label: "Fix the wording",
                  action: "notify-families",
                  onSelect: () => {
                    setSent(null);
                    setEditing({
                      id: row.original.id,
                      title: row.original.title,
                      body: row.original.summary,
                      severity: severityCode(row.original.severity),
                      sentOn: formatSchoolDate(row.original.createdAt),
                      recipients: row.original.recipients,
                      read: row.original.read,
                    });
                  },
                },
                {
                  label: "Send a correction",
                  // The grant the endpoint actually checks. It was `create`,
                  // which only the head holds, so the bursar and the class
                  // teacher — the two roles that write to families most — had
                  // this greyed out on a route they are allowed to call.
                  action: "notify-families",
                  onSelect: () => {
                    setSent(null);
                    setCorrecting({
                      id: row.original.id,
                      title: row.original.title,
                      audience: row.original.audienceCode,
                      classId: row.original.classId,
                      severity: severityCode(row.original.severity),
                      sentOn: formatSchoolDate(row.original.createdAt),
                    });
                    setComposing(true);
                  },
                },
              ]}
            />
          </div>
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-3">
      <PageChrome title="Notices">
        <CreateButton
          resource="schools.reports"
          // Not `create`, which is the head's alone. Sending is
          // `notify-families`, and the button has to be gated on the grant the
          // endpoint checks or the bursar sees a button that answers 403.
          action="notify-families"
          label="Send a notice"
          onSelect={() => {
            setSent(null);
            setCorrecting(null);
            setComposing(true);
          }}
        />
      </PageChrome>

      {edit.error ? <SaveError what="The change" error={edit.error} /> : null}
      {query.error ? (
        <LoadError
          what="what has been sent"
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      ) : null}
      {send.error ? <SaveError what="The notice" error={send.error} /> : null}

      {sent ? (
        <Alert
          tone="success"
          title="Notice sent"
          onDismiss={() => setSent(null)}
          actions={
            sent.withoutAccount > 0 ? (
              <Button asChild variant="secondary" size="sm">
                <Link href="/schools/guardians">Invite the {sent.withoutAccount}</Link>
              </Button>
            ) : undefined
          }
        >
          Sent to {sent.recipients.toLocaleString()}{" "}
          {sent.recipients === 1 ? "person" : "people"}.
          {sent.withoutAccount > 0
            ? ` ${sent.withoutAccount} ${sent.withoutAccount === 1 ? "person has" : "people have"} no portal account yet and did not get it — invite them from Guardians or Students.`
            : ""}
        </Alert>
      ) : null}

      <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
        {query.isPending ? (
          <TableRowsSkeleton
            rows={6}
            headers={["Sent", "Notice", "Audience", "Importance", "Read", "Expires"]}
            columns={[
              { width: 70 },
              { twoLine: true },
              { width: 140 },
              { width: 100, badge: true },
              { width: 120 },
              { width: 80 },
            ]}
          />
        ) : (
          <DataTable
            data={filtered}
            columns={columns}
            searchPlaceholder="Search sent notices"
            searchSubmitLabel="Search"
            pagination={{ enabled: true }}
            /* One row answers narrowing. The filters sat on a row of their
               own above the search box, so the same question was asked in
               two places a band apart. */
            toolbar={
              <>
                <FilterSelect
                  label="Who it was for"
                  allLabel="Every audience"
                  value={audience}
                  options={AUDIENCES}
                  onChange={setAudience}
                />
                <FilterSelect
                  label={words.One}
                  allLabel="The whole school"
                  value={classId}
                  options={classes.map((row) => ({ value: row.id, label: row.name }))}
                  onChange={setClassId}
                />
                <FilterSelect
                  label="Importance"
                  allLabel="Any importance"
                  value={importance}
                  options={IMPORTANCE}
                  onChange={setImportance}
                />
                <FilterSelect
                  label="When"
                  allLabel={activeTerm ? `${activeTerm.name}` : "This term"}
                  value={when}
                  options={WHEN}
                  onChange={setWhen}
                />
              </>
            }
            emptyState={
              rows.length === 0 ? (
                <NothingYet
                  title="The school has not sent a notice yet"
                  body="Anything you send appears in parents' and pupils' portals straight away."
                />
              ) : (
                <NothingMatched
                  what="notices"
                  filters={[
                    audience ? AUDIENCES.find((row) => row.value === audience)?.label : null,
                    classId ? classes.find((row) => row.id === classId)?.name : null,
                    importance
                      ? IMPORTANCE.find((row) => row.value === importance)?.label
                      : null,
                  ].filter((value): value is string => Boolean(value))}
                  onClear={
                    anyFilter
                      ? () => {
                          setAudience("");
                          setClassId("");
                          setImportance("");
                        }
                      : undefined
                  }
                />
              )
            }
          />
        )}

        <div className="flex flex-col gap-3">
          <Card
            title="Who never gets them"
            actions={
              /*
                The two rows below are a to-do list, and until now the only way
                to act on it was the banner that appears for a moment after a
                send. An office reading this card at any other time could see
                the numbers and had nowhere to press. Inviting is what changes
                them.
              */
              unreachable && unreachable.guardians + unreachable.students > 0 ? (
                <Button asChild variant="quiet" size="sm">
                  <Link href="/schools/guardians">
                    Invite the {unreachable.guardians + unreachable.students}
                  </Link>
                </Button>
              ) : undefined
            }
          >
            <div className="divide-y divide-[color:var(--border-subtle)]">
              <ReachRow
                label="Guardians with no portal account"
                value={unreachable?.guardians ?? null}
                href="/schools/guardians"
              />
              <ReachRow
                label="Pupils with no portal account"
                value={unreachable?.students ?? null}
                href="/schools/students"
              />
            </div>
          </Card>

          <Card title={reachWindowLabel}>
            <ReachRow label="Average read" value={`${reach.averageRead}%`} />
          </Card>
        </div>
      </div>

      <SendNoticeDialog
        open={composing}
        onOpenChange={(next) => {
          setComposing(next);
          if (!next) setCorrecting(null);
        }}
        isSending={send.isPending}
        error={send.error ? getApiErrorMessage(send.error) : null}
        onSend={(draft) => send.mutate(draft)}
        correcting={correcting}
      />

      <EditNoticeDialog
        notice={editing}
        onOpenChange={(next) => {
          if (!next) {
            setEditing(null);
            edit.reset();
          }
        }}
        isSaving={edit.isPending}
        error={edit.error ? getApiErrorMessage(edit.error) : null}
        onSave={(draft) => edit.mutate(draft)}
        onSendCorrectionInstead={(notice) => {
          const row = rows.find((candidate) => candidate.id === notice.id);
          if (!row) return;
          setEditing(null);
          edit.reset();
          setSent(null);
          setCorrecting({
            id: row.id,
            title: row.title,
            audience: row.audienceCode,
            classId: row.classId,
            severity: severityCode(row.severity),
            sentOn: formatSchoolDate(row.createdAt),
          });
          setComposing(true);
        }}
      />
    </div>
  );
}

/**
 * Rewording a letter that has already gone out.
 *
 * The description is the whole reason this dialog exists rather than an inline
 * edit on the row. An office reading "Edit" reasonably assumes the families are
 * told; they are not. Nothing in this product delivers a notice — the portals
 * read the row — so saving here changes what somebody sees the next time they
 * open the app and reaches nobody who has already read it. The count of people
 * who have is on the dialog for that reason: "44 of the 58 have already read
 * it" is the number that decides which of the two verbs this is.
 *
 * So the way out is on the dialog too. An office that opens this to fix a typo
 * and realises halfway through that the date itself was wrong should not have
 * to cancel, find the row again and reopen the menu — the correction is one
 * press away from here.
 *
 * The audience is not on this form. Who received the notice was settled when
 * the recipient rows were written and cannot be changed afterwards; showing it
 * as a field would offer a choice that is not there.
 */
function EditNoticeDialog({
  notice,
  onOpenChange,
  isSaving,
  error,
  onSave,
  onSendCorrectionInstead,
}: {
  notice: Editing | null;
  onOpenChange: (open: boolean) => void;
  isSaving: boolean;
  error: string | null;
  onSave: (draft: {
    id: string;
    title: string;
    body: string;
    severity: NoticeSeverity;
  }) => void;
  onSendCorrectionInstead: (notice: Editing) => void;
}) {
  const [draft, setDraft] = useState<Editing | null>(notice);
  const [wasId, setWasId] = useState(notice?.id ?? null);
  if ((notice?.id ?? null) !== wasId) {
    setWasId(notice?.id ?? null);
    setDraft(notice);
  }

  const open = Boolean(notice);
  const ready = Boolean(draft && draft.title.trim() && draft.body.trim());

  return (
    <RecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Fix the wording"
      description={
        notice
          ? `Sent ${notice.sentOn}. This changes what the notice says from now on and tells nobody — the ${notice.read.toLocaleString()} of ${notice.recipients.toLocaleString()} who have already read it keep the version they read. For anything that changes what a family has to do, send a correction instead.`
          : undefined
      }
      errors={error ? [error] : undefined}
      footer={
        <>
          <Button
            variant="quiet"
            onClick={() => notice && onSendCorrectionInstead(notice)}
            disabled={isSaving || !notice}
          >
            Send a correction instead
          </Button>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() =>
              draft &&
              onSave({
                id: draft.id,
                title: draft.title,
                body: draft.body,
                severity: draft.severity,
              })
            }
            disabled={!ready || isSaving}
          >
            {isSaving ? "Saving…" : "Save the wording"}
          </Button>
        </>
      }
    >
      {draft ? (
        <div className="space-y-4">
          <div>
            <Label htmlFor="notice-edit-title">Title</Label>
            <Input
              id="notice-edit-title"
              value={draft.title}
              maxLength={160}
              onChange={(event) =>
                setDraft((current) =>
                  current ? { ...current, title: event.target.value } : current,
                )
              }
            />
          </div>

          <div>
            <Label htmlFor="notice-edit-body">Message</Label>
            <Textarea
              id="notice-edit-body"
              rows={6}
              value={draft.body}
              maxLength={4000}
              onChange={(event) =>
                setDraft((current) =>
                  current ? { ...current, body: event.target.value } : current,
                )
              }
            />
          </div>

          <FilterSelect
            label="Importance"
            allLabel="Normal"
            value={draft.severity === "INFO" ? "" : draft.severity}
            options={[
              { value: "WARNING", label: "Important" },
              { value: "CRITICAL", label: "Urgent" },
            ]}
            onChange={(value) =>
              setDraft((current) =>
                current
                  ? { ...current, severity: (value || "INFO") as NoticeSeverity }
                  : current,
              )
            }
          />
        </div>
      ) : null}
    </RecordDialog>
  );
}

function ReachRow({
  label,
  value,
  href,
}: {
  label: string;
  value: number | string | null;
  href?: string;
}) {
  const body = (
    <>
      <span className="min-w-0 flex-1 text-[length:var(--type-body-sm)]">{label}</span>
      <span className="font-[family-name:var(--font-mono)] text-[length:var(--type-body-sm)] font-bold tabular-nums">
        {value === null ? "—" : typeof value === "number" ? value.toLocaleString() : value}
      </span>
    </>
  );
  return href ? (
    <Link href={href} className="flex items-center gap-3 py-2 hover:underline">
      {body}
    </Link>
  ) : (
    <div className="flex items-center gap-3 py-2">{body}</div>
  );
}
