"""Phase 2.1: extract packages/ui from apps/legacy. Mechanical, asserted, idempotent-ish."""
import os, re, json, subprocess, collections
ROOT = "/home/user/huchu"; APP = f"{ROOT}/apps/legacy"; PKG = f"{ROOT}/packages/ui"
def sh(cmd): subprocess.run(cmd, shell=True, check=True, cwd=ROOT)


def walk(base):
    for dp, dn, fn in os.walk(base):
        dn[:] = [d for d in dn if d not in ("node_modules", ".next", ".turbo")]
        for f in fn:
            if f.endswith((".ts", ".tsx", ".js", ".mjs", ".jsx", ".mdx")):
                yield os.path.join(dp, f)
# ---- 3. the export seam: DataTable takes its exporter from context -----------------
open(f"{PKG}/lib/table-export.tsx", "w").write('''"use client";

import * as React from "react";

// DataTable can export what it shows, but rendering a PDF or CSV belongs to the
// Documents module, which sits above this package. So the table asks its host
// for an exporter through context and hides the export menu when none is
// mounted. A host that composes Documents provides one at its root.

export type TableExportFormat = "pdf" | "csv";

export type TableExportStatus =
  | "requesting"
  | "queued"
  | "processing"
  | "ready"
  | "downloading"
  | "done";

export type TableExportRequest = {
  sourceKey: string;
  format: TableExportFormat;
  filters?: Record<string, string>;
  templateId?: string;
  templateVersionId?: string;
  mode?: "SYNC" | "ASYNC";
  idempotencyKey?: string;
  payload: {
    title?: string;
    subtitle?: string;
    fileName?: string;
    meta?: unknown;
    list: {
      columns: { key: string; label: string }[];
      rows: unknown[];
    };
  };
};

export type TableExporter = (
  request: TableExportRequest,
  options: { onStatus?: (status: TableExportStatus, detail?: string) => void },
) => Promise<void>;

const TableExportContext = React.createContext<TableExporter | null>(null);

export function TableExportProvider({
  exporter,
  children,
}: {
  exporter: TableExporter;
  children: React.ReactNode;
}) {
  return (
    <TableExportContext.Provider value={exporter}>{children}</TableExportContext.Provider>
  );
}

export function useTableExporter(): TableExporter | null {
  return React.useContext(TableExportContext);
}

/** The default source key of a table: derived from the page it is on. */
export function inferTableSourceKey(pathname: string | null | undefined) {
  const safe = (pathname ?? "/")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9/]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^\\/+|\\/+$/g, "");
  return `ui.table.${safe || "root"}`;
}
''')

def edit(path, pairs):
    s = open(path).read()
    for old, new, count in pairs:
        assert s.count(old) == count, (path, old[:60], s.count(old))
        s = s.replace(old, new)
    open(path, "w").write(s)

edit(f"{PKG}/components/data-table.tsx", [
    ('''import {
  inferSourceKeyFromPath,
  runDocumentExport,
  type DocumentExportFormat,
} from "@/lib/documents/export-client";
''', '''import {
  inferTableSourceKey,
  useTableExporter,
  type TableExportFormat,
} from "../lib/table-export";
''', 1),
    ("DocumentExportFormat", "TableExportFormat", 4),
    ("inferSourceKeyFromPath(clientPathname)", "inferTableSourceKey(clientPathname)", 1),
])
# the handler: read the exporter from context, refuse quietly without one
s = open(f"{PKG}/components/data-table.tsx").read()
old = '''  const handleExport = React.useCallback(
    async (format: TableExportFormat) => {
      if (exportingFormat) return;
'''
new = '''  const tableExporter = useTableExporter();
  const handleExport = React.useCallback(
    async (format: TableExportFormat) => {
      if (exportingFormat || !tableExporter) return;
'''
assert s.count(old) == 1; s = s.replace(old, new)
assert s.count("        await runDocumentExport(\n") == 1
s = s.replace("        await runDocumentExport(\n", "        await tableExporter(\n")
open(f"{PKG}/components/data-table.tsx", "w").write(s)

edit(f"{PKG}/components/export-menu.tsx", [
    ('import type { DocumentExportFormat } from "@/lib/documents/export-client";', 'import type { TableExportFormat } from "../lib/table-export";', 1),
    ("DocumentExportFormat", "TableExportFormat", 2),
])

