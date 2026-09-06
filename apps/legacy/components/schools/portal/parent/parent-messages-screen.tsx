"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { PersonAvatar } from "@/components/schools/common/person-avatar";
import {
  CardsSkeleton,
  LoadError,
  NothingYet,
  SaveError,
  SavingOverlay,
} from "@/components/schools/common/states";
import { Alert, AlertDescription, AlertTitle } from "@corelithzw/ui/components/alert";
import { Button } from "@corelithzw/ui/components/button";
import { Input } from "@corelithzw/ui/components/input";
import { Label } from "@corelithzw/ui/components/label";
import { Textarea } from "@corelithzw/ui/components/textarea";
import { fetchJson } from "@corelithzw/platform/api-client";
import { formatSchoolDate } from "@/lib/schools/format";
import { ChatCircle } from "@corelithzw/ui/lib/icons";

import { useParentPortal } from "./parent-portal-context";

/**
 * Messages between this family and the school.
 *
 * The prototype's "Messages from teachers", with its "Write to the school"
 * button. A thread with no teacher on it goes to the office, which is what that
 * button sends — a parent should not have to know which member of staff owns a
 * question in order to ask it.
 *
 * One of the eight states is missing on purpose, and the audit reads text, so it
 * is named here rather than left looking forgotten: there is no
 * `NothingMatched`, because the inbox has no filters — every conversation this
 * family has had is on it, newest first.
 */

