import { resolveFeatureKeyForPath as resolveFeatureKeyForPathFromRegistry } from "./gating/route-registry";

export type FeatureDomain =
  | "core"
  | "operations"
  | "stores"
  | "gold"
  | "hr"
  | "accounting"
  | "maintenance"
  | "compliance"
  | "schools"
  | "retail"
  | "crm"
  | "portal"
  | "reports"
  | "settlements"
  | "admin";

export interface FeatureCatalogEntry {
  key: string;
  name: string;
  description: string;
  domain: FeatureDomain;
  defaultEnabled: boolean;
}

export interface FeatureBundleDefinition {
  code: string;
  name: string;
  description: string;
  /** Comes with every workspace of its kind and is never offered on its own. */
  base?: boolean;
  features: string[];
}

export interface TierDefinition {
  code: string;
  name: string;
  description: string;
  warningDays: number;
  graceDays: number;
  includedFeatures: string[];
  includedBundles: string[];
  /**
   * A vertical edition is cut for what a business *is*, not for how big it is.
   *
   * FISCAL → START → GROW → SCALE → ENTERPRISE is a ladder: each rung adds
   * bundles, and moving up never takes anything away. Gold Edition is not a
   * rung on it — a mine has no use for the retail till suite, so it is not held
   * to being a superset of SCALE. The ladder invariant (never dropping a
   * bundle) applies across `LADDER_TIERS`; a vertical edition is only held to
   * including the wedge — accounting plus fiscalisation — and its own bundles.
   */
  isVerticalEdition?: boolean;
}

function f(entry: FeatureCatalogEntry): FeatureCatalogEntry {
  return entry;
}

