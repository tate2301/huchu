"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { useToast } from "@/components/ui/use-toast";
import { X, Plus } from "@/lib/icons";
import { cn } from "@/lib/utils";

type Tag = { id: string; importId: string; label: string; createdAt: string };

export function StudioTagPicker({
  importId,
  isLocked,
}: {
  importId: string;
  isLocked: boolean;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [inputVal, setInputVal] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: tags = [] } = useQuery<Tag[]>({
    queryKey: ["import-tags", importId],
    queryFn: () => fetchJson(`/api/gold/imports/${importId}/tags`),
  });

  const { data: suggestions = [] } = useQuery<string[]>({
    queryKey: ["import-tag-suggestions"],
    queryFn: () => fetchJson("/api/gold/imports/tag-suggestions"),
    staleTime: 60_000,
  });

  const setTagsMutation = useMutation({
    mutationFn: (labels: string[]) =>
      fetchJson<Tag[]>(`/api/gold/imports/${importId}/tags`, {
        method: "POST",
        body: JSON.stringify({ labels }),
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(["import-tags", importId], updated);
    },
    onError: (err) => {
      toast({
        title: "Could not update tags",
        description: getApiErrorMessage(err),
        variant: "destructive",
      });
    },
  });

  const currentLabels = tags.map((t) => t.label);

  const addTag = (label: string) => {
    const trimmed = label.trim();
    if (!trimmed || currentLabels.includes(trimmed)) return;
    setTagsMutation.mutate([...currentLabels, trimmed]);
    setInputVal("");
    setShowSuggestions(false);
  };

  const removeTag = (label: string) => {
    setTagsMutation.mutate(currentLabels.filter((l) => l !== label));
  };

  const filtered = suggestions.filter(
    (s) =>
      !currentLabels.includes(s) &&
      s.toLowerCase().includes(inputVal.toLowerCase()),
  );

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map((tag) => (
        <span
          key={tag.id}
          className="inline-flex items-center gap-1 rounded-full border border-[--border] bg-[--surface-muted] px-2 py-0.5 text-[11px] text-[--text-body]"
        >
          {tag.label}
          {!isLocked && (
            <button
              type="button"
              onClick={() => removeTag(tag.label)}
              className="text-[--text-muted] hover:text-[--text-strong]"
              aria-label={`Remove tag ${tag.label}`}
            >
              <X className="h-2.5 w-2.5" />
            </button>
          )}
        </span>
      ))}

      {!isLocked && (
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            value={inputVal}
            onChange={(e) => { setInputVal(e.target.value); setShowSuggestions(true); }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); addTag(inputVal); }
              if (e.key === "Escape") { setShowSuggestions(false); setInputVal(""); }
            }}
            placeholder="Add tag…"
            className="h-6 rounded border border-dashed border-[--border] bg-transparent px-2 text-[11px] text-[--text-body] placeholder:text-[--text-muted] focus:outline-none focus:ring-1 focus:ring-[--ring]"
            style={{ width: Math.max(60, inputVal.length * 7 + 40) }}
          />
          {showSuggestions && filtered.length > 0 && (
            <div className="absolute left-0 top-full z-50 mt-1 max-h-40 w-48 overflow-y-auto rounded border border-[--border] bg-[--surface-base] shadow-md">
              {filtered.slice(0, 12).map((s) => (
                <button
                  key={s}
                  type="button"
                  onMouseDown={() => addTag(s)}
                  className="flex w-full items-center gap-1.5 px-2 py-1 text-left text-[11px] text-[--text-body] hover:bg-[--surface-muted]"
                >
                  <Plus className="h-2.5 w-2.5 text-[--text-muted]" />
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
