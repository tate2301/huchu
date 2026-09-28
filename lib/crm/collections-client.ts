// CRM collections client — groups and saved views.
//
// Kept out of `crm-v2.ts` because the app sidebar renders these collections on
// every page. When they lived in the 1,100-line crm-v2 barrel, the root
// layout's compile closure included the whole CRM SDK and, through
// `site-visits` → `accounting-bridge`, the accounting posting engine. This
// module's value closure is `fetchJson` and nothing else.
import { fetchJson } from "@/lib/api-client";
import type { RegisterKey, ViewState } from "@/lib/crm/registers/types";

export type CrmCollectionOwner = { id: string; name: string | null };

export type CrmListRecord = {
  id: string;
  entity: string;
  name: string;
  description: string | null;
  isShared: boolean;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  _count?: { members: number };
  /** Whether the reader may add to, rename or delete it. */
  canEdit?: boolean;
  /** Whether it holds the record the groups were asked about (`recordId`). */
  contains?: boolean;
};

/**
 * A saved view: one list's whole state — the search, every filter, the sort,
 * the layout, the grouping and the columns — under a name.
 */
export type CrmSavedViewRecord = {
  id: string;
  name: string;
  /** Which list it is a view of. */
  register: RegisterKey;
  state: ViewState;
  isShared: boolean;
  createdById: string | null;
  createdBy: CrmCollectionOwner | null;
  /** Whether the reader may change or delete it: whoever made it, or a manager. */
  canEdit: boolean;
  createdAt: string;
  updatedAt: string;
};

type Envelope<T> = { data: T };

/** The groups the reader can see — of one record type, and whether each holds one record. */
export function fetchCrmLists(entity?: string, recordId?: string) {
  const params = new URLSearchParams();
  if (entity) params.set("entity", entity);
  if (recordId) params.set("recordId", recordId);
  const query = params.toString();
  return fetchJson<Envelope<CrmListRecord[]>>(`/api/v2/crm/lists${query ? `?${query}` : ""}`);
}

/**
 * The saved views the reader can see — their own and the team's — of one list,
 * or of every list, and whether the reader may share one with the team.
 */
export function fetchCrmSavedViews(register?: RegisterKey) {
  return fetchJson<Envelope<CrmSavedViewRecord[]> & { canShare: boolean }>(
    `/api/v2/crm/saved-views${register ? `?register=${register}` : ""}`,
  );
}

export function createCrmSavedView(body: {
  register: RegisterKey;
  name: string;
  state: ViewState;
  isShared?: boolean;
}) {
  return fetchJson<CrmSavedViewRecord>(`/api/v2/crm/saved-views`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateCrmSavedView(id: string, body: Partial<{ name: string; state: ViewState; isShared: boolean }>) {
  return fetchJson<CrmSavedViewRecord>(`/api/v2/crm/saved-views/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function deleteCrmSavedView(id: string) {
  return fetchJson<{ id: string }>(`/api/v2/crm/saved-views/${id}`, { method: "DELETE" });
}
