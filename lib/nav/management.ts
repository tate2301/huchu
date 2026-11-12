/**
 * Management's tree: every place the workspace is set up, one home each.
 *
 * Designed on the Corelith navigation canvas, page "Management" (Mgmt-Map).
 * Management is the one sanctioned swap: the gear at the foot of the sidebar
 * opens this tree in the sidebar's place, with one row back.
 *
 * Nothing here grants anything. A row is shown when the gate it has always had
 * lets this person in: rows that came from the old settings rail keep that
 * rail's gate (`settings`, by its entry id in `lib/settings/management-nav.ts`),
 * and rows that moved in from a product's own setup (Shop setup, Books'
 * settings, CRM settings, Payroll, Time off, Conduct) are asked of their
 * address, exactly as the sidebar asked them before they moved.
 */

export type ManagementGroupId =
  | "workspace"
  | "people"
  | "money"
  | "apps"
  | "shop"
  | "books"
  | "crm"
  | "pay"
  | "campus"
  | "mine"
  | "compliance"
  | "account";

export type ManagementGate =
  /** The settings rail's entry, which keeps its own role and feature checks. */
  | { kind: "settings"; entry: string }
  /** Asked of the address, as the main sidebar asks it. */
  | { kind: "address"; href?: string };

export type ManagementItem = {
  id: string;
  label: string;
  icon: string;
  href: string;
  gate: ManagementGate;
  /** Other addresses that are this row's page (a redirect stub, a deeper route). */
  match?: string[];
};

export type ManagementGroup = { id: ManagementGroupId; label: string; items: ManagementItem[] };

const settings = (entry: string): ManagementGate => ({ kind: "settings", entry });
const address = (href?: string): ManagementGate => ({ kind: "address", href });

