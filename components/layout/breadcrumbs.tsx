"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronRight } from "@/lib/icons";

type Crumb = {
  label: string;
  href?: string;
};

const routeLabels: Record<string, string> = {
  analytics: "Downtime Analytics",
  attendance: "Attendance",
  cctv: "CCTV",
  dashboard: "Production Dashboard",
  "user-management": "User Management",
  management: "Management",
  users: "Users",
  gold: "Gold Control",
  accounting: "Accounting",
  maintenance: "Maintenance",
  "human-resources": "Human Resources",
  "plant-report": "Plant Report",
  reports: "Reports",
  shift: "Shift",
  "shift-report": "Shift Report",
  stores: "Stock & Fuel",
  "password-reset": "Password Reset",
  "role-change": "Role Change",
};

const viewLabels: Record<string, Record<string, string>> = {
  maintenance: {
    dashboard: "Dashboard",
    equipment: "Equipment Register",
    "work-orders": "Work Orders",
    breakdown: "Log Breakdown",
    schedule: "PM Schedule",
  },
  stores: {
    dashboard: "Dashboard",
    inventory: "Stock on Hand",
    movements: "Action Log",
    fuel: "Fuel Ledger",
    issue: "Issue Stock",
    receive: "Receive Stock",
  },
  gold: {
    menu: "Overview",
    pour: "Log Gold Output",
    dispatch: "Create Dispatch",
    receipt: "Buyer Receipt",
    payouts: "Worker Payouts",
    reconciliation: "Reconciliation",
    audit: "Audit Trail",
  },
  cctv: {
    overview: "Overview",
    live: "Live Monitor",
    cameras: "Cameras",
    nvrs: "NVRs",
    events: "Events",
    playback: "Playback",
    "access-logs": "Access Logs",
  },
  "human-resources": {
    payouts: "Payouts",
    salaries: "Salary Ops",
    incidents: "Workforce Incidents",
    compensation: "Compensation",
    payroll: "Payroll",
    disbursements: "Disbursements",
    approvals: "Approvals",
  },
  accounting: {
    "chart-of-accounts": "Chart of Accounts",
    journals: "Journal Entries",
    periods: "Accounting Periods",
    "posting-rules": "Posting Rules",
    "trial-balance": "Trial Balance",
    "financial-statements": "Financial Statements",
    sales: "Sales (AR)",
    purchases: "Purchases (AP)",
    banking: "Banking",
    assets: "Fixed Assets",
    budgets: "Budgets",
    "cost-centers": "Cost Centers",
    currency: "Currency Rates",
    tax: "Tax Setup",
    fiscalisation: "ZIMRA Fiscalisation",
  },
};

function toTitleCase(value: string) {
  return value
    .split("-")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function buildCrumbs(pathname: string, view?: string | null): Crumb[] {
  const segments = pathname.split("/").filter(Boolean);
  const crumbs: Crumb[] = [{ label: "Home", href: "/" }];

  segments.forEach((segment, index) => {
    const href = `/${segments.slice(0, index + 1).join("/")}`;
    let label = routeLabels[segment] ?? toTitleCase(segment);
    if (index === 1) {
      const base = segments[0];
      const override = viewLabels[base]?.[segment];
      if (override) label = override;
    }
    crumbs.push({ label, href });
  });

  if (view && segments.length > 0) {
    const base = segments[0];
    const viewLabel = viewLabels[base]?.[view] ?? toTitleCase(view);
    crumbs.push({ label: viewLabel });
  }

  return crumbs;
}

export function Breadcrumbs() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const view = searchParams.get("view");
  const crumbs = React.useMemo(
    () => buildCrumbs(pathname, view),
    [pathname, view],
  );

  return (
    <nav
      aria-label="Breadcrumb"
      className="flex items-center gap-2 text-sm text-muted-foreground"
    >
      {crumbs.map((crumb, index) => {
        const isLast = index === crumbs.length - 1;
        return (
          <React.Fragment key={`${crumb.label}-${index}`}>
            {index > 0 ? (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/70" />
            ) : null}
            {crumb.href && !isLast ? (
              <Link className="hover:text-foreground" href={crumb.href}>
                {crumb.label}
              </Link>
            ) : (
              <span className={isLast ? "text-foreground font-semibold" : ""}>
                {crumb.label}
              </span>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}
