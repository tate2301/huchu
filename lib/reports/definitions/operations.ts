import { periodParams } from "@/lib/reports/params";
import type { ReportDefinition, ReportParam } from "@/lib/reports/types";

/**
 * A mine's reports: what came out of the ground, what it cost to run, and
 * where the gold went.
 *
 * Each keeps the address and the grant its old page had — `/reports/shift` is
 * still `/reports/shift`, still `reports.shift` — so provisioning, bookmarks
 * and the dashboard's links all still land.
 */

const PROFILES = ["GOLD_MINE"];
const MANAGERS = ["SUPERADMIN", "MANAGER"];

/** Filled with the company's own sites by the loader. */
const SITE: ReportParam = { key: "site", label: "Site", type: "choice", options: [{ value: "all", label: "All sites" }] };

const shift: ReportDefinition = {
  key: "shift",
  title: "Shift reports",
  area: "Production",
  href: "/reports/shift",
  profiles: PROFILES,
  params: [...periodParams(7), SITE],
  columns: [
    { key: "date", label: "Date", kind: "date" },
    { key: "shift", label: "Shift", kind: "text" },
    { key: "site", label: "Site", kind: "text" },
    { key: "section", label: "Section", kind: "text", hidden: true },
    { key: "group", label: "Group", kind: "text" },
    { key: "leader", label: "Leader", kind: "text" },
    { key: "workType", label: "Work type", kind: "status" },
    { key: "crew", label: "Crew", kind: "number", total: "sum" },
    { key: "tonnes", label: "Tonnes", kind: "number", total: "sum" },
    { key: "trips", label: "Trips", kind: "number", hidden: true, total: "sum" },
    { key: "metres", label: "Metres advanced", kind: "number", hidden: true, total: "sum" },
    { key: "incident", label: "Incident", kind: "status", hidden: true },
    { key: "status", label: "Status", kind: "status" },
  ],
  defaults: { sort: [{ column: "date", dir: "desc" }] },
  rowActions: [
    {
      id: "delete",
      kind: "delete",
      label: "Delete",
      endpoint: "/api/shift-reports/{id}",
      confirm: "Delete the {shift} shift report for {date}?",
      roles: ["SUPERADMIN"],
    },
  ],
};

const attendance: ReportDefinition = {
  key: "attendance",
  title: "Attendance",
  area: "Production",
  href: "/reports/attendance",
  profiles: PROFILES,
  params: [...periodParams(7), SITE],
  layout: {
    blocks: [
      { id: "figures", type: "figures" },
      { id: "by-mark", type: "chart", form: "bars", by: "status", limit: 8, title: "Marks", half: true },
      { id: "by-site", type: "chart", form: "bars", by: "site", limit: 8, title: "By site", half: true },
      { id: "table", type: "table" },
    ],
  },
  columns: [
    { key: "date", label: "Date", kind: "date" },
    { key: "employee", label: "Employee", kind: "text" },
    { key: "employeeNo", label: "Employee no.", kind: "code", hidden: true },
    { key: "shift", label: "Shift", kind: "text" },
    { key: "site", label: "Site", kind: "text" },
    { key: "group", label: "Group", kind: "text", hidden: true },
    { key: "leader", label: "Shift leader", kind: "text" },
    { key: "status", label: "Status", kind: "status" },
    { key: "overtime", label: "Overtime hours", kind: "number", total: "sum" },
    { key: "notes", label: "Notes", kind: "text", hidden: true },
  ],
  defaults: { sort: [{ column: "date", dir: "desc" }] },
  rowActions: [
    {
      id: "edit",
      kind: "edit",
      label: "Correct attendance",
      endpoint: "/api/people/attendance/{id}",
      fields: [
        {
          key: "status",
          label: "Status",
          type: "select",
          required: true,
          options: [
            { value: "PRESENT", label: "Present" },
            { value: "ABSENT", label: "Absent" },
            { value: "LATE", label: "Late" },
          ],
        },
        { key: "overtime", label: "Overtime hours", type: "number", required: false, min: 0, max: 24 },
        { key: "notes", label: "Notes", type: "longText", required: false },
      ],
      values: { status: "statusCode", overtime: "overtime", notes: "notes" },
      roles: ["SUPERADMIN"],
    },
    {
      id: "delete",
      kind: "delete",
      label: "Delete",
      endpoint: "/api/people/attendance/{id}",
      confirm: "Delete {employee}'s attendance for {date}?",
      roles: ["SUPERADMIN"],
    },
  ],
};