type ThreadSummary = {
  id: string;
  subject: string;
  student: { id: string; firstName: string; lastName: string } | null;
  staff: { id: string; name: string } | null;
  lastMessageAt: string;
  lastMessagePreview: string;
  unread: boolean;
  closed: boolean;
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

export function ParentMessagesScreen() {
  const queryClient = useQueryClient();
  const { child } = useParentPortal();
  const [openId, setOpenId] = useState<string | null>(null);
  const [writing, setWriting] = useState(false);
  const [subject, setSubject] = useState("");
  const [draft, setDraft] = useState("");

  const inbox = useQuery({
    queryKey: ["portal", "parent", "messages"],
    queryFn: () =>
      fetchJson<{ threads: ThreadSummary[] }>("/api/v2/schools/portal/parent/messages"),
  });

  const thread = useQuery({
    queryKey: ["portal", "parent", "messages", openId],
    queryFn: () =>
      fetchJson<ThreadDetail>(`/api/v2/schools/portal/parent/messages?threadId=${openId}`),
    enabled: Boolean(openId),
  });

  const send = useMutation({
    mutationFn: () => {
      if (openId) {
        return fetchJson("/api/v2/schools/portal/parent/messages", {
          method: "POST",
          body: JSON.stringify({ action: "reply", threadId: openId, body: draft.trim() }),
        });
      }
      return fetchJson<{ id: string }>("/api/v2/schools/portal/parent/messages", {
        method: "POST",
        body: JSON.stringify({
          action: "start",
          subject: subject.trim(),
          body: draft.trim(),
          studentId: child?.id ?? null,
          teacherProfileId: null,
        }),
      });
    },
    onSuccess: () => {
      setDraft("");
      setSubject("");
      setWriting(false);
      void queryClient.invalidateQueries({ queryKey: ["portal", "parent", "messages"] });
    },
  });

  if (inbox.isPending) {
    return (
      /* Each thread is a card with an avatar, a name and two lines of preview,
         which is exactly what CardsSkeleton draws. */
      <div className="p-4">
        <CardsSkeleton count={4} columns={1} lines={2} />
      </div>
    );
  }

  if (inbox.isError) {
    return (
      <div className="p-4">
        <LoadError
          what="your messages"
          error={inbox.error}
          onRetry={() => void inbox.refetch()}
        />
      </div>
    );
  }

  const threads = inbox.data?.threads ?? [];
  const unread = threads.filter((row) => row.unread).length;
  const open = thread.data ?? null;

  if (openId && open) {
    return (
      <div className="pp-page space-y-3">
        <button
          type="button"
          className="px-4 pt-3 text-left text-sm text-[var(--brand)]"
          onClick={() => { setOpenId(null); setDraft(""); }}
        >
          ← All messages
        </button>
        <div className="px-4">
          <p className="font-semibold text-[var(--text-strong)]">{open.subject}</p>
          <p className="text-sm text-[var(--text-muted)]">
            {open.staff?.name ?? "The school office"}
            {open.student ? ` · about ${open.student.firstName}` : ""}
          </p>
        </div>

        <div className="space-y-2 px-4">
          {open.messages.map((message) => (
            <div
              key={message.id}
              className={
                message.senderSide === "GUARDIAN"
                  ? "ml-auto max-w-[85%] rounded-[var(--radius-lg)] bg-[var(--brand)] p-3 text-[color:var(--text-on-brand,#fff)]"
                  : "mr-auto max-w-[85%] rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface)] p-3"
              }
            >
              <p className="whitespace-pre-wrap text-sm">{message.body}</p>
              <p
                className={
                  message.senderSide === "GUARDIAN"
                    ? "mt-1 text-[11px] opacity-80"
                    : "mt-1 text-[11px] text-[var(--text-subtle)]"
                }
              >
                {message.senderName} · {formatSchoolDate(message.createdAt)}
              </p>
            </div>
          ))}
        </div>

        {open.closed ? (
          <div className="px-4 pb-24">
            <Alert>
              <AlertTitle>This conversation is closed</AlertTitle>
              <AlertDescription>Write to the school again if you need to.</AlertDescription>
            </Alert>
          </div>
        ) : (
          <div className="space-y-2 px-4 pb-24">
            {send.error ? <SaveError what="Your reply" error={send.error} /> : null}
            {/* The box dims while the reply is in flight. A parent who taps Send
                twice on a slow connection should not send twice. */}
            <SavingOverlay saving={send.isPending} label="Sending…">
              <div className="space-y-2">
                <Textarea
                  rows={3}
                  value={draft}
                  placeholder="Write a reply"
                  onChange={(event) => setDraft(event.target.value)}
                />
                <Button
                  className="w-full"
                  disabled={!draft.trim() || send.isPending}
                  onClick={() => send.mutate()}
                >
                  {send.isPending ? "Sending…" : "Send"}
                </Button>
              </div>
            </SavingOverlay>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="pp-page">
      <div className="section-h">
        Messages from teachers
        {unread > 0 ? <span className="mono-note">{unread} new</span> : null}
      </div>

      {threads.length === 0 ? (
        <div className="px-4">
          <NothingYet
            icon={<ChatCircle className="size-5" aria-hidden />}
            title="No messages yet"
            body="Nothing has been sent either way. If you need something — a question about a lesson, a note about an absence — write to the school below and it goes to the office."
          />
        </div>
      ) : (
        <div className="breakdown">
          {threads.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => setOpenId(row.id)}
              className="breakdown-row w-full cursor-pointer text-left"
            >
              <span className="flex min-w-0 items-center gap-3">
                <PersonAvatar
                  firstName={(row.staff?.name ?? "School").split(" ")[0]}
                  lastName={(row.staff?.name ?? "Office").split(" ").slice(-1)[0]}
                  size="sm"
                />
                <span className="min-w-0">
                  <span className={row.unread ? "nm block font-semibold" : "nm block"}>
                    {row.staff?.name ?? "The school office"}
                  </span>
                  <span className="sb block truncate">{row.lastMessagePreview}</span>
                  <span className="sb block text-[11px]">
                    {row.student ? `re: ${row.student.firstName}` : "General"}
                  </span>
                </span>
              </span>
              {row.unread ? <span className="pip" aria-hidden /> : null}
            </button>
          ))}
        </div>
      )}

      <div className="px-4 py-4 pb-24">
        {writing ? (
          <div className="space-y-2">
            {send.error ? <SaveError what="Your message" error={send.error} /> : null}
            <SavingOverlay saving={send.isPending} label="Sending…">
              <div className="space-y-2">
                <div>
                  <Label htmlFor="msg-subject">What it is about</Label>
                  <Input
                    id="msg-subject"
                    value={subject}
                    placeholder={child ? `About ${child.firstName}` : "Subject"}
                    onChange={(event) => setSubject(event.target.value)}
                  />
                </div>
                <Textarea
                  rows={4}
                  value={draft}
                  placeholder="Write your message to the school"
                  onChange={(event) => setDraft(event.target.value)}
                />
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => { setWriting(false); setDraft(""); setSubject(""); }}
                  >
                    Cancel
                  </Button>
                  <Button
                    className="flex-1"
                    disabled={!subject.trim() || !draft.trim() || send.isPending}
                    onClick={() => send.mutate()}
                  >
                    {send.isPending ? "Sending…" : "Send"}
                  </Button>
                </div>
              </div>
            </SavingOverlay>
          </div>
        ) : (
          <Button className="w-full" onClick={() => setWriting(true)}>
            Write to the school
          </Button>
        )}
      </div>
    </div>
  );
}
