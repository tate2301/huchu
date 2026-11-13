import type { ClientBundleTemplateDefinition } from "@/lib/platform/client-templates";
import type { FeatureBundleDefinition, FeatureCatalogEntry } from "@/lib/platform/feature-catalog";

/**
 * A vertical that lives outside core: an industry fork (e.g. corelith-milling)
 * registers one of these in `extensions/index.ts`, and core merges it into its
 * own catalogues. Core never names an extension in code.
 *
 * Everything an extension contributes carries its id, so it cannot collide
 * with core or with another extension and its paths stay inside the fork
 * boundary (`scripts/fork/boundary-lib.mjs`):
 *
 *   feature keys      `<id>.<name>`         e.g. `milling.runs`
 *   bundle codes      `ADDON_<ID>…`         e.g. `ADDON_MILLING`
 *   template codes    `TEMPLATE_<ID>…`      e.g. `TEMPLATE_MILLING`
 *   page routes       `/<id>` and below
 *   API routes        `/api/<id>/` and below
 *
 * `lib/extensions/registry.ts` checks these when the catalogues load, so a
 * malformed extension fails the build and its tests, not a tenant.
 *
 * Extensions are imported on the proxy's path: keep them plain data — no
 * Prisma, no server-only modules, no React.
 */
export interface CorelithExtension {
  /** The fork's flavour: lower-case letters, digits and "-". */
  id: string;
  /** What the vertical is called, e.g. "Milling". */
  label: string;
  features: ExtensionFeature[];
  /** A feature that needs other features on: `{ "milling.packing": ["milling.runs"] }`. */
  featureDependencies?: Record<string, string[]>;
  bundles?: FeatureBundleDefinition[];
  /** A bundle that needs other bundles: `{ ADDON_MILLING: ["ADDON_STORES_CORE"] }`. */
  bundleDependencies?: Record<string, string[]>;
  routes?: ExtensionRoutes;
  templates?: ClientBundleTemplateDefinition[];
}

/** A catalogue entry whose domain is always "extension". */
export type ExtensionFeature = Omit<FeatureCatalogEntry, "domain" | "alwaysOn">;

export interface ExtensionRoutes {
  /** Page prefix → the feature that gates it, e.g. `{ prefix: "/milling/runs", featureKey: "milling.runs" }`. */
  pages?: Array<{ prefix: string; featureKey: string }>;
  /**
   * API prefix → feature. The proxy does not see most of `/api`, so a route
   * handler under `/api/<id>/` must also gate itself (`canAccessRouteForCompany`).
   */
  apis?: Array<{ prefix: string; featureKey: string }>;
}
