import "dotenv/config";

import type { OperatorRole } from "@prisma/client";

import { LOGIN_SUCCESS_EVENT } from "@/lib/auth-core/last-sign-in";
import { getProduct, getTrialTierCode } from "@/lib/platform/products";
import { syncMemberships } from "@/lib/teams/members";
import { provisionTenant } from "@/lib/platform/provision";
import { prisma } from "@/lib/prisma";
import { sealSecret } from "@/lib/operators/secret-box";
import { hashOperatorPassword } from "@/lib/operators/sign-in";
import { codeAt } from "@/lib/operators/totp";

/**
 * The admin portal's people and workspaces, for a local database only.
 *
 *   pnpm admin:seed-dev            seed (idempotent)
 *   pnpm admin:seed-dev --code     print each operator's authenticator code now
 *
 * Every operator signs in with DEV_PASSWORD. All but Kudakwashe have an
 * authenticator on DEV_TOTP_SECRET, so a code can be read from `--code`
 * instead of a phone; Kudakwashe has none, to walk the set-up step.
 *
 * Refuses any database that is not on this machine: these passwords are in
 * the repository.
 */

export const DEV_PASSWORD = "operator-dev-password";
export const DEV_TOTP_SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";

const OPERATORS: Array<{ email: string; name: string; role: OperatorRole; authenticator: boolean }> = [
  { email: "tafadzwa@corelith.co.zw", name: "Tafadzwa Mhlanga", role: "OWNER", authenticator: true },
  { email: "farai@corelith.co.zw", name: "Farai Moyo", role: "SUPPORT", authenticator: true },
  { email: "chipo@corelith.co.zw", name: "Chipo Ndoro", role: "SUPPORT", authenticator: true },
  { email: "rumbi@corelith.co.zw", name: "Rumbidzai Sithole", role: "BILLING", authenticator: true },
  { email: "kuda@corelith.co.zw", name: "Kudakwashe Dube", role: "SUPPORT", authenticator: false },
];

function assertLocalDatabase() {
  const host = new URL(process.env.DATABASE_URL ?? "postgresql://unset").hostname;
  if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
    throw new Error(`Refusing to seed ${host}: this script only writes to a database on this machine.`);
  }
}

async function seedOperators() {
  const passwordHash = await hashOperatorPassword(DEV_PASSWORD);
  for (const operator of OPERATORS) {
    const authenticator = operator.authenticator
      ? { totpSecret: sealSecret(DEV_TOTP_SECRET), totpConfirmedAt: new Date(), totpLastStep: null }
      : { totpSecret: null, totpConfirmedAt: null, totpLastStep: null };
    await prisma.operator.upsert({
      where: { email: operator.email },
      create: { email: operator.email, name: operator.name, role: operator.role, passwordHash, ...authenticator },
      update: {
        name: operator.name,
        role: operator.role,
        passwordHash,
        failedAttempts: 0,
        lockedUntil: null,
        deactivatedAt: null,
        ...authenticator,
      },
    });
  }
  console.log(`${OPERATORS.length} operators. Password: the DEV_PASSWORD constant in this file.`);
}

const DAY = 24 * 60 * 60 * 1000;

type Seat = { name: string; role?: "SUPERADMIN" | "MANAGER" | "CLERK" | "SALES_REP"; invited?: boolean; signedInHoursAgo?: number };

