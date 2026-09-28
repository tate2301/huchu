import type { RegisterDef } from "../types";

/** Sites: the addresses work happens at. Opens A–Z. */
export const SITE_REGISTER = {
  key: "SITE",
  noun: { one: "site", many: "sites" },
  route: "/crm/sites",
  endpoint: "/api/v2/crm/sites",
  queryKey: ["crm", "sites"],
  layouts: ["TABLE", "LIST"],
  search: { placeholder: "Search sites by name, number or address" },
  filters: [
    { key: "company", label: "Company", kind: "relation", relation: "COMPANY", anyLabel: "Any", pinned: true },
    { key: "city", label: "City", kind: "enum", facet: true, anyLabel: "Anywhere", pinned: true },
    { key: "tag", label: "Tag", kind: "enum", facet: true, anyLabel: "Any tag" },
    {
      key: "created",
      label: "Added",
      kind: "date",
      anyLabel: "Any time",
      presets: ["today", "this-week", "this-month", "last-30d"],
    },
    { key: "group", label: "Group", kind: "group", anyLabel: "Any group" },
    { key: "archived", label: "Archived", kind: "boolean", onLabel: "Archived only" },
  ],
  sorts: [
    { key: "name", label: "Name", dir: "asc" },
    { key: "updated", label: "Last updated", dir: "desc" },
    { key: "created", label: "Date added", dir: "desc" },
    { key: "ref", label: "Reference", dir: "asc" },
  ],
  groupBys: [
    { key: "company", label: "Company" },
    { key: "city", label: "City" },
  ],
  columns: [
    { id: "name", label: "Site", kind: "text", required: true, sort: "name" },
    { id: "ref", label: "Reference", kind: "code", hiddenByDefault: true, sort: "ref" },
    { id: "company", label: "Company", kind: "relation", filter: "company" },
    { id: "address", label: "Where", kind: "text", filter: "city" },
    { id: "city", label: "City", kind: "text", hiddenByDefault: true, filter: "city" },
    { id: "country", label: "Country", kind: "text", hiddenByDefault: true },
    { id: "contact", label: "Contact", kind: "relation" },
    { id: "deals", label: "Deals", kind: "number" },
    { id: "visits", label: "Visits", kind: "number" },
    { id: "coordinates", label: "Coordinates", kind: "code", hiddenByDefault: true },
    { id: "tags", label: "Tags", kind: "text", hiddenByDefault: true, filter: "tag" },
    { id: "created", label: "Added", kind: "date", hiddenByDefault: true, sort: "created", filter: "created" },
    { id: "updated", label: "Last updated", kind: "datetime", hiddenByDefault: true, sort: "updated" },
  ],
  views: [
    { key: "all", name: "All sites", state: { filters: {} } },
    { key: "recent", name: "Recently added", state: { filters: {}, sort: { key: "created", dir: "desc" } } },
    { key: "archived", name: "Archived", state: { filters: { archived: true } } },
  ],
  bulk: ["group", "archive", "restore"],
  entity: "SITE",
} as const satisfies RegisterDef;
