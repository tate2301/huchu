"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { useToast } from "@/components/ui/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Send, X, NoteAdd } from "@/lib/icons";
import { ClientDate } from "@/app/gold/components/client-date";

type Comment = {
  id: string;
  body: string;
  ledgerEntryId: string | null;
  createdAt: string;
  createdBy: { id: string; name: string };
};

export function StudioCommentThread({
  importId,
  ledgerEntryId,
  onClose,
}: {
  importId: string;
  ledgerEntryId?: string;
  onClose?: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
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

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between border-b border-[--border] px-3 py-2">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[--text-muted]">
          <NoteAdd className="h-3 w-3" />
          {ledgerEntryId ? "Row comments" : "Import notes"}
        </span>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded p-0.5 text-[--text-muted] hover:text-[--text-strong]"
            aria-label="Close comments"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : comments.length === 0 ? (
          <p className="py-4 text-center text-xs text-[--text-muted]">
            No comments yet
          </p>
        ) : (
          <div className="space-y-3">
            {comments.map((c) => (
              <div key={c.id} className="rounded border border-[--border] bg-[--surface-base] p-2.5 text-xs">
                <div className="mb-1 flex items-center gap-2">
                  <span className="font-medium text-[--text-strong]">{c.createdBy.name}</span>
                  <span className="text-[10px] text-[--text-muted]">
                    <ClientDate value={c.createdAt} mode="datetime" />
                  </span>
                </div>
                <p className="whitespace-pre-wrap text-[--text-body]">{c.body}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-[--border] p-3">
        <div className="flex gap-2">
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
            placeholder="Add comment… (Ctrl+Enter to submit)"
            className="flex-1 resize-none rounded border border-[--border] bg-[--surface-base] px-2 py-1.5 text-xs text-[--text-strong] placeholder:text-[--text-muted] focus:outline-none focus:ring-1 focus:ring-[--ring]"
          />
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!body.trim() || addMutation.isPending}
            className="shrink-0 self-end rounded border border-[--border] bg-[--surface-base] p-2 text-[--text-muted] hover:bg-[--surface-muted] hover:text-[--text-strong] disabled:opacity-40"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
