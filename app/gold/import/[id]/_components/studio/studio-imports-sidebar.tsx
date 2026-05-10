"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeftIcon, FileText } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { fetchJson } from "@/lib/api-client";
import { ClientDate } from "@/app/gold/components/client-date";

type ImportListItem = {
  id: string;
  fileName: string;
  status: string;
  rowsTotal: number;
  createdAt: string;
};

const STATUS_DOT: Record<string, string> = {
  COMMITTED: "bg-emerald-500",
  FAILED: "bg-rose-500",
  ROLLED_BACK: "bg-amber-500",
  PREVIEW: "bg-sky-500",
  MAPPING: "bg-sky-400",
  DRAFT: "bg-[--text-subtle]",
};

export function StudioImportsSidebar({
  currentImportId,
  onCollapse,
}: {
  currentImportId: string;
  onCollapse: () => void;
}) {
  const { data } = useQuery({
    queryKey: ["gold-imports-sidebar"],
    queryFn: () =>
      fetchJson<{ data: ImportListItem[] }>("/api/gold/imports?limit=30"),
    staleTime: 60_000,
  });

  const imports = data?.data ?? [];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between border-b border-[--border] px-3 py-2">
        <Link
          href="/gold/import"
          className="flex items-center gap-1 text-[11px] font-medium text-[--text-muted] hover:text-[--text-strong]"
        >
          <ChevronLeftIcon className="h-3.5 w-3.5" />
          All imports
        </Link>
        <button
          type="button"
          onClick={onCollapse}
          aria-label="Collapse sidebar"
          className="rounded p-0.5 text-[--text-muted] hover:text-[--text-strong]"
        >
          <ChevronLeftIcon className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {imports.length === 0 ? (
          <div className="p-4 text-center text-[11px] text-[--text-muted]">No imports</div>
        ) : (
          <ul>
            {imports.map((imp) => (
              <li key={imp.id}>
                <Link
                  href={`/gold/import/${imp.id}`}
                  className={cn(
                    "flex items-start gap-2 border-b border-[--border] px-3 py-2.5 text-[11px] transition-colors hover:bg-[--surface-muted]",
                    imp.id === currentImportId && "bg-[--action-secondary-bg]",
                  )}
                >
                  <FileText
                    className={cn(
                      "mt-0.5 h-3.5 w-3.5 shrink-0",
                      imp.id === currentImportId
                        ? "text-[--action-primary-bg]"
                        : "text-[--text-muted]",
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          "h-1.5 w-1.5 shrink-0 rounded-full",
                          STATUS_DOT[imp.status] ?? "bg-[--text-subtle]",
                        )}
                        aria-label={imp.status}
                      />
                      <span
                        className={cn(
                          "truncate font-medium",
                          imp.id === currentImportId
                            ? "text-[--action-primary-bg]"
                            : "text-[--text-strong]",
                        )}
                      >
                        {imp.fileName}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[--text-muted]">
                      <span className="font-mono">{imp.rowsTotal} rows</span>
                      <ClientDate value={imp.createdAt} mode="date" />
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
