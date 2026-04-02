import { isAdminPortalHost } from "@/lib/admin-portal";
import { prisma } from "@/lib/prisma";
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
    key: "huchu",
    label: "SS Huchu",
    fontFamily: '"SS Huchu", "Segoe UI", "Helvetica Neue", Arial, sans-serif',
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

const DEFAULT_BRANDING: EffectiveBranding = {
  companyId: null,
  companyName: null,
  displayName: "Huchu Enterprises",
  fontFamilyKey: "huchu",
  fontFamily: BRANDING_FONT_OPTIONS[0].fontFamily,
  brandingEnabled: false,
  customDomainEnabled: false,
  colors: {
    primary: "#4f46e5",
    secondary: "#eef2ff",
    accent: "#f1f5f9",
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

export function getBrandingCssVariables(branding: EffectiveBranding): Record<string, string> {
  const primary = branding.colors.primary;
  const secondary = branding.colors.secondary;
  const accent = branding.colors.accent;

  return {
    // Font family
    "--font-sans": branding.fontFamily,
    "--font-family": branding.fontFamily,

    // Action colors (primary button)
    "--action-primary-bg": primary,
    "--action-primary-hover": mixColors(primary, "#000000", 0.12),
    "--action-primary-fg": getContrastTextColor(primary),
    "--action-secondary-bg": secondary,
    "--action-secondary-hover": mixColors(primary, "#000000", 0.06),
    "--action-secondary-fg": getContrastTextColor(secondary),
    "--focus-ring": mixColors(primary, "#ffffff", 0.16),

    // Base colors (shadcn compatibility)
    "--primary": primary,
    "--primary-foreground": getContrastTextColor(primary),
    "--secondary": secondary,
    "--secondary-foreground": getContrastTextColor(secondary),
    "--accent": accent,
    "--accent-foreground": getContrastTextColor(accent),

    // Sidebar colors
    "--sidebar-primary": primary,
    "--sidebar-primary-foreground": getContrastTextColor(primary),

    // Surface colors (neutral, admin-first aesthetic)
    "--surface-canvas": "#F8FAFC",
    "--surface-base": "#FFFFFF",
    "--surface-raised": "#FFFFFF",
    "--surface-muted": "#F1F5F9",
    "--surface-subtle": "#EDF2F7",

    // Border colors
    "--border": "#E2E8F0",
    "--border-strong": "#CBD5E1",

    // Text colors
    "--text-strong": "#0F172A",
    "--text-body": "#0F172A",
    "--text-muted": "#64748B",
    "--text-subtle": "#94A3B8",
    "--text-inverse": "#FFFFFF",

    // Status colors
    "--status-success-bg": "rgba(34, 197, 94, 0.12)",
    "--status-success-text": "#22C55E",
    "--status-warning-bg": "rgba(245, 158, 11, 0.12)",
    "--status-warning-text": "#F59E0B",
    "--status-error-bg": "rgba(239, 68, 68, 0.12)",
    "--status-error-text": "#EF4444",

    // Chart colors (status-based)
    "--chart-grid": "#E2E8F0",
    "--chart-text": "#64748B",
    "--chart-passing": "#22C55E",
    "--chart-failing": "#EF4444",
    "--chart-need-changes": "#F59E0B",
    "--chart-in-review": primary,
    "--chart-in-progress": "#0EA5E9",
    "--chart-pending": "#CBD5E1",
    "--chart-inactive": "#94A3B8",

    // Chart palette (generic)
    "--chart-1": primary,
    "--chart-2": mixColors(primary, "#ffffff", 0.22),
    "--chart-3": mixColors(primary, "#000000", 0.18),
    "--chart-4": "#22C55E",
    "--chart-5": "#0EA5E9",

    // Shadow
    "--shadow-popover": "0 12px 24px -12px rgba(0,0,0,0.18), 0 2px 6px rgba(0,0,0,0.06)",
  };
}

export function getBrandingFeatureKeys() {
  return {
    manage: BRANDING_MANAGE_FEATURE,
    customDomain: BRANDING_CUSTOM_DOMAIN_FEATURE,
  };
}
