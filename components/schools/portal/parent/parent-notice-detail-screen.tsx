"use client";

import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  CardsSkeleton,
  LoadError,
  RecordNotFound,
} from "@/components/schools/common/states";
import { fetchJson } from "@/lib/api-client";
import { formatSchoolDate } from "@/lib/schools/format";

import { noticeSource, noticeTone } from "./parent-notice-shape";

/**
 * One notice, in full.
 *
 * A fee reminder is two lines and belongs in the list row a parent is already
 * reading. A letter about a trip is six paragraphs, and a list that renders it
 * inline is a list nobody can scan — so the row truncates it and sends the
 * parent here instead.
 *
 * It reads from the News list's own query rather than a per-notice endpoint:
 * the list is the parent's whole set, capped and already in the cache, so
 * opening one is free and a notice that is not in it is genuinely not theirs.
 *
 * Opening is what marks it read. The list's chevrons used to lead nowhere and
 * a tap meant "mark this read", which is an act no parent was asking to
 * perform — reading is.
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

export function ParentNoticeDetailScreen({ noticeId }: { noticeId: string }) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["portal", "parent", "notices"],
    queryFn: () =>
      fetchJson<{ notices: Notice[]; unread: number }>(
        "/api/v2/schools/portal/parent/notices",
      ),
  });

  const markRead = useMutation({
    mutationFn: (ids: string[]) =>
      fetchJson<{ marked: number }>("/api/v2/schools/portal/parent/notices", {
        method: "POST",
        body: JSON.stringify({ ids }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["portal", "parent", "notices"] });
    },
  });

  const notice = (query.data?.notices ?? []).find((row) => row.id === noticeId) ?? null;
  const unread = notice !== null && !notice.isRead;
  const { mutate } = markRead;

  useEffect(() => {
    if (unread) mutate([noticeId]);
  }, [mutate, noticeId, unread]);

  if (query.isPending) {
    return (
      <div className="p-4">
        <CardsSkeleton count={1} columns={1} lines={6} />
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="p-4">
        <LoadError
          what="this notice"
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      </div>
    );
  }

  if (!notice) {
    return (
      <div className="p-4">
        <RecordNotFound
          what="That notice"
          backHref="/portal/parent/notices"
          backLabel="Back to school news"
        />
      </div>
    );
  }

  const tone = noticeTone(notice.severity);

  return (
    <div className="pp-page">
      <div className="notice-head">
        <span className={tone ? `from ${tone}` : "from"}>{noticeSource(notice)}</span>
        <h2>{notice.title}</h2>
        <div className="when">{formatSchoolDate(notice.sentAt)}</div>
      </div>
      {notice.summary ? <div className="notice-body">{notice.summary}</div> : null}
    </div>
  );
}