export const FEATURE_CATALOG: FeatureCatalogEntry[] = [
  f({ key: "core.auth.login", name: "Login", description: "Authentication and session access.", domain: "core", defaultEnabled: true }),
  f({ key: "core.help.quick-tips", name: "Quick Tips", description: "In-app quick tips and onboarding help.", domain: "core", defaultEnabled: true }),
  f({ key: "core.notifications.center", name: "Notification Center", description: "In-app notification center.", domain: "core", defaultEnabled: true }),
  f({ key: "core.notifications.push", name: "Push Notifications", description: "Web push notifications and subscriptions.", domain: "core", defaultEnabled: false }),
  f({ key: "core.multitenancy.tenant-host-enforcement", name: "Tenant Host Enforcement", description: "Tenant host-based access enforcement.", domain: "core", defaultEnabled: true }),
  f({ key: "core.branding.manage", name: "Branding Management", description: "Brand identity controls for tenant workspace.", domain: "core", defaultEnabled: false }),
  // Not sold on its own: the template library rides with whichever addon gives
  // you templates to keep in it — the CRM suite (forms, quotes, invoices) or
  // custom branding (document layouts).
  f({ key: "core.templates", name: "Template Library", description: "The shared library of forms, intake forms, and document layouts.", domain: "core", defaultEnabled: false }),
  f({ key: "core.branding.custom-domain", name: "Custom Domain", description: "Custom domain configuration and verification.", domain: "core", defaultEnabled: false }),

  f({ key: "ops.shift-report.submit", name: "Shift Reports", description: "Submit and manage shift reports.", domain: "operations", defaultEnabled: false }),
  f({ key: "ops.attendance.mark", name: "Attendance", description: "Attendance capture and attendance APIs.", domain: "operations", defaultEnabled: false }),
  f({ key: "ops.plant-report.submit", name: "Plant Reports", description: "Plant report submission and tracking.", domain: "operations", defaultEnabled: false }),

  f({ key: "stores.dashboard", name: "Stores Dashboard", description: "Stores dashboard and summaries.", domain: "stores", defaultEnabled: false }),
  f({ key: "stores.inventory", name: "Inventory", description: "Inventory item and stock control.", domain: "stores", defaultEnabled: false }),
  f({ key: "stores.movements", name: "Stock Movements", description: "Stock movement logs and actions.", domain: "stores", defaultEnabled: false }),
  f({ key: "stores.issue", name: "Issue Stock", description: "Issue stock workflows.", domain: "stores", defaultEnabled: false }),
  f({ key: "stores.receive", name: "Receive Stock", description: "Receive stock workflows.", domain: "stores", defaultEnabled: false }),
  // What the business sells, as opposed to what it holds. Both screens used to
  // ride on `stores.inventory`, so a tenant could not be given a price book
  // without being given the whole stock module — and a retail workspace, which
  // must hold `stores.inventory` for its own stock, could not be kept away from
  // a second item master it does not read.
  f({ key: "stores.catalogue", name: "Product Catalogue", description: "The shared product catalogue — what the business sells.", domain: "stores", defaultEnabled: false }),
  f({ key: "stores.price-lists", name: "Price Lists", description: "Price lists and the prices resolved from them.", domain: "stores", defaultEnabled: false }),
  f({ key: "stores.fuel-ledger", name: "Fuel Ledger", description: "Fuel-related stock and reporting.", domain: "stores", defaultEnabled: false }),

  f({ key: "gold.home", name: "Gold Home", description: "Gold module landing and navigation.", domain: "gold", defaultEnabled: false }),
  f({ key: "gold.intake.pours", name: "Gold Pours", description: "Gold pour intake workflows.", domain: "gold", defaultEnabled: false }),
  f({ key: "gold.dispatches", name: "Gold Dispatches", description: "Gold dispatch registration and tracking.", domain: "gold", defaultEnabled: false }),
  f({ key: "gold.receipts", name: "Gold Receipts", description: "Buyer receipts and settlement records.", domain: "gold", defaultEnabled: false }),
  f({ key: "gold.reconciliation", name: "Gold Reconciliation", description: "Gold reconciliation workflows.", domain: "gold", defaultEnabled: false }),
  f({ key: "gold.exceptions", name: "Gold Exceptions", description: "Exception and anomaly tracking in gold flows.", domain: "gold", defaultEnabled: false }),
  f({ key: "gold.audit-trail", name: "Gold Audit Trail", description: "Gold audit and traceability pages.", domain: "gold", defaultEnabled: false }),
  f({ key: "gold.payouts", name: "Gold Settlements", description: "Gold settlement workflows.", domain: "gold", defaultEnabled: false }),

  f({ key: "hr.employees", name: "Employees", description: "Employee records and directory.", domain: "hr", defaultEnabled: false }),
  // Takes over from `ops.attendance.mark`: marking a register moved from Mine
  // Daily Operations to People because every vertical with a workforce keeps one.
  f({ key: "hr.attendance", name: "Attendance", description: "Crew attendance capture and the attendance register.", domain: "hr", defaultEnabled: false }),
  f({ key: "hr.leave", name: "Leave", description: "Leave types, entitlements, requests and the public holiday calendar.", domain: "hr", defaultEnabled: false }),
  f({ key: "hr.incidents", name: "HR Incidents", description: "HR incident management.", domain: "hr", defaultEnabled: false }),
  f({ key: "hr.disciplinary-actions", name: "Disciplinary Actions", description: "Disciplinary action lifecycle.", domain: "hr", defaultEnabled: false }),
  f({ key: "hr.compensation-rules", name: "Compensation Rules", description: "Compensation profiles/rules/templates.", domain: "hr", defaultEnabled: false }),
  f({ key: "hr.salaries", name: "Salaries", description: "Salary records and salary operations.", domain: "hr", defaultEnabled: false }),
  f({ key: "hr.payroll", name: "Payroll", description: "Payroll periods and runs.", domain: "hr", defaultEnabled: false }),
  f({ key: "hr.disbursements", name: "Disbursements", description: "Cash disbursement batch operations.", domain: "hr", defaultEnabled: false }),
  f({ key: "hr.approvals-history", name: "Approvals History", description: "Approval history and audit approvals.", domain: "hr", defaultEnabled: false }),
  // Zimbabwe statutory payroll. Separate keys because they are separately
  // sellable: a company outside Zimbabwe wants the payroll engine without the
  // ZIMRA returns, and a company that keeps its own books wants the payslips
  // without giving every employee a login.
  f({ key: "hr.statutory-tables", name: "Statutory Tables", description: "Effective-dated PAYE bands, NSSA rates, levies, tax credits and NEC agreements.", domain: "hr", defaultEnabled: false }),
  f({ key: "hr.statutory-returns", name: "Statutory Returns", description: "Monthly PAYE (P2) and NSSA contribution schedules, reconciled against the ledger.", domain: "hr", defaultEnabled: false }),
  f({ key: "hr.payslips", name: "Payslips", description: "Per-employee payslips showing every stage of the calculation.", domain: "hr", defaultEnabled: false }),
  f({ key: "hr.employee-self-service", name: "Employee Self-Service", description: "Lets an employee view their own payslips and nobody else's.", domain: "hr", defaultEnabled: false }),

  f({ key: "accounting.core", name: "Accounting Core", description: "Accounting module dashboard and shared setup.", domain: "accounting", defaultEnabled: false }),
  f({ key: "accounting.chart-of-accounts", name: "Chart of Accounts", description: "Chart of accounts and account setup.", domain: "accounting", defaultEnabled: false }),
  f({ key: "accounting.journals", name: "Journals", description: "Journal entries and posting workflows.", domain: "accounting", defaultEnabled: false }),
  f({ key: "accounting.periods", name: "Accounting Periods", description: "Accounting periods and period locks.", domain: "accounting", defaultEnabled: false }),
  f({ key: "accounting.posting-rules", name: "Posting Rules", description: "Automated posting rules and mappings.", domain: "accounting", defaultEnabled: false }),
  f({ key: "accounting.trial-balance", name: "Trial Balance", description: "Trial balance reporting.", domain: "accounting", defaultEnabled: false }),
  f({ key: "accounting.financial-statements", name: "Financial Statements", description: "Profit & Loss, Balance Sheet, and Cash Flow.", domain: "accounting", defaultEnabled: false }),
  f({ key: "accounting.ar", name: "Accounts Receivable", description: "Sales customers, invoices, and receipts.", domain: "accounting", defaultEnabled: false }),
  f({ key: "accounting.ap", name: "Accounts Payable", description: "Vendors, bills, and payments.", domain: "accounting", defaultEnabled: false }),
  f({ key: "accounting.banking", name: "Banking", description: "Bank accounts and transactions.", domain: "accounting", defaultEnabled: false }),
  f({ key: "accounting.cost-centers", name: "Cost Centers", description: "Cost center setup and allocation.", domain: "accounting", defaultEnabled: false }),
  f({ key: "accounting.multi-currency", name: "Multi-currency", description: "Currency rates and multi-currency support.", domain: "accounting", defaultEnabled: false }),
  f({ key: "accounting.tax", name: "Tax", description: "Tax codes and VAT configuration.", domain: "accounting", defaultEnabled: false }),
  f({ key: "accounting.zimra.fiscalisation", name: "ZIMRA Fiscalisation", description: "ZIMRA FDMS fiscalisation integration.", domain: "accounting", defaultEnabled: false }),

  f({ key: "maintenance.dashboard", name: "Maintenance Dashboard", description: "Maintenance dashboard.", domain: "maintenance", defaultEnabled: false }),
  f({ key: "maintenance.equipment", name: "Equipment Register", description: "Equipment lifecycle and maintenance meta.", domain: "maintenance", defaultEnabled: false }),
  f({ key: "maintenance.work-orders", name: "Work Orders", description: "Work order operations and workflows.", domain: "maintenance", defaultEnabled: false }),
  f({ key: "maintenance.breakdowns", name: "Breakdown Tracking", description: "Breakdown logging and remediation.", domain: "maintenance", defaultEnabled: false }),
  f({ key: "maintenance.schedule", name: "Maintenance Schedule", description: "Planned maintenance schedule.", domain: "maintenance", defaultEnabled: false }),

  f({ key: "compliance.overview", name: "Compliance Overview", description: "Compliance dashboard/overview.", domain: "compliance", defaultEnabled: true }),
  f({ key: "compliance.permits", name: "Permits", description: "Permit lifecycle management.", domain: "compliance", defaultEnabled: false }),
  f({ key: "compliance.inspections", name: "Inspections", description: "Inspection records and actions.", domain: "compliance", defaultEnabled: false }),
  f({ key: "compliance.incidents", name: "Compliance Incidents", description: "Compliance incident tracking.", domain: "compliance", defaultEnabled: false }),
  f({ key: "compliance.training-records", name: "Training Records", description: "Training records and expiries.", domain: "compliance", defaultEnabled: false }),

  f({ key: "schools.core", name: "Schools Core", description: "Schools module landing and shared setup.", domain: "schools", defaultEnabled: false }),
  f({ key: "schools.admissions", name: "School Admissions", description: "Admissions workflows and enrollment intake.", domain: "schools", defaultEnabled: false }),
  f({ key: "schools.students", name: "Student Directory", description: "Student profile management and directory browsing.", domain: "schools", defaultEnabled: false }),
  f({ key: "schools.attendance", name: "School Attendance", description: "Attendance capture and attendance tracking for students.", domain: "schools", defaultEnabled: false }),
  f({ key: "schools.fees", name: "School Fees", description: "Fees setup, invoicing, and fee collection tracking.", domain: "schools", defaultEnabled: false }),
  f({ key: "schools.boarding", name: "School Boarding", description: "Boarding operations including hostels, beds, and leave/outing workflows.", domain: "schools", defaultEnabled: false }),
  f({ key: "schools.teachers", name: "Teacher Management", description: "Teacher profiles, subjects, and class assignment governance.", domain: "schools", defaultEnabled: false }),
  f({ key: "schools.results", name: "School Results", description: "Continuous assessments, exams, moderation, and report card publishing.", domain: "schools", defaultEnabled: false }),
  // S-13.1. Off until switched on: public exams are the one thing every
  // Zimbabwean secondary school does that the pack could not.
  f({ key: "schools.exams", name: "Public Exams", description: "Public exam series, candidates, entries, seating and results — ZIMSEC and Cambridge.", domain: "schools", defaultEnabled: false }),
  f({ key: "schools.portal.parent", name: "Parent Portal", description: "Parent portal access for student progress and finance visibility.", domain: "schools", defaultEnabled: false }),
  f({ key: "schools.portal.student", name: "Student Portal", description: "Student portal access for own timetable, attendance, and results.", domain: "schools", defaultEnabled: false }),
  f({ key: "schools.portal.teacher", name: "Teacher Portal", description: "Teacher portal access for registers, marks, and moderation tasks.", domain: "schools", defaultEnabled: false }),

  // Commodity and variable settlements: paying somebody for a quantity of
  // something rather than for a period of employment. Its own domain, not HR's,
  // because a payroll module has to be sellable without it and a mine's site
  // manager who approves a settlement has no business in the salary bill.
  f({ key: "settlements.core", name: "Settlements", description: "Settlement intakes, runs and payouts for quantity-based pay.", domain: "settlements", defaultEnabled: false }),
  f({ key: "settlements.gold", name: "Gold Settlements", description: "Settling gold shift allocations by weight, valued at the price agreed upstream.", domain: "settlements", defaultEnabled: false }),

  f({ key: "retail.core", name: "Retail Core", description: "Retail module landing and shared setup.", domain: "retail", defaultEnabled: false }),
  f({ key: "retail.pos", name: "Retail POS", description: "Point-of-sale and cashier workflows.", domain: "retail", defaultEnabled: false }),
  f({ key: "retail.catalog", name: "Retail Catalog", description: "Cataloging, pricing, barcodes, and sellable item management.", domain: "retail", defaultEnabled: false }),
  f({ key: "retail.purchasing", name: "Retail Purchasing", description: "Purchase orders, receipts, and receiving workflows.", domain: "retail", defaultEnabled: false }),
  f({ key: "retail.promotions", name: "Retail Promotions", description: "Price lists, markdowns, and promotion rules.", domain: "retail", defaultEnabled: false }),
  f({ key: "retail.shifts", name: "Retail Shifts", description: "Shift control, cash-up, and register reconciliation.", domain: "retail", defaultEnabled: false }),
  f({ key: "retail.reports", name: "Retail Reports", description: "Retail dashboards and reporting surfaces.", domain: "retail", defaultEnabled: false }),

  f({ key: "crm.customers", name: "CRM Customers", description: "Shared customer directory access for CRM and customer-aware modules.", domain: "crm", defaultEnabled: false }),
  f({ key: "crm.core", name: "CRM Core", description: "CRM module landing, dashboard, and shared setup.", domain: "crm", defaultEnabled: false }),
  f({ key: "crm.leads", name: "CRM Leads & Pipeline", description: "Lead pipeline, stages, and activity timeline.", domain: "crm", defaultEnabled: false }),
  f({ key: "crm.clients", name: "CRM Clients", description: "Client profiles, contacts, and dedupe.", domain: "crm", defaultEnabled: false }),
  f({ key: "crm.appointments", name: "CRM Site Visits", description: "Appointment and site-visit scheduling with follow-ups.", domain: "crm", defaultEnabled: false }),
  f({ key: "crm.intake", name: "CRM Intake Forms", description: "Public intake-form builder, shareable links, and webhook lead capture.", domain: "crm", defaultEnabled: false }),
  f({ key: "crm.documents", name: "CRM Quoting & Invoicing", description: "Create quotations, invoices, and receipts from the CRM (records live in accounting).", domain: "crm", defaultEnabled: false }),
  f({ key: "crm.insights", name: "CRM Insights", description: "Pipeline funnel, per-rep performance, and source/UTM attribution.", domain: "crm", defaultEnabled: false }),
  f({ key: "crm.commissions", name: "CRM Commissions", description: "Tiered commission rules and per-rep commission tracking.", domain: "crm", defaultEnabled: false }),
  f({ key: "crm.settings", name: "CRM Settings", description: "API keys, commission rules, and pipeline configuration.", domain: "crm", defaultEnabled: false }),

  f({ key: "portal.core", name: "Portal Core", description: "External/customer portal shell and shared navigation.", domain: "portal", defaultEnabled: false }),
  f({ key: "portal.schools", name: "School Portal", description: "School-facing portal experiences and APIs.", domain: "portal", defaultEnabled: false }),
  f({ key: "portal.pos", name: "POS Portal", description: "Point-of-sale portal access for cashier surfaces.", domain: "portal", defaultEnabled: false }),

  f({ key: "reports.dashboard", name: "Reports Dashboard", description: "Top-level reports dashboard.", domain: "reports", defaultEnabled: false }),
  f({ key: "reports.shift", name: "Shift Reports", description: "Shift reports analytics pages.", domain: "reports", defaultEnabled: false }),
  f({ key: "reports.attendance", name: "Attendance Reports", description: "Attendance analytics pages.", domain: "reports", defaultEnabled: false }),
  f({ key: "reports.plant", name: "Plant Reports", description: "Plant analytics pages.", domain: "reports", defaultEnabled: false }),
  f({ key: "reports.stores-movements", name: "Stores Movements Reports", description: "Stores movement reports.", domain: "reports", defaultEnabled: false }),
  f({ key: "reports.fuel-ledger", name: "Fuel Ledger Reports", description: "Fuel ledger reports.", domain: "reports", defaultEnabled: false }),
  f({ key: "reports.maintenance-work-orders", name: "Maintenance Work Order Reports", description: "Work order reporting.", domain: "reports", defaultEnabled: false }),
  f({ key: "reports.maintenance-equipment", name: "Maintenance Equipment Reports", description: "Equipment performance reporting.", domain: "reports", defaultEnabled: false }),
  f({ key: "reports.gold-chain", name: "Gold Chain Reports", description: "Gold chain reporting.", domain: "reports", defaultEnabled: false }),
  f({ key: "reports.gold-receipts", name: "Gold Receipt Reports", description: "Gold receipt reporting.", domain: "reports", defaultEnabled: false }),
  f({ key: "reports.audit-trails", name: "Audit Trail Reports", description: "Audit trail reporting pages.", domain: "reports", defaultEnabled: false }),
  f({ key: "reports.downtime-analytics", name: "Downtime Analytics", description: "Downtime analysis reports.", domain: "reports", defaultEnabled: false }),
  f({ key: "reports.compliance-incidents", name: "Compliance Incidents Reports", description: "Compliance incident reports.", domain: "reports", defaultEnabled: false }),

  f({ key: "admin.user-management.core", name: "User Management Core", description: "User management module access.", domain: "admin", defaultEnabled: false }),
  f({ key: "admin.user-management.create", name: "User Creation", description: "Manager/clerk user creation lifecycle actions.", domain: "admin", defaultEnabled: false }),
  f({ key: "admin.user-management.status", name: "User Status", description: "Activate/deactivate manager and clerk accounts.", domain: "admin", defaultEnabled: false }),
  f({ key: "admin.user-management.password-reset", name: "User Password Reset", description: "Manager/clerk password reset actions.", domain: "admin", defaultEnabled: false }),
  f({ key: "admin.user-management.role-change", name: "User Role Change", description: "Manager/clerk role change actions.", domain: "admin", defaultEnabled: false }),
  f({ key: "admin.user-management.feature-access", name: "User Feature Access", description: "Per-user feature access templates and overrides.", domain: "admin", defaultEnabled: false }),
  f({ key: "admin.user-management.directory", name: "User Directory", description: "User and role directory listing and search.", domain: "admin", defaultEnabled: false }),
  f({ key: "admin.sites-sections", name: "Sites and Sections", description: "Site/section administration.", domain: "admin", defaultEnabled: false }),
  f({ key: "admin.payroll-config", name: "Payroll Configuration", description: "Payroll configuration endpoints.", domain: "admin", defaultEnabled: false }),
  f({ key: "admin.feature-flags-console", name: "Feature Flags Console", description: "Platform feature flag operations.", domain: "admin", defaultEnabled: true }),
  f({ key: "admin.subscription-console", name: "Subscription Console", description: "Subscription/tier controls in platform.", domain: "admin", defaultEnabled: true }),
];

