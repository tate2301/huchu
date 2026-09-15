"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Select,
  TextArea,
} from "@corelithzw/react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RecordDialog } from "@/components/crm/records/record-dialog";
import { PersonAvatar } from "@/components/schools/common/person-avatar";
import { TableSearch } from "@/components/records/table-controls";
import {
  LoadError,
  NothingMatched,
  NothingYet,
  SaveError,
  SavingOverlay,
  TableRowsSkeleton,
} from "@/components/records/states";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { useTeacherPortal } from "./teacher-portal-context";

/**
 * Parent messages.
 *
 * A list of people, not of rooms. Each thread is one family, about one child,
 * which is how a teacher thinks about it: "the Moyos, about Anesu". Opening a
 * thread marks it read in the same request, because a badge that survives the
 * screen meant to clear it is a badge people stop believing.
 *
 * The open thread is in the URL. A teacher who follows a link from Today, or
 * who presses Back after reading one, should land on the conversation and then
 * on the inbox — not out of the portal altogether.
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

type Guardian = {
  id: string;
  firstName: string;
  lastName: string;
  studentLinks: Array<{
    student: {
      id: string;
      firstName: string;
      lastName: string;
      currentClass: { id: string } | null;
    };
  }>;
};

/** One message to send: a family, about a child. */
type Target = { guardianId: string; studentId: string };

const WHEN = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

function when(iso: string) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : WHEN.format(date);
}

