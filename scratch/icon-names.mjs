/**
 * Extract every Phosphor icon name lib/icons.tsx actually references, so we can
 * replace the `import * as Phosphor` namespace import with explicit deep imports.
 */
import fs from "node:fs";
import path from "node:path";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const text = fs.readFileSync(path.join(REPO, "lib/icons.tsx"), "utf8");

// createPhosphorIcon("PhosphorName", "ExportedName")
const names = new Set();
const re = /createPhosphorIcon\(\s*"([A-Za-z0-9]+)"/g;
let m;
while ((m = re.exec(text))) names.add(m[1]);

// direct Phosphor.X references
const direct = /Phosphor\.([A-Z][A-Za-z0-9]*)/g;
while ((m = direct.exec(text))) names.add(m[1]);

const sorted = [...names].sort();
console.log(`${sorted.length} distinct Phosphor icons referenced`);

// verify each has its own ssr module
const ssr = path.join(REPO, "node_modules/@phosphor-icons/react/dist/ssr");
const missing = sorted.filter((n) => !fs.existsSync(path.join(ssr, `${n}.es.js`)));
console.log(`missing standalone ssr modules: ${missing.length}`, missing.slice(0, 10));

const total = fs.readdirSync(ssr).filter((f) => f.endsWith(".es.js")).length;
console.log(`phosphor ssr modules on disk: ${total}`);
console.log(`compile input if deep-imported: ${sorted.length} vs ${total} (${(100 - (sorted.length / total) * 100).toFixed(1)}% reduction)`);

fs.writeFileSync(path.join(REPO, "scratch/icon-names.json"), JSON.stringify(sorted, null, 2));
console.log("\nwrote scratch/icon-names.json");
