// @vitest-environment jsdom
import fs from "node:fs";
import path from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import { ariaKeyShortcuts, matchesShortcut, parseShortcut } from "./shortcuts";

function key(init: KeyboardEventInit & { target?: EventTarget | null }) {
  const event = new KeyboardEvent("keydown", init);
  if (init.target !== undefined) Object.defineProperty(event, "target", { value: init.target });
  return event;
}

describe("shortcuts", () => {
  it("reads a shortcut as it shows in its button", () => {
    expect(parseShortcut("N")).toEqual({ mod: false, shift: false, key: "n" });
    expect(parseShortcut("Ctrl K")).toEqual({ mod: true, shift: false, key: "k" });
    expect(parseShortcut("Ctrl ↵")).toEqual({ mod: true, shift: false, key: "Enter" });
    expect(parseShortcut("Esc")).toEqual({ mod: false, shift: false, key: "Escape" });
  });

  it("names it for aria-keyshortcuts", () => {
    expect(ariaKeyShortcuts("N")).toBe("N");
    expect(ariaKeyShortcuts("Ctrl K")).toBe("Control+K");
    expect(ariaKeyShortcuts("Ctrl ↵")).toBe("Control+Enter");
  });

  it("answers Ctrl or ⌘ for Ctrl", () => {
    expect(matchesShortcut(key({ key: "k", ctrlKey: true }), "Ctrl K")).toBe(true);
    expect(matchesShortcut(key({ key: "k", metaKey: true }), "Ctrl K")).toBe(true);
    expect(matchesShortcut(key({ key: "k" }), "Ctrl K")).toBe(false);
    expect(matchesShortcut(key({ key: "n", ctrlKey: true }), "N")).toBe(false);
  });

  it("never fires a single key while a person types, but Esc and Ctrl keys do", () => {
    const input = document.createElement("input");
    expect(matchesShortcut(key({ key: "n", target: input }), "N")).toBe(false);
    expect(matchesShortcut(key({ key: "Escape", target: input }), "Esc")).toBe(true);
    expect(matchesShortcut(key({ key: "Enter", ctrlKey: true, target: input }), "Ctrl ↵")).toBe(true);
    const box = document.createElement("input");
    box.type = "checkbox";
    expect(matchesShortcut(key({ key: "n", target: box }), "N")).toBe(true);
  });
});

/*
 * Every key in design/core-modules/spec/shortcuts.md is wired where its page
 * lives, and every primary button on the built core-module routes shows one.
 * Read from the source, so a row added to the spec without its binding, or a
 * primary drawn without its key, fails here. People and payroll are not built
 * yet (skipped for now) and have no rows.
 */

const ROOT = path.resolve(__dirname, "../..");
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), "utf8");
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Bound through the kit: `useShortcut("K"…)`, a button's `shortcut="K"`, or a primary's `shortcut: "K"`. */
const bound = (key: string) =>
  new RegExp(`useShortcut\\(\\s*"${escape(key)}"|shortcut[=:]\\s*\\{?\\s*"${escape(key)}"|shortcut=\\{[^}]*"${escape(key)}"`);

type Binding = { file: string; pattern?: RegExp };

