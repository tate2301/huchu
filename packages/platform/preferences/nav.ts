import type { UserRole } from "../roles";
import { hasTokenFeature } from "../gating/token-check";

export type PreferencesGroup = "account" | "organization";

export type PreferencesNavItem = {
  id: string;
  group: PreferencesGroup;
  label: string;
  href: string;
  description: string;
};

export type PreferencesAccessInput = {
  role?: string | null;
  enabledFeatures?: string[] | undefined;
};

export const ACCOUNT_PREFERENCES_ITEMS: PreferencesNavItem[] = [
  {
    id: "profile",
    group: "account",
    label: "Profile",
    href: "/preferences/profile",
    description: "Name, phone, email, and workspace role.",
  },
  {
    id: "notifications",
    group: "account",
    label: "Notifications",
    href: "/preferences/notifications",
    description: "Choose which account notifications reach you.",
  },
  {
    id: "appearance",
    group: "account",
    label: "Appearance",
    href: "/preferences/appearance",
    description: "Light, dark, or system theme preference.",
  },
];

export const ORGANIZATION_PREFERENCES_ITEMS: PreferencesNavItem[] = [
  {
    id: "organization",
    group: "organization",
    label: "Organization",
    href: "/preferences/organization",
    description: "Workspace identity and account context.",
  },
  {
    id: "users",
    group: "organization",
    label: "Users",
    href: "/preferences/organization/users",
    description: "Directory and user access controls.",
  },
  {
    id: "sites",
    group: "organization",
    label: "Sites",
    href: "/preferences/organization/sites",
    description: "Operational sites used across reporting.",
  },
  {
    id: "departments",
    group: "organization",
    label: "Departments",
    href: "/preferences/organization/departments",
    description: "HR departments used for assignment and payroll.",
  },
  {
    id: "branding",
    group: "organization",
    label: "Branding",
    href: "/preferences/organization/branding",
    description: "Company identity, assets, and defaults.",
  },
  {
    id: "templates",
    group: "organization",
    label: "Templates",
    href: "/preferences/organization/templates",
    description: "Document template library.",
  },
  {
    id: "billing",
    group: "organization",
    label: "Billing",
    href: "/preferences/organization/billing",
    description: "Plan, renewal, limits, and offline payment guidance.",
  },
];

export function isOrgAdminRole(role: string | null | undefined): role is Extract<UserRole, "SUPERADMIN" | "MANAGER"> {
  return role === "SUPERADMIN" || role === "MANAGER";
}

export function canViewBilling(input: PreferencesAccessInput): boolean {
  return input.role === "SUPERADMIN" || input.role === "MANAGER" || input.role === "FINANCE_OFFICER";
}

export function canViewPreferenceItem(
  itemId: string,
  input: PreferencesAccessInput,
): boolean {
  const { role, enabledFeatures } = input;

  if (ACCOUNT_PREFERENCES_ITEMS.some((item) => item.id === itemId)) return true;

  if (itemId === "billing") return canViewBilling(input);
  if (itemId === "organization") return isOrgAdminRole(role);
  if (itemId === "users") {
    return isOrgAdminRole(role) && hasTokenFeature(enabledFeatures, "admin.user-management.directory");
  }
  if (itemId === "sites") {
    return isOrgAdminRole(role) && hasTokenFeature(enabledFeatures, "admin.sites-sections");
  }
  if (itemId === "departments") {
    return isOrgAdminRole(role) && hasTokenFeature(enabledFeatures, "hr.employees");
  }
  if (itemId === "branding" || itemId === "templates") {
    return role === "SUPERADMIN" && hasTokenFeature(enabledFeatures, "core.branding.manage");
  }

  return false;
}

export function getVisiblePreferencesItems(input: PreferencesAccessInput): PreferencesNavItem[] {
  return [...ACCOUNT_PREFERENCES_ITEMS, ...ORGANIZATION_PREFERENCES_ITEMS].filter((item) =>
    canViewPreferenceItem(item.id, input),
  );
}

export function getDefaultPreferencesHref(input: PreferencesAccessInput): string {
  return getVisiblePreferencesItems(input)[0]?.href ?? "/preferences/profile";
}
