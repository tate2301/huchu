/**
 * How a host's sidebar model is built from what it composes.
 *
 * The arrangement — which modules exist, the order they surface in, the
 * curated sections each workspace profile shows first, the home each profile
 * prefers, the quick actions — is the host's catalogue (`WorkspaceCatalogue`),
 * data the host writes next to its module list. The gating, the profile
 * resolution and the assembly of sections is here, once, and reads the
 * navigation the host registered (`registerNavigationSections`).
 *
 * `buildWorkspaceSidebarModel(catalogue, args)` is what a host's
 * `getWorkspaceSidebarModel` calls; the shell renders whatever comes back and
 * names no module.
 */
import { normalizeFeatureKey } from "@corelithzw/platform/gating/catalog-utils";
import { filterNavSectionsByEnabledFeatures } from "@corelithzw/platform/gating/nav-filter";
import { isRouteAllowedForRole } from "@corelithzw/platform/auth-core/role-routes";
import {
  inferWorkspaceProfileFromEnabledFeatures,
  normalizeWorkspaceProfileInput,
  resolveWorkspaceVerticalProductBundle,
  type VerticalProductBundleDefinition,
  WORKSPACE_PROFILES,
  type WorkspaceModuleId,
  type WorkspaceProfile,
} from "@corelithzw/platform/workspace-products";
import { Dashboard, FileText, type LucideIcon } from "@corelithzw/ui/lib/icons";
import { navigationSections, navigationSectionsForRole, type NavGroup, type NavItem, type NavSection } from "./navigation";
import type { SidebarModelArgs, WorkspaceNavSection, WorkspaceSectionGroup, WorkspaceSidebarModel } from "./sidebar-model";

export type WorkspaceModelArgs = SidebarModelArgs & {
  /**
   * The site each *active* stock location belongs to, one entry per location.
   * Only the shape of this list matters: a stock transfer needs two active
   * locations at one site before it has anywhere to go. Left undefined the
   * answer is "not known", and a surface whose only action may well be
   * impossible is not offered.
   */
  activeStockLocationSiteIds?: string[];
};

export type WorkspaceBuildContext = WorkspaceModelArgs & {
  visibleNavSections: NavSection[];
  navSectionById: Map<string, NavSection>;
};

export type WorkspaceModuleDefinition = {
  id: WorkspaceModuleId;
  label: string;
  homeHref: string | null;
  getItems: (context: WorkspaceBuildContext) => NavItem[];
  /** The section's semantic groups, when it declares any; the sidebar reassembles sections from module items and would otherwise drop them. */
  getGroups?: (context: WorkspaceBuildContext) => NavGroup[] | undefined;
};

export type WorkspaceProfileSectionSpec = {
  id: string;
  title: string;
  /** Bands within the section, when it is long enough to need them; a band with nothing in it after gating is dropped. */
  groups?: NavGroup[];
  refs: Array<{
    moduleId: WorkspaceModuleId;
    href: string;
    /** The band this destination sits in. Must name one of `groups`. */
    group?: string;
  }>;
};

export type WorkspaceProfileRecipe = {
  label: string;
  preferredHomeHref: string | null;
  /** Modules the profile claims: they feed its curated sections and never render a rail of their own. */
  nativeModules: WorkspaceModuleId[];
  sections: WorkspaceProfileSectionSpec[];
  /** Only the curated sections, then the core modules under "more": the retail arrangement. */
  curatedOnly?: boolean;
};

/**
 * What a host composes into its sidebar: the modules it runs and how each
 * profile arranges them. Data, next to the host's module list.
 */