const plant: ReportDefinition = {
  key: "plant",
  title: "Plant reports",
  area: "Production",
  href: "/reports/plant",
  profiles: PROFILES,
  params: [...periodParams(30), SITE],
  columns: [
    { key: "date", label: "Date", kind: "date" },
    { key: "site", label: "Site", kind: "text" },
    { key: "tonnesFed", label: "Tonnes fed", kind: "number", hidden: true, total: "sum" },
    { key: "tonnes", label: "Tonnes processed", kind: "number", total: "sum" },
    { key: "runHours", label: "Run hours", kind: "number", total: "sum" },
    { key: "downtime", label: "Downtime hours", kind: "number", total: "sum" },
    { key: "diesel", label: "Diesel litres", kind: "number", hidden: true, total: "sum" },
    { key: "gold", label: "Gold recovered g", kind: "number", total: "sum" },
    { key: "status", label: "Status", kind: "status" },
    { key: "reportedBy", label: "Reported by", kind: "text", hidden: true },
  ],
  defaults: { sort: [{ column: "date", dir: "desc" }] },
  rowActions: [
    {
      id: "delete",
      kind: "delete",
      label: "Delete",
      endpoint: "/api/plant-reports/{id}",
      confirm: "Delete the plant report for {date}?",
      roles: ["SUPERADMIN"],
    },
  ],
};

const downtime: ReportDefinition = {
  key: "downtime",
  title: "Downtime",
  area: "Production",
  href: "/reports/downtime",
  roles: MANAGERS,
  profiles: PROFILES,
  params: [...periodParams(30), SITE],
  columns: [
    { key: "date", label: "Date", kind: "date" },
    { key: "site", label: "Site", kind: "text" },
    { key: "cause", label: "Cause", kind: "status" },
    { key: "code", label: "Code", kind: "code", hidden: true },
    { key: "from", label: "Reported on", kind: "text" },
    { key: "hours", label: "Hours", kind: "number", total: "sum" },
    { key: "notes", label: "Notes", kind: "text" },
  ],
  defaults: { sort: [{ column: "hours", dir: "desc" }], groupBy: "cause" },
  layout: {
    blocks: [
      { id: "figures", type: "figures" },
      { id: "by-cause", type: "chart", form: "bars", by: "cause", measure: { column: "hours", fn: "sum" }, limit: 10, title: "Hours lost by cause" },
      { id: "over-time", type: "chart", form: "trend", by: "date", measure: { column: "hours", fn: "sum" }, limit: 8, title: "Hours lost over time" },
      { id: "table", type: "table" },
    ],
  },
};

const goldChain: ReportDefinition = {
  key: "gold-chain",
  title: "Gold chain",
  area: "Gold",
  href: "/reports/gold-chain",
  profiles: PROFILES,
  params: [...periodParams(90, "Poured"), SITE],
  columns: [
    { key: "bar", label: "Bar", kind: "code" },
    { key: "poured", label: "Poured", kind: "date" },
    { key: "site", label: "Site", kind: "text" },
    { key: "grams", label: "Gross g", kind: "number", total: "sum" },
    { key: "purity", label: "Est. purity %", kind: "number", hidden: true, total: "avg" },
    { key: "stage", label: "Where it is", kind: "status" },
    { key: "dispatched", label: "Dispatched", kind: "date" },
    { key: "destination", label: "Destination", kind: "text" },
    { key: "receipt", label: "Receipt", kind: "code" },
    { key: "paid", label: "Paid", kind: "money", total: "sum" },
    { key: "value", label: "Value USD", kind: "money", hidden: true, total: "sum" },
  ],
  defaults: { sort: [{ column: "poured", dir: "desc" }] },
};

const goldReceipts: ReportDefinition = {
  key: "gold-receipts",
  title: "Gold receipts",
  area: "Gold",
  href: "/reports/gold-receipts",
  profiles: PROFILES,
  params: periodParams(90, "Received"),
  columns: [
    { key: "receipt", label: "Receipt", kind: "code" },
    { key: "date", label: "Date", kind: "date" },
    { key: "bar", label: "Bar", kind: "code" },
    { key: "assay", label: "Assay %", kind: "number", total: "avg" },
    { key: "paid", label: "Paid", kind: "money", total: "sum" },
    { key: "method", label: "Method", kind: "status" },
    { key: "channel", label: "Channel", kind: "text", hidden: true },
    { key: "reference", label: "Reference", kind: "code", hidden: true },
    { key: "pricePerGram", label: "Price per g", kind: "money", hidden: true, total: "avg" },
  ],
  defaults: { sort: [{ column: "date", dir: "desc" }] },
};

const storesMovements: ReportDefinition = {
  key: "stores-movements",
  title: "Stock movements",
  area: "Stores and maintenance",
  href: "/reports/stores-movements",
  profiles: PROFILES,
  params: [...periodParams(30), SITE],
  columns: [
    { key: "date", label: "Date", kind: "date" },
    { key: "reference", label: "Reference", kind: "code", hidden: true },
    { key: "item", label: "Item", kind: "text" },
    { key: "itemCode", label: "Item code", kind: "code", hidden: true },
    { key: "category", label: "Category", kind: "status" },
    { key: "type", label: "Movement", kind: "status" },
    { key: "quantity", label: "Quantity", kind: "number", total: "sum" },
    { key: "unit", label: "Unit", kind: "text" },
    { key: "site", label: "Site", kind: "text" },
    { key: "issuedTo", label: "Issued to", kind: "text" },
    { key: "by", label: "By", kind: "text", hidden: true },
  ],
  defaults: { sort: [{ column: "date", dir: "desc" }] },
};

