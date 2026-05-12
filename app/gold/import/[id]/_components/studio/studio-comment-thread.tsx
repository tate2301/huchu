"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { useToast } from "@/components/ui/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Send, X, NoteAdd } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { ClientDate } from "@/components/ui/client-date";

type Comment = {
  id: string;
  body: string;
  ledgerEntryId: string | null;
  createdAt: string;
  createdBy: { id: string; name: string };
};

const SUBMIT_HINT =
  typeof navigator !== "undefined" && /Mac/.test(navigator.platform)
    ? "⌘↵ to submit"
    : "Ctrl+↵ to submit";

export function StudioCommentThread({
  importId,
  ledgerEntryId,
  lineNo,
  onClose,
}: {
  importId: string;
  ledgerEntryId?: string;
  lineNo?: number;
  onClose?: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [body, setBody] = useState("");

  const queryKey = ["import-comments", importId, ledgerEntryId ?? "import"];

  const { data: comments = [], isLoading } = useQuery<Comment[]>({
    queryKey,
    queryFn: () => {
      const params = ledgerEntryId
        ? `?ledgerEntryId=${ledgerEntryId}`
        : "?ledgerEntryId=";
      return fetchJson(`/api/gold/imports/${importId}/comments${params}`);
    },
    staleTime: 15_000,
  });

  // Scroll to bottom when new comments arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [comments.length]);

  // Focus textarea when opened
  useEffect(() => {
    const t = setTimeout(() => textareaRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [ledgerEntryId]);

  const addMutation = useMutation({
    mutationFn: (b: string) =>
      fetchJson<Comment>(`/api/gold/imports/${importId}/comments`, {
        method: "POST",
        body: JSON.stringify({ body: b, ledgerEntryId: ledgerEntryId ?? undefined }),
      }),
    onSuccess: (comment) => {
      queryClient.setQueryData<Comment[]>(queryKey, (prev = []) => [...prev, comment]);
      setBody("");
      textareaRef.current?.focus();
    },
    onError: (err) => {
      toast({
        title: "Could not add comment",
        description: getApiErrorMessage(err),
        variant: "destructive",
      });
    },
  });

  const handleSubmit = () => {
    const trimmed = body.trim();
    if (!trimmed) return;
    addMutation.mutate(trimmed);
  };

  const isRowScoped = !!ledgerEntryId;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-[--border] px-3 py-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <NoteAdd className="h-3 w-3 shrink-0 text-[--text-muted]" />
          <span className="text-[11px] font-semibold uppercase tracking-wide text-[--text-muted]">
            {isRowScoped ? "Row notes" : "Import notes"}
          </span>
          {isRowScoped && lineNo != null && (
            <span className="rounded border border-[--border] bg-[--surface-muted] px-1 font-mono text-[10px] tabular-nums text-[--text-muted]">
              L{lineNo}
            </span>
          )}
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="ml-2 shrink-0 rounded p-0.5 text-[--text-muted] hover:text-[--text-strong]"
            aria-label="Close comments"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Scope badge */}
      {isRowScoped && (
        <div className="shrink-0 border-b border-[--border] bg-[--surface-muted] px-3 py-1">
          <p className="text-[10px] text-[--text-muted]">
            Notes on this row only. Open without a row selected to see import-level notes.
          </p>
        </div>
      )}

      {/* Comment list */}
      <div className="flex-1 overflow-y-auto p-3">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full rounded" />
            <Skeleton className="h-10 w-3/4 rounded" />
          </div>
        ) : comments.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-1.5 py-8 text-center">
            <NoteAdd className="h-5 w-5 text-[--text-muted]" />
            <p className="text-xs font-medium text-[--text-muted]">No notes yet</p>
            <p className="text-[11px] text-[--text-muted]">
              {isRowScoped
                ? "Use row notes to document why an anomaly was accepted or flag it for a colleague."
                : "Use import notes to capture context about this import batch — source, period, or known quirks."}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {comments.map((c) => (
              <CommentBubble key={c.id} comment={c} />
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Compose */}
      <div className="shrink-0 border-t border-[--border] p-3">
        <div
          className={cn(
            "flex gap-2 rounded border bg-[--surface-base] p-1.5 transition-colors focus-within:border-[--ring] focus-within:ring-1 focus-within:ring-[--ring]",
            "border-[--border]",
          )}
        >
          <textarea
            ref={textareaRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            rows={2}
            placeholder={`Add a note… (${SUBMIT_HINT})`}
            className="flex-1 resize-none bg-transparent px-1 py-0.5 text-xs text-[--text-strong] placeholder:text-[--text-muted] focus:outline-none"
          />
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!body.trim() || addMutation.isPending}
            title={`Submit (${SUBMIT_HINT})`}
            className="shrink-0 self-end rounded p-1.5 text-[--text-muted] hover:bg-[--surface-muted] hover:text-[--action-primary-bg] disabled:opacity-40"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
        <p className="mt-1 text-[10px] text-[--text-muted]">{SUBMIT_HINT}</p>
      </div>
    </div>
  );
}

function CommentBubble({ comment }: { comment: Comment }) {
  return (
    <div className="group rounded border border-[--border] bg-[--surface-base] p-2.5">
      <div className="mb-1 flex items-baseline gap-2">
        <span className="text-[11px] font-semibold text-[--text-strong]">
          {comment.createdBy.name}
        </span>
        <span className="text-[10px] text-[--text-muted]">
          <ClientDate value={comment.createdAt} mode="datetime" />
        </span>
      </div>
      <p className="whitespace-pre-wrap text-xs leading-relaxed text-[--text-body]">
        {comment.body}
      </p>
    </div>
  );
}
