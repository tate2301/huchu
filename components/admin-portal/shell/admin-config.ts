"use client";

import {
  Building2,
  Dashboard,
  FileText,
  ManageAccounts,
  Settings2,
  ShieldAlert,
  Wallet,
  type LucideIcon,
} from "@/lib/icons";
import type { AdminQuickAction } from "@/components/admin-portal/types";

export type AdminNavItem = {
  href: string;
  label: string;
  description?: string;
  icon: LucideIcon;
};

export const PLATFORM_NAV: AdminNavItem[] = [
  { href: "/admin/dashboard", label: "Dashboard", description: "Live queues and operator actions.", icon: Dashboard },
  { href: "/admin/clients", label: "Workspaces", description: "Directory, health, and workspace drill-down.", icon: Building2 },
  { href: "/admin/identity", label: "Identity", description: "Admins, users, and access posture.", icon: ManageAccounts },
  { href: "/admin/support-access", label: "Support Access", description: "Requests, launches, and sessions.", icon: FileText },
  { href: "/admin/reliability", label: "Reliability", description: "Incidents, contracts, runbooks, and audit.", icon: ShieldAlert },
  { href: "/admin/commercial", label: "Commercial", description: "Plans, templates, add-ons, and feature access.", icon: Wallet },
  { href: "/admin/settings", label: "Settings", description: "Portal defaults and operator preferences.", icon: Settings2 },
];

export function getCompanyNav(companyId: string): AdminNavItem[] {
  return [
    { href: `/admin/clients/${companyId}`, label: "Workspace Overview", description: "Health, pricing, and next actions.", icon: Dashboard },
    { href: `/admin/company/${companyId}/identity`, label: "Identity", description: "Workspace admins and users.", icon: ManageAccounts },
    { href: `/admin/company/${companyId}/support-access`, label: "Support Access", description: "Requests and support sessions.", icon: FileText },
    { href: `/admin/company/${companyId}/reliability`, label: "Reliability", description: "Incidents, contracts, runbooks, and audit.", icon: ShieldAlert },
    { href: `/admin/company/${companyId}/commercial`, label: "Commercial", description: "Plan, add-ons, templates, and features.", icon: Wallet },
  ];
}

export function getQuickActions(activeCompanyId?: string): AdminQuickAction[] {
  const companyId = activeCompanyId ?? null;

  return [
    {
      id: "quick-provision-client",
      label: "Provision client",
      description: "Launch client onboarding and template setup.",
      href: "/admin/clients",
      scope: "platform",
    },
    {
      id: "quick-start-support",
      label: "Start support session",
      description: "Open support access and impersonation workflows.",
      href: companyId ? `/admin/company/${companyId}/support-access` : "/admin/support-access",
      scope: companyId ? "organization" : "platform",
    },
    {
      id: "quick-identity",
      label: "Manage identity",
      description: "Open admins, users, support requests, and live sessions.",
      href: companyId ? `/admin/company/${companyId}/identity` : "/admin/identity",
      scope: companyId ? "organization" : "platform",
    },
    {
      id: "quick-review-reliability",
      label: "Review reliability",
      description: "Inspect incidents, contracts, runbooks, and audit posture.",
      href: companyId ? `/admin/company/${companyId}/reliability` : "/admin/reliability",
      scope: companyId ? "organization" : "platform",
    },
    {
      id: "quick-workspace-overview",
      label: companyId ? "Open workspace overview" : "Open workspace directory",
      description: companyId
        ? "Review workspace summary, health, and next actions."
        : "Jump into workspace state, health, and ownership context.",
      href: companyId ? `/admin/clients/${companyId}` : "/admin/clients",
      scope: companyId ? "organization" : "platform",
    },
    {
      id: "quick-pricing",
      label: "Review commercial state",
      description: "Inspect plans, templates, add-ons, and feature access.",
      href: companyId ? `/admin/company/${companyId}/commercial?view=subscription` : "/admin/commercial?view=subscriptions",
      scope: companyId ? "organization" : "platform",
    },
    {
      id: "quick-sync-catalog",
      label: "Sync catalog",
      description: "Review bundles, templates, and feature catalog drift.",
      href: "/admin/commercial?view=bundles",
      scope: "platform",
    },
  ];
}

export function getAdminRouteForModule(moduleId: string, companyId?: string) {
  switch (moduleId) {
    case "org":
    case "site":
      return companyId ? `/admin/clients/${companyId}` : "/admin/clients";
    case "subscription":
    case "feature":
      return companyId ? `/admin/company/${companyId}/commercial` : "/admin/commercial";
    case "admin":
    case "user":
      return companyId ? `/admin/company/${companyId}/identity` : "/admin/identity";
    case "support":
      return companyId ? `/admin/company/${companyId}/support-access` : "/admin/support-access";
    case "runbook":
    case "health":
    case "contract":
    case "audit":
      return companyId ? `/admin/company/${companyId}/reliability` : "/admin/reliability";
    default:
      return "/admin/dashboard";
  }
}
