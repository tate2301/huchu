"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, Card } from "@corelithzw/react";

import { FilterBar, FilterSelect } from "../common/filter-select";
import { PageBand } from "../common/page-band";
import { PersonAvatar } from "@corelithzw/ui/components/person-avatar";
import {
  LoadError,
  NothingLeftToDo,
  NothingMatched,
  NothingYet,
  SaveError,
  TableRowsSkeleton,
} from "../common/states";
import { RecordActions } from "../common/record-actions";
import { RecordDialog } from "@corelithzw/ui/components/record-dialog";
import { fetchJson } from "@corelithzw/platform/api-client";
import { fetchTeacherProfiles } from "../../admin-v2";

/**
 * Every conversation in the school, and the queue nobody could see.
 *
 * `lib/schools/messages.ts` has had `allThreads` since messaging landed and the
 * route has exposed it just as long, but nothing in `app/schools` called it and
 * there was no way in from the sidebar. So a thread addressed to the office
 * rather than to a named teacher — `teacherProfileId` null, which is the case
 * the model was designed for — arrived somewhere no person ever looked. A
 * parent could be told "the office closed it" about a conversation the office
 * never saw.
 *
 * Two things shape this screen:
 *
 * **Unassigned comes first**, because it is the only queue on which nothing
 * happens by itself. A thread with a teacher on it has somebody whose job it is;
 * a thread with nobody on it has the office, and the office has to be told.
 *
 * **The column is whose move it is, not whether it is unread.** Unread says what
 * is new; whose-move says what is yours. It is the same derived value — the last
 * message is not mine and I have not opened it since — relabelled into the
 * question an office actually has, which lets the list sort by how long a family
 * has been waiting rather than by recency.
 *
 * CRUD here is not create/edit/delete, and that is deliberate rather than
 * missing: nothing in a conversation is ever edited or deleted, because a school
 * has to be able to answer "who could read this, and what did it say" a year
 * later. The verbs are start, reply, assign and close. Starting and replying
 * belong to the family and the teacher in their own portals; the office owns
 * assign and close, and those are what this screen does.
 */

type ThreadSummary = {
  id: string;
  subject: string;
  student: { id: string; firstName: string; lastName: string } | null;
  guardian: { id: string; firstName: string; lastName: string };
  staff: { id: string; name: string } | null;
  lastMessageAt: string;
  lastMessagePreview: string;
  unread: boolean;
  closed: boolean;
  messageCount: number;
};

type ThreadDetail = ThreadSummary & {
  messages: Array<{
    id: string;
    body: string;
    senderSide: "GUARDIAN" | "STAFF";
    senderName: string;
    createdAt: string;
  }>;
};

/** Whose move it is, derived exactly as the model derives unread. */
type Move = "yours" | "family" | "finished";

function moveOf(thread: ThreadSummary): Move {
  if (thread.closed) return "finished";
  return thread.unread ? "yours" : "family";
}

const MOVE_LABEL: Record<Move, string> = {
  yours: "Your reply",
  family: "With the family",
  finished: "Finished",
};

const MOVE_TONE: Record<Move, "warn" | "neutral" | "success"> = {
  yours: "warn",
  family: "neutral",
  finished: "success",
};

const SEGMENTS = [
  { id: "unassigned", label: "Unassigned" },
  { id: "yours", label: "Needs a reply" },
  { id: "family", label: "With the family" },
  { id: "open", label: "Everything open" },
  { id: "finished", label: "Finished" },
] as const;

type SegmentId = (typeof SEGMENTS)[number]["id"];

/** "3 days", "4 hours", "just now" — how long the other side has been waiting. */
function waitedFor(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const minutes = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (minutes < 60) return minutes <= 1 ? "just now" : `${minutes} minutes`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return hours === 1 ? "1 hour" : `${hours} hours`;
  const days = Math.round(hours / 24);
  return days === 1 ? "1 day" : `${days} days`;
}

function fullName(person: { firstName: string; lastName: string }): string {
  return `${person.firstName} ${person.lastName}`;
}