export const FEATURE_BUNDLES: FeatureBundleDefinition[] = [
  {
    code: "ADDON_OPERATIONS_CORE",
    base: true,
    name: "Operations Core",
    description: "Operational reporting home and site/section administration.",
    features: [
      "reports.dashboard",
      "admin.sites-sections",
    ],
  },
  {
    code: "ADDON_MINE_DAILY_OPS",
    base: true,
    name: "Mine Daily Operations",
    description: "Mining shift, crew attendance, and plant capture with matching reports.",
    features: [
      "ops.shift-report.submit",
      "ops.attendance.mark",
      "ops.plant-report.submit",
      "reports.shift",
      "reports.attendance",
      "reports.plant",
    ],
  },
  {
    code: "ADDON_STORES_CORE",
    base: true,
    name: "Stores Core",
    description: "Inventory, stock movement, receiving, and issue workflows.",
    features: [
      "stores.dashboard",
      "stores.inventory",
      "stores.movements",
      "stores.issue",
      "stores.receive",
      "stores.catalogue",
      "stores.price-lists",
      "reports.stores-movements",
    ],
  },
  {
    code: "ADDON_WORKFORCE_CORE",
    base: true,
    name: "Workforce Core",
    description: "Employee directory and workforce base records.",
    features: ["hr.employees", "hr.attendance", "hr.leave"],
  },
  {
    code: "ADDON_GOLD_CORE",
    name: "Gold Operations",
    description: "Core gold intake, dispatch, receipt, and operational navigation.",
    features: [
      "gold.home",
      "gold.intake.pours",
      "gold.dispatches",
      "gold.receipts",
    ],
  },
  {
    code: "ADDON_CUSTOM_BRANDING",
    name: "Custom Branding",
    description: "Tenant brand identity, fonts, and custom domain support.",
    features: [
      "core.branding.manage",
      "core.templates",
      "core.branding.custom-domain",
    ],
  },
  {
    code: "ADDON_ADVANCED_PAYROLL",
    name: "Advanced Payroll",
    description: "Payroll and disbursement heavy workflows.",
    features: [
      "hr.payroll",
      "hr.disbursements",
      "hr.compensation-rules",
      "hr.incidents",
      "hr.disciplinary-actions",
      "hr.salaries",
      "hr.approvals-history",
      "admin.payroll-config",
    ],
  },
  {
    // The bolt-on. Everything Zimbabwe-specific, addable to any existing
    // workspace — including a school, which is the concrete case: a school that
    // buys this pays its teachers from the same `Employee` rows the timetable
    // already uses, with no bridging code.
    //
    // Separate from ADDON_ADVANCED_PAYROLL rather than folded into it, because a
    // company outside Zimbabwe wants the payroll engine without the ZIMRA
    // returns.
    code: "ADDON_ZIMBABWE_PAYROLL",
    name: "Zimbabwe Statutory Payroll",
    description:
      "PAYE, NSSA, AIDS levy, ZIMDEF and NEC handling with the monthly P2 and NSSA returns.",
    features: [
      "hr.statutory-tables",
      "hr.statutory-returns",
      "hr.payslips",
      "hr.employee-self-service",
    ],
  },
  {
    // Paying for a quantity rather than a period. Sold separately from payroll
    // because most payroll customers have no commodity to settle, and sold as one
    // addon covering every source because the intake, the run and the payout are
    // the same machinery whether the quantity is grams or kilos.
    code: "ADDON_COMMODITY_SETTLEMENTS",
    name: "Commodity Settlements",
    description:
      "Settling gold, scrap, commission and other quantity-based pay, with its own approval chain and payouts.",
    features: ["settlements.core", "settlements.gold"],
  },
  {
    code: "ADDON_GOLD_ADVANCED",
    name: "Gold Advanced Controls",
    description: "Advanced gold controls and audit/reconciliation.",
    features: ["gold.reconciliation", "gold.exceptions", "gold.audit-trail", "gold.payouts", "reports.gold-chain", "reports.gold-receipts"],
  },
  {
    code: "ADDON_COMPLIANCE_PRO",
    name: "Compliance Pro",
    description: "Compliance deep controls and reporting.",
    features: ["compliance.overview", "compliance.permits", "compliance.inspections", "compliance.incidents", "compliance.training-records", "reports.compliance-incidents"],
  },
  {
    code: "ADDON_MAINTENANCE_PRO",
    name: "Maintenance Pro",
    description: "Maintenance operations and analytics.",
    features: [
      "maintenance.dashboard",
      "maintenance.equipment",
      "maintenance.work-orders",
      "maintenance.breakdowns",
      "maintenance.schedule",
      "reports.maintenance-work-orders",
      "reports.maintenance-equipment",
    ],
  },
  {
    code: "ADDON_USER_MANAGEMENT_PRO",
    name: "User Management Pro",
    description: "Advanced manager/clerk lifecycle management controls.",
    features: [
      "admin.user-management.core",
      "admin.user-management.create",
      "admin.user-management.status",
      "admin.user-management.password-reset",
      "admin.user-management.role-change",
      "admin.user-management.feature-access",
      "admin.user-management.directory",
    ],
  },
  {
    code: "ADDON_ANALYTICS_PRO",
    name: "Analytics Pro",
    description: "Advanced reports and analytical surfaces.",
    features: ["reports.downtime-analytics", "reports.audit-trails", "core.notifications.push"],
  },
  {
    code: "ADDON_ACCOUNTING_CORE",
    name: "Accounting Core",
    description: "Core accounting setup, journals, and financial statements.",
    features: [
      "accounting.core",
      "accounting.chart-of-accounts",
      "accounting.journals",
      "accounting.periods",
      "accounting.posting-rules",
      "accounting.trial-balance",
      "accounting.financial-statements",
    ],
  },
  {
    code: "ADDON_ACCOUNTING_ADVANCED",
    name: "Accounting Advanced",
    description: "AR/AP, banking, cost centers, and multi-currency.",
    features: [
      "accounting.ar",
      "accounting.ap",
      "accounting.banking",
      "accounting.cost-centers",
      "accounting.multi-currency",
    ],
  },
  {
    code: "ADDON_ZIMRA_FISCAL",
    name: "ZIMRA Tax & Fiscalisation",
    description: "VAT setup and ZIMRA FDMS fiscalisation connector.",
    features: ["accounting.tax", "accounting.zimra.fiscalisation"],
  },
  {
    code: "ADDON_SCHOOLS_SUITE",
    name: "Schools Suite",
    description:
      "Student lifecycle, academics, boarding, fees, and school role portals.",
    features: [
      "schools.core",
      "schools.admissions",
      "schools.students",
      "schools.attendance",
      "schools.fees",
      "schools.boarding",
      "schools.teachers",
      "schools.results",
      // The portal shell the three school portals are gated behind. Without it
      // `schools.portal.*` resolves to "requires portal.core" and every portal
      // route on a Schools Suite tenant redirects to /access-blocked — three
      // features enabled and none of them reachable. The suite sells "parent
      // and teacher portals on any phone browser", so the shell is part of the
      // suite rather than a separate purchase.
      "portal.core",
      "schools.portal.parent",
      "schools.portal.student",
      "schools.portal.teacher",
    ],
  },
  {
    code: "ADDON_RETAIL_SUITE",
    name: "Retail Suite",
    description: "Retail operations, merchandising, shifts, and POS for shop businesses.",
    features: [
      "retail.core",
      "retail.pos",
      "retail.catalog",
      "retail.purchasing",
      "retail.promotions",
      "retail.shifts",
      "retail.reports",
      "crm.customers",
      // The till, and the portal shell it runs in. `portal.pos` depends on
      // `portal.core`, and that dependency is restrictive — shipping the till
      // without the shell left every tenant provisioned from TEMPLATE_RETAIL
      // *entitled* to the POS and *denied* at the door. The demo tenant only
      // works because `retail-demo-focus.ts` keeps `portal.core` by hand.
      "portal.core",
      "portal.pos",
    ],
  },
  {
    code: "ADDON_CRM_SUITE",
    name: "CRM Suite",
    description: "Lead-to-cash CRM: pipeline, clients, site visits, intake forms, quoting/invoicing, commissions, and insights.",
    features: [
      "crm.customers",
      "crm.core",
      "crm.leads",
      "crm.clients",
      "crm.appointments",
      "crm.intake",
      "crm.documents",
      "crm.insights",
      "crm.commissions",
      "crm.settings",
      "core.templates",
    ],
  },
  {
    code: "ADDON_PORTAL_SUITE",
    name: "Client Portal Suite",
    description: "Shared external portal shell and cross-vertical portal delivery surfaces.",
    features: [
      "portal.core",
      "portal.schools",
      "portal.pos",
    ],
  },
];

