import { BUILD_USER_LABEL, BUILD_USERS, type BuildUser } from "@/lib/build/provision";

/**
 * Everything a workspace has built — its forms, documents, emails and reports —
 * as one list, the way Build lists it (PageBuildHome). Pure: the rows are read
 * in `lib/build/read.ts` and shaped here, so the page and the panel's counts
 * agree.
 */

export type BuildKind = "form" | "document" | "email" | "report";
export type BuildStatus = "published" | "draft" | "retired";

/** Where a thing is kept: which table, which builder. */
export type BuildSource = "visit" | "enquiry" | "block" | "layout" | "report";

export const BUILD_KINDS: readonly BuildKind[] = ["form", "document", "email", "report"];

export const BUILD_KIND_LABEL: Record<BuildKind, string> = {
  form: "Form",
  document: "Document",
  email: "Email",
  report: "Report",
};

/** The kinds as the panel and the address name them: `?kind=forms`. */
export const BUILD_KIND_PLURAL: Record<BuildKind, string> = {
  form: "forms",
  document: "documents",
  email: "emails",
  report: "reports",
};

export const BUILD_STATUS_LABEL: Record<BuildStatus, string> = {
  published: "Published",
  draft: "Draft",
  retired: "Retired",
};

export type BuildItem = {
  id: string;
  name: string;
  kind: BuildKind;
  source: BuildSource;
  /** The module whose pages use it. */
  usedBy: BuildUser;
  /** What it is used for there: "Site visits", "Invoices", "Pay runs". */
  usedFor: string;
  isDefault: boolean;
  /** The published version's number, where the thing keeps versions. */
  version: number | null;
  status: BuildStatus;
  updatedAt: string;
  href: string;
  /** A printed layout's source (`hr.payslip`): which of Corelith's it stands in for. */
  sourceKey?: string;
};

/** The builder each kind of thing opens in (`spec/routes.md` §5). */
export function buildHref(source: BuildSource, id: string, blockKind?: string): string {
  const at = encodeURIComponent(id);
  if (source === "visit" || source === "enquiry") return `/build/forms/${at}`;
  if (source === "report") return `/build/reports/${at}`;
  if (source === "layout") return `/build/templates/${at}`;
  if (blockKind === "FORM") return `/build/forms/${at}`;
  if (blockKind === "EMAIL") return `/build/templates/${at}`;
  return `/build/documents/${at}`;
}

/* ── Each table's row, as a Build item ─────────────────────────────────── */

export type VisitFormRow = { id: string; name: string; kind: "PRODUCT" | "EVIDENCE" | "CLOSEOUT"; isActive: boolean; updatedAt: Date | string };
export type EnquiryFormRow = { id: string; name: string; isActive: boolean; updatedAt: Date | string };
export type BlockTemplateRow = { id: string; name: string; kind: string; isShared: boolean; isActive: boolean; updatedAt: Date | string };
export type LayoutRow = {
  id: string;
  name: string;
  sourceKey: string;
  documentType: string;
  isDefault: boolean;
  isActive: boolean;
  updatedAt: Date | string;
  versions: Array<{ version: number; isPublished: boolean }>;
};
export type ReportRow = { id: string; title: string; audience: string; updatedAt: Date | string };

const iso = (value: Date | string) => (typeof value === "string" ? value : value.toISOString());

const VISIT_USE: Record<VisitFormRow["kind"], string> = {
  PRODUCT: "Site visits, when quoting",
  EVIDENCE: "Every site visit",
  CLOSEOUT: "Every site visit, last",
};

export function visitItem(row: VisitFormRow): BuildItem {
  return {
    id: row.id,
    name: row.name,
    kind: "form",
    source: "visit",
    usedBy: "crm",
    usedFor: VISIT_USE[row.kind],
    isDefault: false,
    version: null,
    status: row.isActive ? "published" : "draft",
    updatedAt: iso(row.updatedAt),
    href: buildHref("visit", row.id),
  };
}

export function enquiryItem(row: EnquiryFormRow): BuildItem {
  return {
    id: row.id,
    name: row.name,
    kind: "form",
    source: "enquiry",
    usedBy: "crm",
    usedFor: "Enquiries",
    isDefault: false,
    version: null,
    status: row.isActive ? "published" : "draft",
    updatedAt: iso(row.updatedAt),
    href: buildHref("enquiry", row.id),
  };
}

const BLOCK_USE: Record<string, string> = {
  FORM: "Forms filled in",
  QUOTE: "Quotes",
  INVOICE: "Invoices",
  RECEIPT: "Receipts",
  EMAIL: "Emails about a record",
  EXPORT: "Table exports",
};

export function blockItem(row: BlockTemplateRow): BuildItem {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind === "FORM" ? "form" : row.kind === "EMAIL" ? "email" : "document",
    source: "block",
    usedBy: "crm",
    usedFor: BLOCK_USE[row.kind] ?? "Documents",
    isDefault: false,
    version: null,
    status: !row.isActive ? "retired" : row.isShared ? "published" : "draft",
    updatedAt: iso(row.updatedAt),
    href: buildHref("block", row.id, row.kind),
  };
}

/** What a printed layout is used for, from its source. */
export function layoutUse(sourceKey: string, documentType: string): string {
  if (sourceKey === "hr.payslip") return "Pay runs";
  if (sourceKey.endsWith(".quotation") || documentType === "SALES_QUOTATION") return "Quotes";
  if (sourceKey.endsWith(".credit-note")) return "Credit notes";
  if (sourceKey.endsWith(".statement")) return "Statements";
  if (sourceKey.endsWith("report-card")) return "Report cards";
  if (sourceKey.endsWith("letter")) return "Letters";
  if (documentType === "SALES_INVOICE") return "Invoices";
  if (documentType === "SALES_RECEIPT") return "Receipts";
  if (documentType === "DASHBOARD_PACK") return "Dashboards";
  if (documentType === "REPORT_TABLE") return "Printed reports";
  return "Records";
}

