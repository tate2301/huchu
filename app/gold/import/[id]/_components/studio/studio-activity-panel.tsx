"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchJson } from "@/lib/api-client";
import { Skeleton } from "@/components/ui/skeleton";
import { History, X } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { ClientDate } from "@/app/gold/components/client-date";

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

function formatEventType(eventType: string): string {
  return EVENT_TYPE_LABEL[eventType] ?? eventType.replace(/^gold\.import\./, "").replace(/[.-]/g, " ");
}

export function StudioActivityPanel({
  importId,
  onClose,
}: {
  importId: string;
  onClose?: () => void;
}) {
  const { data: events, isLoading } = useQuery<AuditEvent[]>({
    queryKey: ["gold-import-activity", importId],
    queryFn: () => fetchJson(`/api/gold/imports/${importId}/activity`),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between border-b border-[--border] px-3 py-2">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[--text-muted]">
          <History className="h-3 w-3" />
          Activity
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

      <div className="flex-1 overflow-y-auto p-3">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : !events || events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <History className="mb-2 h-6 w-6 text-[--text-muted]" />
            <p className="text-xs text-[--text-muted]">No activity recorded yet</p>
          </div>
        ) : (
          <ol className="relative space-y-0 border-l border-[--border] pl-4">
            {events.map((event, idx) => (
              <li key={event.id} className="relative pb-4">
                <span
                  className={cn(
                    "absolute -left-[17px] top-0.5 h-2 w-2 rounded-full border-2 border-[--surface-base] bg-[--text-muted]",
                    idx === 0 && "bg-[--action-primary-bg]",
                  )}
                />
                <div>
                  <p className="text-[11px] font-medium text-[--text-strong]">
                    {formatEventType(event.eventType)}
                  </p>
                  <div className="mt-0.5 flex items-center gap-2 text-[10px] text-[--text-muted]">
                    {event.actor && (
                      <span className="font-medium">{event.actor}</span>
                    )}
                    <ClientDate value={event.createdAt} mode="datetime" />
                  </div>
                  {event.reason && (
                    <p className="mt-0.5 text-[11px] italic text-[--text-body]">
                      {event.reason}
                    </p>
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
