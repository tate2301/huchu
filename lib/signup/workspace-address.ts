import { getPortalHostPrefixes } from "@/lib/platform/portal-hosts";
import { slugifyTenant } from "@/lib/platform/tenant-slug";

/**
 * The rules for a workspace's address — the `luxliquor` in
 * `luxliquor.flare.co.zw`.
 *
 * Pure, so the signup page can show the address and its problem as it is
 * typed, and the server applies exactly the same rules when it is submitted.
 * Whether an address is free is a separate, server-side question.
 */

export const WORKSPACE_SLUG_MIN_LENGTH = 3;
export const WORKSPACE_SLUG_MAX_LENGTH = 40;

/**
 * Addresses a workspace may not take: the platform's own hosts, and the portal
 * prefixes, which `lib/platform/tenant.ts` reads as a portal rather than a
 * tenant when they are the first label of a host.
 */
const RESERVED_SLUGS = new Set([
  "app",
  "www",
  "admin",
  "api",
  "auth",
  "login",
  "signup",
  "account",
  "billing",
  "pay",
  "help",
  "support",
  "status",
  "mail",
  "email",
  "docs",
  "blog",
  "home",
  "static",
  "assets",
  "cdn",
  "portal",
  "dashboard",
  ...getPortalHostPrefixes({ includeAliases: true }),
]);

export type WorkspaceSlugProblem = "TOO_SHORT" | "TOO_LONG" | "NOT_AN_ADDRESS" | "RESERVED";

/** The address a business name suggests, cut to the length an address may be. */
export function suggestWorkspaceSlug(businessName: string): string {
  return slugifyTenant(businessName).slice(0, WORKSPACE_SLUG_MAX_LENGTH).replace(/-+$/, "");
}

export function checkWorkspaceSlug(slug: string): WorkspaceSlugProblem | null {
  const value = String(slug ?? "");
  if (value.length < WORKSPACE_SLUG_MIN_LENGTH) return "TOO_SHORT";
  if (value.length > WORKSPACE_SLUG_MAX_LENGTH) return "TOO_LONG";
  if (slugifyTenant(value) !== value) return "NOT_AN_ADDRESS";
  if (RESERVED_SLUGS.has(value)) return "RESERVED";
  return null;
}

export function describeWorkspaceSlugProblem(problem: WorkspaceSlugProblem): string {
  switch (problem) {
    case "TOO_SHORT":
      return `Use at least ${WORKSPACE_SLUG_MIN_LENGTH} characters.`;
    case "TOO_LONG":
      return `Use at most ${WORKSPACE_SLUG_MAX_LENGTH} characters.`;
    case "NOT_AN_ADDRESS":
      return "Use lowercase letters, numbers and single hyphens.";
    case "RESERVED":
      return "That address is kept for Flare itself. Try another.";
  }
}
