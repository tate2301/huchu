/**
 * The navigation registry: every destination in the sidebar, once.
 *
 * Designed on the Corelith navigation canvas (design/nav/BUILD.md). Each node
 * has one home: a group, an icon from the Corelith pack and an address.
 * Products and rights never move a node; they only decide whether it shows
 * (`compose.ts`). A child's address always starts with its parent's.
 *
 * `href` is where the page lives once the design is built. `live` is where it
 * lives now, first match that the person may open wins; remove it when the
 * page has moved (BUILD.md, phase 9). Nothing here gates: entitlement and
 * rights are the existing checks, asked of the address (`gate.ts`).
 */

export type NavIconName = string;

/** A product's own group, or one of the shared groups every workspace has. */
export type NavGroupId =
  | "top"
  | "tender"
  | "crm"
  | "campus"
  | "huchu"
  | "records"
  | "stock"
  | "assets"
  | "books"
  | "people"
  | "insights"
  | "saved";

export type NavKid = {
  id: string;
  label: string;
  icon: NavIconName;
  href: string;
  /** Names the count that rides on the row (`/api/v2/retail/nav/badges`, `/api/books/nav`). */
  badge?: string;
  /** Where the page lives today, in order of preference. */
  live?: string[];
};

export type NavNode = NavKid & {
  group: NavGroupId;
  kids?: NavKid[];
};

/** Where a product's group stands when the workspace runs it, and the shared groups after. */
export const SHARED_GROUP_ORDER: readonly NavGroupId[] = [
  "records",
  "stock",
  "assets",
  "books",
  "people",
  "insights",
  "saved",
];

export const PRODUCT_GROUPS: readonly NavGroupId[] = ["tender", "crm", "campus", "huchu"];

export const GROUP_LABEL: Record<NavGroupId, string> = {
  top: "",
  tender: "The floor",
  crm: "Sales",
  campus: "School",
  huchu: "The mine",
  records: "Records",
  stock: "Stock",
  assets: "Assets",
  books: "Books",
  people: "People",
  insights: "Insights",
  saved: "Pinned",
};

