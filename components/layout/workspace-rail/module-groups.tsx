"use client";

import * as React from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { ChartBar, DotsThree, Plus } from "@/lib/icons";
import type { RailArea } from "@/lib/rail/areas";
import { reportsForArea, type PanelReport } from "@/lib/rail/reports";
import { currentView, viewHref, viewPath, type SavedViewRecord } from "@/lib/saved-views/view";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/use-toast";

import { PanelGroup } from "./panel-group";
import { RailRow } from "./rail-row";
import styles from "./workspace-rail.module.css";

/**
 * What a module's panel adds under its rows (design/core-modules/spec/routes.md
 * §0): the page's Saved views, and the reports that belong to the module.
 */
export function ModuleGroups({
  area,
  areas,
  savedViews = true,
  onNavigate,
}: {
  area: RailArea;
  areas: readonly RailArea[];
  /** False where the module keeps its own saved views (the CRM's lists). */
  savedViews?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <>
      {savedViews ? <SavedViewsGroup onNavigate={onNavigate} /> : null}
      <ReportsGroup area={area} areas={areas} onNavigate={onNavigate} />
    </>
  );
}

const viewsKey = (path: string) => ["saved-views", path] as const;

const noopSubscribe = () => () => {};

/**
 * The query cache is persisted for offline use, so what it holds is read only
 * after hydration: until then the groups draw what the server drew (nothing).
 */
function useMounted(): boolean {
  return React.useSyncExternalStore(noopSubscribe, () => true, () => false);
}

/**
 * Saved views of the page being looked at: yours ("you") and the ones shared
 * with the workspace ("shared"). Choosing one opens its page with its query;
 * Add to Saved views keeps the address being looked at under a name.
 */
function SavedViewsGroup({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const path = viewPath(pathname) ?? "/";
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const viewsQuery = useQuery({
    queryKey: viewsKey(path),
    queryFn: () => fetchJson<{ views: SavedViewRecord[] }>(`/api/saved-views?path=${encodeURIComponent(path)}`),
    staleTime: 60_000,
  });
  const mounted = useMounted();
  const views = (mounted ? viewsQuery.data?.views : undefined) ?? [];
  const current = currentView(views, path, search);

  const [adding, setAdding] = React.useState(false);
  const [renaming, setRenaming] = React.useState<string | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: viewsKey(path) });

  const create = useMutation({
    mutationFn: (input: { name: string; isShared: boolean }) =>
      fetchJson<{ view: SavedViewRecord }>("/api/saved-views", {
        method: "POST",
        body: JSON.stringify({ ...input, href: search ? `${path}?${search}` : path }),
      }),
    onSuccess: async ({ view }) => {
      setAdding(false);
      await refresh();
      toast({ title: `Saved “${view.name}”`, description: view.isShared ? "Everyone here can open it." : "Only you can see it." });
    },
  });

  const rename = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      fetchJson<{ view: SavedViewRecord }>(`/api/saved-views/${id}`, { method: "PATCH", body: JSON.stringify({ name }) }),
    onSuccess: async () => {
      setRenaming(null);
      await refresh();
    },
    onError: (error) => toast({ title: "Could not rename the view", description: getApiErrorMessage(error), variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: (view: SavedViewRecord) => fetchJson(`/api/saved-views/${view.id}`, { method: "DELETE" }),
    onSuccess: async (_, view) => {
      await refresh();
      toast({ title: `Deleted “${view.name}”` });
    },
    onError: (error) => toast({ title: "Could not delete the view", description: getApiErrorMessage(error), variant: "destructive" }),
  });

  return (
    <PanelGroup
      label="Saved views"
      holdsCurrent={Boolean(current) || adding}
      action={
        <button
          type="button"
          className={styles.groupAdd}
          aria-label="Add to Saved views"
          aria-expanded={adding}
          onClick={() => setAdding(true)}
        >
          <Plus className={styles.groupAddIcon} />
        </button>
      }
    >
      {views.map((view) =>
        renaming === view.id ? (
          <li key={view.id}>
            <ViewForm
              initialName={view.name}
              label={`Rename ${view.name}`}
              saving={rename.isPending}
              error={rename.isError ? getApiErrorMessage(rename.error) : null}
              onSave={({ name }) => rename.mutate({ id: view.id, name })}
              onCancel={() => setRenaming(null)}
            />
          </li>
        ) : (
          <RailRow
            key={view.id}
            href={viewHref(view)}
            label={view.name}
            meta={view.isShared ? "shared" : "you"}
            current={current?.id === view.id}
            onNavigate={onNavigate}
            after={
              view.canChange ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button type="button" className={styles.rowMenu} aria-label={`Change ${view.name}`}>
                      <DotsThree className={styles.groupAddIcon} />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setRenaming(view.id)}>Rename</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => remove.mutate(view)}>Delete</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : undefined
            }
          />
        ),
      )}
      {adding ? (
        <li>
          <ViewForm
            label="Name this view"
            share
            saving={create.isPending}
            error={create.isError ? getApiErrorMessage(create.error) : null}
            onSave={(input) => create.mutate(input)}
            onCancel={() => {
              create.reset();
              setAdding(false);
            }}
          />
        </li>
      ) : null}
    </PanelGroup>
  );
}