export const BUNDLE_DEPENDENCIES: Record<string, string[]> = {
  ADDON_ACCOUNTING_ADVANCED: ["ADDON_ACCOUNTING_CORE"],
  ADDON_ZIMRA_FISCAL: ["ADDON_ACCOUNTING_CORE"],
  ADDON_GOLD_ADVANCED: ["ADDON_GOLD_CORE"],
  // Retail does not own stock. Every retail movement — sale, refund, receipt,
  // stock take — writes a core `StockMovement` and updates a core
  // `InventoryItem`, and `retail.catalog` now declares that dependency in
  // `feature-dependencies.ts`. Selling the Retail Suite without Stores Core
  // would sell a shop that cannot count its bottles.
  ADDON_RETAIL_SUITE: ["ADDON_STORES_CORE"],
  // CRM quoting/invoicing writes real accounting AR documents.
  ADDON_CRM_SUITE: ["ADDON_ACCOUNTING_CORE", "ADDON_ACCOUNTING_ADVANCED"],
};

const PLATFORM_BASE_FEATURES = [
  "core.auth.login",
  "core.help.quick-tips",
  "core.notifications.center",
  "core.multitenancy.tenant-host-enforcement",
];

const PLATFORM_BASE_BUNDLES = [
  "ADDON_OPERATIONS_CORE",
  "ADDON_STORES_CORE",
  "ADDON_WORKFORCE_CORE",
];

