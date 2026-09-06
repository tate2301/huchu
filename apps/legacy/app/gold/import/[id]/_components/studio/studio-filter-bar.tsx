"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { useToast } from "@/components/ui/use-toast";
import { Save, ChevronDown, X } from "@/lib/icons";
import { cn } from "@/lib/utils";
import type { AnomalySeverity, LedgerEntry } from "../types";

export type StudioFilter = {
  severities: AnomalySeverity[];
  statuses: LedgerEntry["status"][];
  dateMin: string;
  dateMax: string;
  leaders: string[];
  mapped: "all" | "mapped" | "unmapped";
};

const DEFAULT_FILTER: StudioFilter = {
  severities: [],
  statuses: [],
  dateMin: "",
  dateMax: "",
  leaders: [],
  mapped: "all",
};

type SavedView = {
  id: string;
  name: string;
  filterJson: string;
  updatedAt: string;
};

const ALL_SEVERITIES: AnomalySeverity[] = ["CRITICAL", "WARN", "INFO"];
const ALL_STATUSES: LedgerEntry["status"][] = ["PENDING", "CREATED", "ANOMALY", "FAILED"];

const SEVERITY_CHIP = {
  CRITICAL: "border-rose-300 bg-rose-50 text-rose-700",
  WARN: "border-amber-300 bg-amber-50 text-amber-700",
  INFO: "border-sky-300 bg-sky-50 text-sky-700",
};

