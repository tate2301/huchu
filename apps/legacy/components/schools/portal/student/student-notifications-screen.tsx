"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClientDate } from "@corelithzw/react";
import {
  CardsSkeleton,
  LoadError,
  NothingLeftToDo,
  NothingYet,
  SaveError,
  SavingOverlay,
} from "@/components/schools/common/states";
import { dsConfirm } from "@corelithzw/ui/components/ds-confirm";
import { isFeatureDisabledError } from "@corelithzw/platform/api-client";
import {
  archiveNotifications,
  fetchNotifications,
  markNotificationsRead,
  type NotificationListItem,
} from "@/lib/api";
import { AlertTriangle, Bell, Info, ShieldAlert } from "@corelithzw/ui/lib/icons";
import { useStudentPortal } from "./student-portal-context";

const QUERY_KEY = ["notifications", "student", "inbox"] as const;

/**
 * How loud a message is, said with an icon and a word as well as a colour.
 *
 * Never colour alone: a red tile and a grey tile look the same to a child who
 * cannot tell them apart, so the tile carries a shape and the row carries a
 * label.
 */
function toneOf(item: NotificationListItem) {
  if (item.severity === "CRITICAL") {
    return { accent: "sp-c-2", Icon: ShieldAlert, label: "Important" };
  }
  if (item.severity === "WARNING") {
    return { accent: "sp-c-9", Icon: AlertTriangle, label: "Worth reading" };
  }
  return { accent: "sp-c-0", Icon: Info, label: "News" };
}

/**
 * What the school has told this pupil, newest first.
 *
 * The demo invents a message feed. This one is the platform's real notification
 * centre, which already does the two things that matter: it is addressed to a
 * user rather than fetched by an id, and it keeps read state per recipient. So
 * a pupil sees their own messages because the row is theirs, not because the
 * phone asked for their id — the same S-0.2 rule the rest of the portal keeps,
 * enforced one layer down.
 *
 * Tapping a message marks it read, which is the only thing a message here can
 * do. The notification centre supports typed actions, but every one it can
 * build today points at payroll, incidents and work orders — nothing a child is
 * ever the recipient of — so the row deliberately renders no action buttons
 * rather than showing a pupil a link into the back office.
 *
 * "Clear" archives rather than deletes: a cleared message is out of the way and
 * still on the record, which is the right answer when the thing cleared might
 * have been a detention notice.
 *
 * One of the eight states is missing on purpose, and the audit reads text, so it
 * is named here rather than left looking forgotten: there is no
 * `NothingMatched`, because the inbox has no filters — everything unarchived is
 * on it, newest first.
 */
export function StudentNotificationsScreen() {
  const { student } = useStudentPortal();
  const queryClient = useQueryClient();

  const inbox = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => fetchNotifications({ limit: 50 }),
    enabled: Boolean(student),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["notifications"] });
  };

  const read = useMutation({
    mutationFn: (recipientIds: string[]) => markNotificationsRead({ recipientIds }),
    onSuccess: invalidate,
  });

  const clear = useMutation({
    mutationFn: (recipientIds: string[]) => archiveNotifications({ recipientIds }),
    onSuccess: invalidate,
  });

  if (!student) {
    return (
      <NothingYet
        title="This account is not linked to a pupil"
        body="Ask the school office to link your sign-in to your student record. Until they do, the school cannot send you anything here."
      />
    );
  }

  const messages = inbox.data?.data ?? [];
  const unread = messages.filter((item) => !item.isRead);

  // A school that has not switched the notification centre on is not an error a
  // child should read as broken. Say what is true and stop.
  if (isFeatureDisabledError(inbox.error)) {
    return (
      <NothingYet
        icon={<Bell className="size-5" aria-hidden />}
        title="Messages are switched off at your school"
        body="Your school has not turned this part of the app on. Notices still go up the usual way — ask your form teacher."
      />
    );
  }

  return (
    <div className="flex flex-col">
      {inbox.error ? (
        <LoadError
          what="your messages"
          error={inbox.error}
          onRetry={() => void inbox.refetch()}
        />
      ) : null}
      {read.error ? <SaveError what="That message" error={read.error} /> : null}
      {clear.error ? <SaveError what="Those messages" error={clear.error} /> : null}

      <div className="sp-notif-meta">
        <span>
          {inbox.isPending
            ? "Reading your messages…"
            : `${messages.length} message${messages.length === 1 ? "" : "s"} · ${unread.length} new`}
        </span>
        {messages.length > 0 ? (
          <span className="flex items-center gap-3">
            <button
              type="button"
              className="sp-psh-link"
              disabled={unread.length === 0 || read.isPending}
              onClick={() => read.mutate(unread.map((item) => item.recipientId))}
            >
              Mark all read
            </button>
            <button
              type="button"
              className="sp-psh-link"
              disabled={clear.isPending}
              onClick={() => {
                void (async () => {
                  const confirmed = await dsConfirm({
                    title: `Clear ${messages.length} message${messages.length === 1 ? "" : "s"}`,
                    description:
                      "They come off this list. The school still has them, so nothing is lost.",
                    confirmLabel: "Clear them",
                    variant: "warning",
                  });
                  if (!confirmed) return;
                  clear.mutate(messages.map((item) => item.recipientId));
                })();
              }}
            >
              Clear all
            </button>
          </span>
        ) : null}
      </div>

      {inbox.isPending ? (
        /* A message is an icon tile, a title, a summary and a time — a card.
           Six is a phone screen's worth. */
        <CardsSkeleton count={6} columns={1} lines={2} />
      ) : messages.length === 0 ? (
        /* An empty inbox is not a job undone; it is an inbox that has been
           read. So this is good news, not a prompt to go and make something. */
        <NothingLeftToDo
          title="Nothing new"
          body="You are all caught up. Messages from the school land here — marks going up, homework set, notices from the office."
        />
      ) : (
        /* The list dims while a read or a clear is in flight, so a pupil
           tapping down a long inbox can see which taps have landed. */
        <SavingOverlay
          saving={read.isPending || clear.isPending}
          label={clear.isPending ? "Clearing…" : "Marking read…"}
        >
          <div className="sp-notifs">
            {messages.map((item) => {
              const tone = toneOf(item);
              return (
                <button
                  key={item.recipientId}
                  type="button"
                  className={`sp-notif${item.isRead ? "" : " unread"} ${tone.accent}`}
                  aria-label={`${tone.label}: ${item.title}${item.isRead ? "" : ", unread"}`}
                  onClick={() => {
                    if (item.isRead) return;
                    read.mutate([item.recipientId]);
                  }}
                >
                  <span className="sp-nf-ic">
                    <tone.Icon className="size-4" aria-hidden />
                  </span>
                  <span className="sp-nf-body">
                    <span className="sp-nf-nm block">{item.title}</span>
                    {item.summary ? (
                      <span className="sp-nf-sb block">{item.summary}</span>
                    ) : null}
                    <span className="sp-nf-tm block">
                      <ClientDate value={item.createdAt} mode="datetime" />
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </SavingOverlay>
      )}
    </div>
  );
}