export type WorkspaceCatalogue = {
  modules: Partial<Record<WorkspaceModuleId, WorkspaceModuleDefinition>>;
  /** The order modules surface in when a profile does not say. */
  moduleOrder: readonly WorkspaceModuleId[];
  /** Modules every profile lists after its own sections: people, payroll, accounting, management. */
  canonicalModuleIds: readonly WorkspaceModuleId[];
  /** Modules that need their own feature key present before they surface, on top of having visible items. */
  strictModuleFeatureKeys?: Partial<Record<WorkspaceModuleId, string>>;
  /** A module whose presence is decided by a feature family rather than a key: retail surfaces on any `retail.*` feature. */
  moduleGates?: Partial<Record<WorkspaceModuleId, (enabledFeatures: ReadonlySet<string>) => boolean>>;
  recipes: Partial<Record<WorkspaceProfile, WorkspaceProfileRecipe>> & { GENERAL: WorkspaceProfileRecipe };
  /** The module that makes a profile real: a tenant without it falls back. */
  profileOwnerModules: Partial<Record<Exclude<WorkspaceProfile, "GENERAL">, WorkspaceModuleId>>;
  profileIcons: Partial<Record<WorkspaceProfile, LucideIcon>>;
  /**
   * A module whose sidebar entry is not its nav section as declared — the
   * books list their entry points in one consolidated section. Returns the
   * sections to render, or null to build the section from the module's items.
   */
  consolidateModule?: (
    moduleId: WorkspaceModuleId,
    items: NavItem[],
    workspaceGroup: WorkspaceSectionGroup,
    excludedHrefs: Set<string> | undefined,
  ) => WorkspaceNavSection[] | null;
  quickActions: (args: { role: string | null | undefined; enabledFeatures: string[] | undefined; workspaceProfile: WorkspaceProfile }) => NavItem[];
  supportItems: NavItem[];
};

const DEFAULT_WORKSPACE_PROFILE: WorkspaceProfile = "GENERAL";

export function normalizeWorkspaceProfile(value: string | null | undefined): WorkspaceProfile {
  return normalizeWorkspaceProfileInput(value) ?? DEFAULT_WORKSPACE_PROFILE;
}

/** A section module: its items and groups are the nav section of that id, as the host registered it. */
export function createSectionModule(args: {
  id: WorkspaceModuleId;
  label: string;
  sectionId: string;
  homeHref: string;
}): WorkspaceModuleDefinition {
  return {
    id: args.id,
    label: args.label,
    homeHref: args.homeHref,
    getItems(context) {
      return context.navSectionById.get(args.sectionId)?.items ?? [];
    },
    getGroups(context) {
      return context.navSectionById.get(args.sectionId)?.groups;
    },
  };
}

/** The recipe for a profile, falling back to the general one: only a retired profile misses, and the general workspace is where a retired tenant belongs. */
function recipeFor(catalogue: WorkspaceCatalogue, profile: WorkspaceProfile): WorkspaceProfileRecipe {
  return catalogue.recipes[profile] ?? catalogue.recipes.GENERAL;
}

function buildContext(args: WorkspaceModelArgs): WorkspaceBuildContext {
  // Route-restricted roles (e.g. SALES_REP → CRM only) should never be shown
  // nav for areas the access layer will block anyway.
  const visibleNavSections = filterNavSectionsByEnabledFeatures(navigationSectionsForRole(args.role), args.enabledFeatures)
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => isRouteAllowedForRole(args.role, item.href)),
    }))
    .filter((section) => section.items.length > 0);

  return {
    ...args,
    visibleNavSections,
    navSectionById: new Map(visibleNavSections.map((section) => [section.id, section] as const)),
  };
}

function getVisibleModules(catalogue: WorkspaceCatalogue, context: WorkspaceBuildContext): Map<WorkspaceModuleId, NavItem[]> {
  const normalizedEnabled = new Set((context.enabledFeatures ?? []).map((feature) => normalizeFeatureKey(feature)));
  const entries = catalogue.moduleOrder
    .filter((moduleId) => catalogue.modules[moduleId])
    .map((moduleId) => [moduleId, catalogue.modules[moduleId]!.getItems(context)] as const)
    .filter((entry) => {
      if (entry[1].length === 0) return false;
      const gate = catalogue.moduleGates?.[entry[0]];
      if (gate) return gate(normalizedEnabled);
      const strictFeatureKey = catalogue.strictModuleFeatureKeys?.[entry[0]];
      if (!strictFeatureKey) return true;
      return normalizedEnabled.has(normalizeFeatureKey(strictFeatureKey));
    });

  return new Map(entries);
}

