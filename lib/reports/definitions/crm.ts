import { periodParams } from "@/lib/reports/params";
import type { ReportDefinition, ReportRowAction } from "@/lib/reports/types";

/**
 * The CRM's reports: the pipeline from first contact to money in.
 *
 * Each is one kind of record, dated by the moment that matters for it — a
 * lead by when it arrived, a deal by when it is expected to close, an invoice
 * by its date — so "this quarter" means what somebody asking it would mean.
 */

const PROFILES = ["GENERAL"];
const AREA = "Sales and delivery";

const leads: ReportDefinition = {
  key: "crm-leads",
  title: "Leads",
  area: AREA,
  href: "/crm/leads",
  profiles: PROFILES,
  params: periodParams(90, "Arrived"),
  columns: [
    { key: "leadNo", label: "Lead", kind: "code" },
    { key: "title", label: "Title", kind: "text" },
    { key: "client", label: "Customer", kind: "relation" },
    { key: "stage", label: "Stage", kind: "status" },
    { key: "source", label: "Source", kind: "text" },
    { key: "channel", label: "Channel", kind: "text", hidden: true },
    { key: "owner", label: "Owner", kind: "text" },
    { key: "value", label: "Estimated value", kind: "money", total: "sum" },
    { key: "arrived", label: "Arrived", kind: "date" },
    { key: "phone", label: "Phone", kind: "phone", hidden: true },
    { key: "email", label: "Email", kind: "email", hidden: true },
    { key: "lostReason", label: "Lost because", kind: "text", hidden: true },
  ],
  defaults: { sort: [{ column: "arrived", dir: "desc" }] },
  rowActions: [{ id: "open", kind: "open", label: "Open lead", href: "/crm/leads/{id}" }],
};

const deals: ReportDefinition = {
  key: "crm-deals",
  title: "Deals",
  area: AREA,
  href: "/crm/deals",
  profiles: PROFILES,
  params: [
    { key: "from", label: "Closing", type: "date", default: "yearStart" },
    { key: "to", label: "To", type: "date" },
  ],
  columns: [
    { key: "dealNo", label: "Deal", kind: "code" },
    { key: "title", label: "Title", kind: "text" },
    { key: "client", label: "Customer", kind: "relation" },
    { key: "stage", label: "Stage", kind: "status" },
    { key: "status", label: "Outcome", kind: "status" },
    { key: "owner", label: "Owner", kind: "text" },
    { key: "value", label: "Value", kind: "money", total: "sum" },
    { key: "probability", label: "Probability %", kind: "number", hidden: true },
    { key: "closes", label: "Expected close", kind: "date" },
    { key: "wonAt", label: "Won", kind: "date", hidden: true },
    { key: "source", label: "Source", kind: "text", hidden: true },
    { key: "lostReason", label: "Lost because", kind: "text", hidden: true },
  ],
  defaults: { sort: [{ column: "closes", dir: "asc" }] },
  rowActions: [{ id: "open", kind: "open", label: "Open deal", href: "/crm/deals/{id}" }],
};

const siteVisits: ReportDefinition = {
  key: "crm-site-visits",
  title: "Site visits",
  area: AREA,
  href: "/crm/appointments",
  profiles: PROFILES,
  params: periodParams(30, "Visited"),
  columns: [
    { key: "appointmentNo", label: "Visit", kind: "code" },
    { key: "title", label: "Title", kind: "text" },
    { key: "client", label: "Customer", kind: "relation" },
    { key: "site", label: "Site", kind: "text" },
    { key: "rep", label: "Rep", kind: "text" },
    { key: "status", label: "Status", kind: "status" },
    { key: "scheduled", label: "Scheduled", kind: "date" },
    { key: "completed", label: "Completed", kind: "date", hidden: true },
    { key: "location", label: "Location", kind: "text", hidden: true },
    { key: "outcome", label: "Outcome", kind: "text", hidden: true },
  ],
  defaults: { sort: [{ column: "scheduled", dir: "desc" }] },
};

/**
 * What the site-visit forms collected: one row per form filled in on a visit,
 * with what it measured, the quote it drafted and how the deal went — the
 * line from the tape measure to the signed quote.
 */
