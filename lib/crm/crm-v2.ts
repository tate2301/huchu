/**
 * CRM client SDK — typed fetchers over the /api/v2/crm endpoints.
 * Mirrors the lib/autos/autos-v2.ts pattern.
 */
import { fetchJson } from "@/lib/api-client";
import type {
  CrmListRecord,
  CrmSavedViewRecord,
} from "@/lib/crm/collections-client";
import type {
  CrmLeadStage,
  CrmRecurrence,
  CrmTaskOutcome,
  CrmTaskPriority,
  CrmTaskStatus,
  CrmTaskType,
} from "@prisma/client";
import type { CollabEntity } from "@/lib/crm/collaboration";
import type { TaskQueue } from "@/lib/crm/tasks";
import type { ImportEntity, ImportPlan } from "@/lib/crm/import";
import type { FieldChoice, MergeFieldPlan } from "@/lib/crm/merge";
import type { RecordSort } from "@/lib/crm/records";
import type { LeadSort, LeadViewFilters } from "@/lib/crm/views";
import type { SiteVisitItemInput, SiteVisitReportInput } from "@/lib/crm/site-visits";

export type CrmClientRecord = {
  id: string;
  clientNo: string;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  country: string | null;
  tags: string[];
  assignedToId: string | null;
  customerId: string | null;
  createdAt: string;
};

