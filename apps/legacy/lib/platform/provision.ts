import bcrypt from "bcryptjs";
import { Prisma } from "@corelithzw/db";

import { prisma } from "@corelithzw/db/client";
import { writePlatformAuditEvent } from "@/lib/audit/platform";
import { ensureAccountingDefaults } from "@/lib/accounting/bootstrap";
import { grantBundleToCompany } from "@/lib/platform/entitlements";
import { getBundleDefinition, getTierDefinition } from "@/lib/platform/feature-catalog";
import {
  getClientTemplateBundleCodes,
  getClientTemplateWorkspaceProfile,
  resolveClientTemplateCode,
} from "@/lib/platform/client-templates";

/**
 * Standing a tenant up, from one function call.
 *
 * SS-2.1. Until now the only ways to create a working tenant were the guided
 * TUI wizard (`scripts/platform/modules/wizards/org-provision-wizard.tsx` into
 * `provisionBundle`) and `pnpm provision:school`. Both are operator-driven and
 * neither can be called from a request handler, which is the thing standing
 * between the platform and a public trial signup: a stranger cannot wait for
 * somebody to open a terminal.
 *
 * The shape follows `lib/schools/provision.ts` — which stays where it is and
 * keeps working — and generalises the part above the vertical: company,
 * subdomain, admin, subscription on the resolved tier, template bundles,
 * accounting defaults.
 *
 * **Idempotent on slug.** A retried provision — a dropped connection, a double
 * click on a signup button, a queue that delivers twice — must not leave two
 * companies with two subscriptions and two bills. Every step re-reads before it
 * writes, and the run that finds the company already there reports
 * `created: false` and repairs whatever is missing rather than starting again.
 *
 * Deliberately *not* one big transaction. Two of the steps —
 * `grantBundleToCompany` and `ensureAccountingDefaults` — issue their own
 * writes against the global client and cannot be enlisted, and the seed pack is
 * slow enough that holding a transaction across it would trip the provisioning
 * timeout the TUI path already has to tune around. Idempotency is what makes
 * that safe: a run that dies halfway is finished by running it again.
 */

/** What a tenant gets when the caller does not choose. */
export const DEFAULT_TENANT_TIER_CODE = "START";
export const DEFAULT_TENANT_TEMPLATE_CODE = "TEMPLATE_CORE_STARTER";

const MIN_ADMIN_PASSWORD_LENGTH = 8;

export type ProvisionTenantInput = {
  /** Display name of the business. */
  name: string;
  /** URL-safe identity, and the idempotency key. Derived from `name` if absent. */
  slug?: string;
  /** A `CLIENT_BUNDLE_TEMPLATES` code; aliases resolve. */
  templateCode?: string;
  /** A tier code or any of its `TIER_CODE_ALIASES`. */
  tierCode?: string;
  adminEmail: string;
  adminName?: string;
  /**
   * Optional. Without one the admin row is created with no password, which is
   * the correct state for an invite or reset flow — inventing a password and
   * emailing it would be worse than having none.
   */
  adminPassword?: string;
  /** Defaults to the slug. */
  subdomain?: string;
  /** `TRIALING` for a self-serve trial, `ACTIVE` for a sold tenant. */
  subscriptionStatus?: "TRIALING" | "ACTIVE";
  /** Only read when the subscription is created as `TRIALING`. */
  trialDays?: number;
  /** Who to attribute the audit entry to. */
  actor?: string;
  reason?: string;
};

export type ProvisionTenantResult = {
  /** False when the slug was already provisioned — i.e. this was a retry. */
  created: boolean;
  company: { id: string; name: string; slug: string };
  admin: { id: string; email: string; created: boolean };
  subscription: { id: string; status: string; planCode: string; created: boolean };
  subdomain: { value: string; created: boolean };
  /** Template bundles granted on top of the tier. See `bundlesToGrant`. */
  bundlesGranted: string[];
  featuresEnabled: number;
  accounting: { accountsCreated: number; postingRulesCreated: number };
  /** Things that did not stop the provision but somebody should read. */
  warnings: string[];
};

