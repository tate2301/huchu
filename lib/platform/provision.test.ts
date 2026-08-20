/**
 * Platform tenant provisioning, against a real database.
 *
 * The assertion that matters here is the one about running it twice. SS-3 will
 * put this behind a public signup form, which means the caller is a browser on
 * a Zimbabwean mobile connection: the request will be retried, by the user's
 * thumb if not by anything else. A provisioning function that is not idempotent
 * answers that with a second company, a second subscription and a second
 * invoice, and nothing in the product would show it — two tenants with almost
 * the same slug look exactly like two customers.
 *
 * Prerequisites: a real Postgres DATABASE_URL with migrations applied.
 */

import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { bundlesToGrant, provisionTenant } from "./provision";

const STAMP = `${Date.now()}${Math.floor(process.hrtime()[1] / 1000)}`;
const RETRY_SLUG = `provision-retry-${STAMP}`;
const ALIAS_SLUG = `provision-alias-${STAMP}`;

async function destroyTenant(slug: string) {
  const company = await prisma.company.findUnique({ where: { slug }, select: { id: true } });
  if (!company) return;
  // The audit chain survives its company by design (`onDelete: SetNull`), so a
  // test that only deletes the company leaves orphan rows in the ledger.
  await prisma.platformAuditEvent.deleteMany({ where: { companyId: company.id } });
  await prisma.user.deleteMany({ where: { companyId: company.id } });
  await prisma.company.delete({ where: { id: company.id } }).catch(() => {});
}

beforeAll(async () => {
  await prisma.$connect();
  await Promise.all([destroyTenant(RETRY_SLUG), destroyTenant(ALIAS_SLUG)]);
});

afterAll(async () => {
  await destroyTenant(RETRY_SLUG);
  await destroyTenant(ALIAS_SLUG);
  await prisma.$disconnect();
});

describe("bundlesToGrant", () => {
  it("grants nothing a tier already includes", () => {
    // TEMPLATE_CORE_STARTER's three bundles are exactly the base bundles START
    // carries. Granting them as add-ons would entitle the tenant to nothing new
    // and add three list prices to its monthly bill.
    expect(bundlesToGrant("TEMPLATE_CORE_STARTER", "START")).toEqual([]);
  });

  it("grants what the tier leaves out", () => {
    // FISCAL is the wedge: operations, the ledger and ZIMRA, and nothing else.
    // Stores and workforce are genuinely add-ons on it.
    expect(bundlesToGrant("TEMPLATE_CORE_STARTER", "FISCAL").sort()).toEqual([
      "ADDON_STORES_CORE",
      "ADDON_WORKFORCE_CORE",
    ]);
  });

  it("resolves a retired tier code onto the tier that now serves it", () => {
    expect(bundlesToGrant("TEMPLATE_CORE_STARTER", "BASIC")).toEqual(
      bundlesToGrant("TEMPLATE_CORE_STARTER", "START"),
    );
  });
});

describe("provisionTenant", () => {
  it(
    "provisioned twice on one slug leaves one tenant, and says so",
    async () => {
      const first = await provisionTenant({
        name: "Retry Hardware",
        slug: RETRY_SLUG,
        tierCode: "FISCAL",
        templateCode: "TEMPLATE_CORE_STARTER",
        adminEmail: `admin+${STAMP}@retry.example`,
        adminName: "Rudo Retry",
        adminPassword: "provision-me-1",
        actor: "test:provision",
      });

      expect(first.created).toBe(true);
      expect(first.admin.created).toBe(true);
      expect(first.subscription.created).toBe(true);
      expect(first.subdomain.created).toBe(true);
      expect(first.subscription.planCode).toBe("FISCAL");
      expect(first.bundlesGranted.sort()).toEqual(["ADDON_STORES_CORE", "ADDON_WORKFORCE_CORE"]);

      const second = await provisionTenant({
        name: "Retry Hardware",
        slug: RETRY_SLUG,
        tierCode: "FISCAL",
        templateCode: "TEMPLATE_CORE_STARTER",
        adminEmail: `admin+${STAMP}@retry.example`,
        adminName: "Rudo Retry",
        adminPassword: "provision-me-1",
        actor: "test:provision",
      });

      expect(second.created).toBe(false);
      expect(second.company.id).toBe(first.company.id);
      expect(second.admin.created).toBe(false);
      expect(second.subscription.created).toBe(false);
      expect(second.subdomain.created).toBe(false);

      const companies = await prisma.company.findMany({
        where: { slug: RETRY_SLUG },
        select: { id: true, isProvisioned: true, tenantStatus: true },
      });
      expect(companies).toHaveLength(1);
      expect(companies[0].isProvisioned).toBe(true);
      expect(companies[0].tenantStatus).toBe("ACTIVE");

      const companyId = first.company.id;
      expect(await prisma.user.count({ where: { companyId } })).toBe(1);
      expect(await prisma.companySubscription.count({ where: { companyId } })).toBe(1);
      expect(await prisma.subdomainReservation.count({ where: { companyId } })).toBe(1);
    },
    120_000,
  );

  it(
    "writes one provisioning event, and records the retry as a retry",
    async () => {
      // Depends on the run above: both provisions have already happened, and
      // this reads the ledger they left.
      const events = await prisma.platformAuditEvent.findMany({
        where: {
          companyId: (await prisma.company.findUnique({
            where: { slug: RETRY_SLUG },
            select: { id: true },
          }))!.id,
        },
        select: { eventType: true, eventHash: true, prevEventHash: true },
        orderBy: { createdAt: "asc" },
      });

      const provisioned = events.filter((row) => row.eventType === "PLATFORM_TENANT_PROVISIONED");
      const replayed = events.filter(
        (row) => row.eventType === "PLATFORM_TENANT_PROVISION_REPLAYED",
      );

      expect(provisioned).toHaveLength(1);
      // A retry is an event in its own right. Filing it as a second
      // PROVISIONED would say a tenant was created twice; filing it as nothing
      // would hide that anybody ran it again.
      expect(replayed).toHaveLength(1);
      expect(replayed[0].prevEventHash).toBe(provisioned[0].eventHash);
    },
    60_000,
  );

  it(
    "puts a legacy tier code on the tier that now serves it",
    async () => {
      const result = await provisionTenant({
        name: "Alias Traders",
        slug: ALIAS_SLUG,
        // Retired code. A subscription must never be written against a tier
        // that no longer exists.
        tierCode: "BASIC",
        adminEmail: `admin+${STAMP}@alias.example`,
        actor: "test:provision",
      });

      expect(result.subscription.planCode).toBe("START");

      const subscription = await prisma.companySubscription.findFirstOrThrow({
        where: { companyId: result.company.id },
        select: { status: true, plan: { select: { code: true, monthlyPrice: true } } },
      });
      expect(subscription.plan.code).toBe("START");
      expect(subscription.plan.monthlyPrice).toBe(39);
      expect(subscription.status).toBe("ACTIVE");

      // No password was supplied, so the admin exists but cannot sign in yet —
      // an invite or reset is the intended next step, not a password we chose
      // for them.
      const admin = await prisma.user.findUniqueOrThrow({
        where: { id: result.admin.id },
        select: { password: true, role: true, isActive: true },
      });
      expect(admin.password).toBeNull();
      expect(admin.role).toBe("SUPERADMIN");
      expect(admin.isActive).toBe(true);
    },
    120_000,
  );
});