/** The workspaces in `design/admin/world.json`, standing where the world has them. */
const WORKSPACES: Array<{
  slug: string;
  name: string;
  flare?: boolean;
  template?: string;
  tier?: string;
  /** Where the subscription stands, in days from now: the period's end (or the trial's). */
  ends: number;
  status: "TRIALING" | "ACTIVE";
  tenantStatus?: "PROVISIONING" | "SUSPENDED" | "DISABLED";
  people: Seat[];
}> = [
  {
    slug: "chikuru-motors",
    name: "Chikuru Motors",
    flare: true,
    ends: 4,
    status: "TRIALING",
    people: [
      { name: "Tendai Chikuru", signedInHoursAgo: 0.25 },
      { name: "Rutendo Nyathi", role: "SALES_REP", signedInHoursAgo: 50 },
      { name: "Tatenda Chikuru", role: "MANAGER", signedInHoursAgo: 3 },
      { name: "Blessing Moyo", role: "SALES_REP", signedInHoursAgo: 26 },
      { name: "Nyasha Gumbo", role: "SALES_REP", signedInHoursAgo: 5 },
      { name: "Takudzwa Banda", role: "SALES_REP", invited: true },
    ],
  },
  {
    slug: "mazowe-gold",
    name: "Mazowe Gold Holdings",
    template: "TEMPLATE_GOLD_MINE",
    tier: "GOLD_EDITION",
    ends: 18,
    status: "ACTIVE",
    people: [
      { name: "Simbarashe Nhari", signedInHoursAgo: 0.15 },
      { name: "Farirai Mapfumo", role: "MANAGER", signedInHoursAgo: 1 },
      { name: "Kudzai Shumba", role: "CLERK", signedInHoursAgo: 2 },
    ],
  },
  {
    slug: "st-faiths",
    name: "St Faith's College",
    template: "TEMPLATE_SCHOOLS",
    tier: "SCALE",
    ends: 48,
    status: "ACTIVE",
    people: [
      { name: "Grace Mupfumi", signedInHoursAgo: 0.6 },
      { name: "Tapiwa Gora", role: "MANAGER", signedInHoursAgo: 20 },
    ],
  },
  {
    slug: "zuva-solar",
    name: "Zuva Solar",
    flare: true,
    ends: -3,
    status: "ACTIVE",
    people: [
      { name: "Tsitsi Banda", signedInHoursAgo: 2 },
      { name: "Panashe Dube", role: "SALES_REP", signedInHoursAgo: 30 },
    ],
  },
  {
    slug: "kopje-scrap",
    name: "Kopje Scrap Metals",
    tier: "GROW",
    ends: -5,
    status: "ACTIVE",
    people: [
      { name: "Brian Mutasa", signedInHoursAgo: 5 },
      { name: "Lovemore Sibanda", role: "CLERK", signedInHoursAgo: 8 },
    ],
  },
  {
    slug: "avondale-thrift",
    name: "Avondale Thrift",
    template: "TEMPLATE_RETAIL",
    tier: "START",
    ends: -11,
    status: "ACTIVE",
    people: [{ name: "Nokuthula Ndlovu", signedInHoursAgo: 5 * 24 }],
  },
  {
    slug: "pomona-hardware",
    name: "Pomona Hardware",
    template: "TEMPLATE_RETAIL",
    tier: "GROW",
    ends: 30,
    status: "ACTIVE",
    tenantStatus: "PROVISIONING",
    people: [{ name: "Kelvin Chari", invited: true }],
  },
  {
    slug: "greenline-payroll",
    name: "Greenline Payroll Services",
    template: "TEMPLATE_PAYROLL_BUREAU",
    tier: "START",
    ends: 20,
    status: "ACTIVE",
    tenantStatus: "SUSPENDED",
    people: [
      { name: "Ruvimbo Gumbo", signedInHoursAgo: 2 * 24 },
      { name: "Chiedza Marufu", role: "CLERK", signedInHoursAgo: 2 * 24 + 3 },
    ],
  },
  {
    slug: "marula-lodge",
    name: "Marula Lodge",
    flare: true,
    ends: 21,
    status: "ACTIVE",
    people: [{ name: "Anesu Chirwa", signedInHoursAgo: 22 }],
  },
];

function emailFor(person: string, slug: string) {
  return `${person.toLowerCase().replace(/[^a-z]+/g, ".")}@${slug}.example`;
}

