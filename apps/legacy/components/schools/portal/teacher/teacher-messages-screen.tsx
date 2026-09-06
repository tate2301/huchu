"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Badge, Button, Card, TextArea } from "@corelithzw/react";

import { PersonAvatar } from "@corelithzw/ui/components/person-avatar";
import { TableSearch } from "@/components/schools/common/table-controls";
import {
  LoadError,
  NothingMatched,
  NothingYet,
  SaveError,
  SavingOverlay,
  TableRowsSkeleton,
} from "@/components/schools/common/states";
import { fetchJson } from "@corelithzw/platform/api-client";

/**
 * Parent messages.
 *
 * The screen three links already pointed at. `/portal/teacher/messages` was a
 * 404 — the rail item, the tab strip and the bell all led to it — so the links
 * were removed until this existed rather than left pointing at nothing.
 *
 * A list of people, not of rooms. Each thread is one family, about one child,
 * which is how a teacher thinks about it: "the Moyos, about Anesu". Opening a
 * thread marks it read in the same request, because a badge that survives the
 * screen meant to clear it is a badge people stop believing.
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
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  /**
   * A teacher opens this looking for one family by name. Unread-only is the
   * other question — "what came in while I was teaching" — so it is a view
   * rather than something to be worked out by scanning for blue dots.
   */
  const [search, setSearch] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);

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

  return (
    <div className="flex flex-col gap-4">
      {reply.error ? <SaveError what="That reply" error={reply.error} /> : null}
      {thread.error ? (
        <LoadError
          what="that conversation"
          error={thread.error}
          onRetry={() => void thread.refetch()}
        />
      ) : null}

      {openId && open ? (
        <Card
          title={open.subject}
          subtitle={
            open.student
              ? `${open.guardian.firstName} ${open.guardian.lastName} · about ${open.student.firstName} ${open.student.lastName}`
              : `${open.guardian.firstName} ${open.guardian.lastName}`
          }
          actions={
            <Button variant="ghost" onClick={() => { setOpenId(null); setDraft(""); }}>
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
        <Card
          title="Parent messages"
          subtitle={
            threads.length === 0
              ? undefined
              : `${threads.length} conversation${threads.length === 1 ? "" : "s"}`
          }
          actions={unread > 0 ? <Badge tone="warn">{unread} new</Badge> : null}
        >
          <div className="mb-3 flex flex-wrap items-end gap-3">
            <div className="min-w-0 flex-1 basis-[220px]">
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
              body="When a family writes to you about a pupil, the conversation appears here. Parents start them from their own portal."
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
                  onClick={() => setOpenId(row.id)}
                  className="flex items-start gap-3 border-b border-[color:var(--border-subtle)] p-3 text-left last:border-b-0 hover:bg-[color:var(--surface-muted)]"
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
      )}
    </div>
  );
}
