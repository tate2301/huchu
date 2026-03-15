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
  { href: "/admin/commercial", label: "Commercial Center", description: "Subscriptions, templates, bundles, and feature catalog." },
  { href: "/admin/support-access", label: "Support Access", description: "Impersonation and support sessions." },
  { href: "/admin/reliability", label: "Reliability Cluster", description: "Health, contracts, runbooks, and audit evidence." },
  { href: "/admin/settings", label: "Settings", description: "Portal and operator preferences." },
];

export function getCompanyNav(companyId: string): AdminNavItem[] {
  return [
    { href: `/admin/clients/${companyId}`, label: "Overview", description: "Client health and pricing context." },
    { href: `/admin/company/${companyId}/identity`, label: "Identity", description: "Workspace admins, users, and support sessions." },
    { href: `/admin/company/${companyId}/commercial`, label: "Commercial Center", description: "Workspace plan, templates, add-ons, and feature access." },
    { href: `/admin/company/${companyId}/reliability`, label: "Reliability", description: "Incidents, contracts, runbooks, and workspace audit." },
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
      href: "/admin/commercial?view=bundles",
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
      href: companyId ? `/admin/company/${companyId}/commercial?view=subscription` : "/admin/commercial?view=subscriptions",
      scope: companyId ? "organization" : "platform",
    },
    {
      id: "quick-reliability",
      label: "Review reliability",
      description: "Inspect incidents, contracts, runbooks, and audit posture.",
      href: companyId ? `/admin/company/${companyId}/reliability` : "/admin/reliability",
      scope: companyId ? "organization" : "platform",
    },
    {
      id: "quick-advanced-tools",
      label: "Advanced tools",
      description: "Open the explicit fallback surface for uncovered operator actions.",
      href: companyId ? `/admin/company/${companyId}/advanced` : "/admin/advanced",
      scope: companyId ? "organization" : "platform",
    },
  ];
}
