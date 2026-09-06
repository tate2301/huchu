"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button, EmptyState } from "@corelithzw/react";
import { ClientDate } from "@corelithzw/ui/components/client-date";
import { useToast } from "@corelithzw/ui/components/use-toast";
import { getApiErrorMessage } from "@corelithzw/platform/api-client";
import {
  createCrmComment,
  deleteCrmComment,
  fetchCrmComments,
  fetchCrmFollowers,
  followCrmRecord,
  unfollowCrmRecord,
  updateCrmComment,
  type CrmCommentRecord,
} from "@/lib/crm/crm-v2";
import type { CollabEntity } from "@/lib/crm/collaboration";
import { Bell, BellRing, Check, PushPin, Trash2 } from "@corelithzw/ui/lib/icons";
import { cn } from "@corelithzw/ui/lib/utils";

import { RichTextComposer } from "./rich-text-composer";
import { RichTextRenderer } from "@corelithzw/module-records/components/rich-text-renderer";

function initials(name: string | null, email: string): string {
  const source = name?.trim() || email;
  return source
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function CommentThread({
  entity,
  recordId,
  currentUserId,
}: {
  entity: CollabEntity;
  recordId: string;
  currentUserId?: string;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");

  const commentsKey = ["crm-comments", entity, recordId];
  const followersKey = ["crm-followers", entity, recordId];

  const { data, isLoading } = useQuery({
    queryKey: commentsKey,
    queryFn: () => fetchCrmComments(entity, recordId),
  });
  const { data: followerData } = useQuery({
    queryKey: followersKey,
    queryFn: () => fetchCrmFollowers(entity, recordId),
  });

  const comments = data ?? [];
  const followers = followerData?.followers ?? [];
  const isFollowing = followerData?.isFollowing ?? false;

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: commentsKey });
    queryClient.invalidateQueries({ queryKey: followersKey });
  };

  const post = useMutation({
    mutationFn: (input: { body: string; parentId?: string | null }) =>
      createCrmComment({ entity, recordId, ...input }),
    onSuccess: (_result, input) => {
      if (input.parentId) {
        setReplyBody("");
        setReplyTo(null);
      } else {
        setBody("");
      }
      refresh();
    },
    onError: (error) => toast({ title: getApiErrorMessage(error), variant: "destructive" }),
  });

  const mutate = useMutation({
    mutationFn: (input: { id: string; isPinned?: boolean; resolved?: boolean }) =>
      updateCrmComment(input.id, { isPinned: input.isPinned, resolved: input.resolved }),
    onSuccess: refresh,
    onError: (error) => toast({ title: getApiErrorMessage(error), variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteCrmComment(id),
    onSuccess: () => {
      toast({ title: "Comment deleted" });
      refresh();
    },
    onError: (error) => toast({ title: getApiErrorMessage(error), variant: "destructive" }),
  });

  const toggleFollow = useMutation({
    mutationFn: async () => {
      if (isFollowing) await unfollowCrmRecord(entity, recordId);
      else await followCrmRecord(entity, recordId);
    },
    onSuccess: () => {
      toast({ title: isFollowing ? "You'll stop getting updates" : "You'll get updates here" });
      refresh();
    },
    onError: (error) => toast({ title: getApiErrorMessage(error), variant: "destructive" }),
  });

  const renderComment = (comment: CrmCommentRecord, isReply = false) => {
    const mine = comment.createdBy.id === currentUserId;
    const resolved = Boolean(comment.resolvedAt);

    return (
      <div
        key={comment.id}
        className={cn(
          "rounded-[var(--radius-md)] border border-[var(--border-subtle)] p-3",
          isReply ? "ml-8 border-l-2 border-l-[var(--border-strong)]" : "",
          comment.isPinned ? "bg-[var(--surface-subtle)]" : "",
          resolved ? "opacity-60" : "",
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-full bg-[var(--surface-subtle)] text-sm font-medium">
              {initials(comment.createdBy.name, comment.createdBy.email)}
            </span>
            <div className="leading-tight">
              <div className="text-sm font-medium">
                {comment.createdBy.name ?? comment.createdBy.email}
              </div>
              <div className="text-sm text-[var(--text-muted)]">
                <ClientDate value={comment.createdAt} mode="datetime" />
                {comment.editedAt ? " · edited" : null}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {comment.isPinned ? (
              <PushPin className="size-4 text-[var(--text-muted)]" weight="fill" />
            ) : null}
            {!isReply ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => mutate.mutate({ id: comment.id, isPinned: !comment.isPinned })}
              >
                {comment.isPinned ? "Unpin" : "Pin"}
              </Button>
            ) : null}
            {!isReply ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => mutate.mutate({ id: comment.id, resolved: !resolved })}
              >
                {resolved ? "Reopen" : "Resolve"}
              </Button>
            ) : null}
            {mine ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label="Delete comment"
                onClick={() => remove.mutate(comment.id)}
              >
                <Trash2 className="size-4" />
              </Button>
            ) : null}
          </div>
        </div>

        <div className="mt-2">
          <RichTextRenderer body={comment.body} />
        </div>

        {resolved && comment.resolvedBy ? (
          <div className="mt-2 flex items-center gap-1 text-sm text-[var(--text-muted)]">
            <Check className="size-3.5" />
            Resolved by {comment.resolvedBy.name ?? comment.resolvedBy.email}
          </div>
        ) : null}

        {!isReply ? (
          <div className="mt-2">
            {replyTo === comment.id ? (
              <div className="space-y-2">
                <RichTextComposer
                  value={replyBody}
                  onChange={setReplyBody}
                  rows={2}
                  placeholder="Write a reply…"
                  onSubmit={() =>
                    replyBody.trim() &&
                    post.mutate({ body: replyBody.trim(), parentId: comment.id })
                  }
                />
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={!replyBody.trim() || post.isPending}
                    onClick={() => post.mutate({ body: replyBody.trim(), parentId: comment.id })}
                  >
                    Reply
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setReplyTo(null);
                      setReplyBody("");
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setReplyTo(comment.id);
                  setReplyBody("");
                }}
              >
                Reply
              </Button>
            )}
          </div>
        ) : null}

        {comment.replies?.length ? (
          <div className="mt-3 space-y-2">
            {comment.replies.map((reply) => renderComment(reply, true))}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
          {followers.length ? (
            <>
              <span className="flex -space-x-2">
                {followers.slice(0, 5).map((follower) => (
                  <span
                    key={follower.id}
                    title={follower.user.name ?? follower.user.email}
                    className="flex size-6 items-center justify-center rounded-full border border-[var(--surface-base)] bg-[var(--surface-subtle)] text-sm font-medium"
                  >
                    {initials(follower.user.name, follower.user.email)}
                  </span>
                ))}
              </span>
              <span>
                {followers.length} {followers.length === 1 ? "follower" : "followers"}
              </span>
            </>
          ) : (
            <span>No one is following this record yet</span>
          )}
        </div>

        <Button
          type="button"
          variant={isFollowing ? "secondary" : "ghost"}
          size="sm"
          disabled={toggleFollow.isPending}
          onClick={() => toggleFollow.mutate()}
        >
          {isFollowing ? <BellRing className="mr-1.5 size-4" /> : <Bell className="mr-1.5 size-4" />}
          {isFollowing ? "Following" : "Follow"}
        </Button>
      </div>

      <div className="space-y-2">
        <RichTextComposer
          value={body}
          onChange={setBody}
          placeholder="Leave a note. Type @ to bring someone in."
          onSubmit={() => body.trim() && post.mutate({ body: body.trim() })}
        />
        <div className="flex items-center justify-between">
          <span className="text-sm text-[var(--text-muted)]">⌘↵ to post</span>
          <Button
            type="button"
            size="sm"
            disabled={!body.trim() || post.isPending}
            onClick={() => post.mutate({ body: body.trim() })}
          >
            Comment
          </Button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-[var(--text-muted)]">Loading comments…</p>
      ) : comments.length === 0 ? (
        <EmptyState title="Nothing has been said about this record yet" />
      ) : (
        <div className="space-y-2">{comments.map((comment) => renderComment(comment))}</div>
      )}
    </div>
  );
}