# export-client keeps its names for its other importers, sourced from the ui contract
p = f"{APP}/lib/documents/export-client.ts"; s = open(p).read()
old = 'export type DocumentExportFormat = "pdf" | "csv";\n'
new = '''import { inferTableSourceKey, type TableExportFormat } from "@corelithzw/ui/lib/table-export";

export type DocumentExportFormat = TableExportFormat;
'''
assert s.count(old) == 1; s = s.replace(old, new)
old_fn = s[s.index("export function inferSourceKeyFromPath("):s.index("export async function runDocumentExport(")]
s = s.replace(old_fn, "export const inferSourceKeyFromPath = inferTableSourceKey;\n\n")
open(p, "w").write(s)

# the host adapter and the provider
open(f"{APP}/lib/documents/table-exporter.ts", "w").write('''"use client";

import type { TableExporter } from "@corelithzw/ui/lib/table-export";
import { runDocumentExport } from "@/lib/documents/export-client";

/** What every DataTable in this host exports through: the Documents render pipeline. */
export const documentsTableExporter: TableExporter = async (request, options) => {
  await runDocumentExport(request as Parameters<typeof runDocumentExport>[0], options);
};
''')
p = f"{APP}/components/providers/app-providers.tsx"; s = open(p).read()
assert 'import { OfflineProvider } from "@/components/providers/offline-provider"' in s
s = s.replace('import { OfflineProvider } from "@/components/providers/offline-provider"',
              'import { OfflineProvider } from "@/components/providers/offline-provider"\nimport { TableExportProvider } from "@corelithzw/ui/lib/table-export"\nimport { documentsTableExporter } from "@/lib/documents/table-exporter"', 1)
assert s.count("          <OfflineProvider>\n") == 1 and s.count("          </OfflineProvider>\n") == 1
s = s.replace("          <OfflineProvider>\n", "          <OfflineProvider>\n            <TableExportProvider exporter={documentsTableExporter}>\n", 1)
s = s.replace("          </OfflineProvider>\n", "            </TableExportProvider>\n          </OfflineProvider>\n", 1)
open(p, "w").write(s)

# ---- 4. package files -----------------------------------------------------------------
app_pkg = json.load(open(f"{APP}/package.json"))
deps = app_pkg["dependencies"]; dev = app_pkg["devDependencies"]
want = ["@base-ui/react", "@corelithzw/react", "@phosphor-icons/react", "@radix-ui/react-checkbox", "@radix-ui/react-dialog",
        "@radix-ui/react-dropdown-menu", "@radix-ui/react-popover", "@radix-ui/react-select", "@radix-ui/react-slot",
        "@rtcamp/frappe-ui-react", "@tanstack/react-table", "@visx/curve", "@visx/event", "@visx/responsive", "@visx/scale",
        "@visx/shape", "class-variance-authority", "clsx", "cmdk", "date-fns", "framer-motion", "radix-ui", "tailwind-merge"]
