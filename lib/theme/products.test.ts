import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  APPEARANCE_SCRIPT,
  APPEARANCE_STORAGE_KEY,
  PRODUCT_THEMES,
  ROLE_TOKENS,
  THEME_NAMES,
  paintAppearance,
  productForProfile,
  themeColorForProduct,
  themesForProduct,
} from "@/lib/theme/products";

const ROLES_CSS = readFileSync(path.resolve(__dirname, "../../app/themes/roles.css"), "utf8");

/** Each `selector { … }` block in the file, comments stripped. */
function blocks(css: string): Array<{ selector: string; body: string }> {
  const plain = css.replace(/\/\*[\s\S]*?\*\//g, "");
  return [...plain.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
    selector: match[1].trim(),
    body: match[2],
  }));
}

/** The custom properties a block declares, in order, with their values. */
function declarations(body: string): Array<[string, string]> {
  return [...body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)].map((match) => [
    match[1],
    match[2].trim(),
  ]);
}

function themeBlock(theme: string) {
  const found = blocks(ROLES_CSS).filter(
    (block) => block.selector === `:root[data-theme="${theme}"]`,
  );
  expect(found, `one block for ${theme}`).toHaveLength(1);
  return Object.fromEntries(declarations(found[0].body));
}

describe("roles.css", () => {
  it.each(THEME_NAMES)("the %s block declares exactly ROLE_TOKENS", (theme) => {
    const found = blocks(ROLES_CSS).find(
      (block) => block.selector === `:root[data-theme="${theme}"]`,
    );
    expect(found, `a block for ${theme}`).toBeDefined();
    const names = declarations(found!.body).map(([name]) => name);
    // No duplicates, nothing missing, nothing extra.
    expect(new Set(names).size).toBe(names.length);
    expect([...names].sort()).toEqual([...ROLE_TOKENS].sort());
    // Nothing but custom properties in a theme block.
    const statements = found!.body
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean);
    expect(statements.every((statement) => statement.startsWith("--"))).toBe(true);
  });

  it("has no theme block the product table does not name", () => {
    const themed = blocks(ROLES_CSS)
      .map((block) => block.selector.match(/^:root\[data-theme="([^"]+)"\]$/)?.[1])
      .filter((name): name is string => Boolean(name));
    expect(themed.sort()).toEqual([...THEME_NAMES].sort());
    const named = Object.values(PRODUCT_THEMES).flatMap((pair) =>
      [pair.light, pair.dark].filter(Boolean),
    );
    expect([...new Set(named)].sort()).toEqual([...THEME_NAMES].sort());
  });

  it("carries the board's values for the colours the acceptance names", () => {
    expect(themeBlock("tender")["--ground"]).toBe("#faf7f4");
    expect(themeBlock("tender")["--action-fill"]).toBe("#b84a0c");
    expect(themeBlock("tender")["--on-action"]).toBe("#ffffff");
    expect(themeBlock("tender")["--action"]).toBe("#e8620f");
    expect(themeBlock("tender-dark")["--ground"]).toBe("#171310");
    expect(themeBlock("corelith")["--action-fill"]).toBe("#2563eb");
    expect(themeBlock("corelith")["--ground"]).toBe("#f6f7f9");
  });

  it("points the package's tokens at roles only, in one block", () => {
    const pointing = blocks(ROLES_CSS).filter((block) => block.selector === ":root[data-theme]");
    expect(pointing).toHaveLength(1);
    const pairs = Object.fromEntries(declarations(pointing[0].body));
    expect(pairs["--canvas"]).toBe("var(--ground)");
    expect(pairs["--brand"]).toBe("var(--action)");
    expect(pairs["--action-primary-bg"]).toBe("var(--action-fill)");
    expect(pairs["--action-primary-fg"]).toBe("var(--on-action)");
    expect(pairs["--focus-ring"]).toBe("var(--action)");
    expect(pairs["--font-mono"]).toMatch(/^"IBM Plex Mono"/);
    // A role is never redefined here: every theme answers it.
    for (const role of ROLE_TOKENS) {
      expect(pairs[role], role).toBeUndefined();
    }
  });
});