/** Each row of the spec, by "key | action", and where it is bound. */
const BINDINGS: Record<string, Binding[]> = {
  "Ctrl K | Search everything": [
    // The existing global handler, and the top bar's search showing the key.
    { file: "components/layout/command-bar/global-command-bar.tsx", pattern: /event\.key === "k" && \(event\.metaKey \|\| event\.ctrlKey\)/ },
    { file: "components/layout/app-bar-tools.tsx", pattern: /<Kbd>Ctrl K<\/Kbd>/ },
  ],
  "Ctrl J | Give Vane a job (opens the Vane panel on its box)": [{ file: "components/vane/vane-panel.tsx" }],
  "/ | Search this panel, or add a block in the builder": [
    { file: "components/layout/workspace-rail/rail-panel.tsx" },
    { file: "components/management/ui/settings-rail.tsx" },
    { file: "components/explore/explore-panel.tsx" },
    { file: "components/builder/grid/builder-outline.tsx" },
  ],
  "N | New (invoice, report, job grade…)": [
    // The top bar gives a New (the plus) N unless it names another key.
    { file: "components/layout/page-header.tsx", pattern: /icon === "plus" \? "N"/ },
    { file: "components/reports/reports-overview.tsx" },
    { file: "app/build/page.tsx" },
    { file: "app/build/templates/page.tsx" },
    { file: "app/explore/templates/page.tsx" },
    { file: "components/management/ui/list-column.tsx", pattern: /useShortcut\(shortcut,/ },
  ],
  "E | Edit": [{ file: "components/reports/custom/custom-report-screen.tsx" }],
  "E | Export": [{ file: "components/reports/report-screen.tsx" }, { file: "components/reports/template-run.tsx" }],
  "M | Make it yours, or Make a copy": [{ file: "components/reports/custom/custom-report-screen.tsx" }],
  "I | Issue": [{ file: "app/books/invoices/[id]/page.tsx" }],
  "S | Send (the focused Vane card's send action)": [
    { file: "components/vane/vane-panel-view.tsx" },
    { file: "components/vane/for-you-view.tsx" },
    { file: "components/vane/vane-card-drawer.tsx" },
    { file: "components/vane/vane-quote-check.tsx" },
  ],
  "K | Keep (a change Vane proposes)": [{ file: "components/build/vane-form-changes.tsx" }],
  "U | Upload a statement": [{ file: "app/books/bank/page.tsx" }],
  "Ctrl ↵ | Upload (the statement chosen)": [{ file: "app/books/bank/page.tsx" }],
  "Ctrl ↵ | Publish": [{ file: "components/builder/grid/builder-bar.tsx" }],
  "Ctrl ↵ | The drawer's primary (Post, Prepare, Send, Save)": [
    { file: "components/books/new-journal-drawer.tsx" },
    { file: "components/books/vat-view.tsx" },
    { file: "components/reports/report-out-drawer.tsx" },
    { file: "components/explore/schedule-drawer.tsx" },
  ],
  "P | Preview, and back to Build": [{ file: "components/builder/grid/builder-bar.tsx" }],
  "Ctrl S | Save": [
    { file: "components/reports/custom/report-builder.tsx" },
    { file: "components/build/use-builder-keys.ts" },
    { file: "components/management/branding/branding-view.tsx" },
    { file: "components/explore/studio.tsx" },
  ],
  "J, K | Next and previous": [{ file: "components/notifications/activity-inbox.tsx" }],
  "E | Mark as read": [{ file: "components/notifications/activity-inbox.tsx" }],
  "↵ | Open what it is about": [{ file: "components/notifications/inbox-drawer.tsx" }],
  "Esc | Clear the selection, close a panel": [
    { file: "components/core/table.tsx" },
    { file: "components/vane/vane-panel.tsx" },
  ],
};

function specRows(): Array<{ keys: string; action: string }> {
  const spec = read("design/core-modules/spec/shortcuts.md");
  return spec
    .split("\n")
    .filter((line) => line.startsWith("| ") && !line.startsWith("| Key ") && !line.startsWith("|---"))
    .map((line) => line.split("|").map((cell) => cell.trim()))
    .map(([, keys = "", action = ""]) => ({ keys, action }));
}

describe("every shortcut in spec/shortcuts.md is wired", () => {
  const rows = specRows();

  it("reads the spec's table", () => {
    expect(rows.length).toBeGreaterThanOrEqual(11);
  });

  it.each(rows)("$keys: $action", ({ keys, action }) => {
    const bindings = BINDINGS[`${keys} | ${action}`];
    expect(bindings, `no binding listed for "${keys} | ${action}"`).toBeDefined();
    for (const { file, pattern } of bindings!) {
      const source = read(file);
      for (const key of keys.split(/,\s*/)) {
        const test = pattern ?? bound(key);
        expect(test.test(source), `${file} does not bind ${key}`).toBe(true);
      }
    }
  });

  it("lists no binding the spec has lost", () => {
    const listed = new Set(rows.map(({ keys, action }) => `${keys} | ${action}`));
    expect(Object.keys(BINDINGS).filter((row) => !listed.has(row))).toEqual([]);
  });
});

/** The built core-module routes and their components. */
const CORE_SOURCES = [
  "app/activity",
  "app/books",
  "app/build",
  "app/explore",
  "app/management",
  "app/preferences",
  "app/reports",
  "app/retail/reports",
  "app/retail/insights",
  "app/vane",
  "components/books",
  "components/build",
  "components/builder",
  "components/explore",
  "components/management",
  "components/notifications",
  "components/reports",
  "components/vane",
];

function sourceFiles(dir: string): string[] {
  const full = path.join(ROOT, dir);
  if (!fs.existsSync(full)) return [];
  return fs.readdirSync(full, { withFileTypes: true }).flatMap((entry) => {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(rel);
    return /\.tsx$/.test(entry.name) && !/\.test\./.test(entry.name) ? [rel] : [];
  });
}

/** Kit buttons drawn as the primary with no `shortcut`, and top-bar primaries with no key. */
function primariesWithoutKey(file: string): string[] {
  const source = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const kit = new Set<string>();
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    if (!/^@\/components\/core(\/button)?$/.test(statement.moduleSpecifier.text)) continue;
    const named = statement.importClause?.namedBindings;
    if (named && ts.isNamedImports(named)) for (const element of named.elements) {
      if (["Button", "ButtonLink"].includes((element.propertyName ?? element.name).text)) kit.add(element.name.text);
    }
  }
  const declared = new Map<string, ts.Node>();
  const misses: string[] = [];
  const where = (node: ts.Node) => `${file}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`;
  const prop = (object: ts.ObjectLiteralExpression, name: string) =>
    object.properties.find((property) => property.name && ts.isIdentifier(property.name) && property.name.text === name);
  const checkPrimary = (node: ts.Node) => {
    const visit = (child: ts.Node) => {
      if (ts.isObjectLiteralExpression(child) && prop(child, "label") && (prop(child, "onClick") || prop(child, "href") || prop(child, "sheet"))) {
        const icon = prop(child, "icon");
        const isNew = icon && ts.isPropertyAssignment(icon) && /"plus"/.test(icon.initializer.getText(source));
        if (!prop(child, "shortcut") && !isNew && !prop(child, "menu")) misses.push(`${where(child)} primary ${prop(child, "label")!.getText(source)}`);
      }
      ts.forEachChild(child, visit);
    };
    visit(node);
  };
  const collect = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) declared.set(node.name.text, node.initializer);
    ts.forEachChild(node, collect);
  };
  collect(source);
  const visit = (node: ts.Node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const attributes = node.attributes.properties.filter(ts.isJsxAttribute);
      const attribute = (name: string) => attributes.find((candidate) => candidate.name.getText(source) === name);
      const variant = attribute("variant");
      if (kit.has(node.tagName.getText(source)) && variant && /primary/.test(variant.getText(source)) && !attribute("shortcut")) {
        misses.push(`${where(node)} <${node.tagName.getText(source)}> with no shortcut`);
      }
      const primary = attribute("primary")?.initializer;
      if (primary && ts.isJsxExpression(primary) && primary.expression) {
        const expression = primary.expression;
        checkPrimary(ts.isIdentifier(expression) ? (declared.get(expression.text) ?? expression) : expression);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return misses;
}

describe("every primary button shows its key", () => {
  it("on the built core-module routes", () => {
    const files = CORE_SOURCES.flatMap(sourceFiles);
    expect(files.length).toBeGreaterThan(50);
    expect(files.flatMap(primariesWithoutKey)).toEqual([]);
  });
});
