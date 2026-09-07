#!/usr/bin/env node
// Only packages/db may depend on @prisma/client or prisma. A second dependent
// gives pnpm a second physical copy of the client, and `prisma generate` fills
// exactly one of them — the other fails at runtime with "did not initialize".
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = resolve(new URL("../../..", import.meta.url).pathname);
const forbidden = new Set(["@prisma/client", "prisma"]);
const offenders = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".git" || entry === ".next" || entry === ".turbo") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full);
    else if (entry === "package.json") check(full);
  }
}

function check(file) {
  const rel = relative(root, file);
  if (rel === "packages/db/package.json") return;
  const pkg = JSON.parse(readFileSync(file, "utf8"));
  for (const section of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
    for (const name of Object.keys(pkg[section] ?? {})) {
      if (forbidden.has(name)) offenders.push(`${rel}: ${section}.${name}`);
    }
  }
}

walk(root);
if (offenders.length > 0) {
  console.error("Only packages/db may depend on @prisma/client or prisma (see packages/db/README.md):");
  for (const line of offenders) console.error(`  ${line}`);
  process.exit(1);
}
console.log("prisma dependencies: only packages/db declares them");