describe("productForProfile", () => {
  it("is Tender for RETAIL and Corelith for every other profile", () => {
    expect(productForProfile("RETAIL")).toBe("retail");
    for (const profile of ["GENERAL", "SCHOOLS", "GOLD_MINE", "PAYROLL", null, undefined, ""]) {
      expect(productForProfile(profile)).toBe("corelith");
    }
  });

  it("gives retail a dark theme and Corelith none", () => {
    expect(themesForProduct("retail")).toEqual({ light: "tender", dark: "tender-dark" });
    expect(themesForProduct("corelith")).toEqual({ light: "corelith", dark: null });
  });

  it("colours the browser bar with the product's ground", () => {
    expect(themeColorForProduct("retail")).toBe("#faf7f4");
    expect(themeColorForProduct("corelith")).toBe("#f6f7f9");
  });
});

/** A stand-in for the bits of the browser the head script touches. */
function fakeBrowser(product: string, stored: string | null, deviceIsDark = false) {
  const root = {
    dataset: { product, theme: product === "retail" ? "tender" : "corelith" } as Record<
      string,
      string
    >,
    style: { colorScheme: "" },
  };
  return {
    root,
    document: { documentElement: root },
    window: {
      localStorage: {
        getItem: (key: string) => (key === APPEARANCE_STORAGE_KEY ? stored : null),
      },
      matchMedia: (query: string) => ({
        matches: query === "(prefers-color-scheme: dark)" && deviceIsDark,
      }),
    },
  };
}

function runHeadScript(browser: ReturnType<typeof fakeBrowser>) {
  new Function("document", "window", APPEARANCE_SCRIPT)(browser.document, browser.window);
}

describe("the head script (first paint)", () => {
  it("paints Tender dark for a retail person who chose Dark", () => {
    const browser = fakeBrowser("retail", "dark");
    runHeadScript(browser);
    expect(browser.root.dataset.theme).toBe("tender-dark");
    expect(browser.root.style.colorScheme).toBe("dark");
  });

  it("follows the device for Match the device", () => {
    const dark = fakeBrowser("retail", "system", true);
    runHeadScript(dark);
    expect(dark.root.dataset.theme).toBe("tender-dark");
    const light = fakeBrowser("retail", "system", false);
    runHeadScript(light);
    expect(light.root.dataset.theme).toBe("tender");
  });

  it("keeps the light theme for Light, nothing stored, or a stale value", () => {
    for (const stored of ["light", null, "sepia"]) {
      const browser = fakeBrowser("retail", stored);
      runHeadScript(browser);
      expect(browser.root.dataset.theme).toBe("tender");
      expect(browser.root.style.colorScheme).toBe("light");
    }
  });

  it("never paints dark on a product without a dark theme", () => {
    const browser = fakeBrowser("corelith", "dark", true);
    runHeadScript(browser);
    expect(browser.root.dataset.theme).toBe("corelith");
  });

  it("leaves the server's theme when storage is blocked", () => {
    const browser = fakeBrowser("retail", "dark");
    browser.window.localStorage.getItem = () => {
      throw new Error("SecurityError");
    };
    expect(() => runHeadScript(browser)).not.toThrow();
    expect(browser.root.dataset.theme).toBe("tender");
  });
});

describe("paintAppearance (on change)", () => {
  it("swaps between the product's two themes", () => {
    const browser = fakeBrowser("retail", null);
    const globals = globalThis as unknown as Record<string, unknown>;
    globals.document = browser.document;
    globals.window = browser.window;
    try {
      paintAppearance("dark", PRODUCT_THEMES);
      expect(browser.root.dataset.theme).toBe("tender-dark");
      paintAppearance("light", PRODUCT_THEMES);
      expect(browser.root.dataset.theme).toBe("tender");
      expect(browser.root.style.colorScheme).toBe("light");
    } finally {
      delete globals.document;
      delete globals.window;
    }
  });
});
