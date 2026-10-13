"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { dsConfirm } from "@/components/ui/ds-confirm";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { ClipboardText, DotsThree, FileText, Plus } from "@/lib/icons";
import { folderHref, reportCounts, reportEntries, type ReportsHomeData } from "@/lib/reports/all";
import type { RailArea } from "@/lib/rail/areas";
import { isOrgAdminRole } from "@/lib/preferences/nav";

import { useMounted, ViewForm } from "./module-groups";
import { PanelGroup } from "./panel-group";
import { RailRow } from "./rail-row";
import styles from "./workspace-rail.module.css";

/** The query All reports and Reports' panel share: one answer for both. */
export const REPORTS_HOME_KEY = ["reports", "catalog"] as const;

export function fetchReportsHome() {
  return fetchJson<ReportsHomeData>("/api/v2/reports");
}

/** Reports' own module: the area whose rows hold `/reports`. */
export function isReportsArea(area: RailArea): boolean {
  return area.items.some((item) => (item.href.split("?")[0] ?? item.href) === "/reports");
}

/**
 * What Reports' panel adds under its rows (ReportsAll): the workspace's
 * Folders, with Add to Folders and each folder's Rename and Delete, then
 * Build (Forms, Documents).
 */
export function ReportsGroups({ onNavigate }: { onNavigate?: () => void }) {
  const { data: session } = useSession();
  return (
    <>
      <FoldersGroup onNavigate={onNavigate} />
      {isOrgAdminRole(session?.user?.role) ? (
        <PanelGroup label="Build">
          <RailRow href="/templates#form" label="Forms" icon={ClipboardText} onNavigate={onNavigate} />
          <RailRow href="/templates#document" label="Documents" icon={FileText} onNavigate={onNavigate} />
        </PanelGroup>
      ) : null}
    </>
  );
}

function FoldersGroup({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const mounted = useMounted();

  const home = useQuery({ queryKey: REPORTS_HOME_KEY, queryFn: fetchReportsHome, staleTime: 60_000 });
  const data = mounted ? home.data : undefined;
  const folders = data?.folders ?? [];
  const counts = React.useMemo(() => (data ? reportCounts(reportEntries(data)).folders : {}), [data]);
  const currentId = pathname === "/reports" ? searchParams.get("folder") : null;

  const [adding, setAdding] = React.useState(false);
  const [renaming, setRenaming] = React.useState<string | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: REPORTS_HOME_KEY });

  const create = useMutation({
    mutationFn: (name: string) =>
      fetchJson<{ folder: { id: string; name: string } }>("/api/v2/reports/folders", { method: "POST", body: JSON.stringify({ name }) }),
    onSuccess: async ({ folder }) => {
      setAdding(false);
      await refresh();
      router.push(folderHref(folder.id));
    },
  });

  const rename = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      fetchJson(`/api/v2/reports/folders/${id}`, { method: "PATCH", body: JSON.stringify({ name }) }),
    onSuccess: async () => {
      setRenaming(null);
      await refresh();
    },
  });

  const remove = useMutation({
    mutationFn: (folder: { id: string; name: string }) => fetchJson(`/api/v2/reports/folders/${folder.id}`, { method: "DELETE" }),
    onSuccess: async (_, folder) => {
      await refresh();
      if (currentId === folder.id) router.push("/reports");
      toast({ title: `Deleted “${folder.name}”`, description: "Its reports are in no folder now." });
    },
    onError: (error) => toast({ title: "Could not delete the folder", description: getApiErrorMessage(error), variant: "destructive" }),
  });

  const confirmDelete = async (folder: { id: string; name: string }) => {
    const held = counts[folder.id] ?? 0;
    const confirmed = await dsConfirm({
      title: `Delete ${folder.name}`,
      description:
        held > 0
          ? `Its ${held === 1 ? "report goes" : `${held} reports go`} back to no folder. No report is deleted.`
          : "It holds no reports.",
      confirmLabel: "Delete the folder",
      variant: "danger",
    });
    if (confirmed) remove.mutate(folder);
  };

  return (
    <PanelGroup
      label="Folders"
      holdsCurrent={Boolean(currentId) || adding}
      action={
        <button type="button" className={styles.groupAdd} aria-label="Add to Folders" aria-expanded={adding} onClick={() => setAdding(true)}>
          <Plus className={styles.groupAddIcon} />
        </button>
      }
    >
      {folders.map((folder) =>
        renaming === folder.id ? (
          <li key={folder.id}>
            <ViewForm
              initialName={folder.name}
              label={`Rename ${folder.name}`}
              saving={rename.isPending}
              error={rename.isError ? getApiErrorMessage(rename.error) : null}
              onSave={({ name }) => rename.mutate({ id: folder.id, name })}
              onCancel={() => {
                rename.reset();
                setRenaming(null);
              }}
            />
          </li>
        ) : (
          <RailRow
            key={folder.id}
            href={folderHref(folder.id)}
            label={folder.name}
            badge={counts[folder.id] ? String(counts[folder.id]) : null}
            current={currentId === folder.id}
            onNavigate={onNavigate}
            after={
              folder.canChange ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button type="button" className={styles.rowMenu} aria-label={`Change ${folder.name}`}>
                      <DotsThree className={styles.groupAddIcon} />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setRenaming(folder.id)}>Rename</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => void confirmDelete(folder)}>Delete</DropdownMenuItem>
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
            label="Name the folder"
            saving={create.isPending}
            error={create.isError ? getApiErrorMessage(create.error) : null}
            onSave={({ name }) => create.mutate(name)}
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