const visitForms: ReportDefinition = {
  key: "crm-visit-forms",
  title: "Site visit forms",
  area: AREA,
  href: "/crm/appointments",
  profiles: PROFILES,
  params: periodParams(90, "Visited"),
  columns: [
    { key: "visitNo", label: "Visit", kind: "code" },
    { key: "visited", label: "Visited", kind: "date" },
    { key: "form", label: "Form", kind: "text" },
    { key: "rep", label: "Rep", kind: "text" },
    { key: "customer", label: "Customer", kind: "relation" },
    { key: "answered", label: "Answered", kind: "number", total: "sum" },
    { key: "asked", label: "Asked", kind: "number", total: "sum", hidden: true },
    { key: "measured", label: "Area measured (m²)", kind: "number", total: "sum" },
    { key: "drafted", label: "Quote drafted", kind: "money", total: "sum" },
    { key: "outcome", label: "Deal", kind: "status" },
    { key: "dealValue", label: "Deal value", kind: "money", total: "sum", hidden: true },
  ],
  defaults: { sort: [{ column: "visited", dir: "desc" }] },
};

/** Every answer given on site, as it reads, with its figure where it measured something. */
const visitAnswers: ReportDefinition = {
  key: "crm-visit-answers",
  title: "Site visit answers",
  area: AREA,
  href: "/crm/appointments",
  profiles: PROFILES,
  params: periodParams(90, "Visited"),
  columns: [
    { key: "visitNo", label: "Visit", kind: "code" },
    { key: "visited", label: "Visited", kind: "date" },
    { key: "form", label: "Form", kind: "text" },
    { key: "question", label: "Question", kind: "text" },
    { key: "questionKey", label: "Saved as", kind: "code", hidden: true },
    { key: "answer", label: "Answer", kind: "text" },
    { key: "figure", label: "Figure", kind: "number" },
    { key: "rep", label: "Rep", kind: "text", hidden: true },
    { key: "notApplicable", label: "Not applicable", kind: "status", hidden: true },
  ],
  defaults: { sort: [{ column: "visited", dir: "desc" }] },
};

const projects: ReportDefinition = {
  key: "crm-projects",
  title: "Projects",
  area: AREA,
  href: "/crm/projects",
  profiles: PROFILES,
  params: [
    { key: "status", label: "Status", type: "choice", options: [
      { value: "open", label: "Not finished" },
      { value: "all", label: "All" },
    ] },
  ],
  columns: [
    { key: "projectNo", label: "Project", kind: "code" },
    { key: "name", label: "Name", kind: "text" },
    { key: "client", label: "Customer", kind: "relation" },
    { key: "status", label: "Status", kind: "status" },
    { key: "manager", label: "Manager", kind: "text" },
    { key: "budget", label: "Budget", kind: "money", total: "sum" },
    { key: "committed", label: "Requisitioned", kind: "money", total: "sum" },
    { key: "spent", label: "Spent", kind: "money", total: "sum" },
    { key: "start", label: "Start", kind: "date" },
    { key: "target", label: "Target end", kind: "date" },
    { key: "ended", label: "Ended", kind: "date", hidden: true },
  ],
  defaults: { sort: [{ column: "start", dir: "desc" }] },
  rowActions: [{ id: "open", kind: "open", label: "Open project", href: "/crm/projects/{id}" }],
};

const jobs: ReportDefinition = {
  key: "crm-jobs",
  title: "Jobs",
  area: AREA,
  href: "/crm/work-orders",
  profiles: PROFILES,
  params: periodParams(60, "Scheduled"),
  columns: [
    { key: "workOrderNo", label: "Job", kind: "code" },
    { key: "title", label: "Title", kind: "text" },
    { key: "client", label: "Customer", kind: "relation" },
    { key: "project", label: "Project", kind: "text" },
    { key: "status", label: "Status", kind: "status" },
    { key: "priority", label: "Priority", kind: "status", hidden: true },
    { key: "assignee", label: "Assigned to", kind: "text" },
    { key: "scheduled", label: "Scheduled", kind: "date" },
    { key: "completed", label: "Completed", kind: "date" },
    { key: "rating", label: "Customer rating", kind: "number", hidden: true, total: "avg" },
  ],
  defaults: { sort: [{ column: "scheduled", dir: "desc" }] },
  rowActions: [{ id: "open", kind: "open", label: "Open job", href: "/crm/work-orders/{id}" }],
};

