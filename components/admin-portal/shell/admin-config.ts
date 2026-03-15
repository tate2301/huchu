"use client";

import type { AdminQuickAction } from "@/components/admin-portal/types";

export type AdminNavItem = {
  href: string;
  label: string;
  description: string;
};

export const PLATFORM_NAV: AdminNavItem[] = [
  { href: "/admin/dashboard", label: "Dashboard", description: "Platform cockpit and quick actions." },
  { href: "/admin/clients", label: "Clients", description: "Workspace directory and lifecycle controls." },
  { href: "/admin/identity", label: "Identity", description: "Admins, users, support sessions, and impersonation." },
  { href: "/admin/subscriptions", label: "Subscriptions", description: "Plans, pricing, and health states." },
  { href: "/admin/add-ons", label: "Add-ons", description: "Bundle and add-on management." },
  { href: "/admin/templates", label: "Templates", description: "Client templates and onboarding presets." },
  { href: "/admin/feature-catalog", label: "Feature Catalog", description: "Feature access and advanced overrides." },
  { href: "/admin/support-access", label: "Support Access", description: "Impersonation and support sessions." },
  { href: "/admin/health", label: "Health", description: "Incidents, drift, and remediation." },
  { href: "/admin/audit-log", label: "Audit Log", description: "Operator history and evidence." },
  { href: "/admin/settings", label: "Settings", description: "Portal and operator preferences." },
];

export function getCompanyNav(companyId: string): AdminNavItem[] {
  return [
    { href: `/admin/clients/${companyId}`, label: "Overview", description: "Client health and pricing context." },
    { href: `/admin/company/${companyId}/identity`, label: "Identity", description: "Workspace admins, users, and support sessions." },
    { href: `/admin/company/${companyId}/operations`, label: "Operations", description: "Organization-scoped action catalog." },
    { href: `/admin/clients/${companyId}#subscription`, label: "Subscription", description: "Plan, billing, and pricing changes." },
    { href: `/admin/clients/${companyId}#addons`, label: "Add-ons", description: "Bundle and entitlement changes." },
    { href: `/admin/clients/${companyId}#features`, label: "Features", description: "Effective feature access." },
    { href: `/admin/clients/${companyId}#audit`, label: "Audit", description: "Workspace history and actions." },
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
      id: "quick-sync-catalog",
      label: "Sync catalog",
      description: "Review bundles, templates, and feature catalog drift.",
      href: "/admin/feature-catalog",
      scope: "platform",
    },
    {
      id: "quick-start-support",
      label: "Start support session",
      description: "Open support access and impersonation workflows.",
      href: "/admin/support-access",
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
      id: "quick-pricing",
      label: "Review pricing",
      description: "Inspect plans, overages, and add-on pricing.",
      href: companyId ? `/admin/clients/${companyId}#subscription` : "/admin/subscriptions",
      scope: companyId ? "organization" : "platform",
    },
    {
      id: "quick-company-actions",
      label: "Open operations",
      description: "Jump into the action catalog for the selected workspace.",
      href: companyId ? `/admin/company/${companyId}/operations` : "/admin/clients",
      scope: companyId ? "organization" : "platform",
    },
  ];
}
