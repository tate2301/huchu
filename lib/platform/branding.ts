import { isAdminPortalHost } from "@/lib/admin-portal";
import { prisma } from "@/lib/prisma";
import { PLATFORM_BRAND_NAME } from "@/lib/platform/brand";
import { hasFeature } from "@/lib/platform/features";
import { resolveTenantFromHost } from "@/lib/platform/tenant";

const BRANDING_MANAGE_FEATURE = "core.branding.manage";
const BRANDING_CUSTOM_DOMAIN_FEATURE = "core.branding.custom-domain";

export type BrandingFontKey =
  | "huchu"
  | "inter"
  | "poppins"
  | "source-sans-3"
  | "lato";

export type BrandingFontOption = {
  key: BrandingFontKey;
  label: string;
  /** For the app, where the design system's CSS variables are in scope. */
  fontFamily: string;
  /**
   * For a generated document, where they are not.
   *
   * A PDF is rendered from a standalone HTML string in a headless browser: no
   * stylesheet of ours is loaded, so `var(--font-sans)` resolves to nothing —
   * and an unresolved `var()` makes the whole `font-family` declaration
   * invalid, taking its fallback stack down with it. Every tenant's document
   * therefore printed in Chromium's default face whatever they had chosen.
   * These two fields are what a document needs instead: a stack that names
   * real families, and the webfont to fetch so the container actually has one.
   */
  documentFontFamily: string;
  /** The Google Fonts stylesheet for `documentFontFamily`, or null for a system stack. */
  documentFontImportUrl: string | null;
};

/**
 * The monospace face documents set figures in — the same one the app uses
 * (IBM Plex Mono, 00-foundations 5.1.5), so a total on screen and the same
 * total on paper are the same shape.
 */
export const DOCUMENT_MONO_FONT_FAMILY =
  '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

const GOOGLE_FONTS = "https://fonts.googleapis.com/css2";
/** Loaded alongside every option, because `.mono` is used on every document. */
const MONO_SPEC = "family=IBM+Plex+Mono:wght@400;500;600";

function googleFontUrl(familySpec: string): string {
  return `${GOOGLE_FONTS}?family=${familySpec}&${MONO_SPEC}&display=swap`;
}

export type EffectiveBranding = {
  companyId: string | null;
  companyName: string | null;
  displayName: string;
  fontFamilyKey: BrandingFontKey;
  fontFamily: string;
  brandingEnabled: boolean;
  customDomainEnabled: boolean;
  /**
   * The workspace's own logo, from Branding → Assets. Drawn as the workspace
   * mark in the app's rail and served as the favicon. Null when branding is
   * off or no logo is set, and the generated initial stands in.
   */
  logoUrl: string | null;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
  };
};

export const BRANDING_FONT_OPTIONS: BrandingFontOption[] = [
  {
    // The design system's own face (Atkinson Hyperlegible). Deferring to
    // `--font-sans` rather than naming a family keeps the default tenant on
    // whatever @corelithzw/react ships, including its fallback stack.
    key: "huchu",
    label: `${PLATFORM_BRAND_NAME} Sans`,
    fontFamily: "var(--font-sans)",
    // The face `app/globals.css` loads for the app itself, named in full
    // so a document matches the website rather than approximating it.
    documentFontFamily:
      '"Atkinson Hyperlegible Next", "Atkinson Hyperlegible", "Segoe UI", "Helvetica Neue", Arial, sans-serif',
    documentFontImportUrl: googleFontUrl("Atkinson+Hyperlegible+Next:wght@200..800"),
  },
  {
    key: "inter",
    label: "Inter",
    fontFamily:
      'var(--font-brand-inter), "Inter", "Segoe UI", "Helvetica Neue", Arial, sans-serif',
    documentFontFamily: '"Inter", "Segoe UI", "Helvetica Neue", Arial, sans-serif',
    documentFontImportUrl: googleFontUrl("Inter:wght@400;500;600;700"),
  },
  {
    key: "poppins",
    label: "Poppins",
    fontFamily:
      'var(--font-brand-poppins), "Poppins", "Segoe UI", "Helvetica Neue", Arial, sans-serif',
    documentFontFamily: '"Poppins", "Segoe UI", "Helvetica Neue", Arial, sans-serif',
    documentFontImportUrl: googleFontUrl("Poppins:wght@400;500;600;700"),
  },
  {
    key: "source-sans-3",
    label: "Source Sans 3",
    fontFamily:
      'var(--font-brand-source-sans-3), "Source Sans 3", "Segoe UI", "Helvetica Neue", Arial, sans-serif',
    documentFontFamily: '"Source Sans 3", "Segoe UI", "Helvetica Neue", Arial, sans-serif',
    documentFontImportUrl: googleFontUrl("Source+Sans+3:wght@400;500;600;700"),
  },
  {
    key: "lato",
    label: "Lato",
    fontFamily:
      'var(--font-brand-lato), "Lato", "Segoe UI", "Helvetica Neue", Arial, sans-serif',
    // Lato ships 400/700/900 — asking for 500 or 600 returns nothing for them.
    documentFontFamily: '"Lato", "Segoe UI", "Helvetica Neue", Arial, sans-serif',
    documentFontImportUrl: googleFontUrl("Lato:wght@400;700"),
  },
];