async function seedWorkspaces() {
  const now = Date.now();
  for (const workspace of WORKSPACES) {
    const [owner, ...rest] = workspace.people;
    const flare = getProduct("FLARE");
    const result = await provisionTenant({
      name: workspace.name,
      slug: workspace.slug,
      product: workspace.flare ? "FLARE" : "CORELITH",
      templateCode: workspace.flare ? flare.templateCode! : workspace.template,
      tierCode: workspace.flare ? getTrialTierCode(flare) : workspace.tier,
      adminEmail: emailFor(owner.name, workspace.slug),
      adminName: owner.name,
      subscriptionStatus: workspace.status,
      trialDays: workspace.status === "TRIALING" ? 14 : undefined,
      actor: "seed-admin-dev",
    });
    const companyId = result.company.id;
    const ends = new Date(now + workspace.ends * DAY);
    await prisma.companySubscription.update({
      where: { id: result.subscription.id },
      data:
        workspace.status === "TRIALING"
          ? { status: "TRIALING", trialEndsAt: ends, currentPeriodEnd: null }
          : { status: "ACTIVE", trialEndsAt: null, currentPeriodStart: new Date(ends.getTime() - 30 * DAY), currentPeriodEnd: ends },
    });
    await prisma.company.update({
      where: { id: companyId },
      data: { tenantStatus: workspace.tenantStatus ?? "ACTIVE", suspendedAt: workspace.tenantStatus === "SUSPENDED" ? new Date(now - 2 * DAY) : null },
    });

    for (const person of rest) {
      const email = emailFor(person.name, workspace.slug);
      await prisma.user.upsert({
        where: { email },
        create: { email, name: person.name, role: person.role ?? "CLERK", companyId },
        update: { name: person.name, role: person.role ?? "CLERK", companyId, isActive: true },
      });
    }
    await syncMemberships(prisma, { companyId });

    await prisma.platformAuditEvent.deleteMany({ where: { companyId, eventType: LOGIN_SUCCESS_EVENT } });
    for (const person of workspace.people) {
      if (person.invited || person.signedInHoursAgo === undefined) continue;
      await prisma.platformAuditEvent.create({
        data: {
          companyId,
          actor: emailFor(person.name, workspace.slug),
          eventType: LOGIN_SUCCESS_EVENT,
          entityType: "auth-strategy",
          entityId: "credentials",
          eventHash: `seed-${workspace.slug}-${person.name}`.replace(/\W+/g, "-"),
          createdAt: new Date(now - person.signedInHoursAgo * 60 * 60 * 1000),
        },
      });
    }
  }
  console.log(`${WORKSPACES.length} workspaces.`);
}

/** Payments in every state the portal shows, from `world.json`. */
const PAYMENTS: Array<{ slug: string; provider: string; reference: string; amount: number; months: number; status: string; hoursAgo: number }> = [
  { slug: "kopje-scrap", provider: "pesepay", reference: "8f21c0-pesepay", amount: 99, months: 1, status: "PENDING", hoursAgo: 5 },
  { slug: "zuva-solar", provider: "pesepay", reference: "91aa07-pesepay", amount: 79, months: 1, status: "PENDING", hoursAgo: 3 },
  { slug: "avondale-thrift", provider: "pesepay", reference: "77b3e1-pesepay", amount: 39, months: 1, status: "INITIATED", hoursAgo: 30 },
  { slug: "mazowe-gold", provider: "pesepay", reference: "7d03aa-pesepay", amount: 299, months: 1, status: "PAID", hoursAgo: 12 * 24 },
  { slug: "st-faiths", provider: "pesepay", reference: "6b9e11-pesepay", amount: 398, months: 3, status: "PAID", hoursAgo: 14 * 24 },
  { slug: "greenline-payroll", provider: "pesepay", reference: "5c2210-pesepay", amount: 39, months: 1, status: "FAILED", hoursAgo: 4 * 24 },
];

async function seedPayments() {
  const now = Date.now();
  for (const payment of PAYMENTS) {
    const company = await prisma.company.findUniqueOrThrow({ where: { slug: payment.slug }, select: { id: true } });
    const subscription = await prisma.companySubscription.findFirst({ where: { companyId: company.id }, orderBy: { updatedAt: "desc" } });
    const at = new Date(now - payment.hoursAgo * 60 * 60 * 1000);
    await prisma.subscriptionPayment.upsert({
      where: { provider_providerReference: { provider: payment.provider, providerReference: payment.reference } },
      create: {
        companyId: company.id,
        subscriptionId: subscription?.id ?? null,
        provider: payment.provider,
        providerReference: payment.reference,
        amount: payment.amount,
        periodMonths: payment.months,
        status: payment.status,
        idempotencyKey: `seed:${payment.reference}`,
        paidAt: payment.status === "PAID" ? at : null,
        failureReason: payment.status === "FAILED" ? "Declined by the card issuer" : null,
        createdAt: at,
      },
      update: { status: payment.status, createdAt: at },
    });
  }
  console.log(`${PAYMENTS.length} payments.`);
}

async function main() {
  assertLocalDatabase();
  if (process.argv.includes("--code")) {
    console.log(codeAt(DEV_TOTP_SECRET));
    return;
  }
  await seedOperators();
  await seedWorkspaces();
  await seedPayments();
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