export const MANAGEMENT_GROUPS: readonly ManagementGroup[] = [
  { id: "workspace", label: "Workspace", items: [
    { id: "general", label: "General", icon: "workspace", href: "/preferences/organization", gate: settings("organization") },
    { id: "branding", label: "Branding", icon: "branding", href: "/preferences/organization/branding", gate: settings("branding"), match: ["/settings/branding"] },
    { id: "sites", label: "Sites", icon: "site", href: "/preferences/organization/sites", gate: settings("sites"), match: ["/management/master-data/operations/sites", "/retail/manage/sites"] },
    { id: "departments", label: "Departments", icon: "department", href: "/preferences/organization/departments", gate: settings("departments"), match: ["/management/master-data/hr/departments"] },
    { id: "reports", label: "Reports", icon: "reports", href: "/management/reports", gate: settings("reports") },
    { id: "alerts", label: "Alert routing", icon: "bell", href: "/management/notifications", gate: settings("notification-routing") },
    { id: "activity", label: "Activity", icon: "activity", href: "/activity?view=workspace", gate: settings("activity") },
  ] },
  { id: "people", label: "People and access", items: [
    { id: "users", label: "Users", icon: "people", href: "/preferences/organization/users", gate: settings("users"), match: ["/management/users"] },
    { id: "grades", label: "Job grades", icon: "job-grade", href: "/management/master-data/hr/job-grades", gate: settings("job-grades") },
  ] },
  { id: "money", label: "Money", items: [
    { id: "moneytax", label: "Money and tax", icon: "tax", href: "/management/money-and-tax", gate: settings("money-and-tax") },
    { id: "accounts", label: "Money accounts", icon: "bank", href: "/management/money-accounts", gate: settings("money-accounts") },
    { id: "approvals", label: "Approvals", icon: "approval", href: "/retail/manage/approvals", gate: settings("money-approvals") },
    { id: "export", label: "Accountant export", icon: "statement-out", href: "/management/accountant-export", gate: settings("accountant-export") },
  ] },
  { id: "apps", label: "Apps", items: [
    { id: "billing", label: "Billing", icon: "billing", href: "/preferences/organization/billing", gate: settings("billing") },
    { id: "integrations", label: "Integrations", icon: "plug", href: "/management/integrations", gate: settings("integrations") },
    { id: "marketplace", label: "Marketplace", icon: "marketplace", href: "/management/marketplace", gate: settings("marketplace") },
    { id: "vane", label: "Vane", icon: "vane", href: "/management/vane", gate: settings("vane") },
    { id: "explore", label: "Explore", icon: "explore", href: "/management/explore", gate: settings("explore") },
  ] },
  { id: "shop", label: "Shop", items: [
    { id: "shop", label: "Shop", icon: "home", href: "/retail/manage/company", gate: address(), match: ["/retail/manage"] },
    { id: "tills", label: "Tills and devices", icon: "till", href: "/retail/manage/tills", gate: address() },
    { id: "payments", label: "Payments", icon: "payment-check", href: "/retail/manage/payments", gate: address() },
    { id: "rules", label: "Till rules", icon: "till-rules", href: "/retail/manage/till-rules", gate: address() },
    { id: "receipts", label: "Receipts", icon: "receipt", href: "/retail/manage/receipts", gate: address() },
    { id: "fiscal", label: "Fiscal device", icon: "fiscal-device", href: "/retail/manage/fiscal", gate: address() },
    { id: "posting", label: "Posting to books", icon: "posting", href: "/retail/manage/posting", gate: address() },
    { id: "staff", label: "Staff and PINs", icon: "employee", href: "/retail/manage/people", gate: address() },
    { id: "loyalty", label: "Loyalty", icon: "loyalty", href: "/retail/manage/loyalty", gate: address() },
    { id: "bin", label: "Bin", icon: "bin", href: "/retail/manage/bin", gate: address() },
  ] },
  { id: "books", label: "Books", items: [
    { id: "bsetup", label: "Set up the books", icon: "checklist", href: "/books/settings/setup", gate: address() },
    { id: "btax", label: "Tax codes and rules", icon: "tax-code", href: "/books/settings/tax", gate: address() },
    { id: "bnum", label: "Numbering", icon: "numbering", href: "/books/settings/numbering", gate: address() },
    { id: "block", label: "Locks and periods", icon: "calendar-lock", href: "/books/settings/locks", gate: address() },
    { id: "bopen", label: "Opening balances", icon: "ledger", href: "/books/settings/opening-balances", gate: address() },
  ] },
  { id: "crm", label: "CRM", items: [
    { id: "pipelines", label: "Pipelines", icon: "pipeline", href: "/crm/settings?tab=pipelines", gate: address("/crm/settings") },
    { id: "fields", label: "Custom fields", icon: "field-text", href: "/crm/settings?tab=fields", gate: address("/crm/settings") },
    { id: "sources", label: "Lead sources", icon: "lead", href: "/crm/settings?tab=sources", gate: address("/crm/settings") },
    { id: "catalogue", label: "Catalogue", icon: "product", href: "/crm/settings?tab=catalogue", gate: address("/crm/settings") },
    { id: "visitq", label: "Site visit questions", icon: "visit", href: "/crm/settings?tab=site-visit-questions", gate: address("/crm/settings") },
    { id: "resources", label: "Client resources", icon: "folder", href: "/crm/settings?tab=resources", gate: address("/crm/settings") },
    { id: "commissions", label: "Commissions", icon: "commission", href: "/crm/settings?tab=commissions", gate: address("/crm/settings") },
    { id: "keys", label: "API keys", icon: "key", href: "/crm/settings?tab=keys", gate: address("/crm/settings") },
    { id: "facebook", label: "Facebook ads", icon: "promotion", href: "/crm/settings?tab=facebook", gate: address("/crm/settings") },
    { id: "camera", label: "Field camera", icon: "camera", href: "/crm/settings?tab=field-camera", gate: address("/crm/settings") },
    { id: "workflows", label: "Workflows", icon: "checklist", href: "/crm/workflows", gate: address() },
    { id: "import", label: "Import", icon: "import", href: "/crm/import", gate: address() },
  ] },
  { id: "pay", label: "People and pay", items: [
    { id: "holidays", label: "Public holidays", icon: "holiday", href: "/people/leave/holidays", gate: address() },
    { id: "comp", label: "Compensation rules", icon: "price-list", href: "/payroll/compensation", gate: address() },
    { id: "stat", label: "Statutory tables", icon: "paye", href: "/payroll/statutory", gate: address() },
  ] },
  { id: "campus", label: "School", items: [
    { id: "years", label: "Years and terms", icon: "term", href: "/management/master-data/schools/years", gate: settings("schools-years") },
    { id: "classes", label: "Classes and streams", icon: "class", href: "/management/master-data/schools/classes", gate: settings("schools-classes") },
    { id: "subjects", label: "Subjects", icon: "lesson", href: "/management/master-data/schools/subjects", gate: settings("schools-subjects") },
    { id: "day", label: "The school day", icon: "clock", href: "/management/master-data/schools/periods", gate: settings("schools-school-day") },
    { id: "grading", label: "Grading", icon: "grade", href: "/management/master-data/schools/grading", gate: settings("schools-grading") },
    { id: "records", label: "School records", icon: "pupil", href: "/management/master-data/schools/identity", gate: settings("schools-identity") },
    { id: "conduct", label: "Conduct rules", icon: "policy", href: "/schools/conduct/setup", gate: address() },
  ] },
  { id: "mine", label: "Operations", items: [
    { id: "sections", label: "Sections", icon: "section", href: "/management/master-data/operations/sections", gate: settings("sections") },
    { id: "downtime", label: "Downtime codes", icon: "downtime", href: "/management/master-data/operations/downtime-codes", gate: settings("downtime-codes") },
    { id: "settle", label: "Settlement types", icon: "miner-payout", href: "/management/master-data/operations/gold-expense-types", gate: settings("gold-expense-types") },
  ] },
  { id: "compliance", label: "Compliance", items: [
    { id: "permits", label: "Permits", icon: "permit", href: "/compliance/permits", gate: settings("permits") },
    { id: "inspections", label: "Inspections", icon: "inspection", href: "/compliance/inspections", gate: settings("inspections") },
    { id: "incidents", label: "Incidents", icon: "incident", href: "/compliance/incidents", gate: settings("incidents") },
    { id: "training", label: "Training", icon: "training", href: "/compliance/training", gate: settings("training") },
  ] },
  { id: "account", label: "Your account", items: [
    { id: "profile", label: "Profile", icon: "profile", href: "/preferences/profile", gate: settings("profile") },
    { id: "mynotif", label: "Notifications", icon: "bell", href: "/preferences/notifications", gate: settings("notifications") },
    { id: "appearance", label: "Appearance", icon: "sun", href: "/preferences/appearance", gate: settings("appearance") },
  ] },
];

