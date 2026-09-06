import type { FeatureRouteEntry } from "./gating/types";
import type { CapabilitySet } from "./permission-catalog";
import { getPortalHostDescriptorByPrefix, type PortalHostKey } from "./portal-hosts";
import { registry } from "./registry";

/**
 * What a module contributes, as data.
 *
 * A module is a workspace package: its domain, its screens, and this — a
 * data-only entrypoint (`@corelithzw/module-<id>/manifest`) declaring what it
 * adds to the kernel's registries. A host lists its modules once and hands the
 * manifests over at boot (`registerModules`, from its `modules.ts`); the admin
 * host imports every manifest and knows the whole catalogue without a line of
 * module code entering its bundle. Sections arrive with the modules that need
 * them; the plan's table names the rest.
 *
 * This file must stay importable from the edge runtime — the proxy reads the
 * route registry, which reads the manifests — so it imports types and the
 * registry helper, nothing that reaches a database.
 */
export type ModuleId = string;

/**
 * An action the notification centre offers on a notice, as a template: `{id}`
 * in `href` is the entity's id. Data, so a manifest can carry it.
 */
export type NotificationActionTemplate = {
  key: string;
  label: string;
  kind: "api" | "link";
  href: string;
  method?: "POST" | "PATCH" | "DELETE";
  variant?: "default" | "outline" | "destructive" | "secondary" | "ghost";
  confirmMessage?: string;
};

/**
 * A record type, as its module declares it: what it is called, where its list
 * and its page are, which REST resource its attributes go to, and the query key
 * a saved attribute invalidates. `{id}` stands for the record's id. Data, so a
 * manifest can carry it; the records module turns it into the functions the
 * screens call.
 */
export type RecordTypeTemplate = {
  type: string;
  label: string;
  labelPlural: string;
  /** How the mark is drawn; one of the records module's `RecordKind`s. */
  kind: string;
  isPerson: boolean;
  indexHref: string;
  href: string;
  apiPath: string;
  queryKey: readonly string[];
};

/**
 * A default document template a module ships: which source it prints, what
 * kind of document it is, and the layout. `schema` is the documents module's
 * template schema, carried here as plain data.
 */
export type DocumentTemplateEntry = {
  key: string;
  sourceKey: string;
  documentType: "REPORT_TABLE" | "DASHBOARD_PACK" | "SALES_INVOICE" | "SALES_QUOTATION" | "SALES_RECEIPT" | "GENERIC_RECORD";
  targetType: "LIST" | "RECORD" | "DASHBOARD";
  name: string;
  description: string;
  schema: Record<string, unknown>;
};

/**
 * A portal a module serves on its own host (`pos-<slug>.<root>`), by the
 * kernel's portal-host key. The proxy sends the portal's roles home to it,
 * pins them to its host when asked, and serves its public paths bare; the
 * sign-in refuses roles the portal does not admit.
 */
export type PortalEntry = {
  key: PortalHostKey;
  /** Roles whose home is this portal: sent there from anywhere else on the host. */
  homeRoles: readonly string[];
  /** Roles that may sign in on the portal's host; any role when absent. */
  signInRoles?: readonly string[];
  /** The reason the sign-in gives a role the portal does not admit. */
  signInDeniedReason?: string;
  /** Paths the portal serves bare on its host, `/` included; a portal without them serves its internal tree. */
  publicPaths?: readonly string[];
  /** Whether the portal's roles are kept on the portal host even when they arrive on the tenant host. */
  pinRolesToHost?: boolean;
};

/** Routes only some roles may reach, enforced on the edge before any page or handler runs. */
export type RoleRestrictedRoutes = {
  paths: readonly string[];
  roles: readonly string[];
  message: string;
};

export type ModuleManifest = {
  id: ModuleId;
  /** The modules this one imports from, by id. The boundary test holds it to this. */
  requires?: readonly ModuleId[];
  /** URL prefixes with the feature keys that gate them, page and API. */
  routes?: readonly FeatureRouteEntry[];
  permissions?: {
    /** What a person may do inside the module, as the permission catalog lists it. */
    capabilities?: CapabilitySet;
  };
  records?: {
    /** The record types this module owns, for the shared record page, mark and editor. */
    types?: readonly RecordTypeTemplate[];
  };
  documents?: {
    /** The print-ready defaults for the documents this module's sources produce. */
    templates?: readonly DocumentTemplateEntry[];
  };
  notifications?: {
    /** Where a notice about one of the module's entities opens: entity type → path template with `{id}`. */
    viewPaths?: Readonly<Record<string, string>>;
    /** What an approver can do from the notice itself: notification type → action templates. */
    approvalActions?: Readonly<Record<string, readonly NotificationActionTemplate[]>>;
  };
  /** The portals the module serves on their own hosts. */
  portals?: readonly PortalEntry[];
  /** Routes only some roles may reach. */
  roleRestrictedRoutes?: readonly RoleRestrictedRoutes[];
};

const modules = registry<Map<ModuleId, ModuleManifest>>("modules", () => new Map());

export function registerModules(manifests: readonly ModuleManifest[]): void {
  for (const manifest of manifests) modules.set(manifest.id, manifest);
}

export function registeredModules(): ModuleManifest[] {
  return [...modules.values()];
}

export function isModuleRegistered(id: ModuleId): boolean {
  return modules.has(id);
}

/** Every portal the registered modules serve. */
export function registeredPortals(): PortalEntry[] {
  return registeredModules().flatMap((manifest) => [...(manifest.portals ?? [])]);
}

export function registeredPortalByPrefix(prefix: string | null | undefined): PortalEntry | undefined {
  const descriptor = getPortalHostDescriptorByPrefix(prefix);
  return descriptor ? registeredPortal(descriptor.key) : undefined;
}

export function registeredPortal(key: PortalHostKey): PortalEntry | undefined {
  return registeredPortals().find((portal) => portal.key === key);
}

/** Every role-restricted route the registered modules declare. */
export function registeredRoleRestrictedRoutes(): RoleRestrictedRoutes[] {
  return registeredModules().flatMap((manifest) => [...(manifest.roleRestrictedRoutes ?? [])]);
}

/** Every route the registered modules gate; the route registry reads these beside its own. */
export function registeredModuleRoutes(): FeatureRouteEntry[] {
  return registeredModules().flatMap((manifest) => [...(manifest.routes ?? [])]);
}

/**
 * Declared dependencies no registered module satisfies. A host asserts this is
 * empty after composing itself, so a missing module is a boot failure with a
 * name in it rather than an import that resolves to nothing on some screen.
 */
export function unmetModuleRequirements(): { module: ModuleId; requires: ModuleId }[] {
  return registeredModules().flatMap((manifest) =>
    (manifest.requires ?? [])
      .filter((required) => !modules.has(required))
      .map((required) => ({ module: manifest.id, requires: required })),
  );
}