export type CrmLeadRecord = {
  id: string;
  leadNo: string;
  title: string | null;
  clientId: string | null;
  stage: CrmLeadStage;
  probability: number | null;
  estimatedValue: number | null;
  currency: string;
  services: string[];
  source: string | null;
  utmSource: string | null;
  utmCampaign: string | null;
  assignedToId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CrmFollowUpRecord = {
  id: string;
  title: string;
  dueAt: string;
  status: "PENDING" | "COMPLETED" | "CANCELLED";
  leadId: string | null;
  clientId: string | null;
  assignedToId: string;
};

export type CrmAppointmentRecord = {
  id: string;
  appointmentNo: string;
  title: string;
  leadId: string | null;
  clientId: string | null;
  assignedToId: string;
  scheduledStart: string;
  scheduledEnd: string | null;
  location: string | null;
  status: "SCHEDULED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
};

export type CrmLeadOwner = { id: string; name: string | null };

export type CrmNextFollowUp = { id: string; title: string; dueAt: string };

/** A lead as the table renders it: owner, client, and what's owed next. */
export type CrmLeadListRecord = CrmLeadRecord & {
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  sourceChannel: string | null;
  client: { id: string; name: string } | null;
  assignedTo: CrmLeadOwner | null;
  nextFollowUp: CrmNextFollowUp | null;
};

export type CrmBoardCard = {
  id: string;
  leadNo: string;
  title: string | null;
  stage: CrmLeadStage;
  estimatedValue: number | null;
  currency: string;
  contactName: string | null;
  createdAt: string;
  updatedAt: string;
  stageEnteredAt: string;
  client: { id: string; name: string } | null;
  assignedTo: CrmLeadOwner | null;
  nextFollowUp: CrmNextFollowUp | null;
  /**
   * Set once the enquiry has been promoted. Past Contacted the card is a deal
   * — it says so and opens the deal, not the lead it grew out of.
   */
  deal: { id: string; dealNo: string; value: number | null } | null;
};

export type CrmBoardColumn = {
  stage: CrmLeadStage;
  count: number;
  totalValue: number;
  hasMore: boolean;
  leads: CrmBoardCard[];
};

// Lists and saved views live in `collections-client.ts` (the sidebar renders
// them on every page and must not compile the whole CRM SDK). Re-exported here
// so CRM pages keep one import surface.
export {
  fetchCrmLists,
  fetchCrmSavedViews,
  type CrmListRecord,
  type CrmSavedViewRecord,
} from "@/lib/crm/collections-client";

export type CrmVisitItemRecord = SiteVisitItemInput & {
  id: string;
  appointmentId: string;
  position: number;
};

export type CrmVisitChecklistItem = {
  key: string;
  label: string;
  checked: boolean;
  notes?: string | null;
};

export type CrmVisitPhoto = {
  url: string;
  fileName?: string | null;
  contentType?: string | null;
  size?: number | null;
  kind: "PHOTO" | "FILE";
  caption?: string | null;
};

export type CrmVisitReportRecord = CrmAppointmentRecord & {
  checklist: CrmVisitChecklistItem[] | null;
  photos: CrmVisitPhoto[] | null;
  siteConditions: string | null;
  reportNotes: string | null;
  outcomeNotes: string | null;
  reportCompletedAt: string | null;
  completedAt: string | null;
  visitItems: CrmVisitItemRecord[];
};

/**
 * The shape every paginated CRM route actually returns. It used to be declared
 * with a top-level `total`, which no route has ever sent — so `?? rows.length`
 * fired on every list and each one reported a single page regardless of size.
 */
type ListResponse<T> = {
  data: T[];
  pagination?: { page: number; limit: number; total: number; pages: number; hasMore: boolean };
};
/**
 * `{ data: T }` — and only for the handful of list GETs that literally call
 * `successResponse({ data: rows })`.
 *
 * `successResponse(x)` sends `x` as the body; it adds no envelope of its own.
 * Every `[id]` route, every POST and every PATCH in the CRM answers with the
 * record or result itself, so wrapping those in `Envelope` describes a shape
 * that never arrives — and because the declaration is a lie the compiler
 * accepts, the failure surfaces as `undefined` at runtime: a detail page that
 * says "not found", a toast naming nothing, a callback handed no id. Check the
 * route before reaching for this type.
 */
type Envelope<T> = { data: T };

function qs(params: Record<string, string | number | boolean | null | undefined>): string {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === "") continue;
    sp.set(key, String(value));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

/**
 * Flatten a filter set into query params. Arrays are comma-joined and booleans
 * only sent when true, so a default view produces a clean URL.
 */
export function leadFiltersToParams(
  filters: LeadViewFilters,
): Record<string, string | number | boolean | undefined> {
  return {
    q: filters.q,
    stages: filters.stages?.join(","),
    assignedToIds: filters.assignedToIds?.join(","),
    unassigned: filters.unassigned ? "1" : undefined,
    mineOnly: filters.mineOnly ? "1" : undefined,
    channels: filters.channels?.join(","),
    sources: filters.sources?.join(","),
    valueMin: filters.valueMin,
    valueMax: filters.valueMax,
    createdFrom: filters.createdFrom,
    createdTo: filters.createdTo,
    overdueOnly: filters.overdueOnly ? "1" : undefined,
    archived: filters.archived ? "1" : undefined,
  };
}

export function fetchCrmLeads(
  params: {
    filters?: LeadViewFilters;
    sort?: LeadSort;
    page?: number;
    limit?: number;
  } = {},
) {
  const query = qs({
    ...leadFiltersToParams(params.filters ?? {}),
    sortField: params.sort?.field,
    sortDir: params.sort?.direction,
    page: params.page,
    limit: params.limit,
  });
  return fetchJson<ListResponse<CrmLeadListRecord>>(`/api/v2/crm/leads${query}`);
}

export function fetchCrmLeadsBoard(filters: LeadViewFilters = {}) {
  const query = qs(leadFiltersToParams(filters));
  // The route answers `{ columns, cardsPerColumn }` — no envelope. Declaring
  // one here is what made the board throw the moment it was switched to.
  return fetchJson<{ columns: CrmBoardColumn[]; cardsPerColumn: number }>(
    `/api/v2/crm/leads/board${query}`,
  );
}

export type CrmDealBoardCard = {
  id: string;
  dealNo: string;
  title: string;
  value: number | null;
  currency: string;
  status: "OPEN" | "WON" | "LOST";
  stageId: string;
  stageEnteredAt: string;
  expectedCloseDate: string | null;
  emoji: string | null;
  avatarUrl: string | null;
  client: { id: string; name: string } | null;
  assignedTo: CrmLeadOwner | null;
  nextFollowUp: { id: string; title: string; dueAt: string } | null;
};

export type CrmDealBoardColumn = {
  stage: {
    id: string;
    name: string;
    status: "OPEN" | "WON" | "LOST";
    position: number;
    colorToken: string | null;
  };
  count: number;
  totalValue: number;
  hasMore: boolean;
  deals: CrmDealBoardCard[];
};

export type CrmDealBoard = {
  pipeline: { id: string; name: string };
  columns: CrmDealBoardColumn[];
  cardsPerColumn: number;
};

export function fetchCrmDealsBoard(params: {
  pipelineId?: string | null;
  mineOnly?: boolean;
  q?: string;
} = {}) {
  const search = new URLSearchParams();
  if (params.pipelineId) search.set("pipelineId", params.pipelineId);
  if (params.mineOnly) search.set("mineOnly", "1");
  if (params.q) search.set("q", params.q);
  const query = search.toString();
  // Bare body, like the leads board — no envelope to unwrap.
  return fetchJson<CrmDealBoard>(
    `/api/v2/crm/deals/board${query ? `?${query}` : ""}`,
  );
}

export function updateCrmDealStage(dealId: string, stageId: string) {
  return fetchJson<{ id: string; stageId: string }>(
    `/api/v2/crm/deals/${dealId}/stage`,
    { method: "POST", body: JSON.stringify({ stageId }) },
  );
}

export function fetchCrmList(listId: string) {
  return fetchJson<CrmListRecord & { recordIds: string[] }>(
    `/api/v2/crm/lists/${listId}`,
  );
}

export function createCrmList(body: {
  entity: string;
  name: string;
  description?: string | null;
  isShared?: boolean;
}) {
  return fetchJson<CrmListRecord>(`/api/v2/crm/lists`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export type CrmBulkLeadAction =
  | { action: "assign"; ids: string[]; assignedToId: string | null }
  | { action: "stage"; ids: string[]; stage: CrmLeadStage; lostReason?: string }
  | { action: "archive"; ids: string[]; archived: boolean };

export function bulkUpdateCrmLeads(body: CrmBulkLeadAction) {
  return fetchJson<
    { updated: number; unchanged?: number; skipped: number; notFound: number }
  >(`/api/v2/crm/leads/bulk`, { method: "POST", body: JSON.stringify(body) });
}

export function createCrmSavedView(body: {
  name: string;
  viewType?: "TABLE" | "BOARD";
  filters: LeadViewFilters;
  sort?: LeadSort | null;
  isShared?: boolean;
}) {
  return fetchJson<CrmSavedViewRecord>(`/api/v2/crm/saved-views`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateCrmSavedView(
  id: string,
  body: Partial<{
    name: string;
    viewType: "TABLE" | "BOARD";
    filters: LeadViewFilters;
    sort: LeadSort | null;
    isShared: boolean;
  }>,
) {
  return fetchJson<CrmSavedViewRecord>(`/api/v2/crm/saved-views/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function deleteCrmSavedView(id: string) {
  return fetchJson<{ id: string }>(`/api/v2/crm/saved-views/${id}`, {
    method: "DELETE",
  });
}

export function fetchCrmVisitReport(appointmentId: string) {
  return fetchJson<CrmVisitReportRecord>(
    `/api/v2/crm/appointments/${appointmentId}/report`,
  );
}

export function saveCrmVisitReport(appointmentId: string, body: SiteVisitReportInput) {
  return fetchJson<CrmVisitReportRecord>(
    `/api/v2/crm/appointments/${appointmentId}/report`,
    { method: "PUT", body: JSON.stringify(body) },
  );
}

export function updateCrmFollowUp(
  id: string,
  body: Partial<{
    status: "PENDING" | "COMPLETED" | "CANCELLED";
    title: string;
    notes: string | null;
    dueAt: string;
    assignedToId: string;
  }>,
) {
  return fetchJson<CrmFollowUpRecord>(`/api/v2/crm/follow-ups/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function fetchCrmLead(id: string) {
  return fetchJson<CrmLeadRecord & Record<string, unknown>>(`/api/v2/crm/leads/${id}`);
}

export function createCrmLead(body: Partial<CrmLeadRecord> & { title?: string }) {
  return fetchJson<CrmLeadRecord>(`/api/v2/crm/leads`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateCrmLeadStage(id: string, stage: CrmLeadStage, lostReason?: string) {
  return fetchJson<CrmLeadRecord>(`/api/v2/crm/leads/${id}/stage`, {
    method: "POST",
    body: JSON.stringify({ stage, lostReason }),
  });
}

export function fetchCrmClients(params: { q?: string; page?: number } = {}) {
  return fetchJson<ListResponse<CrmClientRecord>>(`/api/v2/crm/clients${qs(params)}`);
}

export function createCrmClient(body: Partial<CrmClientRecord> & { name: string }) {
  return fetchJson<CrmClientRecord>(`/api/v2/crm/clients`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function fetchCrmFollowUps(params: { status?: string; overdue?: boolean; assignedToId?: string } = {}) {
  return fetchJson<ListResponse<CrmFollowUpRecord>>(`/api/v2/crm/follow-ups${qs(params)}`);
}

export function fetchCrmAppointments(params: { from?: string; to?: string; assignedToId?: string } = {}) {
  return fetchJson<ListResponse<CrmAppointmentRecord>>(`/api/v2/crm/appointments${qs(params)}`);
}

export function fetchCrmInsightsSummary(params: { from?: string; to?: string } = {}) {
  return fetchJson<Record<string, unknown>>(`/api/v2/crm/insights/summary${qs(params)}`);
}

// ---------------------------------------------------------------------------
// Core records: people, companies, deals, sites.
// ---------------------------------------------------------------------------

export type CrmPersonRecord = {
  id: string;
  personNo: string;
  /** A picture chosen for this record. Beats the emoji. */
  avatarUrl: string | null;
  /** The record's own emoji, when somebody has given it one. */
  emoji: string | null;
  firstName: string;
  lastName: string | null;
  fullName: string;
  jobTitle: string | null;
  email: string | null;
  phone: string | null;
  contactType: string;
  preferredChannel: string | null;
  city: string | null;
  tags: string[];
  clientId: string | null;
  client: { id: string; name: string } | null;
  assignedTo: CrmLeadOwner | null;
  customFields: Record<string, unknown> | null;
  lastContactedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { dealContacts: number };
};

export type CrmCompanyRecord = {
  id: string;
  clientNo: string;
  /** A picture chosen for this record. Beats the emoji. */
  avatarUrl: string | null;
  /** The record's own emoji, when somebody has given it one. */
  emoji: string | null;
  name: string;
  tradingName: string | null;
  companyType: string;
  registrationNumber: string | null;
  taxNumber: string | null;
  website: string | null;
  industry: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  country: string | null;
  billingAddress: string | null;
  accountStatus: string;
  parentClientId: string | null;
  parentRelation: string | null;
  parent: { id: string; name: string } | null;
  tags: string[];
  assignedTo: CrmLeadOwner | null;
  customFields: Record<string, unknown> | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { people: number; deals: number; sites: number };
};

export type CrmDealStage = {
  id: string;
  name: string;
  status: "OPEN" | "WON" | "LOST";
  colorToken: string | null;
  inactivityDays: number | null;
};

export type CrmDealRecord = {
  id: string;
  dealNo: string;
  title: string;
  status: "OPEN" | "WON" | "LOST";
  value: number | null;
  currency: string;
  probability: number | null;
  forecastCategory: string;
  expectedCloseDate: string | null;
  stageEnteredAt: string;
  lostReason: string | null;
  client: { id: string; name: string } | null;
  primaryContact: { id: string; fullName: string } | null;
  site: { id: string; name: string } | null;
  assignedTo: CrmLeadOwner | null;
  stage: CrmDealStage;
  pipeline: { id: string; name: string };
  nextFollowUp: CrmNextFollowUp | null;
  customFields: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

export type CrmSiteRecord = {
  id: string;
  siteNo: string;
  /** A picture chosen for this record. Beats the emoji. */
  avatarUrl: string | null;
  /** The record's own emoji, when somebody has given it one. */
  emoji: string | null;
  name: string;
  addressLine: string | null;
  city: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  accessInstructions: string | null;
  siteConditions: string | null;
  tags: string[];
  client: { id: string; name: string } | null;
  primaryContact: { id: string; fullName: string; phone: string | null } | null;
  customFields: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  _count?: { deals: number; appointments: number };
};

export type CrmPipelineStageRecord = CrmDealStage & {
  pipelineId: string;
  position: number;
  probability: number;
  requiredFields: string[];
  checklist: Array<{ key: string; label: string }> | null;
  requiresSiteVisit: boolean;
  requiresQuotation: boolean;
  /** Deals sitting in this stage — the setup page's "In it now" column. */
  _count?: { deals: number };
};

export type CrmPipelineRecord = {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  isActive: boolean;
  position: number;
  stages: CrmPipelineStageRecord[];
  _count?: { deals: number };
};

export type CrmFieldDefinitionRecord = {
  id: string;
  entity: string;
  key: string;
  label: string;
  description: string | null;
  type: string;
  isRequired: boolean;
  defaultValue: unknown;
  options: Array<{ value: string; label: string; colorToken?: string }> | null;
  section: string | null;
  position: number;
  showInTable: boolean;
  archivedAt: string | null;
};

/** Turn a filter object into query params, flattening arrays and custom fields. */
export function recordFiltersToParams(
  filters: Record<string, unknown>,
): Record<string, string | number | boolean | undefined> {
  const params: Record<string, string | number | boolean | undefined> = {};
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === "") continue;
    if (key === "customFields" && typeof value === "object") {
      for (const [fieldKey, fieldValue] of Object.entries(value as Record<string, unknown>)) {
        if (fieldValue === undefined || fieldValue === null || fieldValue === "") continue;
        params[`cf.${fieldKey}`] = Array.isArray(fieldValue)
          ? fieldValue.join(",")
          : String(fieldValue);
      }
      continue;
    }
    if (Array.isArray(value)) {
      if (value.length > 0) params[key] = value.join(",");
      continue;
    }
    if (typeof value === "boolean") {
      if (value) params[key] = "1";
      continue;
    }
    params[key] = value as string | number;
  }
  return params;
}

export function fetchCrmPeople(
  params: { filters?: Record<string, unknown>; sort?: RecordSort; page?: number; limit?: number } = {},
) {
  return fetchJson<ListResponse<CrmPersonRecord>>(
    `/api/v2/crm/people${qs({
      ...recordFiltersToParams(params.filters ?? {}),
      sortField: params.sort?.field,
      sortDir: params.sort?.direction,
      page: params.page,
      limit: params.limit,
    })}`,
  );
}

export function fetchCrmCompanies(
  params: { filters?: Record<string, unknown>; sort?: RecordSort; page?: number; limit?: number } = {},
) {
  return fetchJson<ListResponse<CrmCompanyRecord>>(
    `/api/v2/crm/companies${qs({
      ...recordFiltersToParams(params.filters ?? {}),
      sortField: params.sort?.field,
      sortDir: params.sort?.direction,
      page: params.page,
      limit: params.limit,
    })}`,
  );
}

export function fetchCrmDeals(
  params: { filters?: Record<string, unknown>; sort?: RecordSort; page?: number; limit?: number } = {},
) {
  return fetchJson<ListResponse<CrmDealRecord>>(
    `/api/v2/crm/deals${qs({
      ...recordFiltersToParams(params.filters ?? {}),
      sortField: params.sort?.field,
      sortDir: params.sort?.direction,
      page: params.page,
      limit: params.limit,
    })}`,
  );
}

export function fetchCrmSites(
  params: { filters?: Record<string, unknown>; sort?: RecordSort; page?: number; limit?: number } = {},
) {
  return fetchJson<ListResponse<CrmSiteRecord>>(
    `/api/v2/crm/sites${qs({
      ...recordFiltersToParams(params.filters ?? {}),
      sortField: params.sort?.field,
      sortDir: params.sort?.direction,
      page: params.page,
      limit: params.limit,
    })}`,
  );
}

export function fetchCrmPipelines() {
  return fetchJson<Envelope<CrmPipelineRecord[]>>(`/api/v2/crm/pipelines`);
}

export function fetchCrmFieldDefinitions(entity?: string) {
  return fetchJson<Envelope<CrmFieldDefinitionRecord[]>>(
    `/api/v2/crm/field-definitions${qs({ entity })}`,
  );
}

export function moveCrmDealStage(
  dealId: string,
  body: { stageId: string; lostReason?: string; force?: boolean },
) {
  return fetchJson<CrmDealRecord>(`/api/v2/crm/deals/${dealId}/stage`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Tasks and collaboration
// ---------------------------------------------------------------------------

export type CrmTaskRecord = {
  id: string;
  title: string;
  description: string | null;
  type: CrmTaskType;
  priority: CrmTaskPriority;
  status: CrmTaskStatus;
  dueAt: string;
  hasDueTime: boolean;
  outcome: CrmTaskOutcome | null;
  outcomeNotes: string | null;
  completedAt: string | null;
  assignedToId: string | null;
  assignedTo?: { id: string; name: string | null } | null;
  leadId: string | null;
  dealId: string | null;
  clientId: string | null;
  personId: string | null;
  siteId: string | null;
  recurrence: CrmRecurrence;
  recurrenceInterval: number;
  lead?: { id: string; leadNo: string; title: string | null } | null;
  deal?: { id: string; dealNo: string; title: string } | null;
  client?: { id: string; name: string } | null;
  person?: { id: string; fullName: string } | null;
  createdAt: string;
};

export type CrmTaskRecordRef = {
  leadId?: string;
  dealId?: string;
  clientId?: string;
  personId?: string;
  siteId?: string;
};

export function fetchCrmTasks(
  params: {
    queue?: TaskQueue;
    page?: number;
    limit?: number;
    /** A user id, or "none" for unassigned. */
    assignedToId?: string;
  } & CrmTaskRecordRef = {},
) {
  return fetchJson<ListResponse<CrmTaskRecord>>(
    `/api/v2/crm/tasks${qs({
      queue: params.queue,
      page: params.page,
      limit: params.limit,
      assignedToId: params.assignedToId,
      leadId: params.leadId,
      dealId: params.dealId,
      clientId: params.clientId,
      personId: params.personId,
      siteId: params.siteId,
    })}`,
  );
}

export function createCrmTask(body: Record<string, unknown>) {
  return fetchJson<CrmTaskRecord>(`/api/v2/crm/tasks`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateCrmTask(id: string, body: Record<string, unknown>) {
  return fetchJson<
    CrmTaskRecord & { recurredTask: { id: string; dueAt: string } | null; suggestsFollowUp: boolean }
  >(`/api/v2/crm/tasks/${id}`, { method: "PATCH", body: JSON.stringify(body) });
}

export function deleteCrmTask(id: string) {
  return fetchJson<{ id: string }>(`/api/v2/crm/tasks/${id}`, { method: "DELETE" });
}

export type CrmCommentAuthor = { id: string; name: string | null; email: string };

export type CrmCommentRecord = {
  id: string;
  body: string;
  parentId: string | null;
  isPinned: boolean;
  resolvedAt: string | null;
  editedAt: string | null;
  createdAt: string;
  createdBy: CrmCommentAuthor;
  resolvedBy?: CrmCommentAuthor | null;
  mentions: { userId: string }[];
  replies?: CrmCommentRecord[];
};

export function fetchCrmComments(entity: CollabEntity, recordId: string) {
  return fetchJson<CrmCommentRecord[]>(
    `/api/v2/crm/comments${qs({ entity, recordId })}`,
  );
}

export function createCrmComment(body: {
  entity: CollabEntity;
  recordId: string;
  body: string;
  parentId?: string | null;
}) {
  return fetchJson<CrmCommentRecord>(`/api/v2/crm/comments`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateCrmComment(
  id: string,
  body: { body?: string; isPinned?: boolean; resolved?: boolean },
) {
  return fetchJson<CrmCommentRecord>(`/api/v2/crm/comments/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function deleteCrmComment(id: string) {
  return fetchJson<{ id: string }>(`/api/v2/crm/comments/${id}`, { method: "DELETE" });
}

export type CrmFollowerRecord = {
  id: string;
  userId: string;
  user: CrmCommentAuthor;
};

export function fetchCrmFollowers(entity: CollabEntity, recordId: string) {
  return fetchJson<{ followers: CrmFollowerRecord[]; isFollowing: boolean }>(
    `/api/v2/crm/followers${qs({ entity, recordId })}`,
  );
}

export function followCrmRecord(entity: CollabEntity, recordId: string, userId?: string) {
  return fetchJson<CrmFollowerRecord>(`/api/v2/crm/followers`, {
    method: "POST",
    body: JSON.stringify({ entity, recordId, userId }),
  });
}

export function unfollowCrmRecord(entity: CollabEntity, recordId: string, userId?: string) {
  return fetchJson<{ unfollowed: boolean }>(
    `/api/v2/crm/followers${qs({ entity, recordId, userId })}`,
    { method: "DELETE" },
  );
}

// ---------------------------------------------------------------------------
// Import and merge
// ---------------------------------------------------------------------------

export type CrmImportPreview = ImportPlan & {
  rowCount: number;
  fields: { key: string; label: string; required?: boolean }[];
};

export function previewCrmImport(body: {
  entity: ImportEntity;
  mapping: Record<string, string>;
  onDuplicate: "SKIP" | "UPDATE";
  csv: string;
}) {
  return fetchJson<CrmImportPreview>(`/api/v2/crm/import`, {
    method: "POST",
    body: JSON.stringify({ ...body, commit: false }),
  });
}

export function commitCrmImport(body: {
  entity: ImportEntity;
  mapping: Record<string, string>;
  onDuplicate: "SKIP" | "UPDATE";
  csv: string;
}) {
  return fetchJson<
    {
      created: number;
      updated: number;
      failed: { line: number; message: string }[];
      totals: { create: number; update: number; skip: number };
    }
  >(`/api/v2/crm/import`, { method: "POST", body: JSON.stringify({ ...body, commit: true }) });
}

export type CrmMergePreview = {
  survivor: { id: string; label: string; reference: string };
  loser: { id: string; label: string; reference: string };
  fields: MergeFieldPlan[];
};

export function previewCrmMerge(entity: "PERSON" | "COMPANY", survivorId: string, loserId: string) {
  const base = entity === "PERSON" ? "people" : "companies";
  return fetchJson<CrmMergePreview>(`/api/v2/crm/${base}/${survivorId}/merge`, {
    method: "POST",
    body: JSON.stringify({ loserId, commit: false }),
  });
}

export function commitCrmMerge(
  entity: "PERSON" | "COMPANY",
  survivorId: string,
  loserId: string,
  choices: Record<string, FieldChoice>,
) {
  const base = entity === "PERSON" ? "people" : "companies";
  return fetchJson<{ id: string }>(`/api/v2/crm/${base}/${survivorId}/merge`, {
    method: "POST",
    body: JSON.stringify({ loserId, choices, commit: true }),
  });
}

// ---------------------------------------------------------------------------
// Sales documents: quotes, invoices, receipts.
// ---------------------------------------------------------------------------

export type CrmDocumentKind = "QUOTATION" | "INVOICE" | "RECEIPT";

export type CrmDocumentRecord = {
  id: string;
  type: CrmDocumentKind;
  version: number;
  revisionNote: string | null;
  supersedesId: string | null;
  currency: string;
  createdAt: string;
  createdBy: { id: string; name: string | null } | null;
  lead: { id: string; leadNo: string; title: string } | null;
  deal: { id: string; dealNo: string; title: string } | null;
  approvalStatus: string | null;
  approvalToken: string | null;
  /** From the accounting row, which is the source of truth for all of these. */
  number: string | null;
  status: string;
  issuedAt: string;
  dueAt: string | null;
  customer: string | null;
  total: number;
  /** Invoices only — see the route, where `null` means "cannot be outstanding". */
  balance: number | null;
};

export function fetchCrmDocuments(
  params: {
    type?: CrmDocumentKind;
    q?: string;
    leadId?: string;
    dealId?: string;
    page?: number;
    limit?: number;
  } = {},
) {
  return fetchJson<ListResponse<CrmDocumentRecord>>(`/api/v2/crm/documents${qs(params)}`);
}

// ---------------------------------------------------------------------------
// Sales reps.
// ---------------------------------------------------------------------------

export type CrmRepPerformance = {
  repId: string;
  name: string;
  leads: number;
  quotes: number;
  won: number;
  /** Already a percentage, 0–100 — not a fraction. */
  winRate: number;
  invoicedAmount: number;
  collectedAmount: number;
  avgResponseHours: number | null;
};

export type CrmRepSummary = {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
  joinedAt: string;
  openLeads: number;
  openLeadValue: number;
  openDeals: number;
  openDealValue: number;
  openTasks: number;
  /** Null when the viewer is not entitled to this rep's numbers. */
  performance: CrmRepPerformance | null;
};

export function fetchCrmReps(params: { range?: string } = {}) {
  return fetchJson<{ data: CrmRepSummary[]; range: string; canSeeEveryone: boolean }>(
    `/api/v2/crm/reps${qs(params)}`,
  );
}

export type CrmRepDetail = {
  rep: {
    id: string;
    name: string | null;
    email: string | null;
    phone: string | null;
    role: string;
    isActive: boolean;
    createdAt: string;
  };
  canSeeNumbers: boolean;
  range: string;
  performance: CrmRepPerformance | null;
  closed: { won: number; lost: number };
  leads: Array<{
    id: string;
    leadNo: string;
    title: string;
    stage: CrmLeadStage;
    estimatedValue: number | null;
    currency: string;
    updatedAt: string;
    client: { id: string; name: string } | null;
  }>;
  deals: Array<{
    id: string;
    dealNo: string;
    title: string;
    value: number | null;
    currency: string;
    expectedCloseDate: string | null;
    updatedAt: string;
    stage: { id: string; name: string };
    client: { id: string; name: string } | null;
  }>;
  tasks: Array<{
    id: string;
    title: string;
    type: string;
    priority: string;
    dueAt: string;
    leadId: string | null;
    dealId: string | null;
    clientId: string | null;
  }>;
  activities: Array<{
    id: string;
    type: string;
    subject: string;
    body: string | null;
    occurredAt: string;
    lead: { id: string; title: string } | null;
    deal: { id: string; title: string } | null;
    client: { id: string; name: string } | null;
  }>;
  documents: Array<{ type: string; amount: number; currency: string; createdAt: string }>;
};

export function fetchCrmRep(repId: string, params: { range?: string } = {}) {
  return fetchJson<CrmRepDetail>(`/api/v2/crm/reps/${repId}${qs(params)}`);
}