function getVisibleItem(visibleModules: Map<WorkspaceModuleId, NavItem[]>, moduleId: WorkspaceModuleId, href: string): NavItem | null {
  return visibleModules.get(moduleId)?.find((candidate) => candidate.href === href) ?? null;
}

function buildProfileSections(recipe: WorkspaceProfileRecipe, visibleModules: Map<WorkspaceModuleId, NavItem[]>): WorkspaceNavSection[] {
  return recipe.sections
    .map((section) => {
      const items: NavItem[] = [];
      const seen = new Set<string>();

      for (const ref of section.refs) {
        const item = getVisibleItem(visibleModules, ref.moduleId, ref.href);
        if (!item || seen.has(item.href)) continue;
        seen.add(item.href);
        // The arrangement's grouping wins over whatever band the item carried
        // in its own module.
        items.push(ref.group ? { ...item, group: ref.group } : item);
      }

      // A group label with nothing under it is worse than no label.
      const present = new Set(items.map((item) => item.group).filter(Boolean));
      const groups = section.groups?.filter((group) => present.has(group.id));

      return {
        id: section.id,
        title: section.title,
        ...(groups && groups.length > 0 ? { groups } : {}),
        items,
        workspaceGroup: "primary" as const,
      };
    })
    .filter((section) => section.items.length > 0);
}

function getOrderedModuleIds(catalogue: WorkspaceCatalogue, verticalProduct: VerticalProductBundleDefinition): WorkspaceModuleId[] {
  const seen = new Set<WorkspaceModuleId>();
  const ordered: WorkspaceModuleId[] = [];

  for (const moduleId of [...verticalProduct.primaryModules, ...verticalProduct.foundationalModules, ...catalogue.moduleOrder]) {
    if (seen.has(moduleId) || !catalogue.modules[moduleId]) continue;
    seen.add(moduleId);
    ordered.push(moduleId);
  }

  return ordered;
}

function collectSectionHrefs(sections: WorkspaceNavSection[]): Set<string> {
  return new Set(sections.flatMap((section) => section.items.map((item) => item.href)));
}

/**
 * The nav section a module declares, as registered. Last match, not first, to
 * agree with `navSectionById`, where a later section with the same id wins.
 */
function declaredSection(moduleId: WorkspaceModuleId): NavSection | undefined {
  let found: NavSection | undefined;
  for (const section of navigationSections()) {
    if (section.id === moduleId) found = section;
  }
  return found;
}

function buildModuleSection(
  catalogue: WorkspaceCatalogue,
  moduleId: WorkspaceModuleId,
  visibleModules: Map<WorkspaceModuleId, NavItem[]>,
  workspaceGroup: WorkspaceSectionGroup,
  excludedHrefs?: Set<string>,
): WorkspaceNavSection | null {
  const items = (visibleModules.get(moduleId) ?? []).filter((item) => !excludedHrefs?.has(item.href));
  if (items.length === 0) return null;

  // Drop any group left with nothing in it after gating and exclusions.
  const present = new Set(items.map((item) => item.group).filter(Boolean));
  const groups = declaredSection(moduleId)?.groups?.filter((group) => present.has(group.id));

  return {
    id: moduleId,
    title: catalogue.modules[moduleId]?.label ?? moduleId,
    ...(groups && groups.length > 0 ? { groups } : {}),
    // Carried through: the sidebar decides whether to render the groups as
    // root entries or as bands, and it can only do that if the flag survives.
    ...(declaredSection(moduleId)?.flattenGroups ? { flattenGroups: true } : {}),
    items,
    workspaceGroup,
  };
}

function buildModuleSections(
  catalogue: WorkspaceCatalogue,
  moduleId: WorkspaceModuleId,
  visibleModules: Map<WorkspaceModuleId, NavItem[]>,
  workspaceGroup: WorkspaceSectionGroup,
  excludedHrefs?: Set<string>,
): WorkspaceNavSection[] {
  const consolidated = catalogue.consolidateModule?.(moduleId, visibleModules.get(moduleId) ?? [], workspaceGroup, excludedHrefs);
  if (consolidated) return consolidated;
  const section = buildModuleSection(catalogue, moduleId, visibleModules, workspaceGroup, excludedHrefs);
  return section ? [section] : [];
}

