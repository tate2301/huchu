"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchJson } from "@/lib/api-client";
import { Skeleton } from "@/components/ui/skeleton";
import { History, X } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { ClientDate } from "@/components/ui/client-date";

type AuditEvent = {
  id: string;
  actor: string | null;
  eventType: string;
  entityType: string | null;
  entityId: string | null;
  reason: string | null;
  payloadJson: string | null;
  createdAt: string;
};

const EVENT_TYPE_LABEL: Record<string, string> = {
  "gold.import.created": "Created import",
  "gold.import.committed": "Committed import",
  "gold.import.rolled-back": "Rolled back",
  "gold.import.reset-failed": "Reset failed rows",
  "gold.import.deleted": "Deleted import",
  "gold.import.entry.updated": "Edited row",
  "gold.import.tag.set": "Updated tags",
  "gold.import.comment.added": "Added comment",
  "gold.import.preset.saved": "Saved as preset",
  "gold.import.preset.applied": "Applied preset",
};

const EVENT_TYPE_DOT: Record<string, string> = {
  "gold.import.committed": "bg-emerald-500",
  "gold.import.rolled-back": "bg-rose-500",
  "gold.import.reset-failed": "bg-amber-500",
  "gold.import.entry.updated": "bg-sky-400",
  "gold.import.comment.added": "bg-violet-400",
};

function formatEventType(eventType: string): string {
  return EVENT_TYPE_LABEL[eventType] ?? eventType.replace(/^gold\.import\./, "").replace(/[.-]/g, " ");
}

function dotColor(eventType: string): string {
  return EVENT_TYPE_DOT[eventType] ?? "bg-[--text-muted]";
}

function DiffSnippet({ payloadJson }: { payloadJson: string }) {
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(payloadJson) as Record<string, unknown>;
  } catch {
    return null;
  }

  const entries = Object.entries(payload).filter(([, v]) => v !== undefined && v !== null);
  if (entries.length === 0) return null;

  // Show before/after if both present
  if ("before" in payload && "after" in payload) {
    const before = payload.before as Record<string, unknown> | null;
    const after = payload.after as Record<string, unknown> | null;
    const changedKeys = Object.keys(after ?? {}).filter(
      (k) => JSON.stringify(before?.[k]) !== JSON.stringify(after?.[k]),
    );
    if (changedKeys.length === 0) return null;
    return (
      <div className="mt-1 space-y-0.5">
        {changedKeys.slice(0, 3).map((k) => (
          <div key={k} className="flex items-center gap-1 font-mono text-[10px]">
            <span className="text-[--text-muted]">{k}:</span>
            <span className="text-rose-600 line-through opacity-70">
              {String(before?.[k] ?? "—")}
            </span>
            <span className="text-emerald-700">→ {String(after?.[k] ?? "—")}</span>
          </div>
        ))}
        {changedKeys.length > 3 && (
          <p className="text-[10px] text-[--text-muted]">+{changedKeys.length - 3} more fields</p>
        )}
      </div>
    );
  }

  // Show first few scalar values otherwise
  const scalarEntries = entries.filter(([, v]) => typeof v !== "object").slice(0, 2);
  if (scalarEntries.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
      {scalarEntries.map(([k, v]) => (
        <span key={k} className="font-mono text-[10px] text-[--text-muted]">
          {k}: <span className="text-[--text-body]">{String(v)}</span>
        </span>
      ))}
    </div>
  );
}

const FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "gold.import.entry.updated", label: "Edits" },
  { value: "gold.import.comment.added", label: "Comments" },
  { value: "gold.import.committed", label: "Commits" },
  { value: "gold.import.rolled-back", label: "Rollbacks" },
] as const;

type FilterValue = typeof FILTER_OPTIONS[number]["value"];

export function StudioActivityPanel({
  importId,
  onClose,
}: {
  importId: string;
  onClose?: () => void;
}) {
  const [typeFilter, setTypeFilter] = useState<FilterValue>("all");

  const { data: events, isLoading } = useQuery<AuditEvent[]>({
    queryKey: ["gold-import-activity", importId],
    queryFn: () => fetchJson(`/api/gold/imports/${importId}/activity`),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const filtered = useMemo(() => {
    if (!events) return [];
    if (typeFilter === "all") return events;
    return events.filter((e) => e.eventType === typeFilter);
  }, [events, typeFilter]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between border-b border-[--border] px-3 py-2">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[--text-muted]">
          <History className="h-3 w-3" />
          Activity
          {events && events.length > 0 && (
            <span className="ml-1 rounded-full bg-[--surface-muted] px-1.5 py-0.5 text-[10px] tabular-nums text-[--text-muted]">
              {events.length}
            </span>
          )}
        </span>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded p-0.5 text-[--text-muted] hover:text-[--text-strong]"
            aria-label="Close activity panel"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Type filter */}
      <div className="shrink-0 flex items-center gap-1 overflow-x-auto border-b border-[--border] px-2 py-1.5">
        <span className="shrink-0 text-[10px] font-medium text-[--text-muted]">Show:</span>
        {FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setTypeFilter(opt.value)}
            className={cn(
              "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors whitespace-nowrap",
              typeFilter === opt.value
                ? "bg-[--action-secondary-bg] text-[--action-primary-bg]"
                : "text-[--text-muted] hover:text-[--text-body]",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded" />
            ))}
          </div>
        ) : !events || events.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-1.5 py-8 text-center">
            <History className="h-6 w-6 text-[--text-muted]" />
            <p className="text-xs font-medium text-[--text-muted]">No activity yet</p>
            <p className="text-[11px] text-[--text-muted]">
              Every edit, commit, and comment appears here.
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-6 text-center text-xs text-[--text-muted]">
            No {typeFilter.replace("gold.import.", "").replace(/[.-]/g, " ")} events recorded.
          </p>
        ) : (
          <ol className="relative space-y-0 border-l border-[--border] pl-4">
            {filtered.map((event, idx) => (
              <li key={event.id} className="group relative pb-4 last:pb-0">
                <span
                  className={cn(
                    "absolute -left-[17px] top-0.5 h-2 w-2 rounded-full border-2 border-[--surface-base] transition-colors",
                    idx === 0 ? dotColor(event.eventType) : "bg-[--text-muted]",
                  )}
                />
                <div>
                  <p className="text-[11px] font-medium text-[--text-strong]">
                    {formatEventType(event.eventType)}
                  </p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-[--text-muted]">
                    {event.actor && (
                      <span className="font-medium text-[--text-body]">{event.actor}</span>
                    )}
                    <ClientDate value={event.createdAt} mode="datetime" />
                  </div>
                  {event.reason && (
                    <p className="mt-0.5 text-[11px] italic text-[--text-body]">
                      {event.reason}
                    </p>
                  )}
                  {event.payloadJson && (
                    <DiffSnippet payloadJson={event.payloadJson} />
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
