import type { FeatureRouteEntry } from "@/lib/platform/gating/types";

export const PAGE_FEATURE_ROUTES: FeatureRouteEntry[] = [
  { scope: "page", prefix: "/login", featureKey: "core.auth.login" },
  { scope: "page", prefix: "/help", featureKey: "core.help.quick-tips" },
  { scope: "page", prefix: "/preferences/organization/branding", featureKey: "core.branding.manage" },
  { scope: "page", prefix: "/preferences/organization/templates", featureKey: "core.branding.manage" },
  // Templates left the CRM: one library for the quote layout, the site-survey
  // form and the invoice a customer receives. Gated on its own key, granted by
  // both the CRM suite and the branding addon — gating it on branding alone
  // locked the CRM's own template library away from CRM customers.
  { scope: "page", prefix: "/templates", featureKey: "core.templates" },
  { scope: "page", prefix: "/preferences/organization/departments", featureKey: "hr.employees" },
  { scope: "page", prefix: "/preferences/organization/sites", featureKey: "admin.sites-sections" },
  { scope: "page", prefix: "/preferences/organization/users", featureKey: "admin.user-management.directory" },
  { scope: "page", prefix: "/settings/branding", featureKey: "core.branding.manage" },
  { scope: "page", prefix: "/settings/templates", featureKey: "core.branding.manage" },

  // ST-1.3 / ST-2 — CCTV, vehicle sales and scrap metal were dropped from the
  // product. Their feature keys left the catalogue and their pages have now
  // left the disk, so there is nothing here to gate: a request for one of those
  // prefixes is a 404 from the router, which is the right answer and does not
  // need a registry entry to produce it.

  // Longest prefix wins, so the returns page must precede the tables page it
  // sits under.
  { scope: "page", prefix: "/payroll/statutory/returns", featureKey: "hr.statutory-returns" },
  { scope: "page", prefix: "/payroll/statutory", featureKey: "hr.statutory-tables" },
  { scope: "page", prefix: "/payroll/runs", featureKey: "hr.payroll" },
  { scope: "page", prefix: "/payroll/disbursements", featureKey: "hr.disbursements" },
  { scope: "page", prefix: "/payroll/compensation", featureKey: "hr.compensation-rules" },
  { scope: "page", prefix: "/people/leave/holidays", featureKey: "hr.leave" },
  { scope: "page", prefix: "/people/leave", featureKey: "hr.leave" },
  { scope: "page", prefix: "/people/rosters", featureKey: "hr.employees" },
  // Ahead of the bare /people entry below: first match wins here, so a longer
  // prefix listed after a shorter one never gets read.
  { scope: "page", prefix: "/people/attendance", featureKey: "hr.attendance" },
  { scope: "page", prefix: "/payroll/salaries", featureKey: "hr.salaries" },
  { scope: "page", prefix: "/people/approvals", featureKey: "hr.approvals-history" },
  { scope: "page", prefix: "/people/incidents", featureKey: "hr.incidents" },
  { scope: "page", prefix: "/people", featureKey: "hr.employees" },

  { scope: "page", prefix: "/maintenance/work-orders", featureKey: "maintenance.work-orders" },
  { scope: "page", prefix: "/maintenance/equipment", featureKey: "maintenance.equipment" },
  { scope: "page", prefix: "/maintenance/breakdown", featureKey: "maintenance.breakdowns" },
  { scope: "page", prefix: "/maintenance/schedule", featureKey: "maintenance.schedule" },
  { scope: "page", prefix: "/maintenance", featureKey: "maintenance.dashboard" },

  { scope: "page", prefix: "/stores/movements", featureKey: "stores.movements" },
  { scope: "page", prefix: "/stores/inventory", featureKey: "stores.inventory" },
  { scope: "page", prefix: "/stores/locations", featureKey: "stores.inventory" },
  // The catalogue and its prices are what the business sells, not what it
  // holds — gated with the stock module they live in, not with the CRM that
  // happens to quote from them.
  { scope: "page", prefix: "/stores/catalogue", featureKey: "stores.inventory" },
  { scope: "page", prefix: "/stores/price-lists", featureKey: "stores.inventory" },
  { scope: "page", prefix: "/stores/issue", featureKey: "stores.issue" },
  { scope: "page", prefix: "/stores/receive", featureKey: "stores.receive" },
  { scope: "page", prefix: "/stores/fuel", featureKey: "stores.fuel-ledger" },
  { scope: "page", prefix: "/stores/dashboard", featureKey: "stores.dashboard" },
  { scope: "page", prefix: "/stores", featureKey: "stores.dashboard" },

  { scope: "page", prefix: "/accounting/chart-of-accounts", featureKey: "accounting.chart-of-accounts" },
  { scope: "page", prefix: "/accounting/journals", featureKey: "accounting.journals" },
  { scope: "page", prefix: "/accounting/periods", featureKey: "accounting.periods" },
  { scope: "page", prefix: "/accounting/posting-rules", featureKey: "accounting.posting-rules" },
  { scope: "page", prefix: "/accounting/receivables", featureKey: "accounting.ar" },
  { scope: "page", prefix: "/accounting/payables", featureKey: "accounting.ap" },
  { scope: "page", prefix: "/accounting/financial-reports", featureKey: "accounting.financial-statements" },
  { scope: "page", prefix: "/accounting/trial-balance", featureKey: "accounting.trial-balance" },
  { scope: "page", prefix: "/accounting/financial-statements", featureKey: "accounting.financial-statements" },
  { scope: "page", prefix: "/accounting/sales", featureKey: "accounting.ar" },
  { scope: "page", prefix: "/accounting/purchases", featureKey: "accounting.ap" },
  { scope: "page", prefix: "/accounting/banking", featureKey: "accounting.banking" },
  { scope: "page", prefix: "/accounting/cost-centers", featureKey: "accounting.cost-centers" },
  { scope: "page", prefix: "/accounting/currency", featureKey: "accounting.multi-currency" },
  { scope: "page", prefix: "/accounting/tax", featureKey: "accounting.tax" },
  { scope: "page", prefix: "/accounting/fiscalisation", featureKey: "accounting.zimra.fiscalisation" },
  { scope: "page", prefix: "/accounting", featureKey: "accounting.core" },

  { scope: "page", prefix: "/schools/documents", featureKey: "schools.core" },
  { scope: "page", prefix: "/schools/academics", featureKey: "schools.core" },
  { scope: "page", prefix: "/schools/timetable", featureKey: "schools.core" },
  { scope: "page", prefix: "/schools/homework", featureKey: "schools.core" },
  { scope: "page", prefix: "/schools/goals", featureKey: "schools.core" },
  { scope: "page", prefix: "/schools/meetings", featureKey: "schools.core" },
  { scope: "page", prefix: "/schools/library", featureKey: "schools.core" },
  { scope: "page", prefix: "/schools/transport", featureKey: "schools.core" },
  { scope: "page", prefix: "/schools/finance", featureKey: "schools.fees" },
  { scope: "page", prefix: "/schools/notices", featureKey: "schools.core" },
  { scope: "page", prefix: "/schools/reports", featureKey: "schools.core" },
  { scope: "page", prefix: "/schools/admissions", featureKey: "schools.admissions" },
  { scope: "page", prefix: "/schools/students", featureKey: "schools.students" },
  { scope: "page", prefix: "/schools/imports", featureKey: "schools.students" },
  { scope: "page", prefix: "/schools/classes", featureKey: "schools.core" },
  { scope: "page", prefix: "/schools/subjects", featureKey: "schools.core" },
  { scope: "page", prefix: "/schools/attendance", featureKey: "schools.attendance" },
  { scope: "page", prefix: "/schools/fees", featureKey: "schools.fees" },
  { scope: "page", prefix: "/schools/boarding", featureKey: "schools.boarding" },
  { scope: "page", prefix: "/schools/teachers", featureKey: "schools.teachers" },
  { scope: "page", prefix: "/schools/results/moderation", featureKey: "schools.results" },
  { scope: "page", prefix: "/schools/results/publish", featureKey: "schools.results" },
  { scope: "page", prefix: "/schools/results", featureKey: "schools.results" },
  { scope: "page", prefix: "/schools/portal/parent", featureKey: "schools.portal.parent" },
  { scope: "page", prefix: "/schools/portal/student", featureKey: "schools.portal.student" },
  { scope: "page", prefix: "/schools/portal/teacher", featureKey: "schools.portal.teacher" },
  { scope: "page", prefix: "/schools", featureKey: "schools.core" },

  { scope: "page", prefix: "/retail/customers", featureKey: "crm.customers" },
  { scope: "page", prefix: "/retail/catalog", featureKey: "retail.catalog" },
  { scope: "page", prefix: "/retail/purchasing", featureKey: "retail.purchasing" },
  { scope: "page", prefix: "/retail/merchandising", featureKey: "retail.promotions" },
  { scope: "page", prefix: "/retail/sales", featureKey: "retail.pos" },
  { scope: "page", prefix: "/retail/cash-control", featureKey: "retail.shifts" },
  { scope: "page", prefix: "/retail/shifts", featureKey: "retail.shifts" },
  { scope: "page", prefix: "/retail/reports", featureKey: "retail.reports" },
  { scope: "page", prefix: "/retail/pos", featureKey: "retail.pos" },
  { scope: "page", prefix: "/retail", featureKey: "retail.core" },

  { scope: "page", prefix: "/portal/pos/customers", featureKey: "crm.customers" },
  { scope: "page", prefix: "/portal/pos", featureKey: "retail.pos" },
  { scope: "page", prefix: "/portal/parent", featureKey: "schools.portal.parent" },
  { scope: "page", prefix: "/portal/student", featureKey: "schools.portal.student" },
  { scope: "page", prefix: "/portal/teacher", featureKey: "schools.portal.teacher" },
  { scope: "page", prefix: "/portal/schools", featureKey: "portal.schools" },
  // ST-1.3 / ST-2 — `/portal/autos`, `/portal/car-sales` and `/portal/thrift`
  // are gone with the modules that owned them, pages and all. The bare
  // `/portal` entry below would still have caught those prefixes, which is why
  // deleting the pages rather than inventing a sentinel key was the fix: a key
  // that is not in the catalogue fails the "every route key is a catalogue key"
  // check, and a router 404 is the honest answer for a page that no longer
  // exists.
  { scope: "page", prefix: "/portal", featureKey: "portal.core" },

  { scope: "page", prefix: "/gold/intake/pours", featureKey: "gold.intake.pours" },
  { scope: "page", prefix: "/gold/intake/purchases", featureKey: "gold.intake.pours" },
  { scope: "page", prefix: "/gold/transit/dispatches", featureKey: "gold.dispatches" },
  { scope: "page", prefix: "/gold/dispatch", featureKey: "gold.dispatches" },
  { scope: "page", prefix: "/gold/settlement/receipts", featureKey: "gold.receipts" },
  { scope: "page", prefix: "/gold/receipt", featureKey: "gold.receipts" },
  { scope: "page", prefix: "/gold/reconciliation", featureKey: "gold.reconciliation" },
  { scope: "page", prefix: "/gold/exceptions", featureKey: "gold.exceptions" },
  { scope: "page", prefix: "/gold/audit", featureKey: "gold.audit-trail" },
  { scope: "page", prefix: "/gold/payouts", featureKey: "settlements.gold" },
  { scope: "page", prefix: "/gold/settlement/approvals", featureKey: "settlements.core" },
  { scope: "page", prefix: "/gold/settlement/payouts", featureKey: "settlements.gold" },
  { scope: "page", prefix: "/gold/settlement/runs", featureKey: "settlements.gold" },
  { scope: "page", prefix: "/gold/prices", featureKey: "gold.home" },
  { scope: "page", prefix: "/gold", featureKey: "gold.home" },

  { scope: "page", prefix: "/crm/leads", featureKey: "crm.leads" },
  { scope: "page", prefix: "/crm/deals", featureKey: "crm.leads" },
  { scope: "page", prefix: "/crm/people", featureKey: "crm.clients" },
  { scope: "page", prefix: "/crm/companies", featureKey: "crm.clients" },
  { scope: "page", prefix: "/crm/sites", featureKey: "crm.appointments" },
  { scope: "page", prefix: "/crm/clients", featureKey: "crm.clients" },
  { scope: "page", prefix: "/crm/appointments", featureKey: "crm.appointments" },
  { scope: "page", prefix: "/crm/tasks", featureKey: "crm.core" },
  { scope: "page", prefix: "/crm/import", featureKey: "crm.core" },
  { scope: "page", prefix: "/crm/follow-ups", featureKey: "crm.core" },
  { scope: "page", prefix: "/crm/forms", featureKey: "crm.intake" },
  { scope: "page", prefix: "/crm/insights", featureKey: "crm.insights" },
  { scope: "page", prefix: "/crm/reports", featureKey: "crm.insights" },
  { scope: "page", prefix: "/crm/collections", featureKey: "crm.documents" },
  { scope: "page", prefix: "/crm/quotes", featureKey: "crm.documents" },
  { scope: "page", prefix: "/crm/invoices", featureKey: "crm.documents" },
  { scope: "page", prefix: "/crm/receipts", featureKey: "crm.documents" },
  { scope: "page", prefix: "/crm/reps", featureKey: "crm.core" },
  { scope: "page", prefix: "/crm/work-orders", featureKey: "crm.core" },
  { scope: "page", prefix: "/crm/workflows", featureKey: "crm.settings" },
  { scope: "page", prefix: "/crm/settings", featureKey: "crm.settings" },
  { scope: "page", prefix: "/crm", featureKey: "crm.core" },

  { scope: "page", prefix: "/compliance", featureKey: "compliance.overview" },
  { scope: "page", prefix: "/management/master-data/hr/departments", featureKey: "hr.employees" },
  { scope: "page", prefix: "/management/master-data/hr/job-grades", featureKey: "hr.employees" },
  { scope: "page", prefix: "/management/master-data/operations/sites", featureKey: "admin.sites-sections" },
  { scope: "page", prefix: "/management/master-data/operations/sections", featureKey: "admin.sites-sections" },
  { scope: "page", prefix: "/management/master-data/operations/downtime-codes", featureKey: "maintenance.breakdowns" },
  { scope: "page", prefix: "/management/master-data/operations/gold-expense-types", featureKey: "gold.payouts" },
  // ST-1.3 — the scrap materials and scrap sellers master-data screens went
  // with the module. They fall back to the bare `/management/master-data` entry
  // below, so they answer `admin.sites-sections` until ST-2 removes the pages.
  { scope: "page", prefix: "/management/master-data", featureKey: "admin.sites-sections" },
  { scope: "page", prefix: "/management/users/create", featureKey: "admin.user-management.create" },
  { scope: "page", prefix: "/management/users/status", featureKey: "admin.user-management.status" },
  { scope: "page", prefix: "/management/users/password-reset", featureKey: "admin.user-management.password-reset" },
  { scope: "page", prefix: "/management/users/role-change", featureKey: "admin.user-management.role-change" },
  { scope: "page", prefix: "/management/users", featureKey: "admin.user-management.directory" },
  { scope: "page", prefix: "/user-management/create", featureKey: "admin.user-management.create" },
  { scope: "page", prefix: "/user-management/status", featureKey: "admin.user-management.status" },
  { scope: "page", prefix: "/user-management/password-reset", featureKey: "admin.user-management.password-reset" },
  { scope: "page", prefix: "/user-management/role-change", featureKey: "admin.user-management.role-change" },
  { scope: "page", prefix: "/user-management", featureKey: "admin.user-management.directory" },
  { scope: "page", prefix: "/shift-report", featureKey: "ops.shift-report.submit" },
  { scope: "page", prefix: "/plant-report", featureKey: "ops.plant-report.submit" },
  // The production dashboard is built entirely on plant reports; gate it with
  // the same mining reporting feature so it never fail-opens into non-mining
  // workspaces.
  // Reads as the workspace landing page and is not: `/dashboard` charts plant
  // reports (`fetchPlantReports`), so `reports.plant` is the right gate and a
  // non-mining tenant is correctly refused. Tenants land on their vertical's
  // `preferredHomeHref` — /gold, /schools, /retail — never here.
  { scope: "page", prefix: "/dashboard", featureKey: "reports.plant" },

  // ST-1.3 — `/reports/cctv-events` left with the surveillance module. It falls
  // back to the bare `/reports` entry at the end of this block, so it answers
  // `reports.dashboard` until ST-2 removes the page.
  { scope: "page", prefix: "/reports/compliance-incidents", featureKey: "reports.compliance-incidents" },
  { scope: "page", prefix: "/reports/downtime", featureKey: "reports.downtime-analytics" },
  { scope: "page", prefix: "/reports/maintenance-work-orders", featureKey: "reports.maintenance-work-orders" },
  { scope: "page", prefix: "/reports/maintenance-equipment", featureKey: "reports.maintenance-equipment" },
  { scope: "page", prefix: "/reports/gold-chain", featureKey: "reports.gold-chain" },
  { scope: "page", prefix: "/reports/gold-receipts", featureKey: "reports.gold-receipts" },
  { scope: "page", prefix: "/reports/audit-trails", featureKey: "reports.audit-trails" },
  { scope: "page", prefix: "/reports/fuel-ledger", featureKey: "reports.fuel-ledger" },
  { scope: "page", prefix: "/reports/stores-movements", featureKey: "reports.stores-movements" },
  { scope: "page", prefix: "/reports/attendance", featureKey: "reports.attendance" },
  { scope: "page", prefix: "/reports/shift", featureKey: "reports.shift" },
  { scope: "page", prefix: "/reports/plant", featureKey: "reports.plant" },
  { scope: "page", prefix: "/reports", featureKey: "reports.dashboard" },
];

