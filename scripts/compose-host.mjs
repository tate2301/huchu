#!/usr/bin/env node
/**
 * Compose a host's `app/` tree from the modules it lists.
 *
 *   node scripts/compose-host.mjs apps/enterprise platform campus sell
 *
 * `platform` names the kernel (`packages/platform`, its routes under `api/`),
 * `shell` the workspace chrome (`packages/shell`, its pages under `pages/`);
 * `private/<id>` a client's own module (`packages/modules/private/<id>`,
 * `@corelithzw/private-<id>`), composed only into that client's host; any
 * other id is a module under `packages/modules`.
 *
 * A module keeps its route handlers under `packages/modules/<id>/api/**\/route.ts`
 * and its screens under `packages/modules/<id>/pages/**\/{page,layout,loading,
 * error,not-found,template,default}.tsx`, mirroring the paths a host serves them
 * on. For each, this writes the host's thin file — one line re-exporting exactly
 * the names the module's file exports — so a host's `app/` tree is composition
 * and nothing else. Idempotent; run it again after a module gains a route.
 */
import { readdirSync, readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join, relative, dirname, basename } from "node:path";
import ts from "typescript";

const [hostDir, ...moduleIds] = process.argv.slice(2);
if (!hostDir || moduleIds.length === 0) {
  console.error("usage: node scripts/compose-host.mjs <host dir> <module id>...");
  process.exit(1);
}
const ROOT = process.cwd();
/** Where a package lives and what it is called: the kernel and the shell by name, a private module under packages/modules/private, a module under packages/modules. */
function packageOf(id) {
  if (id === "platform") return { dir: "packages/platform", name: "@corelithzw/platform" };
  if (id === "shell") return { dir: "packages/shell", name: "@corelithzw/shell" };
  if (id.startsWith("private/")) return { dir: `packages/modules/${id}`, name: `@corelithzw/private-${id.slice("private/".length)}` };
  return { dir: `packages/modules/${id}`, name: `@corelithzw/module-${id}` };
}
const PAGE_FILES = new Set(["page.tsx", "layout.tsx", "loading.tsx", "error.tsx", "not-found.tsx", "template.tsx", "default.tsx"]);
/**
 * Next reads the route segment config (`dynamic`, `runtime`, `maxDuration`, …)
 * statically from the route file itself and refuses a re-export, so a module's
 * literal is copied into the host's file rather than re-exported.
 */
const SEGMENT_CONFIG = new Set(["dynamic", "dynamicParams", "revalidate", "fetchCache", "runtime", "preferredRegion", "maxDuration"]);

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

/** The names a module's file exports, and whether it is a client module. */
function exportsOf(file) {
  const text = readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const names = new Set();
  const configs = [];
  let hasDefault = false;
  for (const stmt of sf.statements) {
    const mods = ts.canHaveModifiers(stmt) ? (ts.getModifiers(stmt) ?? []) : [];
    const exported = mods.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    const isDefault = mods.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);
    if (ts.isExportAssignment(stmt)) { hasDefault = true; continue; }
    if (ts.isExportDeclaration(stmt) && stmt.exportClause && ts.isNamedExports(stmt.exportClause)) {
      for (const el of stmt.exportClause.elements) {
        if (el.name.text === "default") hasDefault = true; else names.add(el.name.text);
      }
      continue;
    }
    if (!exported) continue;
    if (isDefault) { hasDefault = true; continue; }
    if (ts.isFunctionDeclaration(stmt) || ts.isClassDeclaration(stmt)) { if (stmt.name) names.add(stmt.name.text); }
    else if (ts.isVariableStatement(stmt)) {
      for (const d of stmt.declarationList.declarations) {
        if (!ts.isIdentifier(d.name)) continue;
        if (SEGMENT_CONFIG.has(d.name.text)) {
          const init = d.initializer;
          const literal = init && (ts.isStringLiteral(init) || ts.isNumericLiteral(init) || init.kind === ts.SyntaxKind.TrueKeyword || init.kind === ts.SyntaxKind.FalseKeyword);
          if (!literal) throw new Error(`${file}: the segment config \`${d.name.text}\` must be a literal for the host to copy it`);
          configs.push(`export const ${d.name.text} = ${init.getText(sf)};`);
        } else names.add(d.name.text);
      }
    }
    // types and interfaces are not runtime exports Next cares about; skip them
  }
  const client = /^\s*(['"])use client\1/.test(text);
  return { names: [...names], hasDefault, client, configs };
}

let written = 0;
for (const id of moduleIds) {
  const { dir, name: spec } = packageOf(id);
  const base = join(ROOT, dir);
  for (const file of walk(join(base, "api"))) {
    if (basename(file) !== "route.ts") continue;
    const rest = relative(join(base, "api"), file);
    const { names, configs } = exportsOf(file);
    const target = join(ROOT, hostDir, "app", "api", rest);
    const from = `${spec}/api/${rest.replace(/\.ts$/, "")}`.replace(/\\/g, "/");
    write(target, `export { ${names.join(", ")} } from "${from}";\n` + configs.map((line) => `${line}\n`).join(""), spec);
  }
  for (const file of walk(join(base, "pages"))) {
    if (!PAGE_FILES.has(basename(file))) continue;
    const rest = relative(join(base, "pages"), file);
    const { names, hasDefault, client, configs } = exportsOf(file);
    const target = join(ROOT, hostDir, "app", rest);
    const from = `${spec}/pages/${rest.replace(/\.tsx$/, "")}`.replace(/\\/g, "/");
    let body = "";
    if (client) body += `"use client";\n`;
    if (hasDefault) body += `export { default } from "${from}";\n`;
    if (names.length) body += `export { ${names.join(", ")} } from "${from}";\n`;
    body += configs.map((line) => `${line}\n`).join("");
    write(target, body, spec);
  }
}
function write(target, body, spec) {
  mkdirSync(dirname(target), { recursive: true });
  const header = `// Composed from ${spec} by scripts/compose-host.mjs; edit the module, then run it again.\n`;
  writeFileSync(target, header + body);
  written++;
}
console.log(`composed ${written} files into ${hostDir}/app from ${moduleIds.join(", ")}`);
