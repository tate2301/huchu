import { DEAL_STATUS_OPTIONS, FORECAST_OPTIONS } from "@/lib/crm/record-labels";

import type { RegisterDef } from "../types";

/**
 * Deals: the pipeline. Opens on the board, because the pipeline is what
 * people come here to work; the views that answer a question — what is mine,
 * what closes this month, what has gone quiet — are tables. Won, lost and
 * open are views and board columns already, so Status waits under "+ Filter".
 *
 * A board is one pipeline's stages; the pipeline filter chooses which, and
 * without it the board shows the default one while a table spans them all.
 */
export const DEAL_REGISTER = {
  key: "DEAL",
  noun: { one: "deal", many: "deals" },
  route: "/crm/deals",
  endpoint: "/api/v2/crm/deals",
  queryKey: ["crm", "deals"],
  layouts: ["BOARD", "TABLE", "LIST"],
  boardEndpoint: "/api/v2/crm/deals/board",
  search: { placeholder: "Search deals by title, number, company or contact" },
  filters: [
    { key: "pipeline", label: "Pipeline", kind: "enum", source: "pipelines", single: true, anyLabel: "All pipelines", pinned: true },
    { key: "status", label: "Status", kind: "enum", options: DEAL_STATUS_OPTIONS, anyLabel: "Any" },
    { key: "owner", label: "Owner", kind: "person", anyLabel: "Anyone", pinned: true },
    { key: "stage", label: "Stage", kind: "enum", source: "stages", follows: "pipeline", anyLabel: "Any stage" },
    { key: "company", label: "Company", kind: "relation", relation: "COMPANY", anyLabel: "Any" },
    { key: "site", label: "Site", kind: "relation", relation: "SITE", anyLabel: "Any" },
    { key: "forecast", label: "Forecast", kind: "enum", options: FORECAST_OPTIONS, anyLabel: "Any" },
    { key: "value", label: "Value", kind: "number", anyLabel: "Any" },
    {
      key: "close",
      label: "Expected close",
      kind: "date",
      anyLabel: "Any time",
      presets: ["overdue", "this-week", "this-month", "next-30d"],
    },
    {
      key: "created",
      label: "Added",
      kind: "date",
      anyLabel: "Any time",
      presets: ["today", "this-week", "this-month", "last-30d"],
    },
    { key: "stale", label: "Gone quiet", kind: "boolean", onLabel: "Gone quiet" },
    { key: "overdue", label: "Task overdue", kind: "boolean", onLabel: "Task overdue" },
    { key: "noProject", label: "No project yet", kind: "boolean", onLabel: "No project yet" },
    { key: "group", label: "Group", kind: "group", anyLabel: "Any group" },
    { key: "archived", label: "Archived", kind: "boolean", onLabel: "Archived only" },
  ],
  sorts: [
    { key: "updated", label: "Last updated", dir: "desc" },
    { key: "close", label: "Expected close", dir: "asc" },
    { key: "value", label: "Value", dir: "desc" },
    { key: "entered", label: "Longest in stage", dir: "asc" },
    { key: "created", label: "Date added", dir: "desc" },
    { key: "title", label: "Title", dir: "asc" },
    { key: "ref", label: "Reference", dir: "asc" },
  ],
  groupBys: [
    { key: "stage", label: "Stage" },
    { key: "owner", label: "Owner" },
    { key: "company", label: "Company" },
  ],
  columns: [
    { id: "name", label: "Deal", kind: "text", required: true, sort: "title" },
    { id: "ref", label: "Reference", kind: "code", hiddenByDefault: true, sort: "ref" },
    { id: "company", label: "Company", kind: "relation" },
    { id: "stage", label: "Stage", kind: "status" },
    { id: "value", label: "Value", kind: "money", sort: "value" },
    { id: "close", label: "Expected close", kind: "date", sort: "close" },
    { id: "owner", label: "Owner", kind: "relation" },
    { id: "next", label: "Next task", kind: "text" },
    { id: "status", label: "Status", kind: "status", hiddenByDefault: true },
    { id: "pipeline", label: "Pipeline", kind: "text", hiddenByDefault: true },
    { id: "probability", label: "Probability", kind: "percent", hiddenByDefault: true },
    { id: "forecast", label: "Forecast", kind: "text", hiddenByDefault: true },
    { id: "contact", label: "Contact", kind: "relation", hiddenByDefault: true },
    { id: "site", label: "Site", kind: "relation", hiddenByDefault: true },
    { id: "entered", label: "In stage since", kind: "date", hiddenByDefault: true, sort: "entered" },
    { id: "created", label: "Added", kind: "date", hiddenByDefault: true, sort: "created" },
    { id: "updated", label: "Last updated", kind: "datetime", hiddenByDefault: true, sort: "updated" },
    { id: "currency", label: "Currency", kind: "code", exportOnly: true },
  ],
  views: [
    { key: "all", name: "All deals", state: { filters: {}, layout: "BOARD" } },
    { key: "mine", name: "My open deals", state: { filters: { owner: ["me"], status: ["OPEN"] }, layout: "TABLE" } },
    {
      key: "closing",
      name: "Closing this month",
      state: {
        filters: { status: ["OPEN"], close: { preset: "this-month" } },
        sort: { key: "close", dir: "asc" },
        layout: "TABLE",
      },
    },
    {
      key: "quiet",
      name: "Gone quiet",
      state: { filters: { stale: true }, sort: { key: "entered", dir: "asc" }, layout: "TABLE" },
    },
    { key: "unassigned", name: "Unassigned", state: { filters: { owner: ["none"], status: ["OPEN"] }, layout: "TABLE" } },
    { key: "won", name: "Won", state: { filters: { status: ["WON"] }, layout: "TABLE" } },
    { key: "lost", name: "Lost", state: { filters: { status: ["LOST"] }, layout: "TABLE" } },
    { key: "archived", name: "Archived", state: { filters: { archived: true }, layout: "TABLE" } },
  ],
  bulk: ["assign", "group", "archive", "restore"],
  groupEntity: "DEAL",
} as const satisfies RegisterDef;