/**
 * Feature keys the platform console rides on. Carried by GROW and above, exactly
 * as STANDARD and above carried them before the restructure — the two self-serve
 * tiers below it are deliberately console-free.
 */
const PLATFORM_CONSOLE_FEATURES = [
  "core.notifications.push",
  "admin.feature-flags-console",
  "admin.subscription-console",
];

/**
 * Which features and bundles each tier switches on, and its grace days. Tiers
 * set no price: a workspace pays per vertical (`lib/platform/verticals.ts`).
 * `TIERS[0]` is the entry tier everywhere one is used as a default.
 */
export const TIERS: TierDefinition[] = [
  {
    // The wedge. Sold on one job — fiscalising invoices across tills and sites —
    // so it carries the identity and document surface fiscalisation actually
    // needs (customers, invoices, supplier identity, tax codes, the FDMS
    // connector) and nothing else. Everything a retailer would also want is a
    // reason to move up to START.
    code: "FISCAL",
    name: "Fiscal",
    description: "ZIMRA fiscalisation for businesses running tills across one or more sites.",
    warningDays: 14,
    graceDays: 7,
    includedFeatures: [
      ...PLATFORM_BASE_FEATURES,
      // AR and AP as identity and documents, not as a ledger: a fiscal invoice
      // needs a customer, an invoice and a supplier. The rest of
      // ADDON_ACCOUNTING_ADVANCED (banking, cost centers, multi-currency)
      // stays an upsell.
      "accounting.ar",
      "accounting.ap",
    ],
    includedBundles: [
      "ADDON_OPERATIONS_CORE",
      "ADDON_ACCOUNTING_CORE",
      "ADDON_ZIMRA_FISCAL",
    ],
  },
  {
    // Single-site retail, self-serve. Replaces BASIC/"Launch" at the same shape
    // (one site, five seats) with the retail suite added, because a shop that
    // signs up without talking to anybody needs a till on day one.
    code: "START",
    name: "Start",
    description: "One shop, self-serve: till, catalog, stock, and people in one place.",
    warningDays: 14,
    graceDays: 7,
    includedFeatures: PLATFORM_BASE_FEATURES,
    includedBundles: [
      ...PLATFORM_BASE_BUNDLES,
      "ADDON_RETAIL_SUITE",
      // Fiscalisation carries up from FISCAL: a shop must not lose the one
      // capability it is legally compelled to have. Every tier above FISCAL
      // bundles these two.
      "ADDON_ACCOUNTING_CORE",
      "ADDON_ZIMRA_FISCAL",
    ],
  },
  {
    // Roughly today's STANDARD (user management + analytics on the base
    // platform) plus the retail suite, the ledger and fiscalisation — the shape
    // a multi-site retailer with three or more tills actually operates.
    code: "GROW",
    name: "Grow",
    description: "Several branches, several tills, with books and fiscalisation connected.",
    warningDays: 14,
    graceDays: 7,
    includedFeatures: [...PLATFORM_BASE_FEATURES, ...PLATFORM_CONSOLE_FEATURES],
    includedBundles: [
      ...PLATFORM_BASE_BUNDLES,
      "ADDON_RETAIL_SUITE",
      "ADDON_USER_MANAGEMENT_PRO",
      "ADDON_ANALYTICS_PRO",
      "ADDON_ACCOUNTING_CORE",
      "ADDON_ZIMRA_FISCAL",
    ],
  },
  {
    // Chains. Everything GROW has, plus the depth today's MEDIUM carried
    // (maintenance, portals, full accounting) and the CRM suite — whose bundle
    // dependencies on accounting core and advanced are satisfied here.
    code: "SCALE",
    name: "Scale",
    description: "Chains running many branches, with finance, CRM, portals, and assets connected.",
    warningDays: 14,
    graceDays: 7,
    includedFeatures: [...PLATFORM_BASE_FEATURES, ...PLATFORM_CONSOLE_FEATURES],
    includedBundles: [
      ...PLATFORM_BASE_BUNDLES,
      "ADDON_RETAIL_SUITE",
      "ADDON_USER_MANAGEMENT_PRO",
      "ADDON_ANALYTICS_PRO",
      "ADDON_ACCOUNTING_CORE",
      "ADDON_ACCOUNTING_ADVANCED",
      "ADDON_ZIMRA_FISCAL",
      "ADDON_CRM_SUITE",
      "ADDON_MAINTENANCE_PRO",
      "ADDON_PORTAL_SUITE",
    ],
  },
  {
    // Gold as a listed edition rather than two add-ons on an ENTERPRISE tenant.
    // Composition: the base platform and mine daily capture, both gold bundles,
    // commodity settlements (how a mine pays for grams), the ledger with
    // fiscalisation, and payroll depth including the Zimbabwe statutory work.
    isVerticalEdition: true,
    code: "GOLD_EDITION",
    name: "Gold Edition",
    description: "Small and medium gold operations: production, settlement, controls, books, and payroll.",
    warningDays: 14,
    graceDays: 7,
    includedFeatures: [...PLATFORM_BASE_FEATURES, ...PLATFORM_CONSOLE_FEATURES],
    includedBundles: [
      ...PLATFORM_BASE_BUNDLES,
      "ADDON_MINE_DAILY_OPS",
      "ADDON_GOLD_CORE",
      "ADDON_GOLD_ADVANCED",
      "ADDON_COMMODITY_SETTLEMENTS",
      "ADDON_ACCOUNTING_CORE",
      "ADDON_ACCOUNTING_ADVANCED",
      "ADDON_ZIMRA_FISCAL",
      "ADDON_ADVANCED_PAYROLL",
      "ADDON_ZIMBABWE_PAYROLL",
      "ADDON_USER_MANAGEMENT_PRO",
      "ADDON_ANALYTICS_PRO",
    ],
  },
  {
    // Contents are the old ENTERPRISE bundle list (all of which survive the
    // drop) plus everything SCALE gained, so ENTERPRISE stays a superset of the
    // tier below it. The vertical editions — gold, schools, mining capture —
    // are added per engagement rather than assumed.
    code: "ENTERPRISE",
    name: "Enterprise",
    description: "Groups with bespoke configuration, governance, finance, and compliance depth.",
    warningDays: 21,
    graceDays: 14,
    includedFeatures: [...PLATFORM_BASE_FEATURES, ...PLATFORM_CONSOLE_FEATURES],
    includedBundles: [
      ...PLATFORM_BASE_BUNDLES,
      "ADDON_RETAIL_SUITE",
      "ADDON_USER_MANAGEMENT_PRO",
      "ADDON_ANALYTICS_PRO",
      "ADDON_ACCOUNTING_CORE",
      "ADDON_ACCOUNTING_ADVANCED",
      "ADDON_ZIMRA_FISCAL",
      "ADDON_CRM_SUITE",
      "ADDON_MAINTENANCE_PRO",
      "ADDON_PORTAL_SUITE",
      "ADDON_COMPLIANCE_PRO",
      "ADDON_ADVANCED_PAYROLL",
      "ADDON_CUSTOM_BRANDING",
    ],
  },
];

