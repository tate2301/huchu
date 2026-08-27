"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Badge, Button, Card } from "@corelithzw/react";

import { PageHeading } from "@/components/layout/page-heading";
import { DataTable } from "@/components/ui/data-table";
import { NumericCell } from "@/components/ui/numeric-cell";
import { PageBand } from "@/components/schools/common/page-band";
import { FilterBar, FilterSelect } from "@/components/schools/common/filter-select";
import { CreateButton, RecordActions } from "@/components/schools/common/record-actions";
import {
  LoadError,
  NothingMatched,
  NothingYet,
  SaveError,
  TableRowsSkeleton,
} from "@/components/schools/common/states";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import {
  fetchSchoolsClasses,
  fetchSchoolsGuardians,
  fetchSchoolsStudents,
  fetchSchoolsTerms,
} from "@/lib/schools/admin-v2";
import { formatSchoolDate } from "@/lib/schools/format";

import { SendNoticeDialog, type Correcting, type NoticeDraft } from "./send-notice-dialog";

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
 * ── Why this record has no edit and no delete ──────────────────────────────
 *
 * Every other campus record is created, edited and archived from its list. A
 * notice cannot be, and the difference is not an omission. Sending writes a
 * recipient row per person and the portals show it immediately, so by the time
 * the list renders, hundreds of families have already read it. Editing the
 * stored row would silently rewrite what some of them saw and leave the rest
 * holding the old version; deleting it would make a letter the school demonstr-
 * ably sent disappear from its own record. The send dialog says a notice cannot
 * be recalled, and the sent list has to mean it.
 *
 * The update verb is therefore *Send a correction*: a second notice, addressed
 * to exactly the people the first one reached, carrying a link back to it. That
 * is the whole of this record's write surface, and it is deliberately the whole
 * of it.
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
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="font-medium">{row.original.title}</div>
            <div className="line-clamp-1 text-[length:var(--type-caption)] text-[color:var(--text-muted)]">
              {row.original.summary}
            </div>
          </div>
        ),
      },
      {
        id: "audience",
        header: "Audience",
        cell: ({ row }) => (
          <span>
            {row.original.audience}
            {row.original.className ? ` · ${row.original.className}` : ""}
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
        header: "",
        cell: ({ row }) => (
          <RecordActions
            resource="schools.reports"
            verbs={[
              {
                label: "Send a correction",
                action: "create",
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
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-3">
      <PageHeading
        title="School Notices"
        primaryAction={
          <CreateButton
            resource="schools.reports"
            label="Send a notice"
            onSelect={() => {
              setSent(null);
              setCorrecting(null);
              setComposing(true);
            }}
          />
        }
      />

      <PageBand
        chips={[
          { label: "Sent this term", value: reach.sent },
          {
            label: "Unread",
            value: reach.unread.toLocaleString(),
            tone: reach.unread > 0 ? "warn" : "success",
          },
          {
            label: "No portal account",
            value: unreachable ? unreachable.guardians + unreachable.students : "—",
            tone: unreachable && unreachable.guardians + unreachable.students > 0 ? "danger" : "success",
            href: "/schools/guardians",
          },
        ]}
      />

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
        <Card flush title="Notices the school has sent">
          <div className="px-3 pt-3">
            <FilterBar>
              <FilterSelect
                label="Who it was for"
                allLabel="Every audience"
                value={audience}
                options={AUDIENCES}
                onChange={setAudience}
              />
              <FilterSelect
                label="Year group"
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
            </FilterBar>
          </div>

          {query.isPending ? (
            <TableRowsSkeleton
              rows={6}
              columns={[{ width: 60 }, { twoLine: true }, { width: 140 }, { width: 90 }, { width: 110 }]}
            />
          ) : (
            <DataTable
              data={filtered}
              columns={columns}
              searchPlaceholder="Search sent notices"
              searchSubmitLabel="Search"
              pagination={{ enabled: true }}
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
        </Card>

        <div className="flex flex-col gap-3">
          <Card
            title="Who never gets them"
            subtitle={
              unreachable
                ? `${(unreachable.guardians + unreachable.students).toLocaleString()} people`
                : undefined
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
            <p className="mt-3 text-[length:var(--type-caption)] text-[color:var(--text-muted)]">
              A notice cannot reach somebody the school has never invited. Inviting them is
              what changes these numbers.
            </p>
          </Card>

          <Card title={`Reach, ${activeTerm ? activeTerm.name.toLowerCase() : "this term"}`}>
            <div className="divide-y divide-[color:var(--border-subtle)]">
              <ReachRow label="Notices sent" value={reach.sent} />
              <ReachRow label="Average read" value={`${reach.averageRead}%`} />
              <ReachRow label="Still unread" value={reach.unread} />
            </div>
            <p className="mt-3 text-[length:var(--type-caption)] text-[color:var(--text-muted)]">
              A guardian who has opened nothing in a term is usually a guardian whose invite
              was never accepted.
            </p>
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
    </div>
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