ui_pkg = collections.OrderedDict([
    ("name", "@corelithzw/ui"), ("version", "0.0.0"), ("private", True),
    ("description", "Design-system wrappers, charts, icons, hooks and UI utilities. Domain-free: depends on nothing in the workspace."),
    ("main", "./index.ts"), ("types", "./index.ts"),
    ("scripts", collections.OrderedDict([("lint", "eslint"), ("typecheck", "tsc --noEmit -p tsconfig.json"), ("test", "vitest run")])),
    ("dependencies", collections.OrderedDict((k, deps[k]) for k in sorted(want))),
    ("peerDependencies", collections.OrderedDict([("next", deps["next"]), ("react", deps["react"]), ("react-dom", deps["react-dom"])])),
    ("devDependencies", collections.OrderedDict(sorted({
        "@corelithzw/config": "workspace:*", "@types/react": dev["@types/react"], "@types/react-dom": dev["@types/react-dom"],
        "eslint": dev["eslint"], "eslint-config-next": dev["eslint-config-next"], "next": deps["next"], "react": deps["react"],
        "react-dom": deps["react-dom"], "typescript": dev["typescript"], "vitest": dev["vitest"]}.items()))),
])
json.dump(ui_pkg, open(f"{PKG}/package.json", "w"), indent=2); open(f"{PKG}/package.json", "a").write("\n")
open(f"{PKG}/tsconfig.json", "w").write('{\n  "extends": "@corelithzw/config/tsconfig/nextjs.json",\n  "compilerOptions": {\n    "types": ["vitest/globals"]\n  },\n  "include": ["**/*.ts", "**/*.tsx"],\n  "exclude": ["node_modules"]\n}\n')
open(f"{PKG}/vitest.config.ts", "w").write('import { defineConfig } from "vitest/config";\n\nexport default defineConfig({\n  test: {\n    environment: "node",\n    globals: true,\n    include: ["**/*.test.ts", "**/*.test.tsx"],\n    exclude: ["node_modules"],\n  },\n});\n')
open(f"{PKG}/eslint.config.mjs", "w").write('''import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// The same rules as the hosts, so a component reads the same wherever it lives.
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores(["node_modules/**"]),
  {
    // The type scale has a floor (see apps/legacy/eslint.config.mjs for why).
    files: ["components/**/*.tsx", "charts/**/*.tsx", "corelith/**/*.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[value=/(^|\\\\s)text-(xs|\\\\[(?:9|10|11|12)px\\\\])(\\\\s|$)/]",
          message: "Below the type scale's floor. Use text-sm, and a muted colour if it needs to recede.",
        },
        {
          selector: "TemplateElement[value.raw=/(^|\\\\s)text-(xs|\\\\[(?:9|10|11|12)px\\\\])(\\\\s|$)/]",
          message: "Below the type scale's floor. Use text-sm, and a muted colour if it needs to recede.",
        },
      ],
    },
  },
]);

export default eslintConfig;
''')
open(f"{PKG}/index.ts", "w").write('''// Deep imports are the norm (`@corelithzw/ui/components/button`); this entry
// carries only what every host needs by name.
export { cn } from "./lib/utils";
export {
  TableExportProvider,
  useTableExporter,
  inferTableSourceKey,
  type TableExporter,
  type TableExportFormat,
  type TableExportRequest,
  type TableExportStatus,
} from "./lib/table-export";
''')
open(f"{PKG}/README.md", "w").write('''# @corelithzw/ui

The design-system layer every host and module renders with: wrappers around
`@corelithzw/react`, charts, icons, a few hooks and the `cn` helper. It knows
nothing about tenants, modules or the database, and it must stay that way — it
is the bottom of the UI stack (`ui ─── platform ─── db`).

```
components/   what was components/ui (button, dialog, data-table, …) and the person avatar
charts/       what was components/charts
corelith/     what was components/corelith
lib/          utils (cn), icons, ui/* (accents, status maps, view icons), animation, charts, table-export
hooks/        use-debounced, use-mobile
```

Import by path: `import { Button } from "@corelithzw/ui/components/button"`,
`import { cn } from "@corelithzw/ui/lib/utils"`, `import { Cube } from "@corelithzw/ui/lib/icons"`.

`DataTable` exports through a `TableExporter` the host provides
(`TableExportProvider`); without one the export menu stays hidden. The
Documents module supplies the real one, so this package never imports upward.
''')

# ---- 5. host wiring ----------------------------------------------------------------------
p = f"{APP}/next.config.ts"; s = open(p).read()
assert 'transpilePackages: ["@corelithzw/db"],' in s
s = s.replace('transpilePackages: ["@corelithzw/db"],', 'transpilePackages: ["@corelithzw/db", "@corelithzw/ui"],'); open(p, "w").write(s)
p = f"{APP}/app/globals.css"; s = open(p).read()
old = '@source "../node_modules/@rtcamp/frappe-ui-react/dist";\n'
assert s.count(old) == 1
s = s.replace(old, old + '/* Workspace packages render with these classes too; Tailwind does not look\n   inside node_modules on its own, and the packages arrive through symlinks there. */\n@source "../../../packages";\n')
open(p, "w").write(s)
p = f"{APP}/package.json"; d = json.load(open(p), object_pairs_hook=collections.OrderedDict)
d["dependencies"]["@corelithzw/ui"] = "workspace:*"; d["dependencies"] = collections.OrderedDict(sorted(d["dependencies"].items()))
json.dump(d, open(p, "w"), indent=2); open(p, "a").write("\n")

# ---- 6. report leftovers -----------------------------------------------------------------
left = collections.Counter()
for path in walk(PKG):
    for m in re.finditer(r'["\']@/[^"\']+["\']', open(path).read()):
        left[m.group(0)] += 1
print("unresolved '@/' imports inside packages/ui:", dict(left))
