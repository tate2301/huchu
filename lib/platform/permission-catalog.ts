/**
 * One list of everything a person is allowed to do.
 *
 * Until now this workspace had two answers to "what can she do?" — the feature
 * flags that decide which pages exist for her, and the CRM capability table
 * that decides what the API lets her change. They were edited in different
 * places, described in different words, and neither screen mentioned the
 * other. An admin trying to give somebody the ability to issue quotes had to
 * know that "issue quotes" was a capability while "CRM documents" was a
 * feature, and that turning one on without the other did nothing.
 *
 * This module puts both behind one shape: a permission key, a group it belongs
 * to, what the person's role gives them by default, and whether an admin has
 * overridden that default in either direction. The screen shows one searchable
 * list; the two storage tables stay where they are because they are read on
 * hot paths that have nothing to do with each other.
 */
import {
  clearManagedUserFeatureOverride,
  getManagedUserFeatureAccessEntries,
  setManagedUserFeatureOverride,
} from "@/lib/platform/user-entitlements";
import {
  CRM_CAPABILITIES,
  CRM_CAPABILITY_LABELS,
  CRM_CAPABILITY_NOTES,
  capabilitiesForRole,
  type CrmCapability,
} from "@/lib/crm/permissions";
import { prisma } from "@/lib/prisma";

/**
 * Three states, not two. "Allowed" and "denied" are answers an admin gave;
 * "role default" is the absence of an answer, and it has to stay distinct so
 * that changing somebody's role still moves them. A workspace that stored
 * every permission as a plain boolean would freeze every person at whatever
 * their role happened to grant on the day an admin last opened this screen.
 */
export const PERMISSION_STATES = ["DEFAULT", "ALLOW", "DENY"] as const;
export type PermissionState = (typeof PERMISSION_STATES)[number];

export type PermissionKind = "FEATURE" | "CAPABILITY";

export type PermissionEntry = {
  /** `feature:<key>` or `capability:<key>` — unique across both systems. */
  id: string;
  kind: PermissionKind;
  key: string;
  label: string;
  description: string;
  /** What this person's role grants when no admin has said otherwise. */
  roleDefault: boolean;
  state: PermissionState;
  /** What the system actually answers today. */
  effective: boolean;
};

export type PermissionGroup = {
  id: string;
  label: string;
  description: string;
  entries: PermissionEntry[];
};

/** Feature domains read as slugs; people read words. */
const DOMAIN_LABELS: Record<string, string> = {
  accounting: "Accounting",
  admin: "Administration",
  compliance: "Compliance",
  core: "Platform",
  crm: "CRM",
  custom: "Other",
  gold: "Gold",
  hr: "People & payroll",
  maintenance: "Maintenance",
  ops: "Operations",
  portal: "Customer portal",
  reports: "Reporting",
  retail: "Retail",
  schools: "Schools",
  stores: "Stores",
};

const DOMAIN_ORDER = [
  "crm",
  "accounting",
  "reports",
  "hr",
  "ops",
  "stores",
  "retail",
  "gold",
  "maintenance",
  "compliance",
  "schools",
  "portal",
  "admin",
  "core",
  "custom",
];

/**
 * Capabilities grouped the way somebody thinks about them, not the way the
 * key happens to be spelled. "Can she delete a record" and "can she merge a
 * duplicate" belong next to each other even though one string starts with
 * `records.delete` and the other with `records.merge`.
 */
const CAPABILITY_GROUP: Record<CrmCapability, string> = {
  "records.read": "crm-records",
  "records.edit.own": "crm-records",
  "records.edit.any": "crm-records",
  "records.delete": "crm-records",
  "records.merge": "crm-records",
  "records.import": "crm-data",
  "records.export": "crm-data",
  "pipelines.manage": "crm-config",
  "fields.manage": "crm-config",
  "views.share": "crm-config",
  "tasks.assign.others": "crm-work",
  "documents.issue": "crm-documents",
  "documents.approve": "crm-documents",
  "commissions.manage": "crm-money",
  "settings.manage": "crm-config",
};

const CAPABILITY_GROUP_META: Record<string, { label: string; description: string }> = {
  "crm-records": {
    label: "CRM · Records",
    description: "Reading and changing people, companies, deals and sites.",
  },
  "crm-data": {
    label: "CRM · Moving data",
    description: "Bringing records in from a file and taking them back out.",
  },
  "crm-work": {
    label: "CRM · Work",
    description: "Tasks, follow-ups and who they land on.",
  },
  "crm-documents": {
    label: "CRM · Documents",
    description: "Quotes, invoices and sending them to a customer.",
  },
  "crm-money": {
    label: "CRM · Money",
    description: "Commission rules and what they pay out.",
  },
  "crm-config": {
    label: "CRM · Configuration",
    description: "Pipelines, fields, shared views and settings.",
  },
};

const CAPABILITY_GROUP_ORDER = [
  "crm-records",
  "crm-documents",
  "crm-work",
  "crm-data",
  "crm-money",
  "crm-config",
];

function domainLabel(domain: string): string {
  return DOMAIN_LABELS[domain] ?? domain.replace(/(^|[-.])([a-z])/g, (_, sep, char: string) =>
    `${sep === "-" || sep === "." ? " " : ""}${char.toUpperCase()}`,
  );
}

function groupRank(id: string): number {
  const capabilityIndex = CAPABILITY_GROUP_ORDER.indexOf(id);
  if (capabilityIndex !== -1) return capabilityIndex;
  const domainIndex = DOMAIN_ORDER.indexOf(id);
  // Capability groups come first: they are the ones an admin came here to
  // change. Feature access is mostly "does this module exist for her at all",
  // which is a rarer question.
  return 100 + (domainIndex === -1 ? DOMAIN_ORDER.length : domainIndex);
}

