"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { fetchJson } from "@/lib/api-client";
import type { ReportTemplateRecord } from "@/lib/reports/template-access";
import type { ReportMeta, ReportParams, ReportRow, ReportView } from "@/lib/reports/types";
import { decodeView, defaultView, encodeView, fitView } from "@/lib/reports/view";

export type ReportResponse = {
  report: ReportMeta;
  /** The template it was opened as, when it was. */
  template: ReportTemplateRecord | null;
  params: ReportParams;
  rows: ReportRow[];
  truncated: boolean;
};

/**
 * A report's state, kept in the URL.
 *
 * The params (dates, choices) are plain query keys because changing them
 * fetches again; the view is one encoded `v` because changing it does not.
 * Both in the URL means a report is linked exactly as it was seen, and the
 * back button undoes a filter.
 */
export function useReport(key: string) {
  const pathname = usePathname();
  const search = useSearchParams();

  const given = useMemo(() => {
    const params: ReportParams = {};
    for (const [name, value] of search) if (name !== "v") params[name] = value;
    return params;
  }, [search]);

  const query = useQuery({
    queryKey: ["reports", key, given],
    queryFn: () => {
      const qs = new URLSearchParams(given).toString();
      return fetchJson<ReportResponse>(`/api/v2/reports/${encodeURIComponent(key)}${qs ? `?${qs}` : ""}`);
    },
    // Keep the old rows on screen, dimmed, while new dates load.
    placeholderData: (previous) => previous,
  });

  const meta = query.data?.report ?? null;
  const encoded = search.get("v");
  const view = useMemo<ReportView | null>(() => {
    if (!meta) return null;
    return fitView(decodeView(encoded) ?? defaultView(meta), meta.columns);
  }, [meta, encoded]);

  // `history.replaceState` rather than the router: the rows are fetched here,
  // so a view change has nothing to ask the server, and the router would
  // re-render the page on the server for every click on a header.
  const replace = useCallback(
    (next: URLSearchParams) => {
      const qs = next.toString();
      window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname);
    },
    [pathname],
  );

  const setView = useCallback(
    (next: ReportView) => {
      const params = new URLSearchParams(search);
      params.set("v", encodeView(next));
      replace(params);
    },
    [replace, search],
  );

  const resetView = useCallback(() => {
    const params = new URLSearchParams(search);
    params.delete("v");
    replace(params);
  }, [replace, search]);

  const setParams = useCallback(
    (patch: ReportParams) => {
      const params = new URLSearchParams(search);
      // An emptied param stays in the URL, empty: "any time" is a choice,
      // not a request for the default back.
      for (const [name, value] of Object.entries(patch)) params.set(name, value);
      replace(params);
    },
    [replace, search],
  );

  return {
    query,
    meta,
    template: query.data?.template ?? null,
    view,
    /** The params the server actually used, defaults filled in. */
    params: query.data?.params ?? given,
    setView,
    resetView,
    setParams,
    customised: Boolean(encoded),
  };
}
