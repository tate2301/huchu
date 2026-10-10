import { createHash } from "crypto";
import { headers } from "next/headers";
import { isAdminPortalHost } from "@/lib/admin-portal";
import { prisma } from "@/lib/prisma";
import { PLATFORM_BRAND_INITIAL, PLATFORM_BRAND_NAME } from "@/lib/platform/brand";
import {
  type EffectiveBranding,
  getEffectiveBrandingForCompany,
  getEffectiveBrandingForHost,
} from "@/lib/platform/branding";
import { getCurrentAuthSession } from "@/lib/auth-core/guards";
import { getHostHeaderFromRequestHeaders } from "@/lib/platform/tenant";
import type { IconPurpose } from "@/lib/platform/workspace-icon";

export type WorkspaceIdentity = {
  companyId: string | null;
  workspaceName: string;
  shortName: string;
  initial: string;
  backgroundColor: string;
  foregroundColor: string;
  /** The branding logo, when the workspace has one. See `EffectiveBranding`. */
  logoUrl: string | null;
  version: string;
  branding: EffectiveBranding;
  /**
   * `Company.workspaceProfile`, which picks the product theme when there is
   * no session to say (5.1.1). Null without a company, and on the admin
   * portal, which is always the Corelith product.
   */
  workspaceProfile: string | null;
};

function resolveForegroundColor(background: string) {
  const normalized = background.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return "#ffffff";
  }
  const red = parseInt(normalized.slice(0, 2), 16);
  const green = parseInt(normalized.slice(2, 4), 16);
  const blue = parseInt(normalized.slice(4, 6), 16);
  const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
  return luminance > 0.62 ? "#0f172a" : "#ffffff";
}

function deriveWorkspaceName(branding: EffectiveBranding) {
  return (
    branding.displayName?.trim() ||
    branding.companyName?.trim() ||
    PLATFORM_BRAND_NAME
  );
}

function deriveShortName(workspaceName: string) {
  const trimmed = workspaceName.trim();
  if (trimmed.length <= 18) {
    return trimmed;
  }
  const words = trimmed.split(/\s+/).filter(Boolean);
  const compact = words.slice(0, 2).join(" ");
  return compact.length <= 18 ? compact : trimmed.slice(0, 18).trim();
}

function deriveInitial(workspaceName: string) {
  const match = workspaceName.trim().match(/[A-Za-z0-9]/);
  return (match?.[0] ?? PLATFORM_BRAND_INITIAL).toUpperCase();
}

function buildVersionSeed(branding: EffectiveBranding, workspaceName: string) {
  return JSON.stringify({
    companyId: branding.companyId,
    workspaceName,
    primary: branding.colors.primary,
    secondary: branding.colors.secondary,
    accent: branding.colors.accent,
    logoUrl: branding.logoUrl,
  });
}

function toWorkspaceIdentity(
  branding: EffectiveBranding,
  workspaceProfile: string | null,
): WorkspaceIdentity {
  const workspaceName = deriveWorkspaceName(branding);
  const backgroundColor = branding.colors.primary || "#0f8f86";
  return {
    companyId: branding.companyId,
    workspaceName,
    shortName: deriveShortName(workspaceName),
    initial: deriveInitial(workspaceName),
    backgroundColor,
    foregroundColor: resolveForegroundColor(backgroundColor),
    logoUrl: branding.logoUrl,
    version: createHash("sha1")
      .update(buildVersionSeed(branding, workspaceName))
      .digest("hex")
      .slice(0, 12),
    branding,
    workspaceProfile,
  };
}

async function findWorkspaceProfile(companyId: string | null): Promise<string | null> {
  if (!companyId) {
    return null;
  }
  const company = await prisma.company
    .findUnique({ where: { id: companyId }, select: { workspaceProfile: true } })
    .catch(() => null);
  return company?.workspaceProfile ?? null;
}

export async function resolveWorkspaceIdentityForHost(hostHeader?: string | null) {
  let branding = await getEffectiveBrandingForHost(hostHeader ?? null);

  if (!branding.companyId) {
    const session = await getCurrentAuthSession().catch(() => null);
    const companyId = session?.user?.companyId?.trim();
    if (companyId) {
      branding = await getEffectiveBrandingForCompany(companyId);
    }
  }

  const workspaceProfile = isAdminPortalHost(hostHeader)
    ? null
    : await findWorkspaceProfile(branding.companyId);

  return toWorkspaceIdentity(branding, workspaceProfile);
}

/** A workspace's identity by its company, or the platform's without one. */
export async function resolveWorkspaceIdentityForCompany(companyId: string | null) {
  const branding = await getEffectiveBrandingForCompany(companyId ?? "");
  return toWorkspaceIdentity(branding, await findWorkspaceProfile(branding.companyId));
}

export async function resolveWorkspaceIdentityFromRequestHeaders() {
  const requestHeaders = await headers();
  const hostHeader = getHostHeaderFromRequestHeaders(requestHeaders);
  return resolveWorkspaceIdentityForHost(hostHeader);
}

export function buildWorkspaceManifestHref(identity: WorkspaceIdentity) {
  return `/manifest.webmanifest?v=${encodeURIComponent(identity.version)}`;
}

/**
 * The workspace's icon. Names the company rather than carrying its logo or
 * colours, so the route draws from the branding it looks up itself and cannot
 * be pointed at an address or made to draw somebody else's name. `v` changes
 * with the branding, so a new logo is a new URL rather than a stale cache.
 */
export function buildWorkspaceIconHref(
  identity: WorkspaceIdentity,
  options?: { size?: number; purpose?: IconPurpose },
) {
  const params = new URLSearchParams({ v: identity.version });
  if (identity.companyId) {
    params.set("c", identity.companyId);
  }

  if (options?.size) {
    params.set("size", String(options.size));
  }
  if (options?.purpose) {
    params.set("purpose", options.purpose);
  }

  return `/api/workspace-app-icon?${params.toString()}`;
}