/**
 * The ladder, smallest first: the tiers a business moves up as it grows.
 *
 * Vertical editions are excluded — see `TierDefinition.isVerticalEdition`. The
 * ladder is what the "more sites, never fewer bundles at each step" invariants
 * are asserted over; an edition is held to a different, weaker promise.
 */
export const LADDER_TIERS: TierDefinition[] = TIERS.filter(
  (tier) => !tier.isVerticalEdition,
);

/** Vertical editions, sold for what a business is rather than how big it is. */
export const VERTICAL_EDITION_TIERS: TierDefinition[] = TIERS.filter(
  (tier) => tier.isVerticalEdition,
);

/**
 * Every tier above the wedge carries fiscalisation. Land on FISCAL, expand into
 * the suite — an upgrade that dropped ZIMRA compliance would be a downgrade in
 * the only dimension the market is legally compelled to care about.
 */
export const WEDGE_BUNDLES = ["ADDON_ACCOUNTING_CORE", "ADDON_ZIMRA_FISCAL"] as const;

/**
 * Every code the platform has ever billed under, mapped onto the tier that now
 * serves it. Legacy tenants resolve through here, so no subscription row can be
 * left pointing at a tier that no longer exists:
 *
 * - BASIC/"Launch" -> START      (single site, self-serve)
 * - STANDARD       -> GROW       (multi-site, same rung)
 * - MEDIUM         -> SCALE      (multi-branch groups)
 * - LARGE/BUSINESS -> ENTERPRISE (unchanged)
 *
 * Note that GROW and SCALE used to be aliases *for* STANDARD and MEDIUM and are
 * now real tier codes; they resolve directly and must not be re-aliased.
 */
