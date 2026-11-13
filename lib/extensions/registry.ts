import type { ClientBundleTemplateDefinition } from "@/lib/platform/client-templates";
import type { FeatureBundleDefinition, FeatureCatalogEntry } from "@/lib/platform/feature-catalog";
import type { FeatureRouteEntry } from "@/lib/platform/gating/types";

import type { CorelithExtension } from "./types";

/**
 * Merges registered extensions into core's catalogues, and refuses any
 * contribution that steps outside its extension's namespace (see the table in
 * `./types.ts`).
 *
 * Each function takes core's own list and the extensions, and returns the
 * merged list; the catalogue modules call them once, at load, so every reader
 * of FEATURE_CATALOG, FEATURE_BUNDLES, the route lists and the templates sees
 * extensions without knowing they exist. A bad extension throws at load, which
 * fails the build, typecheck-time imports and the contract test.
 */

const ID = /^[a-z][a-z0-9-]{1,30}$/;

export class ExtensionError extends Error {
  constructor(extension: string, message: string) {
    super(`Extension "${extension}": ${message}`);
    this.name = "ExtensionError";
  }
}

function upperId(extension: CorelithExtension): string {
  return extension.id.toUpperCase().replace(/-/g, "_");
}

function ownsKey(extension: CorelithExtension, key: string): boolean {
  return key.startsWith(`${extension.id}.`) && key.length > extension.id.length + 1;
}

function ownsCode(extension: CorelithExtension, prefix: "ADDON" | "TEMPLATE", code: string): boolean {
  const base = `${prefix}_${upperId(extension)}`;
  return code === base || code.startsWith(`${base}_`);
}

function assertIds(extensions: readonly CorelithExtension[]): void {
  const seen = new Set<string>();
  for (const extension of extensions) {
    if (!ID.test(extension.id)) {
      throw new ExtensionError(extension.id, "the id must be lower-case letters, digits or \"-\", 2–31 characters");
    }
    if (seen.has(extension.id)) throw new ExtensionError(extension.id, "is registered twice");
    seen.add(extension.id);
  }
}

export function mergeFeatures(
  core: readonly FeatureCatalogEntry[],
  extensions: readonly CorelithExtension[],
): FeatureCatalogEntry[] {
  assertIds(extensions);
  const keys = new Set(core.map((feature) => feature.key));
  const merged = [...core];
  for (const extension of extensions) {
    for (const feature of extension.features) {
      if (!ownsKey(extension, feature.key)) {
        throw new ExtensionError(extension.id, `feature "${feature.key}" must start with "${extension.id}."`);
      }
      if (keys.has(feature.key)) throw new ExtensionError(extension.id, `feature "${feature.key}" is declared twice`);
      keys.add(feature.key);
      merged.push({ ...feature, domain: "extension" });
    }
  }
  return merged;
}

export function mergeFeatureDependencies(
  core: Readonly<Record<string, string[]>>,
  extensions: readonly CorelithExtension[],
): Record<string, string[]> {
  const merged: Record<string, string[]> = { ...core };
  for (const extension of extensions) {
    for (const [key, dependencies] of Object.entries(extension.featureDependencies ?? {})) {
      if (!ownsKey(extension, key)) {
        throw new ExtensionError(extension.id, `can only declare dependencies of its own features, not "${key}"`);
      }
      merged[key] = [...dependencies];
    }
  }
  return merged;
}

export function mergeBundles(
  core: readonly FeatureBundleDefinition[],
  extensions: readonly CorelithExtension[],
): FeatureBundleDefinition[] {
  const merged = [...core];
  const codes = new Set(core.map((bundle) => bundle.code));
  for (const extension of extensions) {
    for (const bundle of extension.bundles ?? []) {
      if (!ownsCode(extension, "ADDON", bundle.code)) {
        throw new ExtensionError(extension.id, `bundle "${bundle.code}" must be ADDON_${upperId(extension)} or start with ADDON_${upperId(extension)}_`);
      }
      if (codes.has(bundle.code)) throw new ExtensionError(extension.id, `bundle "${bundle.code}" is declared twice`);
      codes.add(bundle.code);
      merged.push({ ...bundle, features: [...bundle.features] });
    }
  }
  return merged;
}

export function mergeBundleDependencies(
  core: Readonly<Record<string, string[]>>,
  extensions: readonly CorelithExtension[],
): Record<string, string[]> {
  const merged: Record<string, string[]> = { ...core };
  for (const extension of extensions) {
    for (const [code, dependencies] of Object.entries(extension.bundleDependencies ?? {})) {
      if (!ownsCode(extension, "ADDON", code)) {
        throw new ExtensionError(extension.id, `can only declare dependencies of its own bundles, not "${code}"`);
      }
      merged[code] = [...dependencies];
    }
  }
  return merged;
}

function checkRoute(extension: CorelithExtension, scope: "page" | "api", prefix: string, featureKey: string): void {
  const root = scope === "page" ? `/${extension.id}` : `/api/${extension.id}/`;
  const inside = scope === "page" ? prefix === root || prefix.startsWith(`${root}/`) : prefix.startsWith(root);
  if (!inside) throw new ExtensionError(extension.id, `${scope} route "${prefix}" must be under "${root}"`);
  if (!ownsKey(extension, featureKey)) {
    throw new ExtensionError(extension.id, `route "${prefix}" must be gated on one of its own features, not "${featureKey}"`);
  }
}

export function mergeRoutes(
  core: readonly FeatureRouteEntry[],
  extensions: readonly CorelithExtension[],
  scope: "page" | "api",
): FeatureRouteEntry[] {
  const merged = [...core];
  for (const extension of extensions) {
    const rows = scope === "page" ? extension.routes?.pages : extension.routes?.apis;
    for (const row of rows ?? []) {
      checkRoute(extension, scope, row.prefix, row.featureKey);
      merged.push({ prefix: row.prefix, featureKey: row.featureKey, scope });
    }
  }
  return merged;
}

export function mergeTemplates(
  core: readonly ClientBundleTemplateDefinition[],
  extensions: readonly CorelithExtension[],
): ClientBundleTemplateDefinition[] {
  const merged = [...core];
  const codes = new Set(core.map((template) => template.code));
  for (const extension of extensions) {
    for (const template of extension.templates ?? []) {
      if (!ownsCode(extension, "TEMPLATE", template.code)) {
        throw new ExtensionError(extension.id, `template "${template.code}" must be TEMPLATE_${upperId(extension)} or start with TEMPLATE_${upperId(extension)}_`);
      }
      if (codes.has(template.code)) throw new ExtensionError(extension.id, `template "${template.code}" is declared twice`);
      codes.add(template.code);
      merged.push(template);
    }
  }
  return merged;
}
