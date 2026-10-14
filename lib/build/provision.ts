import { hasEnabledFeature } from "@/lib/platform/gating/enforcer";

/**
 * What a workspace can build, read off the features it is provisioned with —
 * the same keys that gate its nav items and its pages (`lib/workspaces.ts`,
 * `lib/platform/gating/route-registry.ts`). A workspace without the CRM has no
 * site-visit or enquiry forms to build; one without payroll no payslip.
 */
export type BuildProvisions = {
  /** Site-visit forms: the CRM's question sets. */
  visitForms: boolean;
  /** Enquiry forms: the CRM's intake forms. */
  enquiryForms: boolean;
  /** Quotes, invoices, receipts, emails and forms laid out as blocks (the CRM's templates). */
  blocks: boolean;
  /** Printed layouts: the versioned document templates every PDF is drawn with. */
  layouts: boolean;
  /** Reports are gated one by one, by the page each is about. */
  reports: boolean;
  /** The modules things are used by. */
  crm: boolean;
  books: boolean;
  payroll: boolean;
  schools: boolean;
  retail: boolean;
};

export function buildProvisions(enabledFeatures: readonly string[] | undefined): BuildProvisions {
  const on = (key: string) => hasEnabledFeature(enabledFeatures ? [...enabledFeatures] : undefined, key);
  const crm = on("crm.core");
  return {
    visitForms: crm,
    enquiryForms: crm && on("crm.intake"),
    blocks: crm,
    layouts: on("core.branding.manage"),
    reports: true,
    crm,
    books: on("accounting.core"),
    payroll: on("hr.payroll"),
    schools: on("schools.core"),
    retail: on("retail.core"),
  };
}

/** Who uses a thing that is built: the module whose pages send or ask it. */
export type BuildUser = "crm" | "books" | "payroll" | "schools" | "retail" | "reports";

export const BUILD_USER_LABEL: Record<BuildUser, string> = {
  books: "Books",
  payroll: "People and payroll",
  crm: "CRM",
  // Retail's own name for its tills and receipts.
  retail: "Tender",
  schools: "Schools",
  reports: "Reports",
};

/** The order the panel's Used by group lists them in. */
export const BUILD_USERS: readonly BuildUser[] = ["books", "payroll", "crm", "retail", "schools", "reports"];

/** Whether the workspace has the module a thing is used by. */
export function hasUser(provisions: BuildProvisions, user: BuildUser): boolean {
  return user === "reports" ? provisions.reports : provisions[user];
}

/**
 * The module a printed layout serves, from its source (`accounting.sales.invoice`,
 * `hr.payslip`, `schools.fee.receipt`, `reports.shift`, `ui.table.*`).
 */
export function layoutUser(sourceKey: string): BuildUser {
  if (sourceKey.startsWith("accounting.")) return "books";
  if (sourceKey.startsWith("hr.")) return "payroll";
  if (sourceKey.startsWith("schools.")) return "schools";
  if (sourceKey.startsWith("retail.")) return "retail";
  if (sourceKey.startsWith("crm.")) return "crm";
  return "reports";
}

/**
 * Whether a printed layout's source is one this workspace runs: a payslip needs
 * payroll, a fee receipt the school, a shift report the mine's reports.
 */
export function layoutProvisioned(sourceKey: string, enabledFeatures: readonly string[] | undefined): boolean {
  const features = enabledFeatures ? [...enabledFeatures] : undefined;
  if (!hasEnabledFeature(features, "core.branding.manage")) return false;
  const user = layoutUser(sourceKey);
  if (user === "books") return hasEnabledFeature(features, "accounting.core");
  if (user === "payroll") return hasEnabledFeature(features, "hr.payroll");
  if (user === "schools") return hasEnabledFeature(features, "schools.core");
  if (user === "retail") return hasEnabledFeature(features, "retail.core");
  if (user === "crm") return hasEnabledFeature(features, "crm.core");
  if (sourceKey.startsWith("reports.")) return hasEnabledFeature(features, sourceKey);
  if (sourceKey.startsWith("dashboard.")) return hasEnabledFeature(features, "reports.dashboard");
  return true;
}
