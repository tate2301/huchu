"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { findLibraryWorkspaces } from "@/app/portal/admin/(all)/library/actions";
import { ReportDataProvider, type ReportData, type ReportSource, type SourceRowsResponse } from "@/components/reports/custom/report-data";
import { fetchJson } from "@/lib/api-client";
import { sqlName } from "@/lib/reports/sql/schema";

/**
 * Previewing a reading kind (a report, an Explore question, an insight) in
 * the Library's editor. The kind's own builder runs as it does in a
 * workspace, given the portal's preview APIs in place of the workspace's:
 * every source to write against, and the rows of one workspace the operator
 * chooses, read as its owner reads them. Without a workspace the SQL still
 * runs, over empty tables, so a mistake shows before anyone's rows are read.
 */

export type PreviewWorkspace = { id: string; name: string; slug: string };

type PreviewSources = { sources: ReportSource[]; readable: string[] | null };

function sourcesUrl(workspace: PreviewWorkspace | null) {
  return `/api/platform-admin/library/preview/sources${workspace ? `?workspace=${encodeURIComponent(workspace.id)}` : ""}`;
}

/** The builders' data, from the portal: every source, and the chosen workspace's rows. */
export function previewData(workspace: PreviewWorkspace | null): ReportData {
  return {
    scope: `library:${workspace?.id ?? "none"}`,
    sources: () => fetchJson<PreviewSources>(sourcesUrl(workspace)),
    rows: async (keys, params) => {
      if (!workspace) {
        return { sources: Object.fromEntries(keys.map((key) => [key, { rows: [], truncated: false, params }])), missing: [] };
      }
      const read = await fetchJson<SourceRowsResponse>("/api/platform-admin/library/preview/rows", {
        method: "POST",
        body: JSON.stringify({ workspace: workspace.id, keys, params }),
      });
      // A source the workspace does not read comes back empty; the editor says which, rather than the builder refusing it.
      return { sources: read.sources, missing: [] };
    },
  };
}

/** The workspace chosen, the provider the builder sits in, and the tables the chosen workspace does not read. */
export function usePreview() {
  const [workspace, setWorkspace] = useState<PreviewWorkspace | null>(null);
  const data = useMemo(() => previewData(workspace), [workspace]);
  const sources = useQuery({
    queryKey: ["reports", "sources", { scope: data.scope }],
    queryFn: () => fetchJson<PreviewSources>(sourcesUrl(workspace)),
    staleTime: 5 * 60_000,
    meta: { persist: false },
  });
  const readable = sources.data?.readable;
  /** Of these tables (SQL names), the ones the chosen workspace does not read. */
  const unread = (tables: readonly string[]): string[] => {
    if (!readable) return [];
    const open = new Set(readable.map(sqlName));
    return tables.filter((table) => !open.has(table));
  };
  return { workspace, setWorkspace, data, sourcesError: sources.error, unread };
}

export function PreviewProvider({ data, children }: { data: ReportData; children: React.ReactNode }) {
  return <ReportDataProvider value={data}>{children}</ReportDataProvider>;
}

const field =
  "h-9 w-full rounded-[var(--radius-sm)] border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-sm text-[var(--ink)] focus:border-[var(--action)] focus:outline-none";

/** Which workspace's rows the preview reads: none until one is chosen. */
export function PreviewWorkspacePicker({
  value,
  onChange,
  error,
}: {
  value: PreviewWorkspace | null;
  onChange: (next: PreviewWorkspace | null) => void;
  error?: unknown;
}) {
  const id = useId();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [found, setFound] = useState<PreviewWorkspace[]>([]);

  useEffect(() => {
    if (!open) return;
    let live = true;
    const timer = setTimeout(() => {
      void findLibraryWorkspaces(q).then((rows) => live && setFound(rows));
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [q, open]);

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="t-label block text-[var(--ink)]">
        Preview on
      </label>
      {value && !open ? (
        <div className="flex items-center gap-3">
          <span className="min-w-0 truncate text-sm font-medium text-[var(--ink)]">{value.name}</span>
          <span className="font-mono text-xs text-[var(--text-muted)]">{value.slug}</span>
          <button type="button" className="btn ml-auto" onClick={() => setOpen(true)}>
            Change
          </button>
          <button type="button" className="btn" onClick={() => onChange(null)}>
            No workspace
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <input
            id={id}
            type="search"
            value={q}
            onFocus={() => setOpen(true)}
            onChange={(event) => {
              setQ(event.target.value);
              setOpen(true);
            }}
            placeholder="Find a workspace"
            className={field}
          />
          {value && open ? (
            <button type="button" className="btn" onClick={() => setOpen(false)}>
              Keep {value.name}
            </button>
          ) : null}
          {open ? (
            <ul className="max-h-56 overflow-y-auto rounded-[var(--radius-sm)] shadow-[inset_0_0_0_1px_var(--line)]" aria-label="Workspaces">
              {found.length === 0 ? <li className="px-3 py-2 text-sm text-[var(--text-muted)]">No workspace matches.</li> : null}
              {found.map((workspace) => (
                <li key={workspace.id}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-[var(--hover)] focus-visible:bg-[var(--hover)] focus-visible:outline-none"
                    onClick={() => {
                      onChange(workspace);
                      setOpen(false);
                      setQ("");
                    }}
                  >
                    <span className="min-w-0 truncate font-medium text-[var(--ink)]">{workspace.name}</span>
                    <span className="ml-auto font-mono text-xs text-[var(--text-muted)]">{workspace.slug}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
      <p className="t-body-sm text-[var(--text-muted)]">
        {value
          ? `Its rows are read as its owner reads them, and the reading is on ${value.name}'s audit log. Nothing is changed.`
          : "Without one, it runs over empty tables: a mistake still shows, and nobody's rows are read."}
      </p>
      {error ? (
        <p role="alert" className="text-sm text-[var(--bad)]">
          {error instanceof Error ? error.message : "That workspace could not be read."}
        </p>
      ) : null}
    </div>
  );
}

/** The tables an item reads that the chosen workspace does not: it is not offered there. */
export function UnreadNotice({ workspace, tables }: { workspace: PreviewWorkspace | null; tables: readonly string[] }) {
  if (!workspace || tables.length === 0) return null;
  return (
    <p role="status" className="text-sm text-[var(--text-muted)]">
      {workspace.name} does not read <span className="font-mono">{tables.join(", ")}</span>, so it is not offered this. Those tables show no rows here.
    </p>
  );
}