const openRecord: ReportRowAction = {
  id: "open",
  kind: "open",
  label: "Open the deal",
  href: ["/crm/deals/{dealId}", "/crm/leads/{leadId}"],
};

const quotes: ReportDefinition = {
  key: "crm-quotes",
  title: "Quotes",
  area: AREA,
  href: "/crm/quotes",
  profiles: PROFILES,
  params: periodParams(90, "Quoted"),
  columns: [
    { key: "number", label: "Quote", kind: "code" },
    { key: "customer", label: "Customer", kind: "relation" },
    { key: "record", label: "For", kind: "text" },
    { key: "status", label: "Status", kind: "status" },
    { key: "issued", label: "Date", kind: "date" },
    { key: "due", label: "Valid until", kind: "date" },
    { key: "version", label: "Version", kind: "number", hidden: true },
    { key: "total", label: "Total", kind: "money", total: "sum" },
  ],
  defaults: { sort: [{ column: "issued", dir: "desc" }] },
  rowActions: [openRecord],
};

const invoices: ReportDefinition = {
  key: "crm-invoices",
  title: "Invoices",
  area: AREA,
  href: "/crm/invoices",
  profiles: PROFILES,
  params: periodParams(90, "Invoiced"),
  columns: [
    { key: "number", label: "Invoice", kind: "code" },
    { key: "customer", label: "Customer", kind: "relation" },
    { key: "record", label: "For", kind: "text" },
    { key: "status", label: "Status", kind: "status" },
    { key: "issued", label: "Date", kind: "date" },
    { key: "due", label: "Due", kind: "date" },
    { key: "total", label: "Total", kind: "money", total: "sum" },
    { key: "paid", label: "Paid", kind: "money", total: "sum" },
    { key: "balance", label: "Owed", kind: "money", total: "sum" },
  ],
  defaults: { sort: [{ column: "issued", dir: "desc" }] },
  rowActions: [openRecord],
};

const requisitions: ReportDefinition = {
  key: "crm-requisitions",
  title: "Requisitions",
  area: "Money in people's hands",
  href: "/crm/requisitions",
  profiles: PROFILES,
  params: periodParams(60, "Raised"),
  columns: [
    { key: "requisitionNo", label: "Requisition", kind: "code" },
    { key: "purpose", label: "Purpose", kind: "text" },
    { key: "category", label: "Category", kind: "status" },
    { key: "project", label: "Project", kind: "text" },
    { key: "requestedBy", label: "Asked by", kind: "text" },
    { key: "status", label: "Status", kind: "status" },
    { key: "amount", label: "Asked", kind: "money", total: "sum" },
    { key: "approved", label: "Approved", kind: "money", total: "sum" },
    { key: "accounted", label: "Accounted for", kind: "money", total: "sum", hidden: true },
    { key: "raised", label: "Raised", kind: "date" },
    { key: "disbursed", label: "Paid out", kind: "date", hidden: true },
  ],
  defaults: { sort: [{ column: "raised", dir: "desc" }] },
  rowActions: [{ id: "open", kind: "open", label: "Open requisition", href: "/crm/requisitions/{id}" }],
};

const spend: ReportDefinition = {
  key: "crm-spend",
  title: "Spend and receipts",
  area: "Money in people's hands",
  href: "/crm/cost-tracker",
  profiles: PROFILES,
  params: periodParams(30),
  columns: [
    { key: "date", label: "Date", kind: "date" },
    { key: "person", label: "Person", kind: "text" },
    { key: "direction", label: "Direction", kind: "status" },
    { key: "category", label: "Category", kind: "status" },
    { key: "description", label: "Description", kind: "text" },
    { key: "project", label: "Project", kind: "text" },
    { key: "requisition", label: "Requisition", kind: "code", hidden: true },
    { key: "amount", label: "Amount", kind: "money", total: "sum" },
    { key: "receipt", label: "Receipt", kind: "status" },
  ],
  defaults: { sort: [{ column: "date", dir: "desc" }] },
};

export const CRM_REPORTS: ReportDefinition[] = [
  leads,
  deals,
  siteVisits,
  visitForms,
  visitAnswers,
  quotes,
  projects,
  jobs,
  invoices,
  requisitions,
  spend,
];
