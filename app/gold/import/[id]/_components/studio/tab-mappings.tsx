"use client";

import { useQueryClient } from "@tanstack/react-query";
import { SearchableSelect } from "@/app/gold/components/searchable-select";
import { cn } from "@/lib/utils";
import { CheckCircle2, AlertCircle } from "@/lib/icons";
import { StudioTagPicker } from "./studio-tags-panel";
import { StudioPresetManager } from "./studio-preset-manager";
import type { ImportDetail } from "../types";
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

  return (
    <div className="space-y-6 p-6">
      {/* Site assignment */}
      <section className="rounded-lg border border-[--border] bg-[--surface-base] overflow-hidden">
        <header className="border-b border-[--border] bg-[--surface-muted] px-4 py-3">
          <h2 className="text-sm font-semibold text-[--text-strong]">
            Site assignment
          </h2>
          <p className="mt-0.5 text-xs text-[--text-muted]">
            All ledger rows in this import will be attributed to this site.
          </p>
        </header>
        <div className="p-4">
          <div className="flex items-center gap-3">
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
            {importData.siteId ? (
              <span className="flex items-center gap-1 text-xs text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Site assigned
              </span>
            ) : (
              <span className="flex items-center gap-1 text-xs text-[--text-muted]">
                <AlertCircle className="h-3.5 w-3.5" />
                Required to commit
              </span>
            )}
          </div>
        </div>
      </section>

      {/* Leader → shift group mappings */}
      <section className="rounded-lg border border-[--border] bg-[--surface-base] overflow-hidden">
        <header className="flex items-center justify-between border-b border-[--border] bg-[--surface-muted] px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-[--text-strong]">
              Leader mappings
            </h2>
            <p className="mt-0.5 text-xs text-[--text-muted]">
              {mappedCount === distinctNames.length
                ? `All ${distinctNames.length} leaders mapped`
                : `${mappedCount} / ${distinctNames.length} mapped — all must be assigned before committing`}
            </p>
          </div>
        </header>

        {distinctNames.length === 0 ? (
          <div className="p-6 text-center text-sm text-[--text-muted]">
            No leader names parsed from this import.
          </div>
        ) : (
          <div className="divide-y divide-[--border]">
            {distinctNames.map((name) => {
              const mapped = localMappings[name] ?? existingMappings[name] ?? null;
              const mappedGroup = mapped
                ? groups.find((g) => g.id === mapped)
                : null;

              return (
                <div key={name} className="flex items-center gap-4 px-4 py-3">
                  <div className="w-40 shrink-0">
                    <span
                      className={cn(
                        "inline-block rounded border px-2 py-0.5 font-mono text-xs",
                        mapped
                          ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                          : "border-amber-300 bg-amber-50 text-amber-800",
                      )}
                    >
                      {name}
                    </span>
                  </div>
                  <span className="text-xs text-[--text-muted]">→</span>
                  <div className="w-56">
                    <SearchableSelect
                      options={groups.map((g) => ({
                        value: g.id,
                        label: g.name,
                      }))}
                      value={mapped ?? ""}
                      onValueChange={(gId) => onSetMapping(name, gId)}
                      placeholder="Assign shift group…"
                      disabled={isLocked}
                    />
                  </div>
                  {mappedGroup && (
                    <span className="flex items-center gap-1 text-xs text-emerald-700">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {mappedGroup.name}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Presets + tags */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <section className="rounded-lg border border-[--border] bg-[--surface-base] overflow-hidden">
          <header className="border-b border-[--border] bg-[--surface-muted] px-4 py-3">
            <h2 className="text-sm font-semibold text-[--text-strong]">Presets</h2>
            <p className="mt-0.5 text-xs text-[--text-muted]">
              Save and reuse leader mapping configurations.
            </p>
          </header>
          <div className="p-4">
            <StudioPresetManager
              importId={importId}
              isLocked={isLocked}
              onPresetApplied={() =>
                queryClient.invalidateQueries({ queryKey: ["gold-import", importId] })
              }
            />
          </div>
        </section>

        <section className="rounded-lg border border-[--border] bg-[--surface-base] overflow-hidden">
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