export function OfficeInboxContent() {
  const queryClient = useQueryClient();
  const [segment, setSegment] = useState<SegmentId>("unassigned");
  const [staffFilter, setStaffFilter] = useState("");
  const [search, setSearch] = useState("");
  const [reading, setReading] = useState<ThreadSummary | null>(null);
  const [assigning, setAssigning] = useState<ThreadSummary | null>(null);
  const [assignTo, setAssignTo] = useState("");

  const threadsQuery = useQuery({
    queryKey: ["schools", "messages", "office"],
    queryFn: () => fetchJson<{ threads: ThreadSummary[] }>("/api/v2/schools/messages"),
  });

  const staffQuery = useQuery({
    queryKey: ["schools", "teacher-profiles", "for-messages"],
    queryFn: () => fetchTeacherProfiles({ limit: 200, isActive: true }),
  });

  const threads = useMemo(() => threadsQuery.data?.threads ?? [], [threadsQuery.data]);
  const staff = useMemo(() => staffQuery.data?.data ?? [], [staffQuery.data]);

  const counts = useMemo(() => {
    const open = threads.filter((thread) => !thread.closed);
    return {
      unassigned: open.filter((thread) => !thread.staff).length,
      yours: open.filter((thread) => moveOf(thread) === "yours").length,
      family: open.filter((thread) => moveOf(thread) === "family").length,
      open: open.length,
      finished: threads.length - open.length,
    };
  }, [threads]);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const matches = threads.filter((thread) => {
      if (segment === "finished" ? !thread.closed : thread.closed) return false;
      if (segment === "unassigned" && thread.staff) return false;
      if (segment === "yours" && moveOf(thread) !== "yours") return false;
      if (segment === "family" && moveOf(thread) !== "family") return false;
      if (staffFilter === "__office__" && thread.staff) return false;
      if (staffFilter && staffFilter !== "__office__" && thread.staff?.id !== staffFilter) {
        return false;
      }
      if (!term) return true;
      const haystack = [
        thread.subject,
        fullName(thread.guardian),
        thread.student ? fullName(thread.student) : "",
        thread.staff?.name ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });

    // Longest wait first. An inbox sorted by recency puts the family who wrote
    // this morning above the one who has been waiting since Tuesday, which is
    // the wrong way round for a queue somebody is working through.
    return matches.slice().sort(
      (a, b) => new Date(a.lastMessageAt).getTime() - new Date(b.lastMessageAt).getTime(),
    );
  }, [threads, segment, staffFilter, search]);

  const assign = useMutation({
    mutationFn: (input: { threadId: string; teacherProfileId: string | null }) =>
      fetchJson("/api/v2/schools/messages", {
        method: "POST",
        body: JSON.stringify({ action: "assign", ...input }),
      }),
    onSuccess: () => {
      setAssigning(null);
      setAssignTo("");
      void queryClient.invalidateQueries({ queryKey: ["schools", "messages"] });
    },
  });

  const close = useMutation({
    mutationFn: (threadId: string) =>
      fetchJson("/api/v2/schools/messages", {
        method: "POST",
        body: JSON.stringify({ action: "close", threadId }),
      }),
    onSuccess: () => {
      setReading(null);
      void queryClient.invalidateQueries({ queryKey: ["schools", "messages"] });
    },
  });

  const detailQuery = useQuery({
    queryKey: ["schools", "messages", "thread", reading?.id],
    queryFn: () =>
      fetchJson<ThreadDetail>(`/api/v2/schools/messages?threadId=${reading?.id ?? ""}`),
    enabled: Boolean(reading),
  });

  const filtersInForce = [
    staffFilter === "__office__"
      ? "the office"
      : staff.find((row) => row.id === staffFilter)?.user.name,
    search.trim() || undefined,
  ].filter((entry): entry is string => Boolean(entry));

  return (
    <div className="space-y-4">
      <PageBand
        chips={[
          {
            label: "Unassigned",
            value: counts.unassigned,
            tone: counts.unassigned > 0 ? "danger" : "neutral",
          },
          {
            label: "Need a reply",
            value: counts.yours,
            tone: counts.yours > 0 ? "warn" : "neutral",
          },
          { label: "Open", value: counts.open },
        ]}
      />

      {threadsQuery.error ? (
        <LoadError
          what="the conversations"
          error={threadsQuery.error}
          onRetry={() => void threadsQuery.refetch()}
        />
      ) : null}
      {assign.error ? <SaveError what="The conversation" error={assign.error} /> : null}
      {close.error ? <SaveError what="The conversation" error={close.error} /> : null}

      <div className="flex flex-wrap items-center gap-2">
        {SEGMENTS.map((entry) => (
          <Button
            key={entry.id}
            size="sm"
            variant={segment === entry.id ? "primary" : "secondary"}
            onClick={() => setSegment(entry.id)}
          >
            {entry.label}
            <span className="ml-1.5 tabular-nums opacity-70">{counts[entry.id]}</span>
          </Button>
        ))}
      </div>

      <FilterBar>
        <FilterSelect
          label="With whom"
          allLabel="Anyone"
          value={staffFilter}
          options={[
            { value: "__office__", label: "The office — nobody yet" },
            ...staff.map((row) => ({ value: row.id, label: row.user.name })),
          ]}
          onChange={setStaffFilter}
        />
        <div className="min-w-0 flex-1 basis-[220px] sm:max-w-[280px]">
          <label
            htmlFor="messages-search"
            className="text-sm text-[color:var(--text-muted)]"
          >
            Search
          </label>
          <input
            id="messages-search"
            value={search}
            placeholder="A family, a pupil, or what it is about"
            onChange={(event) => setSearch(event.target.value)}
            className="h-9 w-full rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color:var(--surface)] px-3 text-[length:var(--type-body-sm)]"
          />
        </div>
      </FilterBar>

      <Card flush>
        {threadsQuery.isPending ? (
          <TableRowsSkeleton
            columns={[
              { width: 120 },
              { avatar: true, twoLine: true },
              {},
              { width: 140 },
              { width: 90 },
            ]}
          />
        ) : rows.length === 0 ? (
          segment === "unassigned" && counts.open > 0 ? (
            <NothingLeftToDo
              title="Nothing is waiting on the office"
              body="Every open conversation has a member of staff on it."
              action={
                <Button variant="secondary" onClick={() => setSegment("open")}>
                  Show everything open
                </Button>
              }
            />
          ) : filtersInForce.length > 0 ? (
            <NothingMatched
              what="conversations"
              filters={filtersInForce}
              onClear={() => {
                setStaffFilter("");
                setSearch("");
              }}
            />
          ) : threads.length === 0 ? (
            <NothingYet
              title="No family has written yet"
              body="Conversations started from a parent's portal arrive here, and any addressed to the office rather than to a teacher wait on this queue."
            />
          ) : (
            <NothingLeftToDo
              title="Nothing in this queue"
              body="Try another tab — there are conversations elsewhere."
            />
          )
        ) : (
          <ul className="flex flex-col">
            {rows.map((thread) => {
              const move = moveOf(thread);
              return (
                <li
                  key={thread.id}
                  className="flex flex-wrap items-center gap-3 border-b border-[color:var(--border-subtle)] px-4 py-3 last:border-b-0"
                >
                  <Badge tone={MOVE_TONE[move]} dot className="w-[7.5rem] shrink-0">
                    {MOVE_LABEL[move]}
                  </Badge>

                  <PersonAvatar
                    firstName={thread.guardian.firstName}
                    lastName={thread.guardian.lastName}
                    size="sm"
                  />

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[length:var(--type-body-sm)] font-medium text-[color:var(--text-strong)]">
                      {thread.subject}
                    </p>
                    <p className="truncate text-[length:var(--type-caption)] text-[color:var(--text-muted)]">
                      {fullName(thread.guardian)}
                      {thread.student
                        ? ` · about ${fullName(thread.student)}`
                        : " · a general enquiry"}
                    </p>
                  </div>

                  <span className="w-[10rem] shrink-0 truncate text-[length:var(--type-caption)] text-[color:var(--text-body)]">
                    {thread.staff ? thread.staff.name : "The office — nobody yet"}
                  </span>

                  <span className="w-[5.5rem] shrink-0 text-right font-[family-name:var(--font-mono)] text-[length:var(--type-caption)] tabular-nums text-[color:var(--text-muted)]">
                    {waitedFor(thread.lastMessageAt)}
                  </span>

                  <RecordActions
                    resource="schools.reports"
                    verbs={[
                      {
                        label: "Read",
                        action: "view",
                        onSelect: () => setReading(thread),
                      },
                      {
                        label: thread.staff ? "Pass on" : "Assign",
                        action: "create",
                        unavailable: thread.closed
                          ? "This conversation is finished."
                          : undefined,
                        onSelect: () => {
                          setAssignTo(thread.staff?.id ?? "");
                          setAssigning(thread);
                        },
                      },
                    ]}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* Reading a thread. The office reads without claiming a side — opening it
          here must not clear the badge telling a teacher to reply. */}
      <RecordDialog
        open={Boolean(reading)}
        onOpenChange={(next) => {
          if (!next) setReading(null);
        }}
        title={reading?.subject ?? ""}
        description={
          reading
            ? `${fullName(reading.guardian)}${
                reading.student ? ` · about ${fullName(reading.student)}` : ""
              } · ${reading.staff ? reading.staff.name : "not yet with anybody"}`
            : undefined
        }
        size="lg"
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => setReading(null)}>
              Close this window
            </Button>
            <RecordActions
              resource="schools.reports"
              size="md"
              verbs={[
                {
                  label: "End the conversation",
                  action: "create",
                  tone: "warning",
                  loading: close.isPending,
                  unavailable: reading?.closed ? "Already finished." : undefined,
                  confirm: {
                    title: "End this conversation",
                    description:
                      "The family can still read it, and nobody can add to it. If they need something else they can start a new one.",
                    confirmLabel: "End it",
                  },
                  onSelect: () => {
                    if (reading) close.mutate(reading.id);
                  },
                },
              ]}
            />
          </div>
        }
      >
        {detailQuery.isPending ? (
          <TableRowsSkeleton columns={[{ twoLine: true }]} rows={3} />
        ) : detailQuery.error ? (
          <LoadError what="the conversation" error={detailQuery.error} />
        ) : (
          <div className="space-y-3">
            {(detailQuery.data?.messages ?? []).map((message) => (
              <div
                key={message.id}
                className={
                  message.senderSide === "STAFF"
                    ? "rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-3"
                    : "rounded-[var(--radius-lg)] border border-[color:var(--border)] p-3"
                }
              >
                <p className="text-[length:var(--type-caption)] text-[color:var(--text-muted)]">
                  {message.senderName} ·{" "}
                  {message.senderSide === "STAFF" ? "the school" : "the family"}
                </p>
                <p className="mt-1 whitespace-pre-line text-[length:var(--type-body-sm)] text-[color:var(--text-body)]">
                  {message.body}
                </p>
              </div>
            ))}
          </div>
        )}
      </RecordDialog>

      {/* Assigning. One field, because a thread has exactly one member of staff
          on it — which is what lets anybody answer "who could read this". */}
      <RecordDialog
        open={Boolean(assigning)}
        onOpenChange={(next) => {
          if (!next) setAssigning(null);
        }}
        title={assigning?.staff ? "Pass this on" : "Who should answer this?"}
        description="They see it on their own list straight away, and the family sees who has it — so nobody has to write again to find out."
        size="md"
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => setAssigning(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={assign.isPending}
              onClick={() => {
                if (!assigning) return;
                assign.mutate({
                  threadId: assigning.id,
                  teacherProfileId: assignTo || null,
                });
              }}
            >
              {assignTo ? "Pass it on" : "Leave it with the office"}
            </Button>
          </div>
        }
      >
        <FilterSelect
          label="Who takes it"
          allLabel="The office — leave it on this queue"
          value={assignTo}
          options={staff.map((row) => ({ value: row.id, label: row.user.name }))}
          onChange={setAssignTo}
        />
      </RecordDialog>
    </div>
  );
}
