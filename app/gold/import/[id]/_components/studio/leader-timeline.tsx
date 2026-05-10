"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchJson } from "@/lib/api-client";
import { ClientDate } from "@/app/gold/components/client-date";
import { X } from "@/lib/icons";
import { cn } from "@/lib/utils";

type LeaderEntry = {
  id: string;
  parsedDate: string | null;
  gramsTotal: number | null;
  balGrams: number | null;
  importId: string;
  importFileName: string;
  importStatus: string;
};

type LeaderTimelineData = {
  leaderName: string;
  entries: LeaderEntry[];
};

export function LeaderTimeline({
  leaderName,
  currentImportId,
  onClose,
}: {
  leaderName: string;
  currentImportId: string;
  onClose: () => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["leader-timeline", leaderName, currentImportId],
    queryFn: () =>
      fetchJson<LeaderTimelineData>(
        `/api/gold/imports/leader-timeline?name=${encodeURIComponent(leaderName)}`,
      ),
    enabled: !!leaderName,
  });

  return (
    <div
      className={cn(
        "fixed bottom-0 right-0 top-0 z-40 flex w-96 flex-col border-l border-[--border]",
        "bg-[--surface-base] shadow-2xl",
      )}
      style={{ fontFamily: "var(--font-mono, monospace)" }}
    >
      <div className="flex shrink-0 items-center justify-between border-b border-[--border] px-4 py-3">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-[--text-muted]">
            Leader timeline
          </p>
          <p className="text-sm font-semibold text-[--text-strong]">{leaderName}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-[--text-muted] hover:text-[--text-strong]"
          aria-label="Close timeline"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="flex items-center justify-center py-12 text-xs text-[--text-muted]">
            Loading…
          </div>
        )}

        {!isLoading && (!data?.entries || data.entries.length === 0) && (
          <div className="flex items-center justify-center py-12 text-xs text-[--text-muted]">
            No entries found for this leader.
          </div>
        )}

        {data?.entries && data.entries.length > 0 && (
          <table className="w-full border-collapse text-xs">
            <thead className="sticky top-0 z-10 bg-[--surface-muted]/80 backdrop-blur">
              <tr>
                <th className="border-b border-[--border] px-3 py-2 text-left font-semibold text-[--text-muted]">
                  Date
                </th>
                <th className="border-b border-[--border] px-3 py-2 text-right font-semibold text-[--text-muted]">
                  Gross
                </th>
                <th className="border-b border-[--border] px-3 py-2 text-right font-semibold text-[--text-muted]">
                  Bal
                </th>
                <th className="border-b border-[--border] px-3 py-2 text-left font-semibold text-[--text-muted]">
                  Import
                </th>
              </tr>
            </thead>
            <tbody>
              {data.entries.map((entry) => {
                const isCurrent = entry.importId === currentImportId;
                return (
                  <tr
                    key={entry.id}
                    className={cn(
                      "border-b border-[--border] last:border-0",
                      isCurrent && "bg-[--action-secondary-bg]",
                    )}
                  >
                    <td className="px-3 py-1.5 text-[--text-body]">
                      {entry.parsedDate ? (
                        <ClientDate value={entry.parsedDate} mode="date" />
                      ) : (
                        <span className="text-[--text-muted]">—</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono text-[--text-body]">
                      {entry.gramsTotal?.toFixed(3) ?? "—"}
                    </td>
                    <td
                      className={cn(
                        "px-3 py-1.5 text-right font-mono",
                        entry.balGrams != null && entry.balGrams < 0
                          ? "text-rose-600"
                          : "text-[--text-body]",
                      )}
                    >
                      {entry.balGrams?.toFixed(3) ?? "—"}
                    </td>
                    <td className="px-3 py-1.5 max-w-[100px] truncate text-[--text-muted]">
                      <span
                        title={entry.importFileName}
                        className={cn(isCurrent && "font-semibold text-[--text-strong]")}
                      >
                        {isCurrent ? "This import" : entry.importFileName}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