function buildGeneralSections(
  catalogue: WorkspaceCatalogue,
  visibleModules: Map<WorkspaceModuleId, NavItem[]>,
  verticalProduct: VerticalProductBundleDefinition,
): WorkspaceNavSection[] {
  return getOrderedModuleIds(catalogue, verticalProduct).flatMap((moduleId) =>
    buildModuleSections(catalogue, moduleId, visibleModules, "primary"),
  );
}

function buildCanonicalCoreSections(
  catalogue: WorkspaceCatalogue,
  visibleModules: Map<WorkspaceModuleId, NavItem[]>,
  excludedHrefs: Set<string>,
  verticalProduct: VerticalProductBundleDefinition,
  workspaceGroup: WorkspaceSectionGroup,
): WorkspaceNavSection[] {
  return getOrderedModuleIds(catalogue, verticalProduct)
    .filter((moduleId) => catalogue.canonicalModuleIds.includes(moduleId))
    .flatMap((moduleId) => buildModuleSections(catalogue, moduleId, visibleModules, workspaceGroup, excludedHrefs));
}

function buildAdditionalSections(
  catalogue: WorkspaceCatalogue,
  recipe: WorkspaceProfileRecipe,
  visibleModules: Map<WorkspaceModuleId, NavItem[]>,
  excludedHrefs: Set<string>,
  verticalProduct: VerticalProductBundleDefinition,
): WorkspaceNavSection[] {
  return getOrderedModuleIds(catalogue, verticalProduct)
    .filter(
      (moduleId) =>
        !recipe.nativeModules.includes(moduleId) && !catalogue.canonicalModuleIds.includes(moduleId) && visibleModules.has(moduleId),
    )
    .flatMap((moduleId) => buildModuleSections(catalogue, moduleId, visibleModules, "additional", excludedHrefs));
}

function getPrimarySections(
  catalogue: WorkspaceCatalogue,
  profile: WorkspaceProfile,
  recipe: WorkspaceProfileRecipe,
  visibleModules: Map<WorkspaceModuleId, NavItem[]>,
  verticalProduct: VerticalProductBundleDefinition,
): WorkspaceNavSection[] {
  if (profile === "GENERAL") {
    return buildGeneralSections(catalogue, visibleModules, verticalProduct);
  }

  const profileSections = buildProfileSections(recipe, visibleModules);
  const usedHrefs = collectSectionHrefs(profileSections);

  if (recipe.curatedOnly) {
    return profileSections;
  }

  return [...profileSections, ...buildCanonicalCoreSections(catalogue, visibleModules, usedHrefs, verticalProduct, "primary")];
}

function resolveEffectiveWorkspaceProfile(
  catalogue: WorkspaceCatalogue,
  enabledFeatures: string[] | undefined,
  requestedProfile: WorkspaceProfile,
  visibleModules: Map<WorkspaceModuleId, NavItem[]>,
): WorkspaceProfile {
  if (requestedProfile === "GENERAL") {
    return inferWorkspaceProfileFromEnabledFeatures(enabledFeatures) ?? requestedProfile;
  }

  // A retired profile has no owner module, so every lookup below misses and the
  // tenant ends up on `GENERAL` — the documented landing place for one.
  const ownerModule = catalogue.profileOwnerModules[requestedProfile];
  if (ownerModule && visibleModules.has(ownerModule)) {
    return requestedProfile;
  }

  const inferredProfile = inferWorkspaceProfileFromEnabledFeatures(enabledFeatures);
  if (inferredProfile && inferredProfile !== "GENERAL") {
    const inferredOwnerModule = catalogue.profileOwnerModules[inferredProfile];
    if (inferredOwnerModule && visibleModules.has(inferredOwnerModule)) {
      return inferredProfile;
    }
  }

  for (const profile of WORKSPACE_PROFILES) {
    if (profile === "GENERAL") continue;
    const candidateModule = catalogue.profileOwnerModules[profile];
    if (candidateModule && visibleModules.has(candidateModule)) {
      return profile;
    }
  }

  return "GENERAL";
}