export function slugifyTenant(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function normaliseEmail(value: string): string {
  const normalised = String(value || "").trim().toLowerCase();
  if (!normalised || !normalised.includes("@")) {
    throw new Error(`Invalid admin email: ${value}`);
  }
  return normalised;
}

function isUniqueViolation(error: unknown, target: string): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code !== "P2002") return false;
  const meta = error.meta as { target?: string[] | string } | undefined;
  const fields = Array.isArray(meta?.target) ? meta.target.join(",") : String(meta?.target ?? "");
  return fields.toLowerCase().includes(target.toLowerCase());
}

/**
 * The bundles a template adds *beyond* what the tier already carries.
 *
 * `getCompanyFeatureMap` entitles a tenant to everything in its tier's
 * `includedBundles` from the plan code alone, while `computeCompanyPricing`
 * charges every enabled `CompanySubscriptionAddon` on top of the tier's base
 * price. Granting a bundle the tier already includes therefore buys no feature
 * and adds its list price to the invoice — a silent overcharge that looks like
 * a correctly provisioned tenant from every screen.
 */
export function bundlesToGrant(templateCode: string | null, tierCode: string): string[] {
  const tier = getTierDefinition(tierCode);
  const includedByTier = new Set((tier?.includedBundles ?? []).map((code) => code.toUpperCase()));
  return getClientTemplateBundleCodes(templateCode)
    .map((code) => code.toUpperCase())
    .filter((code, index, all) => all.indexOf(code) === index)
    .filter((code) => !includedByTier.has(code));
}

/**
 * The `SubscriptionPlan` row the tier is billed through.
 *
 * The catalogue in `feature-catalog.ts` is the source of truth for price and
 * limits; this table exists because `CompanySubscription.planId` is a foreign
 * key. Upserting the figures on every provision keeps a row created by an older
 * price list from quietly billing the old price.
 */
async function ensureTierPlan(tierCode: string) {
  const tier = getTierDefinition(tierCode);
  if (!tier) throw new Error(`Unknown tier code "${tierCode}".`);

  return prisma.subscriptionPlan.upsert({
    where: { code: tier.code },
    update: {
      name: tier.name,
      description: tier.description,
      monthlyPrice: tier.monthlyPrice,
      annualPrice: tier.annualMonthlyPrice * 12,
      maxSites: tier.includedSites,
      maxUsers: tier.includedUsers,
      warningDays: tier.warningDays,
      graceDays: tier.graceDays,
      isActive: true,
    },
    create: {
      code: tier.code,
      name: tier.name,
      description: tier.description,
      monthlyPrice: tier.monthlyPrice,
      annualPrice: tier.annualMonthlyPrice * 12,
      maxSites: tier.includedSites,
      maxUsers: tier.includedUsers,
      warningDays: tier.warningDays,
      graceDays: tier.graceDays,
      currency: "USD",
      isActive: true,
    },
    select: { id: true, code: true },
  });
}