/** The option whose family defers to the design system's `--font-sans`. */
const DEFAULT_FONT_KEY: BrandingFontKey = "huchu";

/**
 * The unbranded baseline. Colours mirror `@corelithzw/react`'s `--brand`,
 * `--brand-soft` and `--brand-tint` so the branding editor opens on the design
 * system rather than on a palette the product no longer uses. The colours
 * never reach the interface — the product theme paints it (see
 * `getBrandingCssVariables`) — they seed the editor's swatches, the workspace
 * icon and documents.
 */
const DEFAULT_BRANDING: EffectiveBranding = {
  companyId: null,
  companyName: null,
  displayName: PLATFORM_BRAND_NAME,
  fontFamilyKey: DEFAULT_FONT_KEY,
  fontFamily: BRANDING_FONT_OPTIONS[0].fontFamily,
  brandingEnabled: false,
  customDomainEnabled: false,
  logoUrl: null,
  colors: {
    primary: "#0B5DF0",
    secondary: "#E8EFFE",
    accent: "#EEF3FE",
  },
};

const DOMAIN_PATTERN =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

function normalizeHost(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/:\d+$/, "")
    .replace(/\.$/, "");
}

function normalizeRootHosts(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => normalizeHost(item))
    .filter(Boolean);
}

function normalizeDisplayName(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.slice(0, 80);
}

export function normalizeHexColor(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const normalized = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
  return /^#[0-9a-fA-F]{6}$/.test(normalized) ? normalized.toLowerCase() : null;
}

function toFontFamilyKey(value: string | null | undefined): BrandingFontKey {
  const normalized = value?.trim().toLowerCase() as BrandingFontKey | undefined;
  if (!normalized) {
    return DEFAULT_BRANDING.fontFamilyKey;
  }
  return BRANDING_FONT_OPTIONS.some((font) => font.key === normalized)
    ? normalized
    : DEFAULT_BRANDING.fontFamilyKey;
}

/** The document-safe stack and webfont for a font key. */
export function getDocumentFontByKey(key: BrandingFontKey): {
  fontFamily: string;
  importUrl: string | null;
} {
  const option =
    BRANDING_FONT_OPTIONS.find((font) => font.key === key) ?? BRANDING_FONT_OPTIONS[0];
  return { fontFamily: option.documentFontFamily, importUrl: option.documentFontImportUrl };
}

export function getFontFamilyByKey(fontKey: BrandingFontKey): string {
  return (
    BRANDING_FONT_OPTIONS.find((font) => font.key === fontKey)?.fontFamily ??
    DEFAULT_BRANDING.fontFamily
  );
}

export function normalizeHostnameInput(value: string): string | null {
  const normalized = normalizeHost(value);
  if (!normalized || !DOMAIN_PATTERN.test(normalized)) {
    return null;
  }
  return normalized;
}

export function isReservedCustomDomain(hostname: string): boolean {
  const normalized = normalizeHost(hostname);
  if (!normalized) {
    return true;
  }

  const rootDomain = normalizeHost(process.env.PLATFORM_ROOT_DOMAIN);
  const rootHosts = normalizeRootHosts(process.env.PLATFORM_ROOT_HOSTS);
  if (rootDomain && (normalized === rootDomain || normalized.endsWith(`.${rootDomain}`))) {
    return true;
  }

  return rootHosts.includes(normalized);
}