/** The addresses that open Management in the sidebar's place. */
const MANAGEMENT_PREFIXES = [
  "/preferences",
  "/management",
  "/settings",
  "/compliance",
  "/retail/manage",
  "/books/settings",
  "/crm/settings",
  "/crm/workflows",
  "/crm/import",
  "/people/leave/holidays",
  "/payroll/compensation",
  "/payroll/statutory",
  "/schools/conduct/setup",
];

const pathOf = (href: string) => href.split("?")[0] ?? href;

export function isManagementPath(pathname: string, search?: URLSearchParams | null): boolean {
  if (pathname === "/activity" && search?.get("view") === "workspace") return true;
  // Statutory returns are work, not setup: they stay in Payroll.
  if (pathname.startsWith("/payroll/statutory/")) return false;
  return MANAGEMENT_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export type ComposeManagementArgs = {
  /** The settings rail's entries this person may open, by id. */
  settings: ReadonlySet<string>;
  /** Whether the main sidebar's gates let this person open an address. */
  canOpen: (href: string) => boolean;
  groups?: readonly ManagementGroup[];
};

/**
 * Management for one person: the groups they may open, in the catalogue's
 * order, with their rows. A group with nothing in it is left out. Sites opens
 * the shop's own sites page where the workspace runs a shop.
 */
export function composeManagement({ settings: allowed, canOpen, groups = MANAGEMENT_GROUPS }: ComposeManagementArgs): ManagementGroup[] {
  const out: ManagementGroup[] = [];
  for (const group of groups) {
    const items: ManagementItem[] = [];
    for (const item of group.items) {
      const open = item.gate.kind === "settings" ? allowed.has(item.gate.entry) : canOpen(item.gate.href ?? item.href);
      if (!open) continue;
      if (item.id === "sites" && canOpen("/retail/manage/sites")) items.push({ ...item, href: "/retail/manage/sites" });
      else items.push(item);
    }
    if (items.length > 0) out.push({ ...group, items });
  }
  return out;
}

/**
 * The row the page is: the longest address that matches wins, and a row with
 * a `?tab=` wins only on its own tab (CRM settings), the first tab when none is given.
 */
export function activeManagementItem(groups: readonly ManagementGroup[], pathname: string, search?: URLSearchParams | null): string | null {
  let best: string | null = null;
  let bestLength = -1;
  for (const group of groups) {
    for (const item of group.items) {
      const [path, query] = item.href.split("?");
      const candidates = [path!, ...(item.match ?? [])];
      for (const candidate of candidates) {
        const hit = pathname === candidate || pathname.startsWith(`${candidate}/`);
        if (!hit) continue;
        if (query && candidate === path) {
          const want = new URLSearchParams(query);
          const tab = search?.get("tab");
          const first = group.items.find((entry) => entry.href.startsWith(`${path}?`))?.id === item.id;
          if (tab ? want.get("tab") !== tab : !first) continue;
        }
        const length = candidate.length + (query ? 1 : 0);
        if (length > bestLength) {
          best = item.id;
          bestLength = length;
        }
      }
    }
  }
  return best;
}

export { pathOf as managementPathOf };
