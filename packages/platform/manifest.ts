import type { FeatureRouteEntry } from "./gating/types";
import type { CapabilitySet } from "./permission-catalog";
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
  notifications?: {
    /** Where a notice about one of the module's entities opens: entity type → path template with `{id}`. */
    viewPaths?: Readonly<Record<string, string>>;
    /** What an approver can do from the notice itself: notification type → action templates. */
    approvalActions?: Readonly<Record<string, readonly NotificationActionTemplate[]>>;
  };
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