export function permissionStateFor(roleDefault: boolean, override: boolean | undefined): PermissionState {
  if (override === undefined) return "DEFAULT";
  return override ? "ALLOW" : "DENY";
}

export async function getCapabilityOverrideMap(userId: string): Promise<Map<string, boolean>> {
  const normalized = userId.trim();
  if (!normalized) return new Map();

  const rows = await prisma.userPermissionOverride.findMany({
    where: { userId: normalized },
    select: { permissionKey: true, isAllowed: true },
  });

  return new Map(rows.map((row) => [row.permissionKey, row.isAllowed]));
}

function capabilityEntries(
  role: string,
  overrides: Map<string, boolean>,
): PermissionEntry[] {
  const roleGrants = capabilitiesForRole(role);

  return CRM_CAPABILITIES.map((capability) => {
    const roleDefault = roleGrants.has(capability);
    const override = overrides.get(capability);
    const state = permissionStateFor(roleDefault, override);

    return {
      id: `capability:${capability}`,
      kind: "CAPABILITY" as const,
      key: capability,
      label: CRM_CAPABILITY_LABELS[capability],
      description: CRM_CAPABILITY_NOTES[capability],
      roleDefault,
      state,
      effective: override ?? roleDefault,
    };
  });
}

/**
 * Everything one person may or may not do, grouped and ready to render.
 *
 * Feature entries are limited to what the company itself has switched on —
 * offering to grant somebody access to a module nobody bought would be a lie
 * the screen tells and the server then refuses.
 */
export async function getUserPermissionCatalog(input: {
  companyId: string;
  userId: string;
  role: string;
}): Promise<PermissionGroup[]> {
  const [features, capabilityOverrides] = await Promise.all([
    getManagedUserFeatureAccessEntries(input),
    getCapabilityOverrideMap(input.userId),
  ]);

  const groups = new Map<string, PermissionGroup>();

  function bucket(id: string, label: string, description: string): PermissionGroup {
    const existing = groups.get(id);
    if (existing) return existing;
    const created: PermissionGroup = { id, label, description, entries: [] };
    groups.set(id, created);
    return created;
  }

  for (const entry of capabilityEntries(input.role, capabilityOverrides)) {
    const groupId = CAPABILITY_GROUP[entry.key as CrmCapability];
    const meta = CAPABILITY_GROUP_META[groupId];
    bucket(groupId, meta.label, meta.description).entries.push(entry);
  }

  for (const feature of features) {
    const domain = feature.domain || "custom";
    bucket(
      domain,
      domainLabel(domain),
      "Whether these screens exist for this person at all.",
    ).entries.push({
      id: `feature:${feature.featureKey}`,
      kind: "FEATURE",
      key: feature.featureKey,
      label: feature.name,
      description: feature.description,
      roleDefault: feature.roleDefault,
      state: permissionStateFor(
        feature.roleDefault,
        feature.hasOverride ? feature.isEnabled : undefined,
      ),
      effective: feature.isEnabled,
    });
  }

  return [...groups.values()].sort((a, b) => {
    const rank = groupRank(a.id) - groupRank(b.id);
    return rank !== 0 ? rank : a.label.localeCompare(b.label);
  });
}

function isCrmCapability(key: string): key is CrmCapability {
  return (CRM_CAPABILITIES as readonly string[]).includes(key);
}

/**
 * Write one decision down.
 *
 * Setting a permission back to DEFAULT deletes the row rather than storing the
 * role's current answer, because the point of DEFAULT is to keep following the
 * role wherever it goes next.
 */
export async function setUserPermission(input: {
  companyId: string;
  userId: string;
  role: string;
  kind: PermissionKind;
  key: string;
  state: PermissionState;
  actorId: string;
}): Promise<void> {
  if (input.kind === "FEATURE") {
    if (input.state === "DEFAULT") {
      await clearManagedUserFeatureOverride(input.userId, input.key);
      return;
    }
    await setManagedUserFeatureOverride({
      companyId: input.companyId,
      userId: input.userId,
      role: input.role,
      featureKey: input.key,
      isEnabled: input.state === "ALLOW",
    });
    return;
  }

  if (!isCrmCapability(input.key)) {
    throw new Error("UNKNOWN_PERMISSION_KEY");
  }

  if (input.state === "DEFAULT") {
    await prisma.userPermissionOverride.deleteMany({
      where: { userId: input.userId, permissionKey: input.key },
    });
    return;
  }

  const isAllowed = input.state === "ALLOW";
  await prisma.userPermissionOverride.upsert({
    where: {
      userId_permissionKey: { userId: input.userId, permissionKey: input.key },
    },
    update: { isAllowed, grantedById: input.actorId },
    create: {
      companyId: input.companyId,
      userId: input.userId,
      permissionKey: input.key,
      isAllowed,
      grantedById: input.actorId,
    },
  });
}

/** Put somebody back on their role's defaults across both systems. */
export async function resetUserPermissions(userId: string): Promise<void> {
  await prisma.userPermissionOverride.deleteMany({ where: { userId } });
}

/** How many decisions differ from the role, for the summary line. */
export function countOverrides(groups: PermissionGroup[]): number {
  return groups.reduce(
    (total, group) =>
      total + group.entries.filter((entry) => entry.state !== "DEFAULT").length,
    0,
  );
}
