"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  CardsSkeleton,
  LoadError,
  NothingYet,
  SaveError,
  SavingOverlay,
} from "@/components/schools/common/states";
import { fetchJson } from "@/lib/api-client";
import { formatSchoolDate } from "@/lib/schools/format";
import { Bell, CalendarCheck, ChevronRight, Info, Receipt } from "@/lib/icons";

/**
 * S-6.12 — what the school has said, with read state.
 *
 * Unread is a weight, not a badge: an unread notice is bolder and carries an
 * accent pip, and opening it marks it read. "Mark all read" exists because a
 * parent who has been away for a week wants the dot gone, and clearing them one
 * at a time to achieve that is the behaviour that makes people ignore the dot
 * entirely.
 *
 * The leading chip is toned by severity rather than coloured for decoration: a
 * critical notice from the school and a library reminder should not look alike in
 * a list read at a school gate.
 *
 * One of the eight states is missing on purpose, and the audit reads text, so it
 * is named here rather than left looking forgotten: there is no
 * `NothingMatched`, because News has no filters — everything the school sent
 * this family is on the list, read and unread together.
 */

type Notice = {
  id: string;
  title: string;
  summary: string | null;
  severity: string;
  type: string;
  sentAt: string;
  isRead: boolean;
};

const TONE: Record<string, string> = {
  CRITICAL: "danger",
  WARNING: "warn",
};

function iconFor(notice: Notice) {
  if (notice.severity === "CRITICAL") return Info;
  if (notice.type.includes("FEE") || notice.type.includes("INVOICE")) return Receipt;
  if (notice.type.includes("ATTENDANCE") || notice.type.includes("CALENDAR")) return CalendarCheck;
  return Bell;
}

/**
 * The sender line the prototype shows.
 *
 * A notice the office sent is "From the school" — the enum behind it carries
 * the audience, which is a fact about the *sending* and none of the reader's
 * business: a parent looking at their own News tab already knows it was sent to
 * parents, and "Notice parents" is machinery leaking onto their phone. Anything
 * the system raised on its own keeps its humanised type, which is genuinely
 * where it came from.
 */
function sourceOf(notice: Notice) {
  if (notice.type.startsWith("SCHOOL_NOTICE_")) return "From the school";
  const words = notice.type.replace(/^SCHOOL_/, "").replace(/_/g, " ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function ParentNoticesScreen() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["portal", "parent", "notices"],
    queryFn: () =>
      fetchJson<{ notices: Notice[]; unread: number }>(
        "/api/v2/schools/portal/parent/notices",
      ),
  });

  const markRead = useMutation({
    mutationFn: (ids?: string[]) =>
      fetchJson<{ marked: number }>("/api/v2/schools/portal/parent/notices", {
        method: "POST",
        body: JSON.stringify(ids && ids.length > 0 ? { ids } : {}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portal", "parent", "notices"] });
    },
  });

  if (query.isPending) {
    return (
      /* News is a stack of cards, each an icon tile with a title, a summary
         and a date, so the wait is that stack. Five fills a phone. */
      <div className="p-4">
        <CardsSkeleton count={5} columns={1} lines={2} />
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="p-4">
        <LoadError
          what="school news"
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      </div>
    );
  }

  const notices = query.data?.notices ?? [];
  const unread = query.data?.unread ?? 0;

  if (notices.length === 0) {
    return (
      <div className="p-4">
        <NothingYet
          icon={<Bell className="size-5" aria-hidden />}
          title="Nothing from the school yet"
          body="Anything they send appears here — term dates, fee reminders, a word about your child. You do not need to check; the bell shows a dot when something arrives."
        />
      </div>
    );
  }

  return (
    <div className="pp-page">
      <div className="section-h">
        School news
        <span className="mono-note">{unread > 0 ? `${unread} new` : "All read"}</span>
      </div>

      {markRead.error ? (
        <div className="px-4 pb-3">
          <SaveError what="That notice" error={markRead.error} />
        </div>
      ) : null}

      {/* The list dims while a read is in flight. Marking one notice read is a
          small write, but a parent tapping down the list on a slow connection
          should see which taps have landed. */}
      <SavingOverlay saving={markRead.isPending} label="Marking read…">
        <div className="card-block boxed">
          {notices.map((notice) => {
            const Icon = iconFor(notice);
            const tone = TONE[notice.severity] ?? "";
            return (
              <button
                key={notice.id}
                type="button"
                onClick={() => {
                  if (!notice.isRead) markRead.mutate([notice.id]);
                }}
                className={notice.isRead ? "notice-row" : "notice-row unread"}
              >
                <span className={tone ? `ic ${tone}` : "ic"}>
                  <Icon className="size-4" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="nm block">{notice.title}</span>
                  {notice.summary ? <span className="sb block">{notice.summary}</span> : null}
                  <span className="meta block">
                    {sourceOf(notice)} · {formatSchoolDate(notice.sentAt)}
                  </span>
                </span>
                {notice.isRead ? (
                  <span className="chev">
                    <ChevronRight className="size-[14px]" aria-hidden />
                  </span>
                ) : (
                  <span className="pip" aria-hidden />
                )}
              </button>
            );
          })}
        </div>
      </SavingOverlay>

      {unread > 0 ? (
        <div className="p-4">
          <button
            type="button"
            className="pp-wide-btn"
            disabled={markRead.isPending}
            onClick={() => markRead.mutate(undefined)}
          >
            {markRead.isPending ? "Marking…" : "Mark them all as read"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