export const API_FEATURE_ROUTES: FeatureRouteEntry[] = [
  { scope: "api", prefix: "/api/notifications/push-subscriptions", featureKey: "core.notifications.push" },
  { scope: "api", prefix: "/api/notifications", featureKey: "core.notifications.center" },
  { scope: "api", prefix: "/api/settings/branding/domain/verify", featureKey: "core.branding.custom-domain" },
  { scope: "api", prefix: "/api/settings/branding/domain", featureKey: "core.branding.custom-domain" },
  { scope: "api", prefix: "/api/settings/branding", featureKey: "core.branding.manage" },
  { scope: "api", prefix: "/api/document-templates", featureKey: "core.branding.manage" },

  { scope: "api", prefix: "/api/users/create", featureKey: "admin.user-management.create" },
  { scope: "api", prefix: "/api/users/status", featureKey: "admin.user-management.status" },
  { scope: "api", prefix: "/api/users/password-reset", featureKey: "admin.user-management.password-reset" },
  { scope: "api", prefix: "/api/users/role-change", featureKey: "admin.user-management.role-change" },
  { scope: "api", prefix: "/api/users/access/reset", featureKey: "admin.user-management.feature-access" },
  { scope: "api", prefix: "/api/users/access", featureKey: "admin.user-management.feature-access" },
  { scope: "api", prefix: "/api/users", featureKey: "admin.user-management.directory" },
  { scope: "api", prefix: "/api/sites", featureKey: "admin.sites-sections" },
  { scope: "api", prefix: "/api/sections", featureKey: "admin.sites-sections" },
  { scope: "api", prefix: "/api/payroll/config", featureKey: "admin.payroll-config" },

  { scope: "api", prefix: "/api/shift-reports", featureKey: "ops.shift-report.submit" },
  { scope: "api", prefix: "/api/plant-reports", featureKey: "ops.plant-report.submit" },

  // Longest prefix wins, so these must precede the bare `/api/payroll`.
  { scope: "api", prefix: "/api/payroll/returns", featureKey: "hr.statutory-returns" },
  { scope: "api", prefix: "/api/payroll/statutory", featureKey: "hr.statutory-tables" },
  { scope: "api", prefix: "/api/payroll", featureKey: "hr.payroll" },
  { scope: "api", prefix: "/api/disbursements", featureKey: "hr.disbursements" },
  { scope: "api", prefix: "/api/compensation", featureKey: "hr.compensation-rules" },
  { scope: "api", prefix: "/api/employee-payments", featureKey: "hr.salaries" },
  // SS-1.1 — adjustment approve/reject/submit already ask
  // `hrPermissionDenial(session, "hr.payroll", ...)` inside the handler; without
  // an entry here the route itself was ungated, so the module gate ran only
  // where somebody remembered to write it. Same key, one layer earlier.
  { scope: "api", prefix: "/api/adjustments", featureKey: "hr.payroll" },
  { scope: "api", prefix: "/api/approvals/history", featureKey: "hr.approvals-history" },
  { scope: "api", prefix: "/api/people/leave", featureKey: "hr.leave" },
  { scope: "api", prefix: "/api/people/attendance", featureKey: "hr.attendance" },
  { scope: "api", prefix: "/api/hr/incidents", featureKey: "hr.incidents" },
  { scope: "api", prefix: "/api/hr/disciplinary-actions", featureKey: "hr.disciplinary-actions" },
  // Longest prefix wins, so the bare /api/settlements entry stays last of the
  // three or it swallows the two below it.
  { scope: "api", prefix: "/api/settlements/runs", featureKey: "settlements.core" },
  { scope: "api", prefix: "/api/settlements/batches", featureKey: "settlements.core" },
  { scope: "api", prefix: "/api/settlements/intakes", featureKey: "settlements.core" },
  { scope: "api", prefix: "/api/settlements", featureKey: "settlements.core" },
  { scope: "api", prefix: "/api/hr/shift-group-schedules", featureKey: "hr.employees" },
  { scope: "api", prefix: "/api/people/rosters", featureKey: "hr.employees" },
  { scope: "api", prefix: "/api/departments", featureKey: "hr.employees" },
  { scope: "api", prefix: "/api/job-grades", featureKey: "hr.employees" },
  { scope: "api", prefix: "/api/employees", featureKey: "hr.employees" },

  { scope: "api", prefix: "/api/gold/dispatches", featureKey: "gold.dispatches" },
  { scope: "api", prefix: "/api/gold/receipts", featureKey: "gold.receipts" },
  { scope: "api", prefix: "/api/gold/pours", featureKey: "gold.intake.pours" },
  { scope: "api", prefix: "/api/gold/purchases", featureKey: "gold.intake.pours" },
  { scope: "api", prefix: "/api/gold/corrections", featureKey: "gold.reconciliation" },
  { scope: "api", prefix: "/api/gold/shift-allocations", featureKey: "gold.payouts" },
  { scope: "api", prefix: "/api/gold/expense-types", featureKey: "gold.payouts" },
  { scope: "api", prefix: "/api/gold/prices", featureKey: "gold.home" },
  // SS-1.1 — the module fallback, deliberately last of the gold block (longest
  // prefix wins). Before this entry `/api/gold/imports`, `/api/gold/summary`,
  // `/api/gold/period-close`, `/api/gold/shift-output` and `/api/gold/reports/*`
  // matched nothing and so were reachable by any signed-in user in any tenant,
  // gold or not. `gold.home` rather than a per-screen key because every other
  // `gold.*` feature declares it as a dependency, so no tenant that holds any
  // gold entitlement can fail this gate.
  { scope: "api", prefix: "/api/gold", featureKey: "gold.home" },

  { scope: "api", prefix: "/api/inventory/items", featureKey: "stores.inventory" },
  { scope: "api", prefix: "/api/inventory/movements", featureKey: "stores.movements" },
  { scope: "api", prefix: "/api/stock-locations", featureKey: "stores.inventory" },

  { scope: "api", prefix: "/api/accounting/coa", featureKey: "accounting.chart-of-accounts" },
  { scope: "api", prefix: "/api/accounting/journals", featureKey: "accounting.journals" },
  { scope: "api", prefix: "/api/accounting/periods", featureKey: "accounting.periods" },
  { scope: "api", prefix: "/api/accounting/posting-rules", featureKey: "accounting.posting-rules" },
  { scope: "api", prefix: "/api/accounting/reports/general-ledger", featureKey: "accounting.financial-statements" },
  { scope: "api", prefix: "/api/accounting/reports/trial-balance", featureKey: "accounting.trial-balance" },
  { scope: "api", prefix: "/api/accounting/reports/financials", featureKey: "accounting.financial-statements" },
  { scope: "api", prefix: "/api/accounting/reports/cash-flow", featureKey: "accounting.financial-statements" },
  { scope: "api", prefix: "/api/accounting/hubs/receivables-summary", featureKey: "accounting.ar" },
  { scope: "api", prefix: "/api/accounting/hubs/payables-summary", featureKey: "accounting.ap" },
  {
    scope: "api",
    prefix: "/api/accounting/hubs/financial-reports-summary",
    featureKey: "accounting.financial-statements",
  },
  { scope: "api", prefix: "/api/accounting/reports/ar-aging", featureKey: "accounting.ar" },
  { scope: "api", prefix: "/api/accounting/reports/customer-statement", featureKey: "accounting.ar" },
  { scope: "api", prefix: "/api/accounting/reports/ap-aging", featureKey: "accounting.ap" },
  { scope: "api", prefix: "/api/accounting/reports/vendor-statement", featureKey: "accounting.ap" },
  { scope: "api", prefix: "/api/accounting/reports/vat-summary", featureKey: "accounting.tax" },
  { scope: "api", prefix: "/api/accounting/vat-returns", featureKey: "accounting.tax" },
  { scope: "api", prefix: "/api/accounting/closing", featureKey: "accounting.periods" },
  { scope: "api", prefix: "/api/accounting/payment-ledger", featureKey: "accounting.core" },
  { scope: "api", prefix: "/api/accounting/sales", featureKey: "accounting.ar" },
  { scope: "api", prefix: "/api/accounting/sales/quotations", featureKey: "accounting.ar" },
  { scope: "api", prefix: "/api/accounting/purchases", featureKey: "accounting.ap" },
  { scope: "api", prefix: "/api/accounting/banking", featureKey: "accounting.banking" },
  { scope: "api", prefix: "/api/accounting/cost-centers", featureKey: "accounting.cost-centers" },
  { scope: "api", prefix: "/api/accounting/currency", featureKey: "accounting.multi-currency" },
  { scope: "api", prefix: "/api/accounting/tax", featureKey: "accounting.tax" },
  { scope: "api", prefix: "/api/accounting/fiscalisation", featureKey: "accounting.zimra.fiscalisation" },
  { scope: "api", prefix: "/api/accounting", featureKey: "accounting.core" },

  { scope: "api", prefix: "/api/schools/admissions", featureKey: "schools.admissions" },
  { scope: "api", prefix: "/api/schools/students", featureKey: "schools.students" },
  { scope: "api", prefix: "/api/schools/guardians", featureKey: "schools.students" },
  { scope: "api", prefix: "/api/schools/enrollments", featureKey: "schools.admissions" },
  { scope: "api", prefix: "/api/schools/attendance", featureKey: "schools.attendance" },
  { scope: "api", prefix: "/api/schools/fees", featureKey: "schools.fees" },
  { scope: "api", prefix: "/api/schools/boarding", featureKey: "schools.boarding" },
  { scope: "api", prefix: "/api/schools/teachers", featureKey: "schools.teachers" },
  { scope: "api", prefix: "/api/schools/results", featureKey: "schools.results" },
  { scope: "api", prefix: "/api/schools/portal/parent", featureKey: "schools.portal.parent" },
  { scope: "api", prefix: "/api/schools/portal/student", featureKey: "schools.portal.student" },
  { scope: "api", prefix: "/api/schools/portal/teacher", featureKey: "schools.portal.teacher" },
  { scope: "api", prefix: "/api/schools", featureKey: "schools.core" },
  { scope: "api", prefix: "/api/v2/schools/admissions", featureKey: "schools.admissions" },
  // S-3.3 — importing a school that is switching systems. Gated on
  // `schools.students` because that is the smallest thing an import always
  // writes; the fee and opening-balance entity types additionally need
  // `schools.fees`, which `importPermissionDenial` enforces per request.
  // S-4.2 — `/api/v2/records/**` is DELIBERATELY ABSENT from this registry.
  //
  // Those routes serve subjects from more than one module, and an entry here can
  // name only one feature — which is the exact trap they exist to escape:
  // /api/v2/crm/files is gated on `crm.core` and so refused every school before
  // its handler ran, however well the storage supported a student. An
  // unregistered path is allowed through by `canAccessRouteWithToken`, and
  // `app/api/v2/records/_guard.ts` then checks the feature AND the role per
  // subject type. Do not "fix" this by adding a prefix entry; that would put one
  // module's gate back in front of every module's records.
  { scope: "api", prefix: "/api/v2/schools/imports", featureKey: "schools.students" },
  // S-4.4 — a school's own fields on a pupil or a parent. The same engine as
  // /api/v2/crm/field-definitions, behind a gate a school can actually pass:
  // that route is registered against `crm.settings`, which no school has.
  { scope: "api", prefix: "/api/v2/schools/field-definitions", featureKey: "schools.students" },
  { scope: "api", prefix: "/api/v2/schools/students", featureKey: "schools.students" },
  { scope: "api", prefix: "/api/v2/schools/guardians", featureKey: "schools.students" },
  { scope: "api", prefix: "/api/v2/schools/enrollments", featureKey: "schools.admissions" },
  { scope: "api", prefix: "/api/v2/schools/attendance/sessions", featureKey: "schools.attendance" },
  { scope: "api", prefix: "/api/v2/schools/attendance", featureKey: "schools.attendance" },
  { scope: "api", prefix: "/api/v2/schools/fees", featureKey: "schools.fees" },
  { scope: "api", prefix: "/api/v2/schools/finance", featureKey: "schools.fees" },
  { scope: "api", prefix: "/api/v2/schools/notices", featureKey: "schools.core" },
  { scope: "api", prefix: "/api/v2/schools/boarding", featureKey: "schools.boarding" },
  { scope: "api", prefix: "/api/v2/schools/teachers", featureKey: "schools.teachers" },
  { scope: "api", prefix: "/api/v2/schools/results", featureKey: "schools.results" },
  { scope: "api", prefix: "/api/v2/schools/assessments", featureKey: "schools.results" },
  { scope: "api", prefix: "/api/v2/schools/assignments", featureKey: "schools.core" },
  { scope: "api", prefix: "/api/v2/schools/library", featureKey: "schools.core" },
  { scope: "api", prefix: "/api/v2/schools/lesson-plans", featureKey: "schools.core" },
  { scope: "api", prefix: "/api/v2/schools/messages", featureKey: "schools.core" },
  { scope: "api", prefix: "/api/v2/schools/syllabus", featureKey: "schools.core" },
  { scope: "api", prefix: "/api/v2/schools/teaching-resources", featureKey: "schools.core" },
  { scope: "api", prefix: "/api/v2/schools/transport", featureKey: "schools.core" },
  { scope: "api", prefix: "/api/v2/schools/meetings", featureKey: "schools.core" },
  { scope: "api", prefix: "/api/v2/schools/goals", featureKey: "schools.core" },
  { scope: "api", prefix: "/api/v2/schools/health", featureKey: "schools.boarding" },
  { scope: "api", prefix: "/api/v2/schools/applications", featureKey: "schools.admissions" },
  { scope: "api", prefix: "/api/v2/schools/year-rollup", featureKey: "schools.students" },
  { scope: "api", prefix: "/api/v2/schools/grading-schemes", featureKey: "schools.results" },
  { scope: "api", prefix: "/api/v2/schools/portal/parent/children", featureKey: "schools.portal.parent" },
  { scope: "api", prefix: "/api/v2/schools/portal/student/me/homework", featureKey: "schools.portal.student" },
  { scope: "api", prefix: "/api/v2/schools/portal/student/me/library", featureKey: "schools.portal.student" },
  { scope: "api", prefix: "/api/v2/schools/portal/student/me/subjects", featureKey: "schools.portal.student" },
  { scope: "api", prefix: "/api/v2/schools/portal/student/me", featureKey: "schools.portal.student" },
  { scope: "api", prefix: "/api/v2/schools/portal/teacher/me/reports", featureKey: "schools.portal.teacher" },
  { scope: "api", prefix: "/api/v2/schools/portal/teacher/me", featureKey: "schools.portal.teacher" },
  { scope: "api", prefix: "/api/v2/schools/portal/parent", featureKey: "schools.portal.parent" },
  { scope: "api", prefix: "/api/v2/schools/portal/student", featureKey: "schools.portal.student" },
  { scope: "api", prefix: "/api/v2/schools/portal/teacher", featureKey: "schools.portal.teacher" },
  { scope: "api", prefix: "/api/v2/schools", featureKey: "schools.core" },

  { scope: "api", prefix: "/api/retail/customers", featureKey: "crm.customers" },
  { scope: "api", prefix: "/api/retail/catalog", featureKey: "retail.catalog" },
  { scope: "api", prefix: "/api/retail/purchasing", featureKey: "retail.purchasing" },
  { scope: "api", prefix: "/api/retail/promotions", featureKey: "retail.promotions" },
  { scope: "api", prefix: "/api/retail/shifts", featureKey: "retail.shifts" },
  { scope: "api", prefix: "/api/retail/pos", featureKey: "retail.pos" },
  { scope: "api", prefix: "/api/retail/reports", featureKey: "retail.reports" },
  { scope: "api", prefix: "/api/retail", featureKey: "retail.core" },
  { scope: "api", prefix: "/api/thrift", featureKey: "retail.core" },
  { scope: "api", prefix: "/api/v2/inventory/products", featureKey: "stores.inventory" },
  { scope: "api", prefix: "/api/v2/inventory/price-lists", featureKey: "stores.inventory" },
  { scope: "api", prefix: "/api/v2/inventory/stock-items", featureKey: "stores.inventory" },
  // SS-1.1 — "what is in this store" reads the same stock the three entries
  // above gate; it was the one sibling with no entry.
  { scope: "api", prefix: "/api/v2/inventory/locations", featureKey: "stores.inventory" },
  { scope: "api", prefix: "/api/v2/retail/customers", featureKey: "crm.customers" },
  { scope: "api", prefix: "/api/v2/retail/catalog", featureKey: "retail.catalog" },
  { scope: "api", prefix: "/api/v2/retail/purchasing", featureKey: "retail.purchasing" },
  { scope: "api", prefix: "/api/v2/retail/promotions", featureKey: "retail.promotions" },
  { scope: "api", prefix: "/api/v2/retail/shifts", featureKey: "retail.shifts" },
  { scope: "api", prefix: "/api/v2/retail/pos", featureKey: "retail.pos" },
  { scope: "api", prefix: "/api/v2/retail/reports", featureKey: "retail.reports" },
  { scope: "api", prefix: "/api/v2/retail", featureKey: "retail.core" },
  { scope: "api", prefix: "/api/v2/thrift", featureKey: "retail.core" },
  // SS-1.1 — the till's own v2 collection endpoint, which sits outside the
  // `/api/v2/retail` tree and so matched nothing. `/api/v2/portal` does not
  // collide with it: prefix matching is literal, and "por" is not "pos".
  { scope: "api", prefix: "/api/v2/pos", featureKey: "retail.pos" },

  { scope: "api", prefix: "/api/portal/parent", featureKey: "schools.portal.parent" },
  { scope: "api", prefix: "/api/portal/student", featureKey: "schools.portal.student" },
  { scope: "api", prefix: "/api/portal/teacher", featureKey: "schools.portal.teacher" },
  { scope: "api", prefix: "/api/portal/schools", featureKey: "portal.schools" },
  { scope: "api", prefix: "/api/portal/thrift", featureKey: "portal.pos" },
  { scope: "api", prefix: "/api/portal", featureKey: "portal.core" },
  { scope: "api", prefix: "/api/v2/portal/parent", featureKey: "schools.portal.parent" },
  { scope: "api", prefix: "/api/v2/portal/parent/children", featureKey: "schools.portal.parent" },
  { scope: "api", prefix: "/api/v2/portal/student/me", featureKey: "schools.portal.student" },
  { scope: "api", prefix: "/api/v2/portal/student", featureKey: "schools.portal.student" },
  { scope: "api", prefix: "/api/v2/portal/teacher/me", featureKey: "schools.portal.teacher" },
  { scope: "api", prefix: "/api/v2/portal/teacher", featureKey: "schools.portal.teacher" },
  { scope: "api", prefix: "/api/v2/portal/schools", featureKey: "portal.schools" },
  { scope: "api", prefix: "/api/v2/portal/thrift", featureKey: "portal.pos" },
  { scope: "api", prefix: "/api/v2/portal", featureKey: "portal.core" },

  { scope: "api", prefix: "/api/v2/crm/intake-forms", featureKey: "crm.intake" },
  { scope: "api", prefix: "/api/v2/crm/submissions", featureKey: "crm.intake" },
  { scope: "api", prefix: "/api/v2/crm/api-keys", featureKey: "crm.settings" },
  { scope: "api", prefix: "/api/v2/crm/commissions", featureKey: "crm.commissions" },
  { scope: "api", prefix: "/api/v2/crm/insights", featureKey: "crm.insights" },
  { scope: "api", prefix: "/api/v2/crm/reports", featureKey: "crm.insights" },
  { scope: "api", prefix: "/api/v2/crm/automations", featureKey: "crm.settings" },
  { scope: "api", prefix: "/api/v2/crm/collections", featureKey: "crm.documents" },
  { scope: "api", prefix: "/api/v2/crm/documents", featureKey: "crm.documents" },
  { scope: "api", prefix: "/api/v2/crm/reps", featureKey: "crm.core" },
  { scope: "api", prefix: "/api/v2/crm/work-orders", featureKey: "crm.core" },
  { scope: "api", prefix: "/api/v2/crm/discount-approvals", featureKey: "crm.documents" },
  { scope: "api", prefix: "/api/v2/crm/clients", featureKey: "crm.clients" },
  { scope: "api", prefix: "/api/v2/crm/appointments", featureKey: "crm.appointments" },
  { scope: "api", prefix: "/api/v2/crm/follow-ups", featureKey: "crm.core" },
  { scope: "api", prefix: "/api/v2/crm/leads", featureKey: "crm.leads" },
  { scope: "api", prefix: "/api/v2/crm/deals", featureKey: "crm.leads" },
  { scope: "api", prefix: "/api/v2/crm/people", featureKey: "crm.clients" },
  { scope: "api", prefix: "/api/v2/crm/companies", featureKey: "crm.clients" },
  { scope: "api", prefix: "/api/v2/crm/sites", featureKey: "crm.appointments" },
  { scope: "api", prefix: "/api/v2/crm/pipelines", featureKey: "crm.settings" },
  { scope: "api", prefix: "/api/v2/crm/field-definitions", featureKey: "crm.settings" },
  { scope: "api", prefix: "/api/v2/crm/tasks", featureKey: "crm.core" },
  { scope: "api", prefix: "/api/v2/crm/import", featureKey: "crm.core" },
  { scope: "api", prefix: "/api/v2/crm/comments", featureKey: "crm.core" },
  { scope: "api", prefix: "/api/v2/crm/followers", featureKey: "crm.core" },
  { scope: "api", prefix: "/api/v2/crm/lists", featureKey: "crm.core" },
  { scope: "api", prefix: "/api/v2/crm/uploads", featureKey: "crm.core" },
  { scope: "api", prefix: "/api/v2/crm", featureKey: "crm.core" },

  { scope: "api", prefix: "/api/work-orders", featureKey: "maintenance.work-orders" },
  { scope: "api", prefix: "/api/equipment", featureKey: "maintenance.equipment" },
  { scope: "api", prefix: "/api/analytics/downtime", featureKey: "reports.downtime-analytics" },
  { scope: "api", prefix: "/api/downtime-codes", featureKey: "maintenance.breakdowns" },

  { scope: "api", prefix: "/api/compliance/permits", featureKey: "compliance.permits" },
  { scope: "api", prefix: "/api/compliance/inspections", featureKey: "compliance.inspections" },
  { scope: "api", prefix: "/api/compliance/incidents", featureKey: "compliance.incidents" },
  { scope: "api", prefix: "/api/compliance/training-records", featureKey: "compliance.training-records" },
];