function getSupportItems(catalogue: WorkspaceCatalogue, context: WorkspaceBuildContext): NavItem[] {
  const overviewSection = context.navSectionById.get("overview");
  return overviewSection?.items.filter((item) => item.href !== "/") ?? catalogue.supportItems;
}

function getGeneralDashboardItem(context: WorkspaceBuildContext): NavItem | null {
  const settingsSection = context.navSectionById.get("settings");
  return settingsSection?.items.find((item) => item.href === "/dashboard") ?? null;
}

function getHomeTarget(args: {
  catalogue: WorkspaceCatalogue;
  profile: WorkspaceProfile;
  recipe: WorkspaceProfileRecipe;
  context: WorkspaceBuildContext;
  sections: WorkspaceNavSection[];
}): { href: string; label: string } {
  const verticalProduct = resolveWorkspaceVerticalProductBundle({
    enabledFeatures: args.context.enabledFeatures,
    workspaceProfile: args.profile,
  });
  const visibleItems = args.sections.flatMap((section) => section.items);
  const preferredHomeHref = verticalProduct.preferredHomeHref ?? args.recipe.preferredHomeHref;
  const preferredItem = preferredHomeHref ? (visibleItems.find((item) => item.href === preferredHomeHref) ?? null) : null;
  const generalDashboardItem = args.profile === "GENERAL" ? getGeneralDashboardItem(args.context) : null;
  const fallbackItem =
    preferredItem ??
    generalDashboardItem ??
    visibleItems[0] ??
    getSupportItems(args.catalogue, args.context)[0] ??
    args.catalogue.supportItems[0] ??
    ({ href: "/help", label: "Quick Tips", icon: FileText } satisfies NavItem);

  return { href: fallbackItem.href, label: fallbackItem.label };
}

/** The home a profile prefers before anything about the tenant is known. */
export function workspaceHomeHref(catalogue: WorkspaceCatalogue, profile: string | null | undefined): string {
  return (
    resolveWorkspaceVerticalProductBundle({ enabledFeatures: undefined, workspaceProfile: profile }).preferredHomeHref ??
    recipeFor(catalogue, normalizeWorkspaceProfile(profile)).preferredHomeHref ??
    "/dashboard"
  );
}

export function buildWorkspaceSidebarModel(catalogue: WorkspaceCatalogue, args: WorkspaceModelArgs): WorkspaceSidebarModel {
  const requestedProfile = normalizeWorkspaceProfile(args.workspaceProfile);
  const context = buildContext(args);
  const visibleModules = getVisibleModules(catalogue, context);
  const profile = resolveEffectiveWorkspaceProfile(catalogue, args.enabledFeatures, requestedProfile, visibleModules);
  const recipe = recipeFor(catalogue, profile);
  const verticalProduct = resolveWorkspaceVerticalProductBundle({
    enabledFeatures: args.enabledFeatures,
    workspaceProfile: profile,
  });
  const primarySections = getPrimarySections(catalogue, profile, recipe, visibleModules, verticalProduct);
  const usedPrimaryHrefs = collectSectionHrefs(primarySections);
  const canonicalAdditionalSections = recipe.curatedOnly
    ? buildCanonicalCoreSections(catalogue, visibleModules, usedPrimaryHrefs, verticalProduct, "additional")
    : [];
  const additionalSections =
    profile === "GENERAL"
      ? []
      : [...canonicalAdditionalSections, ...buildAdditionalSections(catalogue, recipe, visibleModules, usedPrimaryHrefs, verticalProduct)];
  const sections = [...primarySections, ...additionalSections];
  const homeTarget = getHomeTarget({ catalogue, profile, recipe, context, sections });

  return {
    homeHref: homeTarget.href,
    homeLabel: homeTarget.label,
    workspaceLabel: verticalProduct.workspaceLabel || recipe.label,
    workspaceIcon: catalogue.profileIcons[profile] ?? Dashboard,
    quickActions: catalogue
      .quickActions({ role: args.role, enabledFeatures: args.enabledFeatures, workspaceProfile: profile })
      .filter((item) => isRouteAllowedForRole(args.role, item.href)),
    sections,
    supportItems: getSupportItems(catalogue, context),
  };
}
