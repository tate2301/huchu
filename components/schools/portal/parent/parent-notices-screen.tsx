"use client";

import Link from "next/link";
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

import { noticeSource, noticeTone } from "./parent-notice-shape";

/**
 * S-6.12 — what the school has said, with read state.
 *
 * Unread is a weight, not a badge: an unread notice is bolder and carries an
 * accent pip, and reading it marks it read. "Mark all read" exists because a
 * parent who has been away for a week wants the dot gone, and clearing them one
 * at a time to achieve that is the behaviour that makes people ignore the dot
 * entirely.
 *
 * A notice short enough to read in the row is read in the row, and has no
 * chevron because there is nowhere further to go. A long one is cut at two
 * lines and opens on its own screen. That split is the whole reason the
 * chevron can be trusted again.
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

/**
 * Where a body stops fitting a list row. Two lines at 12px on a 390px phone is
 * around this; past it the row becomes the screen.
 */
const ROW_BODY_LIMIT = 200;

function iconFor(notice: Notice) {
  if (notice.severity === "CRITICAL") return Info;
  if (notice.type.includes("FEE") || notice.type.includes("INVOICE")) return Receipt;
  if (notice.type.includes("ATTENDANCE") || notice.type.includes("CALENDAR")) return CalendarCheck;
  return Bell;
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
          body="Anything they send appears here — term dates, fee reminders, a word about your child."
        />
      </div>
    );
  }

  return (
    <div className="pp-page">
      <div className="section-h">
        School news
        <span className="count-note">{unread > 0 ? `${unread} new` : "All read"}</span>
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
            const tone = noticeTone(notice.severity);
            const long = (notice.summary?.length ?? 0) > ROW_BODY_LIMIT;
            const lead = (
              <>
                <span className={tone ? `ic ${tone}` : "ic"}>
                  <Icon className="size-4" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="nm block">{notice.title}</span>
                  {notice.summary ? (
                    <span className={long ? "sb clamp block" : "sb block"}>{notice.summary}</span>
                  ) : null}
                  <span className="meta block">
                    {noticeSource(notice)} · {formatSchoolDate(notice.sentAt)}
                  </span>
                </span>
              </>
            );

            if (long) {
              return (
                <Link
                  key={notice.id}
                  href={`/portal/parent/notice/${notice.id}`}
                  className={notice.isRead ? "notice-row" : "notice-row unread"}
                >
                  {lead}
                  {notice.isRead ? (
                    <span className="chev">
                      <ChevronRight className="size-[14px]" aria-hidden />
                    </span>
                  ) : (
                    <span className="pip" aria-hidden />
                  )}
                </Link>
              );
            }

            return (
              <button
                key={notice.id}
                type="button"
                onClick={() => {
                  if (!notice.isRead) markRead.mutate([notice.id]);
                }}
                className={notice.isRead ? "notice-row" : "notice-row unread"}
              >
                {lead}
                {notice.isRead ? <span /> : <span className="pip" aria-hidden />}
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
