/**
 * EXPERIMENT: rewrite lib/icons.tsx's `import * as Phosphor` namespace import
 * into explicit deep imports of only the 162 icons actually referenced.
 *
 * Writes lib/icons.tsx in place. Revert with `git checkout lib/icons.tsx`.
 */
import fs from "node:fs";
import path from "node:path";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const ICONS = path.join(REPO, "lib/icons.tsx");
let text = fs.readFileSync(ICONS, "utf8");

const names = JSON.parse(fs.readFileSync(path.join(REPO, "scratch/icon-names.json"), "utf8"));
if (!names.includes("Question")) names.push("Question");
names.sort();

const imports = names
  .map((n) => `import { ${n} as Ph${n} } from "@phosphor-icons/react/dist/ssr/${n}";`)
  .join("\n");

const registry = `const iconRegistry: Record<string, PhosphorIconComponent> = {\n${
  names.map((n) => `  ${n}: Ph${n},`).join("\n")
}\n};`;

// 1. replace the namespace import
text = text.replace(
  'import * as Phosphor from "@phosphor-icons/react/ssr";',
  imports,
);
// 2. Phosphor.Question -> PhQuestion (type + fallback)
text = text.replace(/typeof Phosphor\.Question/g, "typeof PhQuestion");
text = text.replace(/Phosphor\.Question/g, "PhQuestion");
// 3. replace the registry cast with an explicit map
text = text.replace(
  "const iconRegistry = Phosphor as unknown as Record<string, PhosphorIconComponent>;",
  registry,
);

fs.writeFileSync(ICONS, text);
console.log(`rewrote lib/icons.tsx with ${names.length} deep imports`);
console.log("remaining 'Phosphor' refs:", (text.match(/Phosphor\./g) || []).length);
