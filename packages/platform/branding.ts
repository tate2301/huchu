import { isAdminPortalHost } from "./admin-portal";
import { prisma } from "@corelithzw/db/client";
import { PLATFORM_BRAND_NAME } from "./brand";
import { hasFeature } from "./features";
import { resolveTenantFromHost } from "./tenant";

const BRANDING_MANAGE_FEATURE = "core.branding.manage";
const BRANDING_CUSTOM_DOMAIN_FEATURE = "core.branding.custom-domain";

export type BrandingFontKey =
  | "huchu"
  | "inter"
  | "poppins"
  | "source-sans-3"
  | "lato";

type RGB = {
  r: number;
  g: number;
  b: number;
};

export type BrandingFontOption = {
  key: BrandingFontKey;
  label: string;
  fontFamily: string;
};

export type EffectiveBranding = {
  companyId: string | null;
  companyName: string | null;
  displayName: string;
  fontFamilyKey: BrandingFontKey;
  fontFamily: string;
  brandingEnabled: boolean;
  customDomainEnabled: boolean;
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
  },
  {
    key: "inter",
    label: "Inter",
    fontFamily:
      'var(--font-brand-inter), "Inter", "Segoe UI", "Helvetica Neue", Arial, sans-serif',
  },
  {
    key: "poppins",
    label: "Poppins",
    fontFamily:
      'var(--font-brand-poppins), "Poppins", "Segoe UI", "Helvetica Neue", Arial, sans-serif',
  },
  {
    key: "source-sans-3",
    label: "Source Sans 3",
    fontFamily:
      'var(--font-brand-source-sans-3), "Source Sans 3", "Segoe UI", "Helvetica Neue", Arial, sans-serif',
  },
  {
    key: "lato",
    label: "Lato",
    fontFamily:
      'var(--font-brand-lato), "Lato", "Segoe UI", "Helvetica Neue", Arial, sans-serif',
  },
];

/** The option whose family defers to the design system's `--font-sans`. */
const DEFAULT_FONT_KEY: BrandingFontKey = "huchu";

/**
 * The unbranded baseline. Colours mirror `@corelithzw/react`'s `--brand`,
 * `--brand-soft` and `--brand-tint` so the branding editor opens on the design
 * system rather than on a palette the product no longer uses. Nothing here
 * reaches the DOM while `brandingEnabled` is false — see
 * `getBrandingCssVariables` — these values only seed the editor's swatches.
 */
const DEFAULT_BRANDING: EffectiveBranding = {
  companyId: null,
  companyName: null,
  displayName: PLATFORM_BRAND_NAME,
  fontFamilyKey: DEFAULT_FONT_KEY,
  fontFamily: BRANDING_FONT_OPTIONS[0].fontFamily,
  brandingEnabled: false,
  customDomainEnabled: false,
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

function parseHexColor(value: string): RGB | null {
  const normalized = normalizeHexColor(value);
  if (!normalized) {
    return null;
  }

  return {
    r: Number.parseInt(normalized.slice(1, 3), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    b: Number.parseInt(normalized.slice(5, 7), 16),
  };
}

function toHexColor(rgb: RGB): string {
  const toHex = (value: number) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0");
  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
}

function mixColors(from: string, to: string, ratio: number): string {
  const a = parseHexColor(from);
  const b = parseHexColor(to);
  if (!a || !b) {
    return from;
  }

  const clampedRatio = Math.max(0, Math.min(1, ratio));
  return toHexColor({
    r: a.r + (b.r - a.r) * clampedRatio,
    g: a.g + (b.g - a.g) * clampedRatio,
    b: a.b + (b.b - a.b) * clampedRatio,
  });
}

function getContrastTextColor(background: string): string {
  const rgb = parseHexColor(background);
  if (!rgb) {
    return "#ffffff";
  }

  const luminance =
    (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
  return luminance > 0.58 ? "#111827" : "#ffffff";
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
 * An inline style outranks every stylesheet, so anything emitted here silently
 * overrides `@corelithzw/react`. Two rules keep that from re-opening the drift
 * this function used to cause:
 *
 *  1. Emit ONLY what the tenant actually chose. Surfaces, text, borders,
 *     statuses, charts and shadows are the design system's job — they used to
 *     be hardcoded warm-paper hexes here, which is why every page rendered off
 *     the token set regardless of what the stylesheets said.
 *  2. Re-tint through the design system's OWN token names (`--brand` and its
 *     scale), not just the app's aliases. That is what makes a tenant's colour
 *     reach components rendered by the package, which read `--brand`.
 *
 * With branding disabled the result is empty and the page renders as pure
 * design system.
 */
export function getBrandingCssVariables(branding: EffectiveBranding): Record<string, string> {
  if (!branding.brandingEnabled) {
    return {};
  }

  const { primary, secondary, accent } = branding.colors;

  const strong = mixColors(primary, "#000000", 0.18);
  const deeper = mixColors(primary, "#000000", 0.32);
  const onPrimary = getContrastTextColor(primary);

  return {
    // Typeface. Skipped on the default key: that option's family IS
    // `var(--font-sans)`, and emitting it here would define `--font-sans` in
    // terms of itself — a reference cycle that leaves the element with no
    // font-family at all. Omitting it lets the design system's face stand.
    ...(branding.fontFamilyKey === DEFAULT_FONT_KEY
      ? {}
      : { "--font-sans": branding.fontFamily }),

    // The design system's brand scale — one saturated colour, re-anchored on
    // the tenant's. Everything downstream (actions, focus ring, info tone,
    // links, selection wash, package components) derives from these.
    "--brand": primary,
    "--brand-strong": strong,
    "--brand-deeper": deeper,
    "--brand-soft": mixColors(primary, "#ffffff", 0.9),
    "--brand-tint": mixColors(primary, "#ffffff", 0.94),
    "--brand-50": mixColors(primary, "#ffffff", 0.94),
    "--brand-100": mixColors(primary, "#ffffff", 0.86),
    "--brand-200": mixColors(primary, "#ffffff", 0.7),
    "--brand-300": mixColors(primary, "#ffffff", 0.48),
    "--brand-500": primary,
    "--brand-700": strong,
    "--brand-900": mixColors(primary, "#000000", 0.55),

    // `--action-primary-*` and `--focus-ring` already resolve through `--brand`
    // in the package, so only the foreground needs stating: contrast against an
    // arbitrary tenant colour cannot be derived in CSS.
    "--action-primary-fg": onPrimary,

    // Secondary and accent are separate tenant choices, not brand rungs.
    "--action-secondary-bg": secondary,
    "--action-secondary-bg-h": mixColors(secondary, "#000000", 0.06),
    "--action-secondary-fg": getContrastTextColor(secondary),
    "--accent": accent,
    "--accent-foreground": getContrastTextColor(accent),
  };
}

export function getBrandingFeatureKeys() {
  return {
    manage: BRANDING_MANAGE_FEATURE,
    customDomain: BRANDING_CUSTOM_DOMAIN_FEATURE,
  };
}