/**
 * A logo URL fit to put in an `<img src>` and a `<link rel="icon">`: an
 * absolute http(s) URL or a same-origin path. The settings field takes any
 * string up to 500 characters, so anything else — a `javascript:` URL, a typo
 * with no scheme — is dropped rather than drawn as a broken image.
 */
function normalizeLogoUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return trimmed;
  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export async function getEffectiveBrandingForCompany(companyId: string): Promise<EffectiveBranding> {
  const normalizedCompanyId = companyId.trim();
  if (!normalizedCompanyId) {
    return DEFAULT_BRANDING;
  }

  try {
    const [company, brandingEnabled, customDomainEnabled] = await Promise.all([
      prisma.company.findUnique({
        where: { id: normalizedCompanyId },
        select: {
          id: true,
          name: true,
          branding: {
            select: {
              displayName: true,
              logoUrl: true,
              primaryColor: true,
              secondaryColor: true,
              accentColor: true,
              fontFamilyKey: true,
            },
          },
        },
      }),
      hasFeature(normalizedCompanyId, BRANDING_MANAGE_FEATURE),
      hasFeature(normalizedCompanyId, BRANDING_CUSTOM_DOMAIN_FEATURE),
    ]);

    if (!company) {
      return DEFAULT_BRANDING;
    }

    const companyName = company.name ?? null;
    const baseDisplayName = normalizeDisplayName(companyName) ?? DEFAULT_BRANDING.displayName;
    const configuredDisplayName = normalizeDisplayName(company.branding?.displayName);
    const displayName =
      brandingEnabled && configuredDisplayName ? configuredDisplayName : baseDisplayName;

    const primary = brandingEnabled
      ? normalizeHexColor(company.branding?.primaryColor) ?? DEFAULT_BRANDING.colors.primary
      : DEFAULT_BRANDING.colors.primary;
    const secondary = brandingEnabled
      ? normalizeHexColor(company.branding?.secondaryColor) ?? DEFAULT_BRANDING.colors.secondary
      : DEFAULT_BRANDING.colors.secondary;
    const accent = brandingEnabled
      ? normalizeHexColor(company.branding?.accentColor) ?? DEFAULT_BRANDING.colors.accent
      : DEFAULT_BRANDING.colors.accent;
    const fontFamilyKey = brandingEnabled
      ? toFontFamilyKey(company.branding?.fontFamilyKey)
      : DEFAULT_BRANDING.fontFamilyKey;

    return {
      companyId: company.id,
      companyName,
      displayName,
      brandingEnabled,
      customDomainEnabled,
      fontFamilyKey,
      fontFamily: getFontFamilyByKey(fontFamilyKey),
      logoUrl: brandingEnabled ? normalizeLogoUrl(company.branding?.logoUrl) : null,
      colors: {
        primary,
        secondary,
        accent,
      },
    };
  } catch {
    return DEFAULT_BRANDING;
  }
}

export async function getEffectiveBrandingForHost(hostHeader: string | null | undefined): Promise<EffectiveBranding> {
  if (isAdminPortalHost(hostHeader)) {
    return DEFAULT_BRANDING;
  }
  const tenant = await resolveTenantFromHost(hostHeader ?? null);
  if (!tenant) {
    return DEFAULT_BRANDING;
  }
  return getEffectiveBrandingForCompany(tenant.companyId);
}

/**
 * CSS custom properties for a tenant's branding, applied inline on `<body>`.
 *
 * Only the typeface. A tenant's colours no longer re-tint the interface: the
 * product theme does (`app/themes/roles.css`, chosen from the workspace's
 * profile), and the tenant's mark stays in the logo tile and on documents.
 * An inline style outranks every stylesheet, so a colour emitted here would
 * silently override the theme.
 *
 * Empty with branding disabled, and on the default face: that option's family
 * IS `var(--font-sans)`, and emitting it would define `--font-sans` in terms of
 * itself — a reference cycle that leaves the element with no font-family.
 */
export function getBrandingCssVariables(branding: EffectiveBranding): Record<string, string> {
  if (!branding.brandingEnabled || branding.fontFamilyKey === DEFAULT_FONT_KEY) {
    return {};
  }
  return { "--font-sans": branding.fontFamily };
}

export function getBrandingFeatureKeys() {
  return {
    manage: BRANDING_MANAGE_FEATURE,
    customDomain: BRANDING_CUSTOM_DOMAIN_FEATURE,
  };
}
