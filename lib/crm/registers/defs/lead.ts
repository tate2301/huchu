import { LEAD_CHANNEL_OPTIONS, LEAD_STAGE_OPTIONS } from "@/lib/crm/record-labels";

import type { RegisterDef } from "../types";

/** Every stage before an enquiry is won or lost. */
const OPEN_STAGES = ["NEW", "CONTACTED", "QUALIFIED", "SITE_VISIT", "QUOTED", "INVOICED"];

/**
 * Leads: the enquiries coming in. Opens on the board, a column per stage,
 * because working the intake is what the page is for; "needs attention" and
 * "unassigned" are questions, answered as tables.
 */
export const LEAD_REGISTER = {
  key: "LEAD",
  noun: { one: "lead", many: "leads" },
  route: "/crm/leads",
  endpoint: "/api/v2/crm/leads",
  queryKey: ["crm", "leads"],
  layouts: ["BOARD", "TABLE", "LIST"],
  boardEndpoint: "/api/v2/crm/leads/board",
  search: { placeholder: "Search leads by title, number, contact or company" },
  filters: [
    { key: "owner", label: "Owner", kind: "person", anyLabel: "Anyone", pinned: true },
    { key: "stage", label: "Stage", kind: "enum", options: LEAD_STAGE_OPTIONS, anyLabel: "Any stage" },
    { key: "channel", label: "Channel", kind: "enum", options: LEAD_CHANNEL_OPTIONS, anyLabel: "Any" },
    { key: "source", label: "Source", kind: "enum", facet: true, anyLabel: "Any source" },
    { key: "company", label: "Company", kind: "relation", relation: "COMPANY", anyLabel: "Any" },
    { key: "value", label: "Value", kind: "number", anyLabel: "Any" },
    {
      key: "created",
      label: "Added",
      kind: "date",
      anyLabel: "Any time",
      presets: ["today", "this-week", "this-month", "last-30d"],
    },
    { key: "overdue", label: "Task overdue", kind: "boolean", onLabel: "Task overdue" },
    { key: "group", label: "Group", kind: "group", anyLabel: "Any group" },
    { key: "archived", label: "Archived", kind: "boolean", onLabel: "Archived only" },
  ],
  sorts: [
    { key: "updated", label: "Last updated", dir: "desc" },
    { key: "created", label: "Date added", dir: "desc" },
    { key: "value", label: "Value", dir: "desc" },
    { key: "stage", label: "Stage", dir: "asc" },
    { key: "title", label: "Title", dir: "asc" },
    { key: "ref", label: "Reference", dir: "asc" },
  ],
  groupBys: [
    { key: "stage", label: "Stage" },
    { key: "owner", label: "Owner" },
    { key: "channel", label: "Channel" },
    { key: "source", label: "Source" },
  ],
  columns: [
    { id: "name", label: "Lead", kind: "text", required: true, sort: "title" },
    { id: "ref", label: "Reference", kind: "code", hiddenByDefault: true, sort: "ref" },
    { id: "company", label: "Company", kind: "relation", filter: "company" },
    { id: "stage", label: "Stage", kind: "status", sort: "stage", filter: "stage" },
    { id: "value", label: "Value", kind: "money", sort: "value", filter: "value" },
    { id: "owner", label: "Owner", kind: "relation", filter: "owner" },
    { id: "next", label: "Next task", kind: "text" },
    { id: "source", label: "Source", kind: "text", filter: "source" },
    { id: "channel", label: "Channel", kind: "text", hiddenByDefault: true, filter: "channel" },
    { id: "contact", label: "Contact", kind: "text", hiddenByDefault: true },
    { id: "email", label: "Email", kind: "email", hiddenByDefault: true },
    { id: "phone", label: "Phone", kind: "phone", hiddenByDefault: true },
    { id: "created", label: "Added", kind: "date", hiddenByDefault: true, sort: "created", filter: "created" },
    { id: "updated", label: "Last updated", kind: "datetime", sort: "updated" },
    { id: "currency", label: "Currency", kind: "code", exportOnly: true },
  ],
  views: [
    { key: "all", name: "All leads", state: { filters: {}, layout: "BOARD" } },
    { key: "mine", name: "My leads", state: { filters: { owner: ["me"] }, layout: "BOARD" } },
    { key: "open", name: "Open pipeline", state: { filters: { stage: OPEN_STAGES }, layout: "BOARD" } },
    { key: "attention", name: "Needs attention", state: { filters: { overdue: true }, layout: "TABLE" } },
    { key: "unassigned", name: "Unassigned", state: { filters: { owner: ["none"] }, layout: "TABLE" } },
    { key: "archived", name: "Archived", state: { filters: { archived: true }, layout: "TABLE" } },
  ],
  bulk: ["assign", "status", "group", "archive", "restore"],
  statusOptions: LEAD_STAGE_OPTIONS,
  statusLabel: "Stage",
  statusNeedsReason: ["LOST"],
  entity: "LEAD",
} as const satisfies RegisterDef;