const fuelLedger: ReportDefinition = {
  key: "fuel-ledger",
  title: "Fuel ledger",
  area: "Stores and maintenance",
  href: "/reports/fuel-ledger",
  profiles: PROFILES,
  params: [...periodParams(30), SITE],
  columns: [
    { key: "date", label: "Date", kind: "date" },
    { key: "item", label: "Fuel", kind: "text" },
    { key: "type", label: "Movement", kind: "status" },
    { key: "quantity", label: "Litres", kind: "number", total: "sum" },
    { key: "site", label: "Site", kind: "text" },
    { key: "issuedTo", label: "Issued to", kind: "text" },
    { key: "onHand", label: "On hand now", kind: "number", hidden: true },
  ],
  defaults: { sort: [{ column: "date", dir: "desc" }] },
};

const workOrders: ReportDefinition = {
  key: "maintenance-work-orders",
  title: "Maintenance work orders",
  area: "Stores and maintenance",
  href: "/reports/maintenance-work-orders",
  profiles: PROFILES,
  params: [...periodParams(60, "Down"), SITE],
  columns: [
    { key: "equipment", label: "Equipment", kind: "text" },
    { key: "code", label: "Code", kind: "code", hidden: true },
    { key: "issue", label: "Issue", kind: "text" },
    { key: "status", label: "Status", kind: "status" },
    { key: "down", label: "Down from", kind: "date" },
    { key: "up", label: "Back up", kind: "date" },
    { key: "hours", label: "Hours down", kind: "number", total: "sum" },
    { key: "technician", label: "Technician", kind: "text" },
    { key: "parts", label: "Parts", kind: "money", total: "sum" },
    { key: "labour", label: "Labour", kind: "money", total: "sum" },
  ],
  defaults: { sort: [{ column: "down", dir: "desc" }] },
};

const equipment: ReportDefinition = {
  key: "maintenance-equipment",
  title: "Equipment service",
  area: "Stores and maintenance",
  href: "/reports/maintenance-equipment",
  profiles: PROFILES,
  params: [SITE],
  columns: [
    { key: "code", label: "Code", kind: "code" },
    { key: "name", label: "Equipment", kind: "text" },
    { key: "category", label: "Category", kind: "status" },
    { key: "site", label: "Site", kind: "text" },
    { key: "service", label: "Service", kind: "status" },
    { key: "lastService", label: "Last service", kind: "date" },
    { key: "nextDue", label: "Next due", kind: "date" },
    { key: "count", label: "Units", kind: "number", hidden: true, total: "sum" },
  ],
  defaults: { sort: [{ column: "nextDue", dir: "asc" }] },
};

const incidents: ReportDefinition = {
  key: "compliance-incidents",
  title: "Incidents",
  area: "Safety and audit",
  href: "/reports/compliance-incidents",
  roles: MANAGERS,
  profiles: PROFILES,
  params: [...periodParams(90), SITE],
  columns: [
    { key: "date", label: "Date", kind: "date" },
    { key: "type", label: "Type", kind: "status" },
    { key: "severity", label: "Severity", kind: "status" },
    { key: "site", label: "Site", kind: "text" },
    { key: "description", label: "What happened", kind: "text" },
    { key: "actions", label: "Actions taken", kind: "text", hidden: true },
    { key: "reportedBy", label: "Reported by", kind: "text" },
    { key: "status", label: "Status", kind: "status" },
  ],
  defaults: { sort: [{ column: "date", dir: "desc" }] },
};

const auditTrails: ReportDefinition = {
  key: "audit-trails",
  title: "Activity",
  area: "Safety and audit",
  href: "/reports/audit-trails",
  profiles: PROFILES,
  params: periodParams(7),
  columns: [
    { key: "when", label: "When", kind: "date" },
    { key: "time", label: "Time", kind: "code" },
    { key: "actor", label: "Who", kind: "text" },
    { key: "event", label: "Event", kind: "code" },
    { key: "entity", label: "Record", kind: "text" },
    { key: "entityId", label: "Record id", kind: "code", hidden: true },
    { key: "reason", label: "Reason", kind: "text", hidden: true },
  ],
  defaults: { sort: [{ column: "when", dir: "desc" }, { column: "time", dir: "desc" }] },
};

export const OPERATIONS_REPORTS: ReportDefinition[] = [
  shift,
  plant,
  downtime,
  attendance,
  goldChain,
  goldReceipts,
  storesMovements,
  fuelLedger,
  workOrders,
  equipment,
  incidents,
  auditTrails,
];
