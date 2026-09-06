/**
 * The rule every module package stands on, checked mechanically.
 *
 * A module imports the kernel packages, npm, and the modules its manifest
 * declares in `requires`. Never a host (no `@/` alias, no `@corelithzw/legacy`),
 * never a module it does not declare, never a file above its own root. This is
 * `lib/hr/module-boundary.test.ts` generalised: that test guarded a list of
 * directories against a list of verticals, and was evaded by moving a file one
 * directory up. A package has a root, so there is nowhere to move to.
 *
 * Node-only; imported by a module's `module-boundary.test.ts`.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import type { ModuleManifest } from "../manifest";

export type BoundaryViolation = { file: string; specifier: string; reason: string };

const MODULE_PREFIX = "@corelithzw/module-";
const HOST_PREFIXES = ["@corelithzw/legacy", "@corelithzw/enterprise", "@corelithzw/admin"];
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(?\s*|\bexport\s+\*\s+from\s*)["']([^"']+)["']/g;

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...sourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.(test|spec)\.tsx?$/.test(entry) && !entry.endsWith(".d.ts")) {
      found.push(full);
    }
  }
  return found;
}

export function moduleBoundaryViolations(input: { dir: string; manifest: ModuleManifest }): BoundaryViolation[] {
  const root = resolve(input.dir);
  if (!existsSync(root)) return [{ file: root, specifier: "", reason: "the package root does not exist" }];
  const declared = new Set(input.manifest.requires ?? []);
  const violations: BoundaryViolation[] = [];

  for (const file of sourceFiles(root)) {
    const text = readFileSync(file, "utf8");
    const shown = relative(root, file);
    for (const match of text.matchAll(SPECIFIER)) {
      const specifier = match[1];
      if (specifier.startsWith("@/")) {
        violations.push({ file: shown, specifier, reason: "reaches into a host through its path alias" });
      } else if (specifier.startsWith(".")) {
        const target = resolve(dirname(file), specifier);
        if (relative(root, target).startsWith("..")) {
          violations.push({ file: shown, specifier, reason: "escapes the package root" });
        }
      } else if (HOST_PREFIXES.some((prefix) => specifier === prefix || specifier.startsWith(`${prefix}/`))) {
        violations.push({ file: shown, specifier, reason: "imports a host" });
      } else if (specifier.startsWith(MODULE_PREFIX)) {
        const id = specifier.slice(MODULE_PREFIX.length).split("/")[0];
        if (id !== input.manifest.id && !declared.has(id)) {
          violations.push({ file: shown, specifier, reason: `imports module "${id}", which the manifest does not require` });
        }
      }
    }
  }
  return violations;
}