export function StudioFilterBar({
  filter,
  onFilterChange,
  distinctLeaders,
}: {
  filter: StudioFilter;
  onFilterChange: (f: StudioFilter) => void;
  distinctLeaders: string[];
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [saveOpen, setSaveOpen] = useState(false);
  const [viewsOpen, setViewsOpen] = useState(false);
  const [saveName, setSaveName] = useState("");

  const { data: savedViews = [] } = useQuery<SavedView[]>({
    queryKey: ["import-saved-views"],
    queryFn: () => fetchJson("/api/gold/imports/saved-views"),
    staleTime: 60_000,
  });

  const saveMutation = useMutation({
    mutationFn: (name: string) =>
      fetchJson<SavedView>("/api/gold/imports/saved-views", {
        method: "POST",
        body: JSON.stringify({ name, filterJson: JSON.stringify(filter) }),
      }),
    onSuccess: (view) => {
      queryClient.setQueryData<SavedView[]>(["import-saved-views"], (prev = []) => {
        const filtered = prev.filter((v) => v.id !== view.id);
        return [view, ...filtered];
      });
      toast({ title: `View "${view.name}" saved`, variant: "success" });
      setSaveOpen(false);
      setSaveName("");
    },
    onError: (err) => {
      toast({
        title: "Could not save view",
        description: getApiErrorMessage(err),
        variant: "destructive",
      });
    },
  });

  const applyView = (view: SavedView) => {
    try {
      const f = JSON.parse(view.filterJson) as StudioFilter;
      onFilterChange(f);
      setViewsOpen(false);
      toast({ title: `View "${view.name}" applied`, variant: "success" });
    } catch {
      toast({ title: "Could not apply view", variant: "destructive" });
    }
  };

  const isFiltered =
    filter.severities.length > 0 ||
    filter.statuses.length > 0 ||
    filter.dateMin ||
    filter.dateMax ||
    filter.leaders.length > 0 ||
    filter.mapped !== "all";

  const toggleSeverity = (sev: AnomalySeverity) => {
    const next = filter.severities.includes(sev)
      ? filter.severities.filter((s) => s !== sev)
      : [...filter.severities, sev];
    onFilterChange({ ...filter, severities: next });
  };

  const toggleStatus = (st: LedgerEntry["status"]) => {
    const next = filter.statuses.includes(st)
      ? filter.statuses.filter((s) => s !== st)
      : [...filter.statuses, st];
    onFilterChange({ ...filter, statuses: next });
  };

  const toggleLeader = (leader: string) => {
    const next = filter.leaders.includes(leader)
      ? filter.leaders.filter((l) => l !== leader)
      : [...filter.leaders, leader];
    onFilterChange({ ...filter, leaders: next });
  };

  return (
    <div className="shrink-0 border-b border-[--border] bg-[--surface-base] px-3 py-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-[--text-muted]">
          Filter
        </span>

        <div className="flex gap-1">
          {ALL_SEVERITIES.map((sev) => (
            <button
              key={sev}
              type="button"
              onClick={() => toggleSeverity(sev)}
              className={cn(
                "rounded border px-1.5 py-0.5 text-[10px] font-medium transition-opacity",
                filter.severities.includes(sev)
                  ? SEVERITY_CHIP[sev]
                  : "border-[--border] text-[--text-muted] opacity-60 hover:opacity-100",
              )}
            >
              {sev[0] + sev.slice(1).toLowerCase()}
            </button>
          ))}
        </div>

        <div className="flex gap-1">
          {ALL_STATUSES.map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => toggleStatus(st)}
              className={cn(
                "rounded border px-1.5 py-0.5 text-[10px] font-medium transition-opacity",
                filter.statuses.includes(st)
                  ? "border-[--action-primary-bg] bg-[--action-secondary-bg] text-[--action-primary-bg]"
                  : "border-[--border] text-[--text-muted] opacity-60 hover:opacity-100",
              )}
            >
              {st[0] + st.slice(1).toLowerCase()}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          <span className="text-[10px] text-[--text-muted]">from</span>
          <input
            type="date"
            value={filter.dateMin}
            onChange={(e) => onFilterChange({ ...filter, dateMin: e.target.value })}
            className="h-5 rounded border border-[--border] bg-[--surface-base] px-1 text-[10px] text-[--text-strong] focus:outline-none"
          />
          <span className="text-[10px] text-[--text-muted]">to</span>
          <input
            type="date"
            value={filter.dateMax}
            onChange={(e) => onFilterChange({ ...filter, dateMax: e.target.value })}
            className="h-5 rounded border border-[--border] bg-[--surface-base] px-1 text-[10px] text-[--text-strong] focus:outline-none"
          />
        </div>

        {distinctLeaders.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {distinctLeaders.map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => toggleLeader(l)}
                className={cn(
                  "rounded border px-1.5 py-0.5 font-mono text-[10px] transition-opacity",
                  filter.leaders.includes(l)
                    ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                    : "border-[--border] text-[--text-muted] opacity-60 hover:opacity-100",
                )}
              >
                {l}
              </button>
            ))}
          </div>
        )}

        <div className="flex gap-1">
          {(["all", "mapped", "unmapped"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onFilterChange({ ...filter, mapped: m })}
              className={cn(
                "rounded border px-1.5 py-0.5 text-[10px] transition-opacity",
                filter.mapped === m
                  ? "border-[--action-primary-bg] bg-[--action-secondary-bg] text-[--action-primary-bg]"
                  : "border-[--border] text-[--text-muted] opacity-60 hover:opacity-100",
              )}
            >
              {m}
            </button>
          ))}
        </div>

        {isFiltered && (
          <button
            type="button"
            onClick={() => onFilterChange(DEFAULT_FILTER)}
            className="flex items-center gap-0.5 text-[10px] text-[--text-muted] hover:text-[--text-strong]"
          >
            <X className="h-3 w-3" />
            Clear
          </button>
        )}

        <div className="ml-auto flex items-center gap-1">
          <div className="relative">
            <button
              type="button"
              onClick={() => setViewsOpen((o) => !o)}
              className="flex items-center gap-1 rounded border border-[--border] bg-[--surface-base] px-2 py-0.5 text-[10px] text-[--text-muted] hover:bg-[--surface-muted]"
            >
              Views
              <ChevronDown className="h-3 w-3" />
            </button>
            {viewsOpen && (
              <div className="absolute right-0 top-full z-50 mt-1 w-48 rounded border border-[--border] bg-[--surface-base] shadow-md">
                {savedViews.length === 0 ? (
                  <p className="px-3 py-2 text-[11px] text-[--text-muted]">No saved views</p>
                ) : (
                  savedViews.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => applyView(v)}
                      className="w-full px-3 py-1.5 text-left text-[11px] text-[--text-body] hover:bg-[--surface-muted]"
                    >
                      {v.name}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => setSaveOpen((o) => !o)}
              className="flex items-center gap-1 rounded border border-[--border] bg-[--surface-base] px-2 py-0.5 text-[10px] text-[--text-muted] hover:bg-[--surface-muted]"
            >
              <Save className="h-3 w-3" />
              Save view
            </button>
            {saveOpen && (
              <div className="absolute right-0 top-full z-50 mt-1 flex w-56 flex-col gap-2 rounded border border-[--border] bg-[--surface-base] p-2 shadow-md">
                <input
                  type="text"
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (saveName.trim()) saveMutation.mutate(saveName.trim()); } }}
                  placeholder="View name…"
                  autoFocus
                  className="rounded border border-[--border] bg-[--surface-muted] px-2 py-1 text-[11px] text-[--text-strong] placeholder:text-[--text-muted] focus:outline-none focus:ring-1 focus:ring-[--ring]"
                />
                <button
                  type="button"
                  disabled={!saveName.trim() || saveMutation.isPending}
                  onClick={() => { if (saveName.trim()) saveMutation.mutate(saveName.trim()); }}
                  className="rounded bg-[--action-primary-bg] px-2 py-1 text-[11px] font-medium text-white disabled:opacity-40"
                >
                  Save
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export { DEFAULT_FILTER };