/** Naming a view, where its row goes: Enter saves, Esc puts it away. */
function ViewForm({
  label,
  initialName = "",
  share = false,
  saving,
  error,
  onSave,
  onCancel,
}: {
  label: string;
  initialName?: string;
  /** Offer "Shared with everyone": a new view, not a rename. */
  share?: boolean;
  saving: boolean;
  error: string | null;
  onSave: (input: { name: string; isShared: boolean }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = React.useState(initialName);
  const [isShared, setShared] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);
  return (
    <form
      className={styles.viewForm}
      onSubmit={(event) => {
        event.preventDefault();
        if (name.trim()) onSave({ name: name.trim(), isShared });
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onCancel();
        }
      }}
    >
      <input
        ref={inputRef}
        className={styles.viewInput}
        aria-label={label}
        placeholder={label}
        maxLength={120}
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      {share ? (
        <label className={styles.viewShare}>
          <input type="checkbox" checked={isShared} onChange={(event) => setShared(event.target.checked)} />
          Shared with everyone
        </label>
      ) : null}
      {error ? <p className={styles.viewError}>{error}</p> : null}
      <div className={styles.viewActions}>
        <button type="submit" className={styles.viewSave} disabled={saving || !name.trim()} aria-keyshortcuts="Enter">
          {saving ? "Saving" : "Save"}
          <span className={styles.viewKbd} aria-hidden="true">
            ↵
          </span>
        </button>
        <button type="button" className={styles.viewCancel} onClick={onCancel} aria-keyshortcuts="Escape">
          Cancel
        </button>
      </div>
    </form>
  );
}

/** "Reports from <module>": none drawn where the module has none. */
function ReportsGroup({
  area,
  areas,
  onNavigate,
}: {
  area: RailArea;
  areas: readonly RailArea[];
  onNavigate?: () => void;
}) {
  const reportsQuery = useQuery({
    queryKey: ["reports", "panel"],
    queryFn: () => fetchJson<{ reports: PanelReport[] }>("/api/v2/reports/panel"),
    staleTime: 5 * 60_000,
  });
  const mounted = useMounted();
  const data = mounted ? reportsQuery.data : undefined;
  const reports = React.useMemo(() => reportsForArea(data?.reports ?? [], areas, area.id), [area.id, areas, data]);
  if (reports.length === 0) return null;
  return (
    <PanelGroup label={`Reports from ${area.label}`}>
      {reports.map((report) => (
        <RailRow key={report.key} href={report.href} label={report.title} icon={ChartBar} onNavigate={onNavigate} />
      ))}
    </PanelGroup>
  );
}
