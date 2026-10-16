"use client";

import * as React from "react";

import { LIST_ACTION_RUNS } from "@/lib/retail/asks";
import type { ListActionRun } from "@/lib/retail/asks/runs";

/**
 * Where a ListFrame lives: the API its pages and ids come from, the runs its
 * actions name, and whether the workspace shell draws its header.
 *
 * The workspace product is the default. The admin portal provides its own:
 * its lists come from `/api/platform-admin/lists`, behind an operator's
 * sign-in, and its pages draw their own header.
 */
export type ListHost = {
  /** `${base}/${source}?…` reads a page or the ids; `${base}/${source}/export` writes a file. */
  base: string;
  runs: Readonly<Record<string, ListActionRun>>;
  /** "shell": the workspace's page header (PageChrome). "page": the page draws its own. */
  chrome: "shell" | "page";
  /** The files Export offers. */
  formats: ReadonlyArray<"xlsx" | "csv" | "pdf">;
};

export const WORKSPACE_LIST_HOST: ListHost = {
  base: "/api/v2/reports",
  runs: LIST_ACTION_RUNS,
  chrome: "shell",
  formats: ["xlsx", "csv", "pdf"],
};

const ListHostContext = React.createContext<ListHost>(WORKSPACE_LIST_HOST);

export function ListHostProvider({ host, children }: { host: ListHost; children: React.ReactNode }) {
  return <ListHostContext.Provider value={host}>{children}</ListHostContext.Provider>;
}

export function useListHost(): ListHost {
  return React.useContext(ListHostContext);
}
