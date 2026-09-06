// CRM collections client — lists and saved views.
//
// Split out of `crm-v2.ts` because the app sidebar renders these collections on
// every page. When they lived in the 1,100-line crm-v2 barrel, the root
// layout's compile closure included the whole CRM SDK and, through
// `site-visits` → `accounting-bridge`, the accounting posting engine. This
// module's value closure is `fetchJson` and nothing else; crm-v2 re-exports it
// so CRM pages keep their single import surface.
import { fetchJson } from "@corelithzw/platform/api-client";
import type { LeadSort, LeadViewFilters } from "@/lib/crm/views";

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
};

export type CrmSavedViewRecord = {
  id: string;
  name: string;
  entity: string;
  viewType: "TABLE" | "BOARD";
  filters: LeadViewFilters;
  sort: LeadSort | null;
  isShared: boolean;
  createdById: string;
  createdBy: CrmCollectionOwner | null;
  createdAt: string;
  updatedAt: string;
};

type Envelope<T> = { data: T };

export function fetchCrmLists(entity?: string) {
  const suffix = entity ? `?entity=${encodeURIComponent(entity)}` : "";
  return fetchJson<Envelope<CrmListRecord[]>>(`/api/v2/crm/lists${suffix}`);
}

export function fetchCrmSavedViews() {
  return fetchJson<Envelope<CrmSavedViewRecord[]>>(`/api/v2/crm/saved-views`);
}