const TIER_CODE_ALIASES: Record<string, TierDefinition["code"]> = {
  // Retired tier codes.
  BASIC: "START",
  STANDARD: "GROW",
  MEDIUM: "SCALE",
  ENTERPRISE: "ENTERPRISE",
  // Legacy display and sales aliases, carried forward.
  SOLO: "START",
  STARTER: "START",
  LAUNCH: "START",
  SMALL: "GROW",
  GROWTH: "GROW",
  LARGE: "ENTERPRISE",
  BUSINESS: "ENTERPRISE",
  // Gold was sold as add-ons on an ENTERPRISE tenant before it was an edition.
  GOLD: "GOLD_EDITION",
  GOLD_EDITION: "GOLD_EDITION",
};

export function getTierDefinition(planCode: string | null | undefined): TierDefinition | null {
  if (!planCode) return null;
  const normalized = planCode.trim().toUpperCase();
  const resolvedCode = TIER_CODE_ALIASES[normalized] ?? normalized;
  return TIERS.find((tier) => tier.code === resolvedCode) ?? null;
}

export function getBundleDefinition(code: string | null | undefined): FeatureBundleDefinition | null {
  if (!code) return null;
  const normalized = code.trim().toUpperCase();
  return FEATURE_BUNDLES.find((bundle) => bundle.code === normalized) ?? null;
}

export function resolveFeatureKeyForPath(pathname: string): string | null {
  return resolveFeatureKeyForPathFromRegistry(pathname);
}

export function isKnownFeatureKey(featureKey: string): boolean {
  return FEATURE_CATALOG.some((feature) => feature.key === featureKey);
}