export function layoutItem(row: LayoutRow, user: BuildUser): BuildItem {
  const published = row.versions.filter((version) => version.isPublished).map((version) => version.version);
  return {
    id: row.id,
    name: row.name,
    kind: "document",
    source: "layout",
    usedBy: user,
    usedFor: layoutUse(row.sourceKey, row.documentType),
    isDefault: row.isDefault,
    version: published.length ? Math.max(...published) : row.versions.length ? Math.max(...row.versions.map((version) => version.version)) : null,
    status: !row.isActive ? "retired" : published.length ? "published" : "draft",
    updatedAt: iso(row.updatedAt),
    href: buildHref("layout", row.id),
    sourceKey: row.sourceKey,
  };
}

/** A report is published once others can see it; one only its maker sees is a draft. */
export function reportItem(row: ReportRow): BuildItem {
  return {
    id: row.id,
    name: row.title,
    kind: "report",
    source: "report",
    usedBy: "reports",
    usedFor: "Reports",
    isDefault: false,
    version: null,
    status: row.audience === "JUST_ME" ? "draft" : "published",
    updatedAt: iso(row.updatedAt),
    href: buildHref("report", row.id),
  };
}

/* ── Narrowing the list ────────────────────────────────────────────────── */

export type BuildQuery = {
  kind: BuildKind | null;
  used: BuildUser | null;
  status: BuildStatus | null;
  q: string;
  page: number;
};

export const BUILD_PAGE_SIZE = 25;

const asKind = (value: string | null): BuildKind | null =>
  (BUILD_KINDS.find((kind) => kind === value || BUILD_KIND_PLURAL[kind] === value) ?? null);
const asUser = (value: string | null): BuildUser | null => (BUILD_USERS.find((user) => user === value) ?? null);
const asStatus = (value: string | null): BuildStatus | null =>
  value === "published" || value === "draft" || value === "retired" ? value : value === "drafts" ? "draft" : null;

/** The list's query, from the address: `?kind=forms&used=crm&status=draft&q=visit&page=2`. */
export function readBuildQuery(params: { get(name: string): string | null }): BuildQuery {
  const page = Number(params.get("page"));
  return {
    kind: asKind(params.get("kind")),
    used: asUser(params.get("used")),
    status: asStatus(params.get("status")),
    q: params.get("q") ?? "",
    page: Number.isInteger(page) && page > 1 ? page : 1,
  };
}

export function filterBuildItems(items: readonly BuildItem[], query: Omit<BuildQuery, "page">): BuildItem[] {
  const needle = query.q.trim().toLowerCase();
  return items.filter(
    (item) =>
      (!query.kind || item.kind === query.kind) &&
      (!query.used || item.usedBy === query.used) &&
      (!query.status || item.status === query.status) &&
      (!needle || `${item.name} ${item.usedFor} ${BUILD_KIND_LABEL[item.kind]}`.toLowerCase().includes(needle)),
  );
}

/** Newest change first, then by name. */
export function sortBuildItems(items: readonly BuildItem[]): BuildItem[] {
  return [...items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.name.localeCompare(b.name));
}

export type BuildCounts = {
  all: number;
  kind: Record<BuildKind, number>;
  status: Record<BuildStatus, number>;
  used: Record<BuildUser, number>;
};

export function buildCounts(items: readonly BuildItem[]): BuildCounts {
  const counts: BuildCounts = {
    all: items.length,
    kind: { form: 0, document: 0, email: 0, report: 0 },
    status: { published: 0, draft: 0, retired: 0 },
    used: { crm: 0, books: 0, payroll: 0, schools: 0, retail: 0, reports: 0 },
  };
  for (const item of items) {
    counts.kind[item.kind] += 1;
    counts.status[item.status] += 1;
    counts.used[item.usedBy] += 1;
  }
  return counts;
}

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

/** "17 forms, documents and emails are in use." and what follows it. */
export function buildFinding(items: readonly BuildItem[]): { fact: string; rest: string | null } {
  if (items.length === 0) {
    return { fact: "Nothing is built here yet.", rest: "Start one from a template: a form, a document, an email or a report." };
  }
  const inUse = items.filter((item) => item.status === "published").length;
  const drafts = items.filter((item) => item.status === "draft").length;
  const fact =
    inUse === 0
      ? `${plural(items.length, "thing")} built here, none in use yet.`
      : `${inUse} ${inUse === 1 ? "form, document, email or report is" : "forms, documents, emails and reports are"} in use.`;
  const rest = [
    "Every one opens in the same builder.",
    drafts ? `${plural(drafts, "draft")} ${drafts === 1 ? "is" : "are"} not in use yet.` : null,
  ]
    .filter(Boolean)
    .join(" ");
  return { fact, rest };
}

/** The panel's figures, by the address of each row (`lib/navigation.ts`, the build section). */
export function buildBadges(counts: BuildCounts, templates: { corelith: number; made: number; retired: number }): Record<string, string> {
  const badges: Record<string, string> = { "/build": String(counts.all) };
  for (const kind of BUILD_KINDS) badges[`/build?kind=${BUILD_KIND_PLURAL[kind]}`] = String(counts.kind[kind]);
  for (const user of BUILD_USERS) badges[`/build?used=${user}`] = String(counts.used[user]);
  badges["/build/templates"] = String(templates.corelith);
  badges["/build/templates?view=made"] = String(templates.made);
  badges["/build/templates?view=retired"] = String(templates.retired);
  return badges;
}

export const usedByLabel = (user: BuildUser) => BUILD_USER_LABEL[user];
