"use client";

import * as React from "react";

import { fetchJson } from "@/lib/api-client";
import type { ReportColumn, ReportParams, ReportRow } from "@/lib/reports/types";

/**
 * Where the report builders read their sources and rows from.
 *
 * In a workspace that is its own report APIs, under the person's session.
 * The admin portal's library has no workspace session: it gives the same
 * builders the portal's preview APIs instead, which read one chosen
 * workspace's rows (`app/api/platform-admin/library/preview`). Either way
 * the SQL runs in this tab, in the report database, after the guard.
 */

/** A source as the builders know it: what it is called and the columns it has. */
export type ReportSource = {
  key: string;
  title: string;
  area: string;
  columns: ReportColumn[];
};

export type SourceRowsResponse = {
  sources: Record<string, { rows: ReportRow[]; truncated: boolean; params: ReportParams }>;
  missing: string[];
};

export type ReportData = {
  /** Kept apart in the query cache from a workspace's own: whose rows these are. Left out for the workspace's. */
  scope?: string;
  sources: () => Promise<{ sources: ReportSource[] }>;
  rows: (keys: string[], params: ReportParams) => Promise<SourceRowsResponse>;
};

export const WORKSPACE_REPORT_DATA: ReportData = {
  sources: () => fetchJson<{ sources: ReportSource[] }>("/api/v2/reports/sources"),
  rows: (keys, params) => fetchJson<SourceRowsResponse>("/api/v2/reports/sources/rows", { method: "POST", body: JSON.stringify({ keys, params }) }),
};

const ReportDataContext = React.createContext<ReportData>(WORKSPACE_REPORT_DATA);

export function ReportDataProvider({ value, children }: { value: ReportData; children: React.ReactNode }) {
  return <ReportDataContext.Provider value={value}>{children}</ReportDataContext.Provider>;
}

export function useReportData(): ReportData {
  return React.useContext(ReportDataContext);
}

/** A query key in the data's own scope: unchanged for a workspace's, apart for anyone else's. */
export function scopedKey<T extends readonly unknown[]>(data: ReportData, key: T): readonly unknown[] {
  return data.scope ? [...key, { scope: data.scope }] : key;
}
