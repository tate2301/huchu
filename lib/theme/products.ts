/**
 * Themes per product (00-foundations 5.1, the `Tokens` board).
 *
 * A workspace's profile is its primary product: `RETAIL` is Tender, and every
 * other profile is Corelith until it has a palette of its own. The root layout
 * resolves the product on the server and sets `data-product` and `data-theme`
 * on `<html>`, so the first paint is already right. `app/themes/roles.css`
 * answers every role in `ROLE_TOKENS` once per theme; components only ever
 * read a role.
 *
 * Nothing here may import from the server or the DOM at module level: the
 * appearance provider and the inline head script both use it.
 */

/**
 * Every role a theme must answer, in the order `roles.css` declares them.
 * `lib/theme/products.test.ts` holds each theme block to exactly this list,
 * so a product cannot leave one out or add one the others lack.
 */
export const ROLE_TOKENS = [
  "--ground",
  "--surface",
  "--hover",
  "--tray",
  "--active",
  "--selected",
  "--line",
  "--line-soft",
  "--line-strong",
  "--ink",
  "--ink-2",
  "--ink-3",
  "--faint",
  "--action",
  "--action-fill",
  "--on-action",
  "--action-ink",
  "--sel-fill",
  "--on-sel",
  "--sel-bg",
  "--sel-line",
  "--sel-ink",
  "--device",
  "--info",
  "--info-soft",
  "--ok",
  "--ok-soft",
  "--warn",
  "--warn-soft",
  "--warn-dot",
  "--warn-line",
  "--bad",
  "--bad-soft",
  "--bad-dot",
  "--data",
  "--data-muted",
  "--data-compare",
  "--s1",
  "--s2",
  "--s3",
  "--s4",
  "--scrim",
  "--shadow-float",
  "--shadow-pin",
  "--shadow-sheet",
] as const;

export type RoleToken = (typeof ROLE_TOKENS)[number];

export type Product = "retail" | "corelith";

export type ThemeName = "corelith" | "tender" | "tender-dark";

export const THEME_NAMES: readonly ThemeName[] = ["corelith", "tender", "tender-dark"];

export type ProductThemes = { light: ThemeName; dark: ThemeName | null };

/** A product's light theme, and its dark one when it has one. */
export const PRODUCT_THEMES: Record<Product, ProductThemes> = {
  retail: { light: "tender", dark: "tender-dark" },
  corelith: { light: "corelith", dark: null },
};

/**
 * The product a workspace profile belongs to. Takes the normalised profile
 * (`RETAIL`, as the session claim and the Prisma enum spell it).
 */
export function productForProfile(profile: string | null | undefined): Product {
  return profile === "RETAIL" ? "retail" : "corelith";
}

export function themesForProduct(product: Product): ProductThemes {
  return PRODUCT_THEMES[product];
}

/** The browser bar's colour: the product's page ground. */
export function themeColorForProduct(product: Product): string {
  return product === "retail" ? "#faf7f4" : "#f6f7f9";
}

/** A person's choice on Appearance. Kept on the device, never on the server. */
export type AppearanceChoice = "light" | "dark" | "system";

export const APPEARANCE_STORAGE_KEY = "huchu.appearance";

export function isAppearanceChoice(value: unknown): value is AppearanceChoice {
  return value === "light" || value === "dark" || value === "system";
}

/**
 * Puts the theme for `choice` on `<html>`, for whatever product the server
 * named in `data-product`. Products without a dark theme always get their
 * light one.
 *
 * Self-contained on purpose: the root layout serialises it into the inline
 * head script that runs before first paint, so it may reference nothing but
 * its arguments and the browser's globals.
 */
export function paintAppearance(
  choice: string | null,
  themes: Record<string, ProductThemes>,
): void {
  const root = document.documentElement;
  const pair = themes[root.dataset.product || ""];
  if (!pair) {
    return;
  }
  const darkTheme = pair.dark;
  const wantsDark =
    choice === "dark" ||
    (choice === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  if (darkTheme && wantsDark) {
    root.dataset.theme = darkTheme;
    root.style.colorScheme = "dark";
  } else {
    root.dataset.theme = pair.light;
    root.style.colorScheme = "light";
  }
}

/**
 * The inline `<head>` script: reads the stored choice and paints it before
 * the first frame, so Dark never flashes white on a reload. Storage can be
 * blocked (private windows, site data off); the server's light theme stands
 * then.
 */
export const APPEARANCE_SCRIPT = `(function(){try{(${paintAppearance.toString()})(window.localStorage.getItem(${JSON.stringify(
  APPEARANCE_STORAGE_KEY,
)}),${JSON.stringify(PRODUCT_THEMES)})}catch(e){}})();`;
