import type { QueryClient } from "@tanstack/react-query";

/**
 * What to refetch after a document is raised, paid or converted.
 *
 * These invalidations were a list of key literals written next to each
 * mutation, and they had drifted: the builder invalidated `["crm-record",
 * basePath]`, which no query has ever used. The lead page reads `["crm-lead",
 * id]`, the deal page reads `["crm", "deal", id]`, the registers read
 * `["crm", "documents", …]` — so raising an invoice refetched nothing and the
 * only way to see it was to reload the page.
 *
 * One list, in one file, is the fix. A key that appears in a component and
 * nowhere here is a bug that shows up as "I have to refresh", which is the
 * kind of bug people work around rather than report.
 *
 * Prefixes, deliberately: TanStack matches them, so `["crm-lead"]` reaches
 * every lead query without this file having to know the ids.
 */
const DOCUMENT_KEYS: readonly unknown[][] = [
  ["crm-lead"],
  ["crm", "lead"],
  ["crm", "deal"],
  ["crm", "leads"],
  ["crm", "deals"],
  ["crm", "board"],
  ["crm", "documents"],
  ["crm", "person"],
  ["crm", "company"],
  ["crm", "rep"],
  ["crm", "collections"],
  ["crm-dashboard"],
];

export function refreshAfterDocumentChange(queryClient: QueryClient): void {
  for (const key of DOCUMENT_KEYS) {
    queryClient.invalidateQueries({ queryKey: key });
  }
}

/** After anything that moves a record's own fields. */
const RECORD_KEYS: readonly unknown[][] = [
  ["crm-lead"],
  ["crm", "lead"],
  ["crm", "deal"],
  ["crm", "leads"],
  ["crm", "deals"],
  ["crm", "board"],
  ["crm", "person"],
  ["crm", "people"],
  ["crm", "company"],
  ["crm", "companies"],
  ["crm-field-history"],
];

export function refreshAfterRecordChange(queryClient: QueryClient): void {
  for (const key of RECORD_KEYS) {
    queryClient.invalidateQueries({ queryKey: key });
  }
}
