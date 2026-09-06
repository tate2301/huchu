"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  AlertCircle,
  Search,
  Lock,
} from "@/lib/icons";
import { StudioTagPicker } from "./studio-tags-panel";
import { StudioPresetManager } from "./studio-preset-manager";
import type { ImportDetail, LedgerEntry } from "../types";
import type { Site } from "@/lib/api";

type Group = { id: string; name: string };

export function TabMappings({
  importData,
  importId,
  distinctNames,
  sites,
  groups,
  localMappings,
  existingMappings,
  onSetSite,
  onSetMapping,
  isLocked,
}: {
  importData: ImportDetail;
  importId: string;
  distinctNames: string[];
  sites: Site[];
  groups: Group[];
  localMappings: Record<string, string>;
  existingMappings: Record<string, string>;
  onSetSite: (siteId: string) => void;
  onSetMapping: (name: string, groupId: string) => void;
  isLocked: boolean;
}) {
  const queryClient = useQueryClient();
  const mappedCount = distinctNames.filter(
    (n) => !!(localMappings[n] || existingMappings[n]),
  ).length;

  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState<string | null>(
    distinctNames[0] ?? null,
  );

  // Counts per leader so the operator sees the impact of each mapping
  // before clicking through to the Ledger.
  const rowCountsByName = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of importData.entries) {
      if (!e.parsedName) continue;
      map.set(e.parsedName, (map.get(e.parsedName) ?? 0) + 1);
    }
    return map;
  }, [importData.entries]);

  const filteredNames = useMemo(() => {
    if (!query) return distinctNames;
    const q = query.toLowerCase();
    return distinctNames.filter((n) => n.toLowerCase().includes(q));
  }, [distinctNames, query]);

  // Sample rows for the focused leader — keeps the preview pane fast and
  // legible. Operators rarely need to scan more than a handful to confirm
  // the right person.
  const focusedRows = useMemo<LedgerEntry[]>(() => {
    if (!focused) return [];
    return importData.entries
      .filter((e) => e.parsedName === focused)
      .slice(0, 25);
  }, [importData.entries, focused]);

  const focusedMappingId =
    focused != null
      ? localMappings[focused] ?? existingMappings[focused] ?? null
      : null;
  const focusedGroup = focusedMappingId
    ? groups.find((g) => g.id === focusedMappingId) ?? null
    : null;

  return (
    <div className="space-y-6 p-6">
      {/* Site assignment — pinned at the top as the precondition for every
          mapping below it. */}
      <section className="bg-[--surface-base] overflow-hidden">
        <header className="flex items-center justify-between gap-3 border-b border-[--border] bg-[--surface-muted] px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-[--text-strong]">
              Site assignment
            </h2>
            <p className="mt-0.5 text-xs text-[--text-muted]">
              All ledger rows in this import will be attributed to this site.
            </p>
          </div>
          {importData.siteId ? (
            <Badge variant="soft-success">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Assigned
            </Badge>
          ) : (
            <Badge variant="soft-danger">
              <AlertCircle className="h-3.5 w-3.5" />
              Required
            </Badge>
          )}
        </header>
        <div className="p-4">
          <div className="w-64">
            <SearchableSelect
              options={sites.map((s) => ({
                value: s.id,
                label: `${s.code} — ${s.name}`,
              }))}
              value={importData.siteId ?? ""}
              onValueChange={onSetSite}
              placeholder="Pick site…"
              disabled={isLocked}
            />
          </div>
        </div>
      </section>

      {/* Leader → shift group mappings — two-pane editor. Left is the list
          of parsed leader names; right previews the rows that will be
          attributed to whichever shift group is picked. Cuts the "who is
          this person?" question to one click. */}
      <section className="bg-[--surface-base] overflow-hidden">
        <header className="flex items-center justify-between gap-3 border-b border-[--border] bg-[--surface-muted] px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-[--text-strong]">
              Leader mappings
            </h2>
            <p className="mt-0.5 text-xs text-[--text-muted]">
              {mappedCount === distinctNames.length
                ? `All ${distinctNames.length} leaders mapped`
                : `${mappedCount} / ${distinctNames.length} mapped — every leader must be assigned before commit`}
            </p>
          </div>
          {distinctNames.length > 0 && (
            <Badge
              variant={
                mappedCount === distinctNames.length
                  ? "soft-success"
                  : "soft-warning"
              }
            >
              {mappedCount} / {distinctNames.length}
            </Badge>
          )}
        </header>

        {distinctNames.length === 0 ? (
          <div className="p-6 text-center text-sm text-[--text-muted]">
            No leader names parsed from this import.
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            {/* Left: searchable list */}
            <div className="border-b border-[--border] lg:border-b-0 lg:border-r">
              <div className="border-b border-[--border] bg-[--surface-base] p-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[--text-subtle]" />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={`Search ${distinctNames.length} leaders…`}
                    className="h-8 pl-7 text-xs"
                  />
                </div>
              </div>
              <ul
                role="listbox"
                aria-label="Parsed leader names"
                className="max-h-[480px] overflow-y-auto"
              >
                {filteredNames.length === 0 ? (
                  <li className="px-3 py-6 text-center text-xs text-[--text-muted]">
                    No leaders match &ldquo;{query}&rdquo;.
                  </li>
                ) : (
                  filteredNames.map((name) => {
                    const mappingId =
                      localMappings[name] ?? existingMappings[name] ?? null;
                    const mappedGroup = mappingId
                      ? groups.find((g) => g.id === mappingId) ?? null
                      : null;
                    const isFocused = focused === name;
                    const count = rowCountsByName.get(name) ?? 0;

                    return (
                      <li key={name}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={isFocused}
                          onClick={() => setFocused(name)}
                          className={cn(
                            "flex w-full items-center gap-2 border-b border-[--border]/60 px-3 py-2 text-left transition-colors",
                            "focus:outline-none focus-visible:bg-[--surface-muted]",
                            isFocused
                              ? "bg-[--action-secondary-bg]/40 shadow-[inset_3px_0_0_0_var(--action-primary-bg)]"
                              : "hover:bg-[--surface-muted]",
                          )}
                        >
                          <span
                            className={cn(
                              "h-1.5 w-1.5 shrink-0 rounded-full",
                              mappedGroup ? "bg-emerald-500" : "bg-amber-400",
                            )}
                            aria-hidden="true"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-mono text-xs font-semibold text-[--text-strong]">
                              {name}
                            </div>
                            <div className="truncate text-[10px] text-[--text-muted]">
                              {mappedGroup
                                ? mappedGroup.name
                                : "Unmapped"}
                            </div>
                          </div>
                          <span className="shrink-0 rounded bg-[--surface-muted] px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-[--text-muted]">
                            {count}
                          </span>
                        </button>
                      </li>
                    );
                  })
                )}
              </ul>
            </div>

            {/* Right: preview + mapping picker for focused leader */}
            <div className="min-w-0 bg-[--surface-base]">
              {focused == null ? (
                <div className="flex h-full items-center justify-center p-8 text-center text-sm text-[--text-muted]">
                  Pick a leader on the left to preview their rows.
                </div>
              ) : (
                <div className="flex h-full min-h-[280px] flex-col">
                  <header className="border-b border-[--border] bg-[--surface-muted] px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[11px] uppercase tracking-wide text-[--text-muted]">
                          Leader
                        </div>
                        <h3 className="truncate font-mono text-sm font-semibold text-[--text-strong]">
                          {focused}
                        </h3>
                      </div>
                      <span className="shrink-0 text-[11px] text-[--text-muted]">
                        {rowCountsByName.get(focused) ?? 0} rows
                      </span>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <SearchableSelect
                          options={groups.map((g) => ({
                            value: g.id,
                            label: g.name,
                          }))}
                          value={focusedMappingId ?? ""}
                          onValueChange={(gId) => onSetMapping(focused, gId)}
                          placeholder="Assign shift group…"
                          disabled={isLocked}
                        />
                      </div>
                      {focusedGroup && (
                        <Badge variant="soft-success" className="shrink-0">
                          <CheckCircle2 className="h-3 w-3" />
                          Mapped
                        </Badge>
                      )}
                      {isLocked && (
                        <Lock
                          className="h-3.5 w-3.5 shrink-0 text-[--text-muted]"
                          aria-label="Committed — locked"
                        />
                      )}
                    </div>
                  </header>

                  <div className="min-h-0 flex-1 overflow-y-auto">
                    {focusedRows.length === 0 ? (
                      <div className="flex h-full items-center justify-center p-8 text-center text-xs text-[--text-muted]">
                        No rows reference this leader.
                      </div>
                    ) : (
                      <table className="min-w-full text-[11px]">
                        <thead className="sticky top-0 bg-[--surface-base]">
                          <tr className="border-b border-[--border] text-[--text-muted]">
                            <th className="px-3 py-1.5 text-left font-medium uppercase tracking-wide">
                              #
                            </th>
                            <th className="px-3 py-1.5 text-left font-medium uppercase tracking-wide">
                              Date
                            </th>
                            <th className="px-3 py-1.5 text-right font-medium uppercase tracking-wide">
                              Gross
                            </th>
                            <th className="px-3 py-1.5 text-right font-medium uppercase tracking-wide">
                              Bal
                            </th>
                            <th className="px-3 py-1.5 text-left font-medium uppercase tracking-wide">
                              Status
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {focusedRows.map((r) => (
                            <tr
                              key={r.id}
                              className="border-b border-[--border]/60 align-middle"
                            >
                              <td className="px-3 py-1.5 font-mono text-[--text-muted] tabular-nums">
                                {r.lineNo}
                              </td>
                              <td className="px-3 py-1.5 font-mono text-[--text-body] tabular-nums">
                                {r.parsedDate ?? "—"}
                              </td>
                              <td className="px-3 py-1.5 text-right font-mono text-[--text-body] tabular-nums">
                                {r.gramsTotal == null
                                  ? "—"
                                  : r.gramsTotal.toFixed(3)}
                              </td>
                              <td
                                className={cn(
                                  "px-3 py-1.5 text-right font-mono tabular-nums",
                                  r.balGrams != null && r.balGrams < 0
                                    ? "text-rose-700"
                                    : "text-[--text-body]",
                                )}
                              >
                                {r.balGrams == null
                                  ? "—"
                                  : r.balGrams.toFixed(3)}
                              </td>
                              <td className="px-3 py-1.5">
                                <span
                                  className={cn(
                                    "rounded border px-1.5 py-0.5 text-[10px] font-medium",
                                    r.status === "CREATED"
                                      ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                                      : r.status === "ANOMALY"
                                        ? "border-amber-300 bg-amber-50 text-amber-800"
                                        : r.status === "FAILED"
                                          ? "border-rose-300 bg-rose-50 text-rose-800"
                                          : "border-[--border] text-[--text-muted]",
                                  )}
                                >
                                  {r.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                          {(rowCountsByName.get(focused) ?? 0) >
                            focusedRows.length && (
                            <tr>
                              <td
                                colSpan={5}
                                className="px-3 py-2 text-center text-[11px] text-[--text-muted]"
                              >
                                Showing first {focusedRows.length} of{" "}
                                {rowCountsByName.get(focused)} rows.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Presets + tags — kept as paired auxiliary cards. They're rarely
          touched compared to the mapping list, so they sit below as a
          quieter row. */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <section className="bg-[--surface-base] overflow-hidden">
          <header className="border-b border-[--border] bg-[--surface-muted] px-4 py-3">
            <h2 className="text-sm font-semibold text-[--text-strong]">
              Presets
            </h2>
            <p className="mt-0.5 text-xs text-[--text-muted]">
              Save and reuse leader mapping configurations.
            </p>
          </header>
          <div className="p-4">
            <StudioPresetManager
              importId={importId}
              isLocked={isLocked}
              onPresetApplied={() =>
                queryClient.invalidateQueries({
                  queryKey: ["gold-import", importId],
                })
              }
            />
          </div>
        </section>

        <section className="bg-[--surface-base] overflow-hidden">
          <header className="border-b border-[--border] bg-[--surface-muted] px-4 py-3">
            <h2 className="text-sm font-semibold text-[--text-strong]">Tags</h2>
            <p className="mt-0.5 text-xs text-[--text-muted]">
              Label this import for filtering and reporting.
            </p>
          </header>
          <div className="p-4">
            <StudioTagPicker importId={importId} isLocked={isLocked} />
          </div>
        </section>
      </div>
    </div>
  );
}