export const NAV_NODES: readonly NavNode[] = [
  { id: "home", label: "Home", icon: "home", href: "/", group: "top" },
  { id: "sales", label: "Sales", icon: "receipt", href: "/retail/sales", group: "tender", kids: [
      { id: "sales-all", label: "All sales", icon: "receipt", href: "/retail/sales" },
      { id: "sales-held", label: "Held", icon: "sale-clock", href: "/retail/sales?state=held", badge: "held" },
      { id: "sales-refunds", label: "Refunds", icon: "refund", href: "/retail/sales?state=refunded", badge: "refunds" },
      { id: "sales-account", label: "On account", icon: "payment-clock", href: "/retail/sales?state=account" },
    ] },
  { id: "shifts", label: "Shifts and cash-ups", icon: "shift", href: "/retail/shifts", group: "tender", kids: [
      { id: "shifts-all", label: "Shifts", icon: "shift", href: "/retail/shifts" },
      { id: "shifts-eod", label: "End of day", icon: "end-of-day", href: "/retail/shifts/end-of-day", badge: "cashups" },
    ] },
  { id: "laybys", label: "Lay-bys", icon: "stockroom", href: "/retail/laybys", group: "tender", badge: "laybys" },
  { id: "leads", label: "Leads", icon: "lead", href: "/crm/leads", group: "crm", badge: "leads" },
  { id: "deals", label: "Deals", icon: "deal", href: "/crm/deals", group: "crm", kids: [
      { id: "deals-board", label: "Pipeline", icon: "pipeline", href: "/crm/deals" },
      { id: "deals-mine", label: "Mine", icon: "person-check", href: "/crm/deals?owner=me" },
      { id: "deals-closed", label: "Won and lost", icon: "seal-check", href: "/crm/deals?state=closed" },
    ] },
  { id: "projects", label: "Projects", icon: "deal", href: "/crm/projects", group: "crm", kids: [
      { id: "proj-all", label: "Projects", icon: "deal", href: "/crm/projects" },
      { id: "proj-jobs", label: "Jobs", icon: "job-card", href: "/crm/projects/jobs" },
    ] },
  { id: "visits", label: "Visits", icon: "calendar-check", href: "/crm/appointments", group: "crm", badge: "visits" },
  { id: "tasks", label: "Tasks", icon: "task", href: "/crm/tasks", group: "crm", kids: [
      { id: "tasks-all", label: "Tasks", icon: "task", href: "/crm/tasks" },
      { id: "tasks-follow", label: "Follow-ups", icon: "phone-call", href: "/crm/tasks/follow-ups" },
    ] },
  { id: "students", label: "Students", icon: "pupil", href: "/schools/students", group: "campus", kids: [
      { id: "st-all", label: "Students", icon: "pupil", href: "/schools/students" },
      { id: "st-apps", label: "Applications", icon: "pupil-plus", href: "/schools/students/applications" },
      { id: "st-guard", label: "Guardians", icon: "guardian", href: "/schools/students/guardians" },
      { id: "st-leave", label: "Leavers", icon: "pupil-slash", href: "/schools/students/leavers" },
    ] },
  { id: "schoolday", label: "The school day", icon: "sun", href: "/schools/attendance", group: "campus", kids: [
      { id: "sd-reg", label: "Registers", icon: "checklist", href: "/schools/attendance" },
      { id: "sd-abs", label: "Absence follow-up", icon: "alert-circle", href: "/schools/attendance/follow-up" },
      { id: "sd-cal", label: "Calendar", icon: "calendar", href: "/schools/attendance/calendar" },
      { id: "sd-tt", label: "Timetable", icon: "timetable", href: "/schools/attendance/timetable" },
    ] },
  { id: "results", label: "Results", icon: "report-card", href: "/schools/results", group: "campus", kids: [
      { id: "rs-all", label: "Results", icon: "report-card", href: "/schools/results" },
      { id: "rs-exams", label: "Exam series", icon: "certificate", href: "/schools/results/exams" },
      { id: "rs-pub", label: "Publishing", icon: "send", href: "/schools/results/publish" },
    ] },
  { id: "boarding", label: "Boarding", icon: "bed", href: "/schools/boarding", group: "campus", kids: [
      { id: "bd-board", label: "Bed board", icon: "bed", href: "/schools/boarding" },
      { id: "bd-roll", label: "Roll call", icon: "checklist", href: "/schools/boarding/roll-call" },
      { id: "bd-sick", label: "Sick bay", icon: "welfare", href: "/schools/boarding/sick-bay" },
    ] },
  { id: "fees", label: "Fees", icon: "fees", href: "/schools/finance", group: "campus", kids: [
      { id: "fees-class", label: "Fees by class", icon: "fees", href: "/schools/finance" },
      { id: "fees-ledger", label: "Fee ledger", icon: "ledger", href: "/schools/finance/ledger" },
      { id: "fees-arrears", label: "Arrears and ageing", icon: "alert-circle", href: "/schools/finance/arrears" },
    ] },
  { id: "schstaff", label: "Staff", icon: "employee", href: "/schools/staff", group: "campus", kids: [
      { id: "ss-support", label: "Support staff", icon: "employee", href: "/schools/staff" },
      { id: "ss-teach", label: "Teaching staff", icon: "teacher", href: "/schools/staff/teachers" },
    ] },
  { id: "families", label: "Families", icon: "promotion", href: "/schools/families", group: "campus", kids: [
      { id: "fm-msg", label: "Messages", icon: "mail", href: "/schools/families/messages" },
      { id: "fm-notice", label: "Notices", icon: "promotion", href: "/schools/families/notices" },
      { id: "fm-meet", label: "Parent meetings", icon: "calendar-check", href: "/schools/families/meetings" },
    ] },
  { id: "shiftrep", label: "Shift report", icon: "pupil-plus", href: "/shift-report", group: "huchu" },
  { id: "plantrep", label: "Plant report", icon: "plant", href: "/plant-report", group: "huchu", badge: "tanks" },
  { id: "gold", label: "Gold", icon: "gold-bar", href: "/gold", group: "huchu", kids: [
      { id: "gold-pours", label: "Pours", icon: "gold-room", href: "/gold/intake/pours" },
      { id: "gold-buy", label: "Purchases", icon: "fees", href: "/gold/intake/purchases" },
      { id: "gold-disp", label: "Dispatches", icon: "dispatch", href: "/gold/transit/dispatches" },
      { id: "gold-settle", label: "Settlements", icon: "receipt", href: "/gold/settlement/receipts" },
      { id: "gold-exc", label: "Exceptions", icon: "alert-circle", href: "/gold/exceptions" },
    ] },
  { id: "customers", label: "Customers", icon: "customer", href: "/records/customers", group: "records", live: ["/retail/customers", "/crm/companies", "/crm/clients"] },
  { id: "people-c", label: "Contacts", icon: "guardian", href: "/records/contacts", group: "records", live: ["/crm/people"] },
  { id: "products", label: "Products", icon: "tag", href: "/records/products", group: "records", live: ["/retail/products", "/stores/catalogue"], kids: [
      { id: "prod-all", label: "All products", icon: "rows", href: "/records/products", live: ["/retail/products", "/stores/catalogue"] },
      { id: "prod-prices", label: "Price lists", icon: "price-list", href: "/records/products/price-lists", live: ["/retail/products/price-lists", "/stores/price-lists"] },
      { id: "prod-promos", label: "Promotions", icon: "promotion", href: "/records/products/promotions", live: ["/retail/products/promotions"] },
    ] },
  { id: "suppliers", label: "Suppliers", icon: "dispatch", href: "/records/suppliers", group: "records", live: ["/retail/buying/suppliers"] },
  { id: "onhand", label: "On hand", icon: "stockroom", href: "/stock", group: "stock", badge: "low", live: ["/retail/stock", "/stores/inventory"] },
  { id: "movements", label: "Movements", icon: "activity", href: "/stock/movements", group: "stock", live: ["/retail/stock/movements", "/stores/movements"] },
  { id: "counts", label: "Counts", icon: "stock-take", href: "/stock/counts", group: "stock", badge: "counts", live: ["/retail/stock/counts"] },
  { id: "transfers", label: "Transfers", icon: "transfer", href: "/stock/transfers", group: "stock", live: ["/retail/stock/transfers"] },
  { id: "buying", label: "Buying", icon: "purchase-order", href: "/stock/buying", group: "stock", live: ["/retail/buying/orders"], kids: [
      { id: "buy-orders", label: "Orders", icon: "purchase-order", href: "/stock/buying", live: ["/retail/buying/orders"] },
      { id: "buy-deliveries", label: "Deliveries", icon: "dispatch", href: "/stock/buying/deliveries", live: ["/retail/buying/deliveries", "/stores/receive"] },
      { id: "buy-reqs", label: "Requisitions", icon: "money", href: "/stock/buying/requisitions", badge: "reqs", live: ["/retail/buying/requisitions", "/crm/requisitions"] },
    ] },
  { id: "equipment", label: "Equipment", icon: "job-card", href: "/maintenance/equipment", group: "assets" },
  { id: "workorders", label: "Work orders", icon: "stock-take", href: "/maintenance/work-orders", group: "assets" },
  { id: "breakdown", label: "Breakdowns", icon: "alert-circle", href: "/maintenance/breakdown", group: "assets" },
  { id: "money", label: "Money", icon: "money", href: "/books", group: "books" },
  // Books' levels (design/books/spec/books.md, Navigation). A level's rows are the pages it holds;
  // the plan's price rides on a row the workspace does not have (`compose.ts`, `lockOf`).
  { id: "bsales", label: "Sales", icon: "invoice", href: "/books/invoices", group: "books", kids: [
      { id: "bs-inv", label: "Invoices", icon: "invoice", href: "/books/invoices", badge: "invoices" },
      { id: "bs-quotes", label: "Quotes", icon: "quote", href: "/books/quotes", badge: "quotes" },
      { id: "bs-pay", label: "Payments received", icon: "payment-clock", href: "/books/payments" },
      { id: "bs-credit", label: "Credit notes", icon: "credit-note", href: "/books/credit-notes" },
      { id: "bs-cust", label: "Customers", icon: "guardian", href: "/books/customers" },
    ] },
  { id: "bspend", label: "Bills & spending", icon: "bill", href: "/books/bills", group: "books", kids: [
      { id: "bsp-all", label: "All spending", icon: "bill", href: "/books/expenses" },
      { id: "bsp-bills", label: "Bills", icon: "bill", href: "/books/bills", badge: "bills" },
      { id: "bsp-paid", label: "Payments made", icon: "payment-check", href: "/books/payments-made" },
      { id: "bsp-orders", label: "Purchase orders", icon: "purchase-order-check", href: "/books/orders" },
      { id: "bsp-reqs", label: "Requisitions", icon: "requisition-check", href: "/books/requisitions", badge: "reqs" },
      { id: "bsp-claims", label: "Claims & petty cash", icon: "receipt", href: "/books/claims" },
      { id: "bsp-sup", label: "Suppliers", icon: "supplier", href: "/books/suppliers" },
    ] },
  { id: "bbank", label: "Bank & cash", icon: "bank", href: "/books/accounts", group: "books", kids: [
      { id: "bk-acc", label: "Accounts", icon: "bank", href: "/books/accounts" },
      { id: "bk-match", label: "To match", icon: "link", href: "/books/bank", badge: "match" },
      { id: "bk-rec", label: "Reconciliations", icon: "checks", href: "/books/reconciliations" },
      { id: "bk-takings", label: "Takings", icon: "fees", href: "/books/takings" },
    ] },
  { id: "btax", label: "Tax", icon: "tax", href: "/books/tax", group: "books", kids: [
      { id: "bt-due", label: "What's due", icon: "calendar-clock", href: "/books/tax" },
      { id: "bt-vat", label: "VAT returns", icon: "tax", href: "/books/vat" },
      { id: "bt-wh", label: "Withholding", icon: "tax", href: "/books/withholding" },
      { id: "bt-prov", label: "Provisional tax", icon: "tax", href: "/books/provisional-tax" },
      { id: "bt-fiscal", label: "Fiscal register", icon: "receipt", href: "/books/fiscal" },
    ] },
  { id: "bclose", label: "Close the month", icon: "checklist", href: "/books/periods", group: "books", kids: [
      { id: "bc-check", label: "Checklist", icon: "checklist", href: "/books/periods" },
      { id: "bc-post", label: "Needs posting", icon: "journal", href: "/books/needs-posting" },
      { id: "bc-rates", label: "Rates & revaluation", icon: "chart-bar", href: "/books/rates" },
      { id: "bc-year", label: "Year end", icon: "calendar-lock", href: "/books/year-end" },
    ] },
  { id: "bledger", label: "Ledger", icon: "ledger", href: "/books/journals", group: "books", kids: [
      { id: "bl-journals", label: "Journals", icon: "journal", href: "/books/journals" },
      { id: "bl-tb", label: "Trial balance", icon: "chart-bar", href: "/books/trial-balance" },
      { id: "bl-fin", label: "Financial statements", icon: "chart-line", href: "/books/financials" },
      { id: "bl-gl", label: "General ledger", icon: "ledger", href: "/books/ledger" },
      { id: "bl-chart", label: "Chart of accounts", icon: "chart-of-accounts", href: "/books/chart" },
      { id: "bl-cost", label: "Cost centres", icon: "price-list", href: "/books/cost-centres" },
      { id: "bl-rules", label: "Posting rules", icon: "link", href: "/books/posting-rules" },
      { id: "bl-audit", label: "Audit trail", icon: "audit-clock", href: "/books/audit" },
    ] },
  { id: "bsettings", label: "Settings", icon: "shield", href: "/books/settings/tax", group: "books", kids: [
      { id: "bse-tax", label: "Tax codes & rules", icon: "tax", href: "/books/settings/tax" },
      { id: "bse-num", label: "Numbering", icon: "price-list", href: "/books/settings/numbering" },
      { id: "bse-lock", label: "Locks & periods", icon: "calendar-lock", href: "/books/settings/locks" },
      { id: "bse-open", label: "Opening balances", icon: "ledger", href: "/books/settings/opening-balances" },
      { id: "bse-setup", label: "Set up the books", icon: "checklist", href: "/books/settings/setup" },
    ] },
  { id: "everyone", label: "Everyone", icon: "people", href: "/people", group: "people" },
  { id: "timeoff", label: "Time off", icon: "calendar", href: "/people/leave", group: "people", badge: "leave" },
  { id: "rosters", label: "Rosters", icon: "calendar-check", href: "/people/rosters", group: "people" },
  { id: "payroll", label: "Payroll", icon: "money", href: "/payroll", group: "people", live: ["/payroll/runs"], kids: [
      { id: "pay-runs", label: "Pay runs", icon: "money", href: "/payroll/runs" },
      { id: "pay-sal", label: "Salaries", icon: "fees", href: "/payroll/salaries" },
      { id: "pay-stat", label: "Statutory", icon: "price-list", href: "/payroll/statutory" },
    ] },
  { id: "reports", label: "Reports", icon: "chart-bar", href: "/reports", group: "insights", live: ["/reports", "/retail/reports", "/reports/gold-chain"], kids: [
      { id: "rep-over", label: "Overview", icon: "chart-line", href: "/reports/insights" },
      { id: "rep-all", label: "All reports", icon: "quote", href: "/reports?view=all" },
      { id: "rep-yours", label: "Yours", icon: "person-check", href: "/reports?view=yours" },
      { id: "rep-shared", label: "Shared with you", icon: "guardian", href: "/reports?view=shared" },
    ] },
  { id: "explore", label: "Explore", icon: "explore", href: "/explore", group: "insights" },
  { id: "build", label: "Build", icon: "studio", href: "/build", group: "insights" },
];