function normalizePath(pathname: string): string {
  const value = pathname.trim();
  if (!value) return "/";
  return value.startsWith("/") ? value : `/${value}`;
}

function sortByPrefixLength<T extends { prefix: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => b.prefix.length - a.prefix.length);
}

const PAGE_PREFIX_SORTED = sortByPrefixLength(PAGE_FEATURE_ROUTES);
const API_PREFIX_SORTED = sortByPrefixLength(API_FEATURE_ROUTES);

/**
 * The feature a path is gated on, or null for a path that is not a gated surface.
 *
 * SS-1.1 — null is load-bearing now that the policy denies by default. "No entry
 * here" cannot mean "denied": this registry is a hand-maintained list against a
 * router with 900-odd routes, and the day it forgets one, that route would go
 * dark in production for every tenant at once. So the two failure modes are
 * deliberately asymmetric — unmapped means ungated and passes; mapped-but-not-
 * entitled is refused. Forgetting an entry leaves a route open, which is the
 * pre-existing state and is caught by review and by the coverage audit, rather
 * than taking a paying workspace off the air.
 */
export function resolveFeatureKeyForPath(pathname: string): string | null {
  const normalizedPath = normalizePath(pathname).toLowerCase();
  const prefixes = normalizedPath.startsWith("/api/") ? API_PREFIX_SORTED : PAGE_PREFIX_SORTED;
  const match = prefixes.find((row) => normalizedPath.startsWith(row.prefix.toLowerCase()));
  return match?.featureKey ?? null;
}

export function getAllRouteFeatureKeys(): string[] {
  return Array.from(new Set([...PAGE_FEATURE_ROUTES, ...API_FEATURE_ROUTES].map((row) => row.featureKey))).sort();
}