export function TeacherMessagesScreen() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { selectedClass } = useTeacherPortal();
  const openId = params.get("thread");

  const [draft, setDraft] = useState("");
  const [composing, setComposing] = useState<"pupil" | "class" | null>(null);
  const [studentId, setStudentId] = useState("");
  const [chosen, setChosen] = useState<string[]>([]);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  /**
   * A teacher opens this looking for one family by name. Unread-only is the
   * other question — "what came in while I was teaching" — so it is a view
   * rather than something to be worked out by scanning for blue dots.
   */
  const [search, setSearch] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);

  const openThread = (id: string | null) =>
    router.push(id ? `${pathname}?thread=${id}` : pathname);

  const inbox = useQuery({
    queryKey: ["schools", "portal", "teacher", "messages"],
    queryFn: () =>
      fetchJson<{ threads: ThreadSummary[] }>(
        "/api/v2/schools/portal/teacher/me/messages",
      ),
  });

  const thread = useQuery({
    queryKey: ["schools", "portal", "teacher", "messages", openId],
    queryFn: () =>
      fetchJson<ThreadDetail>(
        `/api/v2/schools/portal/teacher/me/messages?threadId=${openId}`,
      ),
    enabled: Boolean(openId),
  });

  /**
   * The class's families, which is what both composers are addressed from.
   * Read through the guardians list rather than the roll: a message goes to a
   * guardian, and a pupil with nobody on the books has nowhere to send one.
   */
  const families = useQuery({
    queryKey: ["schools", "guardians", "class", selectedClass?.classId],
    queryFn: () =>
      fetchJson<{ data: Guardian[] }>(
        `/api/v2/schools/guardians?classId=${selectedClass?.classId}&limit=100`,
      ),
    enabled: Boolean(selectedClass?.classId) && composing !== null,
  });

  const reply = useMutation({
    mutationFn: async () => {
      if (!openId) throw new Error("No conversation is open");
      if (!draft.trim()) throw new Error("Write something first");
      return fetchJson("/api/v2/schools/portal/teacher/me/messages", {
        method: "POST",
        body: JSON.stringify({ action: "reply", threadId: openId, body: draft.trim() }),
      });
    },
    onSuccess: () => {
      setDraft("");
      void queryClient.invalidateQueries({
        queryKey: ["schools", "portal", "teacher", "messages"],
      });
    },
  });

  /**
   * Starting conversations, one family or the whole class, over the same
   * endpoint: a thread is one guardian about one child, so a broadcast is that
   * many threads rather than a room everybody is put in. Sent in turn, because
   * a failure halfway should leave the rest unsent and say so.
   */
  const start = useMutation({
    mutationFn: async (targets: Target[]) => {
      let done = 0;
      for (const target of targets) {
        await fetchJson("/api/v2/schools/portal/teacher/me/messages", {
          method: "POST",
          body: JSON.stringify({
            action: "start",
            guardianId: target.guardianId,
            studentId: target.studentId,
            subject: subject.trim(),
            body: body.trim(),
          }),
        });
        done += 1;
      }
      return done;
    },
    onSuccess: (done) => {
      setSent(`Sent to ${done} ${done === 1 ? "family" : "families"}.`);
      setComposing(null);
      setSubject("");
      setBody("");
      setChosen([]);
      setStudentId("");
      void queryClient.invalidateQueries({
        queryKey: ["schools", "portal", "teacher", "messages"],
      });
    },
  });

  // Memoised because the filter below depends on it: a fresh `[]` every render
  // would make that dependency change forever.
  const threads = useMemo(() => inbox.data?.threads ?? [], [inbox.data]);
  const unread = threads.filter((row) => row.unread).length;

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return threads.filter((row) => {
      if (unreadOnly && !row.unread) return false;
      if (needle) {
        const haystack = `${row.guardian.firstName} ${row.guardian.lastName} ${row.subject} ${
          row.student ? `${row.student.firstName} ${row.student.lastName}` : ""
        }`;
        if (!haystack.toLowerCase().includes(needle)) return false;
      }
      return true;
    });
  }, [threads, unreadOnly, search]);

  // Memoised because three lists below derive from it: a fresh `[]` every
  // render would make their dependency change forever.
  const guardians = useMemo(() => families.data?.data ?? [], [families.data]);

  /** Every guardian of the class, paired with the child they are here about. */
  const classTargets = useMemo<Target[]>(() => {
    const classId = selectedClass?.classId;
    if (!classId) return [];
    return guardians.flatMap((guardian) =>
      guardian.studentLinks
        .filter((link) => link.student.currentClass?.id === classId)
        .map((link) => ({ guardianId: guardian.id, studentId: link.student.id })),
    );
  }, [guardians, selectedClass?.classId]);

  /** The pupils of the class, as the picker offers them. */
  const pupils = useMemo(() => {
    const classId = selectedClass?.classId;
    const seen = new Map<string, { id: string; name: string }>();
    for (const guardian of guardians) {
      for (const link of guardian.studentLinks) {
        if (link.student.currentClass?.id !== classId) continue;
        seen.set(link.student.id, {
          id: link.student.id,
          name: `${link.student.lastName}, ${link.student.firstName}`,
        });
      }
    }
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [guardians, selectedClass?.classId]);

  /** The guardians on the chosen pupil's record. */
  const forPupil = useMemo(
    () =>
      guardians.filter((guardian) =>
        guardian.studentLinks.some((link) => link.student.id === studentId),
      ),
    [guardians, studentId],
  );

  if (inbox.isPending) {
    return (
      <TableRowsSkeleton
        headers={["Family", "Last message", "When"]}
        columns={[
          { avatar: true, twoLine: true },
          {},
          { width: 96, align: "right" },
        ]}
        rows={6}
      />
    );
  }

  if (inbox.error) {
    return (
      <LoadError
        what="your messages"
        error={inbox.error}
        onRetry={() => void inbox.refetch()}
      />
    );
  }

  const open = thread.data ?? null;
  const broadcasting = composing === "class";
  const targets = broadcasting
    ? classTargets
    : chosen.map((guardianId) => ({ guardianId, studentId }));
  const classLabel = selectedClass
    ? `${selectedClass.className}${selectedClass.streamName ? ` ${selectedClass.streamName}` : ""}`
    : "your class";

  const composer = (
    <RecordDialog
      open={composing !== null}
      onOpenChange={(next) => {
        if (!next) setComposing(null);
      }}
      title={broadcasting ? "Send to the whole class" : "Start a conversation"}
      description={
        broadcasting
          ? `One conversation per family of ${classLabel}, each about their own child.`
          : "Pick the child, then who to write to."
      }
      size="md"
      errors={start.error ? [getApiErrorMessage(start.error)] : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={() => setComposing(null)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={start.isPending}
            disabled={targets.length === 0 || !subject.trim() || !body.trim()}
            onClick={() => start.mutate(targets)}
          >
            {targets.length > 1 ? `Send to ${targets.length} families` : "Send"}
          </Button>
        </>
      }
    >
      {families.isPending ? (
        <TableRowsSkeleton columns={[{ avatar: true, twoLine: true }]} rows={3} />
      ) : null}
      {families.error ? (
        <LoadError what="the class's families" error={families.error} />
      ) : null}

      <div className="flex flex-col gap-4">
        {broadcasting ? null : (
          <>
            <div className="space-y-2">
              <Label htmlFor="message-pupil">Pupil</Label>
              <Select
                id="message-pupil"
                value={studentId}
                onChange={(event) => {
                  setStudentId(event.target.value);
                  setChosen([]);
                }}
              >
                <option value="">Choose a pupil</option>
                {pupils.map((pupil) => (
                  <option key={pupil.id} value={pupil.id}>
                    {pupil.name}
                  </option>
                ))}
              </Select>
            </div>

            {studentId ? (
              <fieldset className="space-y-2">
                <legend className="text-[length:var(--type-body-sm)] font-medium text-[color:var(--text-strong)]">
                  Who to write to
                </legend>
                {forPupil.length === 0 ? (
                  <p className="text-[length:var(--type-body-sm)] text-[color:var(--text-muted)]">
                    Nobody is on this pupil&apos;s record. The office adds guardians
                    under Pupils.
                  </p>
                ) : (
                  forPupil.map((guardian) => (
                    <label
                      key={guardian.id}
                      className="flex items-center gap-2 text-[length:var(--type-body-sm)] text-[color:var(--text-body)]"
                    >
                      <input
                        type="checkbox"
                        checked={chosen.includes(guardian.id)}
                        onChange={(event) =>
                          setChosen((current) =>
                            event.target.checked
                              ? [...current, guardian.id]
                              : current.filter((id) => id !== guardian.id),
                          )
                        }
                      />
                      {guardian.firstName} {guardian.lastName}
                    </label>
                  ))
                )}
              </fieldset>
            ) : null}
          </>
        )}

        <div className="space-y-2">
          <Label htmlFor="message-subject">Subject</Label>
          <Input
            id="message-subject"
            value={subject}
            maxLength={160}
            placeholder="Anesu's progress this term"
            onChange={(event) => setSubject(event.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="message-body">Message</Label>
          <TextArea
            id="message-body"
            rows={5}
            value={body}
            placeholder="Write what you would say at the gate."
            onChange={(event) => setBody(event.target.value)}
          />
        </div>

        {broadcasting ? (
          <p className="text-[length:var(--type-body-sm)] text-[color:var(--text-muted)]">
            {classTargets.length} famil{classTargets.length === 1 ? "y" : "ies"} will
            each get their own conversation.
          </p>
        ) : null}
      </div>
    </RecordDialog>
  );

  return (
    <div className="te-msg" data-open={openId ? "thread" : "list"}>
      <div className="te-msg-alerts">
        {reply.error ? <SaveError what="That reply" error={reply.error} /> : null}
        {start.error ? <SaveError what="That message" error={start.error} /> : null}
        {thread.error ? (
          <LoadError
            what="that conversation"
            error={thread.error}
            onRetry={() => void thread.refetch()}
          />
        ) : null}
        {sent ? (
          <Alert tone="success" title={sent} onDismiss={() => setSent(null)} />
        ) : null}
      </div>

      <div className="te-msg-list">
        <Card
          title="Parent messages"
          subtitle={
            threads.length === 0
              ? undefined
              : `${threads.length} conversation${threads.length === 1 ? "" : "s"}`
          }
          actions={unread > 0 ? <Badge tone="warn">{unread} new</Badge> : null}
        >
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Button
              variant="primary"
              disabled={!selectedClass}
              onClick={() => {
                start.reset();
                setComposing("pupil");
              }}
            >
              Start a conversation
            </Button>
            <Button
              variant="secondary"
              disabled={!selectedClass}
              onClick={() => {
                start.reset();
                setComposing("class");
              }}
            >
              Send to whole class
            </Button>
          </div>

          <div className="mb-3 flex flex-wrap items-end gap-3">
            <div className="min-w-0 flex-1 basis-[200px]">
              <TableSearch
                label="Find a family"
                value={search}
                onChange={setSearch}
                placeholder="Search a parent or a pupil"
              />
            </div>
            <Button
              variant={unreadOnly ? "primary" : "secondary"}
              disabled={unread === 0 && !unreadOnly}
              onClick={() => setUnreadOnly((current) => !current)}
            >
              {unreadOnly ? "Showing the new ones" : `Show the ${unread} new`}
            </Button>
          </div>

          {threads.length === 0 ? (
            <NothingYet
              title="No messages yet"
              body="Write to a family about their child and the conversation opens here."
              action={
                selectedClass ? (
                  <Button
                    variant="primary"
                    onClick={() => {
                      start.reset();
                      setComposing("pupil");
                    }}
                  >
                    Start a conversation
                  </Button>
                ) : undefined
              }
            />
          ) : visible.length === 0 ? (
            <NothingMatched
              what="conversations"
              filters={[unreadOnly ? "new only" : null, search.trim() || null].filter(
                (value): value is string => Boolean(value),
              )}
              onClear={() => {
                setSearch("");
                setUnreadOnly(false);
              }}
            />
          ) : (
            <div className="flex flex-col">
              {visible.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  aria-current={row.id === openId ? "true" : undefined}
                  onClick={() => openThread(row.id)}
                  className={
                    row.id === openId
                      ? "flex items-start gap-3 border-b border-[color:var(--border-subtle)] bg-[color:var(--brand-soft)] p-3 text-left last:border-b-0"
                      : "flex items-start gap-3 border-b border-[color:var(--border-subtle)] p-3 text-left last:border-b-0 hover:bg-[color:var(--surface-muted)]"
                  }
                >
                  <PersonAvatar
                    firstName={row.guardian.firstName}
                    lastName={row.guardian.lastName}
                    size="sm"
                  />
                  <span className="min-w-0 flex-1">
                    <span
                      className={
                        row.unread
                          ? "block font-semibold text-[color:var(--text-strong)]"
                          : "block text-[color:var(--text-strong)]"
                      }
                    >
                      {row.guardian.firstName} {row.guardian.lastName}
                    </span>
                    <span className="block truncate text-[length:var(--type-body-sm)] text-[color:var(--text-muted)]">
                      {row.lastMessagePreview}
                    </span>
                    <span className="block text-[length:var(--type-caption)] text-[color:var(--text-subtle)]">
                      {row.student
                        ? `re: ${row.student.firstName} ${row.student.lastName}`
                        : "General enquiry"}
                      {row.staff ? "" : " · to the office"}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-[length:var(--type-caption)] text-[color:var(--text-subtle)]">
                      {when(row.lastMessageAt)}
                    </span>
                    {row.unread ? (
                      <span
                        aria-hidden
                        className="mt-1 inline-block size-2 rounded-full bg-[color:var(--brand)]"
                      />
                    ) : null}
                  </span>
                </button>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="te-msg-thread">
        {openId && open ? (
          <Card
            title={open.subject}
            subtitle={
              open.student
                ? `${open.guardian.firstName} ${open.guardian.lastName} · about ${open.student.firstName} ${open.student.lastName}`
                : `${open.guardian.firstName} ${open.guardian.lastName}`
            }
            actions={
              <Button
                variant="ghost"
                className="te-msg-back"
                onClick={() => {
                  openThread(null);
                  setDraft("");
                }}
              >
                Back to all
              </Button>
            }
          >
            <div className="flex flex-col gap-3">
              {open.messages.map((message) => (
                <div
                  key={message.id}
                  className={
                    message.senderSide === "STAFF"
                      ? "self-end max-w-[85%] rounded-[var(--radius-md)] bg-[color:var(--brand-soft,var(--surface-muted))] p-3"
                      : "self-start max-w-[85%] rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color:var(--surface)] p-3"
                  }
                >
                  <p className="text-[length:var(--type-caption)] text-[color:var(--text-muted)]">
                    {message.senderName} · {when(message.createdAt)}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-[length:var(--type-body-sm)] text-[color:var(--text-strong)]">
                    {message.body}
                  </p>
                </div>
              ))}

              {open.closed ? (
                <Alert tone="info" title="This conversation has been closed">
                  The office closed it. Start a new one if there is more to say.
                </Alert>
              ) : (
                /* The box stops taking words while the reply is going out. A
                   sentence typed mid-send is a sentence the parent never gets. */
                <SavingOverlay saving={reply.isPending} label="Sending…">
                  <div className="flex flex-col gap-2">
                    <TextArea
                      rows={3}
                      value={draft}
                      placeholder="Write a reply"
                      onChange={(event) => setDraft(event.target.value)}
                    />
                    <Button
                      className="self-end"
                      loading={reply.isPending}
                      disabled={!draft.trim()}
                      onClick={() => reply.mutate()}
                    >
                      Send
                    </Button>
                  </div>
                </SavingOverlay>
              )}
            </div>
          </Card>
        ) : (
          <EmptyState
            title="Pick a conversation"
            body="Open one on the left to read it and reply."
          />
        )}
      </div>

      {composer}
    </div>
  );
}