export async function provisionTenant(
  input: ProvisionTenantInput,
  at = new Date(),
): Promise<ProvisionTenantResult> {
  const warnings: string[] = [];

  const name = String(input.name || "").trim();
  if (!name) throw new Error("Tenant name is required.");

  const slug = slugifyTenant(input.slug || name);
  if (!slug) throw new Error(`Could not derive a slug from "${input.name}".`);

  const subdomain = slugifyTenant(input.subdomain || slug);
  if (!subdomain) throw new Error(`Could not derive a subdomain from "${slug}".`);

  const adminEmail = normaliseEmail(input.adminEmail);
  const adminName = String(input.adminName || "").trim() || "Administrator";

  if (input.adminPassword !== undefined && input.adminPassword.length < MIN_ADMIN_PASSWORD_LENGTH) {
    throw new Error(`adminPassword must be at least ${MIN_ADMIN_PASSWORD_LENGTH} characters.`);
  }

  const tier = getTierDefinition(input.tierCode ?? DEFAULT_TENANT_TIER_CODE);
  if (!tier) throw new Error(`Unknown tier code "${input.tierCode}".`);

  const templateCode =
    resolveClientTemplateCode(input.templateCode ?? DEFAULT_TENANT_TEMPLATE_CODE) ?? null;
  if (input.templateCode && !templateCode) {
    warnings.push(`Unknown template "${input.templateCode}"; provisioned with no template bundles.`);
  }

  const existingCompany = await prisma.company.findUnique({
    where: { slug },
    select: { id: true, name: true, slug: true },
  });

  // Both of these are globally unique columns owned by somebody else's tenant.
  // Checking before the company row is written means a collision fails with a
  // name the operator can act on instead of leaving a half-built tenant behind.
  const subdomainHolder = await prisma.subdomainReservation.findUnique({
    where: { subdomain },
    select: { id: true, companyId: true, status: true },
  });
  if (subdomainHolder && subdomainHolder.companyId !== existingCompany?.id) {
    throw new Error(`Subdomain "${subdomain}" is already reserved by another tenant.`);
  }

  const emailHolder = await prisma.user.findUnique({
    where: { email: adminEmail },
    select: { id: true, companyId: true },
  });
  if (emailHolder && emailHolder.companyId !== existingCompany?.id) {
    throw new Error(`Admin email "${adminEmail}" already belongs to another tenant.`);
  }

  const workspaceProfile = (getClientTemplateWorkspaceProfile(templateCode) ??
    "GENERAL") as Prisma.CompanyCreateInput["workspaceProfile"];

  let company = existingCompany;
  let created = false;
  if (!company) {
    try {
      company = await prisma.company.create({
        data: {
          name,
          slug,
          workspaceProfile,
          tenantStatus: "ACTIVE",
          isProvisioned: true,
        },
        select: { id: true, name: true, slug: true },
      });
      created = true;
    } catch (error) {
      // Two provisions of the same slug in flight at once. The loser re-reads
      // rather than failing: the caller asked for this tenant to exist, and it
      // does.
      if (!isUniqueViolation(error, "slug")) throw error;
      company = await prisma.company.findUnique({
        where: { slug },
        select: { id: true, name: true, slug: true },
      });
      if (!company) throw error;
    }
  } else {
    // A re-run must not rename a tenant somebody has since edited, but it does
    // finish the job: a company left in PROVISIONING by a failed first attempt
    // is exactly what the retry is for.
    await prisma.company.update({
      where: { id: company.id },
      data: { tenantStatus: "ACTIVE", isProvisioned: true },
    });
  }

  const companyId = company.id;

  const existingAdmin = await prisma.user.findUnique({
    where: { email: adminEmail },
    select: { id: true, email: true },
  });
  const admin =
    existingAdmin ??
    (await prisma.user.create({
      data: {
        companyId,
        email: adminEmail,
        name: adminName,
        password: input.adminPassword
          ? await bcrypt.hash(input.adminPassword, 12)
          : null,
        role: "SUPERADMIN",
        isActive: true,
      },
      select: { id: true, email: true },
    }));

  const plan = await ensureTierPlan(tier.code);

  const existingSubscription = await prisma.companySubscription.findFirst({
    where: { companyId },
    orderBy: [{ updatedAt: "desc" }],
    select: { id: true, status: true, plan: { select: { code: true } } },
  });

  if (existingSubscription && existingSubscription.plan.code !== plan.code) {
    // Re-provisioning is not the tier-change path. `assignTier` in the platform
    // console is, and it records who moved the tenant and why; silently
    // repricing here would make a retry indistinguishable from a sale.
    warnings.push(
      `Tenant is already subscribed on ${existingSubscription.plan.code}; left as is rather than repriced to ${plan.code}.`,
    );
  }

  const subscriptionStatus = input.subscriptionStatus ?? "ACTIVE";
  const subscription =
    existingSubscription ??
    (await prisma.companySubscription.create({
      data: {
        companyId,
        planId: plan.id,
        status: subscriptionStatus,
        startedAt: at,
        currentPeriodStart: at,
        trialEndsAt:
          subscriptionStatus === "TRIALING" && input.trialDays
            ? new Date(at.getTime() + input.trialDays * 24 * 60 * 60 * 1000)
            : null,
      },
      select: { id: true, status: true, plan: { select: { code: true } } },
    }));

  const reservation = await prisma.subdomainReservation.findUnique({
    where: { subdomain },
    select: { id: true },
  });
  if (!reservation) {
    // RESERVED rather than ACTIVE: the DNS/host side is a separate concern
    // (`provisionTenantSurfaceDomains`), and claiming the host is live before
    // anything answers on it is the kind of green tick that hides an outage.
    await prisma.subdomainReservation.create({
      data: { companyId, subdomain, status: "RESERVED" },
    });
  }

  // Bundles before accounting, for the reason `lib/schools/provision.ts`
  // records: the seed pack decides what chart to lay down from the tenant's
  // enabled features, and until the grants land there are none.
  const bundlesGranted: string[] = [];
  let featuresEnabled = 0;
  for (const bundleCode of bundlesToGrant(templateCode, tier.code)) {
    if (!getBundleDefinition(bundleCode)) {
      warnings.push(`Template bundle "${bundleCode}" is not in the catalogue; skipped.`);
      continue;
    }
    try {
      const granted = await grantBundleToCompany({
        companyId,
        bundleCode,
        reason: `Provisioned on template ${templateCode ?? "none"}`,
      });
      bundlesGranted.push(granted.bundleCode);
      featuresEnabled += granted.featuresEnabled;
    } catch (error) {
      warnings.push(
        `Bundle "${bundleCode}" could not be granted: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
  }

  // Reported rather than thrown. Everything above this line is already
  // committed, so a throw here would leave a tenant that exists, is billable
  // and is invisible to its own caller — and the retry would die at the same
  // step forever. The seed pack also runs as a safety net inside every posting
  // attempt (`lib/accounting/bootstrap.ts`), so a tenant that reaches this
  // warning is recoverable rather than broken; the warning and the audit
  // payload are how somebody finds out it needs recovering.
  let accounting = { createdAccounts: 0, createdPostingRules: 0 };
  try {
    accounting = await ensureAccountingDefaults(companyId);
  } catch (error) {
    warnings.push(
      `Accounting defaults were not seeded: ${error instanceof Error ? error.message : "unknown error"}`,
    );
  }

  // A retry is a real event and is recorded as one. Collapsing both onto a
  // single event type would make "this tenant was provisioned twice" invisible
  // in the ledger that exists to answer exactly that kind of question.
  await writePlatformAuditEvent({
    companyId,
    actorId: input.actor ?? "platform:provision",
    eventType: created ? "PLATFORM_TENANT_PROVISIONED" : "PLATFORM_TENANT_PROVISION_REPLAYED",
    entityType: "company",
    entityId: companyId,
    reason: input.reason ?? (created ? `Provisioned ${slug}` : `Re-ran provisioning for ${slug}`),
    payload: {
      slug,
      subdomain,
      tierCode: tier.code,
      templateCode,
      adminEmail,
      adminCreated: !existingAdmin,
      subscriptionCreated: !existingSubscription,
      bundlesGranted,
      warnings,
    },
  });

  return {
    created,
    company: { id: companyId, name: company.name, slug: company.slug },
    admin: { id: admin.id, email: admin.email, created: !existingAdmin },
    subscription: {
      id: subscription.id,
      status: subscription.status,
      planCode: subscription.plan.code,
      created: !existingSubscription,
    },
    subdomain: { value: subdomain, created: !reservation },
    bundlesGranted,
    featuresEnabled,
    accounting: {
      accountsCreated: accounting.createdAccounts,
      postingRulesCreated: accounting.createdPostingRules,
    },
    warnings,
  };
}
