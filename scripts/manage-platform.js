#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
"use strict";
require("dotenv").config();

const readline = require("readline");
const bcrypt = require("bcryptjs");

const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const { Pool } = require("pg");

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.warn("DATABASE_URL not set. Prisma will use PG* env vars.");
}

const pool = connectionString ? new Pool({ connectionString }) : new Pool();
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const rawArgs = process.argv.slice(2);
const actorArg = getArgFrom(rawArgs, "--actor");
const hasSection = rawArgs[0] && !rawArgs[0].startsWith("-");
const section = hasSection ? rawArgs[0].toLowerCase() : null;
const hasAction = hasSection && rawArgs[1] && !rawArgs[1].startsWith("-");
const action = hasAction ? rawArgs[1].toLowerCase() : null;
const args = hasSection ? rawArgs.slice(hasAction ? 2 : 1) : rawArgs;

const ORG_STATUSES = ["PROVISIONING", "ACTIVE", "SUSPENDED", "DISABLED"];
const SUBSCRIPTION_STATUSES = ["TRIALING", "ACTIVE", "PAST_DUE", "CANCELED", "EXPIRED"];
const ADMIN_STATUSES = ["ACTIVE", "INACTIVE"];
const ADMIN_ROLES = ["SUPERADMIN", "MANAGER"];

function getArgFrom(list, flag) {
  const index = list.indexOf(flag);
  if (index === -1) return undefined;
  const value = list[index + 1];
  if (!value || value.startsWith("--")) return undefined;
  return value;
}

function hasFlag(list, flag) {
  return list.includes(flag);
}

function parseInteger(value, label, { min = 0, fallback } = {}) {
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < min) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  return parsed;
}

function normalizeEnum(value, label, allowed, { fallback } = {}) {
  if (value === undefined) return fallback;
  const normalized = value.trim().toUpperCase();
  if (!allowed.includes(normalized)) {
    throw new Error(
      `Invalid ${label}: ${value}. Use ${allowed.map((item) => item.toLowerCase()).join(", ")}.`,
    );
  }
  return normalized;
}

function parseEnabled(list) {
  const enable = hasFlag(list, "--enable");
  const disable = hasFlag(list, "--disable");
  if (enable && disable) throw new Error("Use only one of --enable or --disable.");
  if (enable) return true;
  if (disable) return false;

  const value = getArgFrom(list, "--enabled");
  if (value === undefined) return undefined;

  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes", "enabled", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "disabled", "off"].includes(normalized)) return false;
  throw new Error(`Invalid --enabled value: ${value}. Use true or false.`);
}

function requiredArg(list, flag, fallbackFlag) {
  const value = getArgFrom(list, flag);
  if (value !== undefined) return value;
  if (fallbackFlag) {
    const fallbackValue = getArgFrom(list, fallbackFlag);
    if (fallbackValue !== undefined) return fallbackValue;
  }
  throw new Error(`Missing required argument: ${flag}`);
}

function requireActor(actor, actionLabel) {
  const normalized = actor ? actor.trim() : "";
  if (!normalized) {
    throw new Error(`${actionLabel} requires --actor <email>.`);
  }
  return normalized;
}

function normalizeEmail(email, label = "email") {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized || !normalized.includes("@")) {
    throw new Error(`Invalid ${label}: ${email}`);
  }
  return normalized;
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function formatDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toISOString();
}

function printTable(title, rows) {
  console.log(`\n${title}`);
  if (!rows || rows.length === 0) {
    console.log("No records found.");
    return;
  }
  console.table(rows);
}

function printObject(title, payload) {
  console.log(`\n${title}`);
  console.log(JSON.stringify(payload, null, 2));
}

function printUsage() {
  console.log(`Usage:
  pnpm manage-platform --help
  pnpm manage-platform --actor <operator-email>
  pnpm manage-platform org list [--status <provisioning|active|suspended|disabled>] [--search <text>] [--limit <n>] [--skip <n>]
  pnpm manage-platform org show --id <uuid>
  pnpm manage-platform org provision --name <name> [--slug <slug>] --admin-email <email> --admin-name <name> --admin-password <password> --actor <operator-email> [--yes]
  pnpm manage-platform org suspend --id <uuid> --actor <operator-email> [--reason <text>] [--yes]
  pnpm manage-platform org activate --id <uuid> --actor <operator-email> [--reason <text>] [--yes]
  pnpm manage-platform org disable --id <uuid> --actor <operator-email> [--reason <text>] [--yes]

  pnpm manage-platform subscription list [--company-id <uuid>] [--status <trialing|active|past_due|canceled|expired>] [--limit <n>] [--skip <n>]
  pnpm manage-platform subscription set-status --company-id <uuid> --status <trialing|active|past_due|canceled|expired> --actor <operator-email> [--reason <text>] [--yes]

  pnpm manage-platform feature list [--company-id <uuid>]
  pnpm manage-platform feature set --company-id <uuid> --feature <key> (--enable|--disable|--enabled <true|false>) --actor <operator-email> [--reason <text>] [--yes]

  pnpm manage-platform admin list [--company-id <uuid>] [--status <active|inactive>] [--search <text>] [--limit <n>] [--skip <n>]
  pnpm manage-platform admin create --company-id <uuid> --email <email> --name <name> --password <password> [--role <superadmin|manager>] --actor <operator-email> [--yes]
  pnpm manage-platform admin activate --id <uuid> --actor <operator-email> [--reason <text>] [--yes]
  pnpm manage-platform admin deactivate --id <uuid> --actor <operator-email> [--reason <text>] [--yes]

  pnpm manage-platform audit list [--limit <n>] [--actor-filter <email>] [--action <key>] [--company-id <uuid>]
  pnpm manage-platform audit note --company-id <uuid> --message <text> --actor <operator-email> [--yes]

Interactive:
  pnpm manage-platform --actor <operator-email>

Notes:
  - Interactive mode sections: Organizations, Subscriptions, Features, Admins, Audit.
  - Mutations and audit writes require --actor.
  - Command mutations prompt for confirmation unless --yes.
  - Organization status updates also synchronize tenantStatus for host access control.
  - Audit data is written into ProvisioningEvent records.
`);
}

function createRl() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

function ask(rl, question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

async function confirm(rl, message) {
  const answer = await ask(rl, `${message}\nType YES to confirm: `);
  return answer === "YES";
}

async function pause(rl) {
  await ask(rl, "Press Enter to continue...");
}

async function ensureCommandConfirmed(list, message) {
  if (hasFlag(list, "--yes")) return;
  if (!process.stdin.isTTY) {
    throw new Error("Mutation requires --yes when stdin is not interactive.");
  }
  const rl = createRl();
  try {
    const ok = await confirm(rl, message);
    if (!ok) throw new Error("Aborted by user.");
  } finally {
    rl.close();
  }
}

function getFeatureDefinition(featureKey) {
  const normalized = featureKey
    ? featureKey
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
    : "";

  if (!normalized) {
    throw new Error("Feature key cannot be empty.");
  }

  return {
    key: normalized,
    label: normalized
      .split("-")
      .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
      .join(" "),
  };
}

function mapSubscription(company) {
  return {
    id: company.id,
    companyId: company.companyId,
    companyName: company.company?.name,
    status: company.status,
    planCode: company.plan?.code,
    planName: company.plan?.name,
    startedAt: formatDate(company.startedAt),
    currentPeriodStart: formatDate(company.currentPeriodStart),
    currentPeriodEnd: formatDate(company.currentPeriodEnd),
    trialEndsAt: formatDate(company.trialEndsAt),
    canceledAt: formatDate(company.canceledAt),
    endedAt: formatDate(company.endedAt),
    updatedAt: formatDate(company.updatedAt)
  };
}

function mapFeatures(feature, companyFlag) {
  return {
    feature: feature.key,
    featureLabel: feature.name,
    platformActive: feature.isActive,
    enabled: companyFlag ? companyFlag.isEnabled : false,
    reason: companyFlag?.reason ?? null,
    updatedAt: formatDate(companyFlag?.updatedAt ?? feature.updatedAt),
  };
}

async function appendAuditEvent(event) {
  const companyId = event.companyId ?? null;
  const payload = {
    actor: event.actor ?? null,
    action: event.action ?? null,
    entityType: event.entityType ?? null,
    entityId: event.entityId ?? null,
    reason: event.reason ?? null,
    before: event.before ?? null,
    after: event.after ?? null,
    metadata: event.metadata ?? null,
  };

  if (!companyId) {
    return {
      id: `local-${Date.now()}`,
      timestamp: new Date().toISOString(),
      ...payload,
      companyId: null,
    };
  }

  const created = await prisma.provisioningEvent.create({
    data: {
      companyId,
      eventType: payload.action ?? "AUDIT_EVENT",
      status: "SUCCESS",
      message: payload.reason ?? payload.action ?? "Audit event",
      payloadJson: JSON.stringify(payload),
      startedAt: new Date(),
      finishedAt: new Date(),
    },
    select: {
      id: true,
      companyId: true,
      eventType: true,
      message: true,
      createdAt: true,
      payloadJson: true,
    },
  });

  return {
    id: created.id,
    timestamp: formatDate(created.createdAt),
    actor: payload.actor,
    action: created.eventType,
    entityType: payload.entityType,
    entityId: payload.entityId,
    companyId: created.companyId,
    reason: created.message,
  };
}

async function getAuditEvents({ limit = 50, actor, action, companyId } = {}) {
  const where = {};
  if (companyId) where.companyId = companyId;
  if (action) where.eventType = action.trim().toUpperCase();

  const rows = await prisma.provisioningEvent.findMany({
    where,
    select: {
      id: true,
      companyId: true,
      eventType: true,
      message: true,
      payloadJson: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  const mapped = rows.map((row) => {
    let payload = {};
    if (row.payloadJson) {
      try {
        payload = JSON.parse(row.payloadJson);
      } catch {
        payload = {};
      }
    }
    return {
      id: row.id,
      timestamp: formatDate(row.createdAt),
      actor: payload.actor ?? null,
      action: row.eventType,
      entityType: payload.entityType ?? null,
      entityId: payload.entityId ?? null,
      companyId: row.companyId,
      reason: row.message,
    };
  });

  if (!actor) return mapped;
  const normalizedActor = actor.trim().toLowerCase();
  return mapped.filter((entry) => String(entry.actor || "").toLowerCase() === normalizedActor);
}

async function getOrganizationRows({ status, search, limit = 100, skip = 0 } = {}) {
  const where = {};
  if (status) where.tenantStatus = status;
  const query = search ? search.trim() : "";
  if (query) {
    where.OR = [
      { name: { contains: query, mode: "insensitive" } },
      { slug: { contains: query, mode: "insensitive" } },
      { id: query },
    ];
  }

  const companies = await prisma.company.findMany({
    where,
    select: { id: true, name: true, slug: true, tenantStatus: true, isProvisioned: true, createdAt: true, updatedAt: true },
    orderBy: { name: "asc" },
    skip,
    take: limit,
  });

  const rows = await Promise.all(
    companies.map(async (company) => {
      const [siteCount, activeSiteCount, userCount, activeUserCount] = await Promise.all([
        prisma.site.count({ where: { companyId: company.id } }),
        prisma.site.count({ where: { companyId: company.id, isActive: true } }),
        prisma.user.count({ where: { companyId: company.id } }),
        prisma.user.count({ where: { companyId: company.id, isActive: true } }),
      ]);

      return {
        id: company.id,
        name: company.name,
        slug: company.slug,
        status: company.tenantStatus,
        isProvisioned: company.isProvisioned,
        siteCount,
        activeSiteCount,
        userCount,
        activeUserCount,
        createdAt: formatDate(company.createdAt),
        updatedAt: formatDate(company.updatedAt),
      };
    }),
  );

  return rows;
}

async function getOrganization(companyId) {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      id: true,
      name: true,
      slug: true,
      tenantStatus: true,
      isProvisioned: true,
      suspendedAt: true,
      disabledAt: true,
      payrollCycle: true,
      goldPayoutCycle: true,
      cashDisbursementOnly: true,
      autoGeneratePayrollPeriods: true,
      autoGenerateGoldPayoutPeriods: true,
      periodGenerationHorizon: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!company) throw new Error(`Organization not found for id: ${companyId}`);

  const [siteCount, activeSiteCount, userCount, activeUserCount] = await Promise.all([
    prisma.site.count({ where: { companyId } }),
    prisma.site.count({ where: { companyId, isActive: true } }),
    prisma.user.count({ where: { companyId } }),
    prisma.user.count({ where: { companyId, isActive: true } }),
  ]);

  return {
    ...company,
    counts: { sites: siteCount, activeSites: activeSiteCount, users: userCount, activeUsers: activeUserCount },
    createdAt: formatDate(company.createdAt),
    updatedAt: formatDate(company.updatedAt),
  };
}

async function ensureDefaultPlan() {
  return prisma.subscriptionPlan.upsert({
    where: { code: "CUSTOM" },
    update: { isActive: true },
    create: {
      code: "CUSTOM",
      name: "Custom",
      description: "Default manually managed plan",
      monthlyPrice: 0,
      annualPrice: 0,
      currency: "USD",
      isActive: true,
    },
    select: { id: true, code: true, name: true },
  });
}

async function provisionOrganization({ name, slug, adminEmail, adminName, adminPassword, actor }) {
  const normalizedName = String(name || "").trim();
  if (!normalizedName) {
    throw new Error("Organization name cannot be empty.");
  }

  const normalizedSlug = slugify(slug || normalizedName);
  if (!normalizedSlug) {
    throw new Error("Invalid organization slug.");
  }

  const normalizedAdminEmail = normalizeEmail(adminEmail, "admin email");
  const normalizedAdminName = String(adminName || "").trim();
  if (!normalizedAdminName) {
    throw new Error("Admin name cannot be empty.");
  }

  if (String(adminPassword || "").length < 8) {
    throw new Error("Admin password must be at least 8 characters.");
  }

  const existingSlug = await prisma.company.findUnique({
    where: { slug: normalizedSlug },
    select: { id: true },
  });
  if (existingSlug) {
    throw new Error(`Slug already exists: ${normalizedSlug}`);
  }

  const existingEmail = await prisma.user.findUnique({
    where: { email: normalizedAdminEmail },
    select: { id: true },
  });
  if (existingEmail) {
    throw new Error(`User email already exists: ${normalizedAdminEmail}`);
  }

  const plan = await ensureDefaultPlan();
  const passwordHash = await bcrypt.hash(adminPassword, 12);

  const result = await prisma.$transaction(async (tx) => {
    const company = await tx.company.create({
      data: {
        name: normalizedName,
        slug: normalizedSlug,
        tenantStatus: "ACTIVE",
        isProvisioned: true,
      },
      select: { id: true, name: true, slug: true, tenantStatus: true, isProvisioned: true },
    });

    const user = await tx.user.create({
      data: {
        email: normalizedAdminEmail,
        name: normalizedAdminName,
        password: passwordHash,
        role: "SUPERADMIN",
        companyId: company.id,
        isActive: true,
      },
      select: { id: true, email: true, name: true, role: true, companyId: true },
    });

    const subscription = await tx.companySubscription.create({
      data: {
        companyId: company.id,
        planId: plan.id,
        status: "ACTIVE",
        startedAt: new Date(),
        currentPeriodStart: new Date(),
      },
      select: { id: true, status: true, startedAt: true },
    });

    const event = await tx.provisioningEvent.create({
      data: {
        companyId: company.id,
        eventType: "ORG_PROVISIONED",
        status: "SUCCESS",
        message: "Organization provisioned via manage-platform CLI",
        payloadJson: JSON.stringify({ actor, adminUserId: user.id, planCode: plan.code }),
        startedAt: new Date(),
        finishedAt: new Date(),
      },
      select: { id: true, eventType: true, status: true, createdAt: true },
    });

    return { company, user, subscription, event };
  });

  return {
    company: result.company,
    adminUser: result.user,
    subscription: {
      id: result.subscription.id,
      status: result.subscription.status,
      startedAt: formatDate(result.subscription.startedAt),
      planCode: plan.code,
    },
    auditEventId: result.event.id,
  };
}
async function setOrganizationStatus({ companyId, activate, actor, reason, targetStatus }) {
  const before = await getOrganization(companyId);
  const nextStatus = targetStatus ?? (activate ? "ACTIVE" : "SUSPENDED");
  const [, usersResult, sitesResult] = await prisma.$transaction([
    prisma.company.update({
      where: { id: companyId },
      data: {
        tenantStatus: nextStatus,
        isProvisioned: true,
        suspendedAt: nextStatus === "SUSPENDED" ? new Date() : null,
        disabledAt: nextStatus === "DISABLED" ? new Date() : null,
      },
    }),
    prisma.user.updateMany({
      where: { companyId, isActive: !activate },
      data: { isActive: activate },
    }),
    prisma.site.updateMany({
      where: { companyId, isActive: !activate },
      data: { isActive: activate },
    }),
  ]);
  const after = await getOrganization(companyId);

  const audit = await appendAuditEvent({
    actor,
    action: activate ? "ORG_ACTIVATE" : "ORG_SUSPEND",
    entityType: "organization",
    entityId: companyId,
    companyId,
    reason,
    before: { status: before.tenantStatus, counts: before.counts },
    after: { status: after.tenantStatus, counts: after.counts },
    metadata: { usersChanged: usersResult.count, sitesChanged: sitesResult.count },
  });

  return {
    organizationId: companyId,
    organizationName: after.name,
    beforeStatus: before.tenantStatus,
    afterStatus: after.tenantStatus,
    usersChanged: usersResult.count,
    sitesChanged: sitesResult.count,
    auditEventId: audit.id,
  };
}

async function listSubscriptions({ companyId, status, limit = 100, skip = 0 } = {}) {
  const where = {};
  if (companyId) where.companyId = companyId;
  if (status) where.status = status;

  const subscriptions = await prisma.companySubscription.findMany({
    where,
    select: {
      id: true,
      companyId: true,
      status: true,
      startedAt: true,
      trialEndsAt: true,
      currentPeriodStart: true,
      currentPeriodEnd: true,
      canceledAt: true,
      endedAt: true,
      updatedAt: true,
      company: { select: { name: true, slug: true } },
      plan: { select: { code: true, name: true } },
    },
    orderBy: { updatedAt: "desc" },
    skip,
    take: limit,
  });

  return subscriptions.map(mapSubscription);
}

async function setSubscriptionStatus({ companyId, status, actor, reason }) {
  const normalized = normalizeEnum(status, "status", SUBSCRIPTION_STATUSES);
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, name: true, slug: true },
  });
  if (!company) throw new Error(`Organization not found for id: ${companyId}`);

  const plan = await prisma.subscriptionPlan.upsert({
    where: { code: "CUSTOM" },
    update: { isActive: true },
    create: {
      code: "CUSTOM",
      name: "Custom",
      description: "Default manual platform plan",
      monthlyPrice: 0,
      annualPrice: 0,
      currency: "USD",
      isActive: true,
    },
    select: { id: true, code: true, name: true },
  });

  const beforeSubscription = await prisma.companySubscription.findFirst({
    where: { companyId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      companyId: true,
      status: true,
      startedAt: true,
      trialEndsAt: true,
      currentPeriodStart: true,
      currentPeriodEnd: true,
      canceledAt: true,
      endedAt: true,
      updatedAt: true,
      company: { select: { name: true } },
      plan: { select: { code: true, name: true } },
    },
  });

  const now = new Date();
  const nextSubscription = beforeSubscription
    ? await prisma.companySubscription.update({
      where: { id: beforeSubscription.id },
      data: {
        status: normalized,
        currentPeriodStart: now,
        currentPeriodEnd: null,
        canceledAt: normalized === "CANCELED" ? now : null,
        endedAt: normalized === "EXPIRED" ? now : null,
      },
      select: {
        id: true,
        companyId: true,
        status: true,
        startedAt: true,
        trialEndsAt: true,
        currentPeriodStart: true,
        currentPeriodEnd: true,
        canceledAt: true,
        endedAt: true,
        updatedAt: true,
        company: { select: { name: true } },
        plan: { select: { code: true, name: true } },
      },
    })
    : await prisma.companySubscription.create({
      data: {
        companyId,
        planId: plan.id,
        status: normalized,
        startedAt: now,
        currentPeriodStart: now,
      },
      select: {
        id: true,
        companyId: true,
        status: true,
        startedAt: true,
        trialEndsAt: true,
        currentPeriodStart: true,
        currentPeriodEnd: true,
        canceledAt: true,
        endedAt: true,
        updatedAt: true,
        company: { select: { name: true } },
        plan: { select: { code: true, name: true } },
      },
    });

  const before = beforeSubscription ? mapSubscription(beforeSubscription) : null;
  const after = mapSubscription(nextSubscription);
  const audit = await appendAuditEvent({
    actor,
    action: "SUBSCRIPTION_SET_STATUS",
    entityType: "subscription",
    entityId: companyId,
    companyId,
    reason,
    before,
    after,
  });

  return {
    companyId,
    companyName: company.name,
    companySlug: company.slug,
    beforeStatus: before ? before.status : null,
    afterStatus: after.status,
    auditEventId: audit.id,
  };
}

async function listFeatures({ companyId } = {}) {
  const features = await prisma.platformFeature.findMany({
    select: {
      id: true,
      key: true,
      name: true,
      isActive: true,
      updatedAt: true,
    },
    orderBy: { key: "asc" },
  });

  if (!companyId) {
    return features.map((feature) => mapFeatures(feature, null));
  }

  const flags = await prisma.companyFeatureFlag.findMany({
    where: { companyId },
    select: {
      featureId: true,
      isEnabled: true,
      reason: true,
      updatedAt: true,
    },
  });

  const flagsByFeature = new Map(flags.map((flag) => [flag.featureId, flag]));
  return features.map((feature) => mapFeatures(feature, flagsByFeature.get(feature.id) ?? null));
}

async function setFeature({ companyId, featureKey, enabled, actor, reason }) {
  const definition = getFeatureDefinition(featureKey);
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, name: true },
  });
  if (!company) throw new Error(`Organization not found for id: ${companyId}`);

  const feature = await prisma.platformFeature.upsert({
    where: { key: definition.key },
    update: {
      name: definition.label,
      isActive: true,
    },
    create: {
      key: definition.key,
      name: definition.label,
      description: `Feature flag for ${definition.key}`,
      isActive: true,
    },
    select: { id: true, key: true, name: true },
  });

  const before = await prisma.companyFeatureFlag.findUnique({
    where: {
      companyId_featureId: {
        companyId,
        featureId: feature.id,
      },
    },
    select: { isEnabled: true },
  });

  const after = await prisma.companyFeatureFlag.upsert({
    where: {
      companyId_featureId: {
        companyId,
        featureId: feature.id,
      },
    },
    update: {
      isEnabled: enabled,
      reason: reason ?? null,
    },
    create: {
      companyId,
      featureId: feature.id,
      isEnabled: enabled,
      reason: reason ?? null,
    },
    select: { isEnabled: true, reason: true },
  });

  const audit = await appendAuditEvent({
    actor,
    action: "FEATURE_SET",
    entityType: "feature",
    entityId: `${companyId}:${definition.key}`,
    companyId,
    reason,
    before: { feature: definition.key, enabled: before?.isEnabled ?? null },
    after: { feature: definition.key, enabled: after.isEnabled },
  });

  return {
    companyId,
    companyName: company.name,
    feature: definition.key,
    featureLabel: definition.label,
    enabled: after.isEnabled,
    reason: after.reason ?? null,
    auditEventId: audit.id,
  };
}

async function listAdmins({ companyId, status, search, limit = 100, skip = 0 } = {}) {
  const where = {
    role: { in: ADMIN_ROLES },
  };
  if (companyId) where.companyId = companyId;
  if (status === "ACTIVE") where.isActive = true;
  if (status === "INACTIVE") where.isActive = false;

  const query = search ? search.trim() : "";
  if (query) {
    where.OR = [
      { name: { contains: query, mode: "insensitive" } },
      { email: { contains: query, mode: "insensitive" } },
      { id: query },
    ];
  }

  return prisma.user.findMany({
    where,
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      companyId: true,
      createdAt: true,
      updatedAt: true,
      company: { select: { name: true } },
    },
    orderBy: [{ companyId: "asc" }, { name: "asc" }],
    skip,
    take: limit,
  });
}

async function createAdmin({ companyId, email, name, password, role, actor }) {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, name: true },
  });
  if (!company) throw new Error(`Organization not found for id: ${companyId}`);

  const normalizedEmail = normalizeEmail(email);
  const normalizedName = String(name || "").trim();
  if (!normalizedName) {
    throw new Error("Admin name cannot be empty.");
  }

  const normalizedRole = normalizeEnum(role, "role", ADMIN_ROLES);
  if (String(password || "").length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }

  const existing = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true },
  });
  if (existing) {
    throw new Error(`User already exists for email: ${normalizedEmail}`);
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.create({
    data: {
      companyId,
      email: normalizedEmail,
      name: normalizedName,
      password: passwordHash,
      role: normalizedRole,
      isActive: true,
    },
    select: {
      id: true,
      companyId: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
  });

  const audit = await appendAuditEvent({
    actor,
    action: "ADMIN_CREATE",
    entityType: "admin",
    entityId: user.id,
    companyId,
    reason: `Created admin ${user.email}`,
    after: { role: user.role, isActive: user.isActive },
  });

  return {
    ...user,
    companyName: company.name,
    createdAt: formatDate(user.createdAt),
    auditEventId: audit.id,
  };
}

async function setAdminStatus({ userId, isActive, actor, reason }) {
  const before = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      companyId: true,
      company: { select: { name: true } },
    },
  });

  if (!before) throw new Error(`Admin user not found for id: ${userId}`);
  if (!ADMIN_ROLES.includes(before.role)) {
    throw new Error(`User ${before.email} has role ${before.role}, not admin role.`);
  }

  const after = await prisma.user.update({
    where: { id: userId },
    data: { isActive },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      companyId: true,
      updatedAt: true,
      company: { select: { name: true } },
    },
  });

  const audit = await appendAuditEvent({
    actor,
    action: isActive ? "ADMIN_ACTIVATE" : "ADMIN_DEACTIVATE",
    entityType: "admin",
    entityId: userId,
    companyId: after.companyId,
    reason,
    before: { isActive: before.isActive, role: before.role },
    after: { isActive: after.isActive, role: after.role },
  });

  return {
    adminId: after.id,
    email: after.email,
    name: after.name,
    role: after.role,
    isActive: after.isActive,
    companyId: after.companyId,
    companyName: after.company.name,
    updatedAt: formatDate(after.updatedAt),
    auditEventId: audit.id,
  };
}

async function addAuditNote({ actor, message, companyId }) {
  const text = message ? message.trim() : "";
  if (!text) throw new Error("Audit note message cannot be empty.");

  if (!companyId) {
    throw new Error("Audit note requires --company-id.");
  }

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true },
  });
  if (!company) throw new Error(`Organization not found for id: ${companyId}`);

  return appendAuditEvent({
    actor,
    action: "AUDIT_NOTE",
    entityType: "audit",
    entityId: companyId || "platform",
    companyId: companyId || null,
    reason: text,
    metadata: { message: text },
  });
}

function mapOrgRowsForPrint(rows) {
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status,
    provisioned: row.isProvisioned,
    activeUsers: row.activeUserCount,
    users: row.userCount,
    activeSites: row.activeSiteCount,
    sites: row.siteCount,
    updatedAt: row.updatedAt,
  }));
}

function mapAdminRowsForPrint(rows) {
  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    active: row.isActive,
    companyId: row.companyId,
    companyName: row.company ? row.company.name : null,
    updatedAt: formatDate(row.updatedAt),
  }));
}

function mapAuditRowsForPrint(rows) {
  return rows.map((row) => ({
    id: row.id,
    timestamp: row.timestamp,
    actor: row.actor,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    companyId: row.companyId,
    reason: row.reason,
  }));
}

async function runOrgCommand(command, list, actor) {
  switch (command) {
    case "list": {
      const status = normalizeEnum(getArgFrom(list, "--status"), "status", ORG_STATUSES, {
        fallback: undefined,
      });
      const search = getArgFrom(list, "--search");
      const limit = parseInteger(getArgFrom(list, "--limit"), "limit", { min: 1, fallback: 100 });
      const skip = parseInteger(getArgFrom(list, "--skip"), "skip", { min: 0, fallback: 0 });
      const rows = await getOrganizationRows({ status, search, limit, skip });
      printTable("Organizations", mapOrgRowsForPrint(rows));
      return;
    }
    case "show": {
      const companyId = requiredArg(list, "--id", "--company-id");
      const org = await getOrganization(companyId);
      printObject("Organization", org);
      return;
    }
    case "provision": {
      const confirmedActor = requireActor(actor, "org provision");
      const name = requiredArg(list, "--name");
      const slug = getArgFrom(list, "--slug");
      const adminEmail = requiredArg(list, "--admin-email");
      const adminName = requiredArg(list, "--admin-name");
      const adminPassword = requiredArg(list, "--admin-password");
      await ensureCommandConfirmed(list, `About to provision organization ${name}.`);
      const result = await provisionOrganization({
        name,
        slug,
        adminEmail,
        adminName,
        adminPassword,
        actor: confirmedActor,
      });
      printObject("Organization provisioned", result);
      return;
    }
    case "suspend":
    case "activate":
    case "disable": {
      const companyId = requiredArg(list, "--id", "--company-id");
      const confirmedActor = requireActor(actor, `org ${command}`);
      const reason = getArgFrom(list, "--reason");
      await ensureCommandConfirmed(list, `About to ${command} organization ${companyId}.`);
      const result = await setOrganizationStatus({
        companyId,
        activate: command === "activate",
        actor: confirmedActor,
        reason: reason ?? (command === "disable" ? "Disabled via CLI" : undefined),
        targetStatus: command === "disable" ? "DISABLED" : undefined,
      });
      printObject("Organization updated", result);
      return;
    }
    default:
      throw new Error(`Unknown org command: ${command}`);
  }
}

async function runSubscriptionCommand(command, list, actor) {
  switch (command) {
    case "list": {
      const companyId = getArgFrom(list, "--company-id");
      const status = normalizeEnum(getArgFrom(list, "--status"), "status", SUBSCRIPTION_STATUSES, {
        fallback: undefined,
      });
      const limit = parseInteger(getArgFrom(list, "--limit"), "limit", { min: 1, fallback: 100 });
      const skip = parseInteger(getArgFrom(list, "--skip"), "skip", { min: 0, fallback: 0 });
      const rows = await listSubscriptions({ companyId, status, limit, skip });
      printTable("Subscriptions", rows);
      return;
    }
    case "set-status": {
      const companyId = requiredArg(list, "--company-id");
      const status = requiredArg(list, "--status");
      const confirmedActor = requireActor(actor, "subscription set-status");
      const reason = getArgFrom(list, "--reason");
      await ensureCommandConfirmed(list, `About to set subscription status for ${companyId}.`);
      const result = await setSubscriptionStatus({ companyId, status, actor: confirmedActor, reason });
      printObject("Subscription updated", result);
      return;
    }
    default:
      throw new Error(`Unknown subscription command: ${command}`);
  }
}

async function runFeatureCommand(command, list, actor) {
  switch (command) {
    case "list": {
      const companyId = getArgFrom(list, "--company-id");
      const rows = await listFeatures({ companyId });
      printTable("Features", rows);
      return;
    }
    case "set": {
      const companyId = requiredArg(list, "--company-id");
      const feature = requiredArg(list, "--feature");
      const enabled = parseEnabled(list);
      if (enabled === undefined) {
        throw new Error("Feature set requires --enable, --disable, or --enabled <true|false>.");
      }
      const confirmedActor = requireActor(actor, "feature set");
      const reason = getArgFrom(list, "--reason");
      await ensureCommandConfirmed(list, `About to update feature ${feature} for organization ${companyId}.`);
      const result = await setFeature({
        companyId,
        featureKey: feature,
        enabled,
        actor: confirmedActor,
        reason,
      });
      printObject("Feature updated", result);
      return;
    }
    default:
      throw new Error(`Unknown feature command: ${command}`);
  }
}

async function runAdminCommand(command, list, actor) {
  switch (command) {
    case "list": {
      const companyId = getArgFrom(list, "--company-id");
      const status = normalizeEnum(getArgFrom(list, "--status"), "status", ADMIN_STATUSES, {
        fallback: undefined,
      });
      const search = getArgFrom(list, "--search");
      const limit = parseInteger(getArgFrom(list, "--limit"), "limit", {
        min: 1,
        fallback: 100,
      });
      const skip = parseInteger(getArgFrom(list, "--skip"), "skip", {
        min: 0,
        fallback: 0,
      });
      const rows = await listAdmins({ companyId, status, search, limit, skip });
      printTable("Admins", mapAdminRowsForPrint(rows));
      return;
    }
    case "create": {
      const companyId = requiredArg(list, "--company-id");
      const email = requiredArg(list, "--email");
      const name = requiredArg(list, "--name");
      const password = requiredArg(list, "--password");
      const role = getArgFrom(list, "--role") || "SUPERADMIN";
      const confirmedActor = requireActor(actor, "admin create");
      await ensureCommandConfirmed(list, `About to create admin ${email} for ${companyId}.`);
      const result = await createAdmin({
        companyId,
        email,
        name,
        password,
        role,
        actor: confirmedActor,
      });
      printObject("Admin created", result);
      return;
    }
    case "activate":
    case "deactivate": {
      const userId = requiredArg(list, "--id", "--user-id");
      const confirmedActor = requireActor(actor, `admin ${command}`);
      const reason = getArgFrom(list, "--reason");
      await ensureCommandConfirmed(list, `About to ${command} admin ${userId}.`);
      const result = await setAdminStatus({
        userId,
        isActive: command === "activate",
        actor: confirmedActor,
        reason,
      });
      printObject("Admin updated", result);
      return;
    }
    default:
      throw new Error(`Unknown admin command: ${command}`);
  }
}

async function runAuditCommand(command, list, actor) {
  switch (command) {
    case "list": {
      const limit = parseInteger(getArgFrom(list, "--limit"), "limit", {
        min: 1,
        fallback: 50,
      });
      const actorFilter = getArgFrom(list, "--actor-filter");
      const actionFilter = getArgFrom(list, "--action");
      const companyId = getArgFrom(list, "--company-id");
      const rows = await getAuditEvents({
        limit,
        actor: actorFilter,
        action: actionFilter,
        companyId,
      });
      printTable("Audit events", mapAuditRowsForPrint(rows));
      return;
    }
    case "note": {
      const message = requiredArg(list, "--message");
      const companyId = requiredArg(list, "--company-id");
      const confirmedActor = requireActor(actor, "audit note");
      await ensureCommandConfirmed(list, "About to append audit note.");
      const result = await addAuditNote({ actor: confirmedActor, message, companyId });
      printObject("Audit event appended", result);
      return;
    }
    default:
      throw new Error(`Unknown audit command: ${command}`);
  }
}

async function runCommandMode() {
  switch (section) {
    case "org":
    case "organization":
    case "organizations":
      await runOrgCommand(action || "list", args, actorArg);
      return;
    case "subscription":
    case "subscriptions":
      await runSubscriptionCommand(action || "list", args, actorArg);
      return;
    case "feature":
    case "features":
      await runFeatureCommand(action || "list", args, actorArg);
      return;
    case "admin":
    case "admins":
      await runAdminCommand(action || "list", args, actorArg);
      return;
    case "audit":
      await runAuditCommand(action || "list", args, actorArg);
      return;
    default:
      throw new Error(`Unknown section: ${section}`);
  }
}

async function runOrganizationsMenu(rl, actor) {
  while (true) {
    console.log("\nOrganizations");
    console.log("  1) List organizations");
    console.log("  2) Show organization");
    console.log("  3) Provision organization");
    console.log("  4) Suspend organization");
    console.log("  5) Activate organization");
    console.log("  6) Disable organization");
    console.log("  7) Back");

    const choice = await ask(rl, "Choose an option: ");
    if (choice === "7") return;

    try {
      if (choice === "1") {
        const statusInput = await ask(rl, "Status filter (provisioning/active/suspended/disabled/all): ");
        const search = await ask(rl, "Search (optional): ");
        const status =
          statusInput && statusInput.toLowerCase() !== "all"
            ? normalizeEnum(statusInput, "status", ORG_STATUSES)
            : undefined;
        const rows = await getOrganizationRows({ status, search, limit: 100, skip: 0 });
        printTable("Organizations", mapOrgRowsForPrint(rows));
      } else if (choice === "2") {
        const companyId = await ask(rl, "Organization id: ");
        const org = await getOrganization(companyId);
        printObject("Organization", org);
      } else if (choice === "3") {
        const name = await ask(rl, "Organization name: ");
        const slug = await ask(rl, "Slug (optional): ");
        const adminEmail = await ask(rl, "Admin email: ");
        const adminName = await ask(rl, "Admin name: ");
        const adminPassword = await ask(rl, "Admin password (min 8 chars): ");
        const ok = await confirm(
          rl,
          `About to provision organization ${name} with admin ${adminEmail}.`,
        );
        if (!ok) {
          console.log("Cancelled.");
        } else {
          const result = await provisionOrganization({
            name,
            slug: slug || undefined,
            adminEmail,
            adminName,
            adminPassword,
            actor,
          });
          printObject("Organization provisioned", result);
        }
      } else if (choice === "4" || choice === "5" || choice === "6") {
        const companyId = await ask(rl, "Organization id: ");
        const reason = await ask(rl, "Reason (optional): ");
        const targetStatus = choice === "4" ? "SUSPENDED" : choice === "5" ? "ACTIVE" : "DISABLED";
        const isActivate = targetStatus === "ACTIVE";
        const ok = await confirm(
          rl,
          `About to set status ${targetStatus} for organization ${companyId}.`,
        );
        if (!ok) {
          console.log("Cancelled.");
        } else {
          const result = await setOrganizationStatus({
            companyId,
            activate: isActivate,
            actor,
            reason,
            targetStatus,
          });
          printObject("Organization updated", result);
        }
      } else {
        console.log("Invalid option.");
      }
    } catch (error) {
      console.error("Error:", error.message);
    }

    await pause(rl);
  }
}

async function runSubscriptionsMenu(rl, actor) {
  while (true) {
    console.log("\nSubscriptions");
    console.log("  1) List subscriptions");
    console.log("  2) Set subscription status");
    console.log("  3) Back");

    const choice = await ask(rl, "Choose an option: ");
    if (choice === "3") return;

    try {
      if (choice === "1") {
        const companyId = await ask(rl, "Company id (optional, blank for all): ");
        const statusInput = await ask(rl, "Status filter (trialing/active/past_due/canceled/expired/all): ");
        const status =
          statusInput && statusInput.toLowerCase() !== "all"
            ? normalizeEnum(statusInput, "status", SUBSCRIPTION_STATUSES)
            : undefined;
        const rows = await listSubscriptions({
          companyId: companyId || undefined,
          status,
          limit: 100,
          skip: 0,
        });
        printTable("Subscriptions", rows);
      } else if (choice === "2") {
        const companyId = await ask(rl, "Company id: ");
        const status = await ask(rl, "Target status (trialing/active/past_due/canceled/expired): ");
        const reason = await ask(rl, "Reason (optional): ");
        const normalized = normalizeEnum(status, "status", SUBSCRIPTION_STATUSES);
        const ok = await confirm(
          rl,
          `About to set subscription status for ${companyId} to ${normalized}.`,
        );
        if (!ok) {
          console.log("Cancelled.");
        } else {
          const result = await setSubscriptionStatus({
            companyId,
            status: normalized,
            actor,
            reason,
          });
          printObject("Subscription updated", result);
        }
      } else {
        console.log("Invalid option.");
      }
    } catch (error) {
      console.error("Error:", error.message);
    }

    await pause(rl);
  }
}

async function runFeaturesMenu(rl, actor) {
  while (true) {
    console.log("\nFeatures");
    console.log("  1) List features");
    console.log("  2) Set feature flag");
    console.log("  3) Back");

    const choice = await ask(rl, "Choose an option: ");
    if (choice === "3") return;

    try {
      if (choice === "1") {
        const companyId = await ask(rl, "Company id (optional, blank for all): ");
        const rows = await listFeatures({ companyId: companyId || undefined });
        printTable("Features", rows);
      } else if (choice === "2") {
        const companyId = await ask(rl, "Company id: ");
        console.log("Tip: feature keys are slug-like, for example: cctv-live, advanced-payroll");
        const featureKey = await ask(rl, "Feature key: ");
        const value = await ask(rl, "Set value (enable/disable): ");
        const normalized = value.trim().toLowerCase();
        let enabled;
        if (["enable", "enabled", "true", "yes", "1"].includes(normalized)) {
          enabled = true;
        } else if (["disable", "disabled", "false", "no", "0"].includes(normalized)) {
          enabled = false;
        } else {
          throw new Error("Invalid feature value. Use enable or disable.");
        }
        const reason = await ask(rl, "Reason (optional): ");
        const ok = await confirm(
          rl,
          `About to set ${featureKey}=${enabled} for organization ${companyId}.`,
        );
        if (!ok) {
          console.log("Cancelled.");
        } else {
          const result = await setFeature({ companyId, featureKey, enabled, actor, reason });
          printObject("Feature updated", result);
        }
      } else {
        console.log("Invalid option.");
      }
    } catch (error) {
      console.error("Error:", error.message);
    }

    await pause(rl);
  }
}

async function runAdminsMenu(rl, actor) {
  while (true) {
    console.log("\nAdmins");
    console.log("  1) List admins");
    console.log("  2) Create admin");
    console.log("  3) Deactivate admin");
    console.log("  4) Activate admin");
    console.log("  5) Back");

    const choice = await ask(rl, "Choose an option: ");
    if (choice === "5") return;

    try {
      if (choice === "1") {
        const companyId = await ask(rl, "Company id (optional, blank for all): ");
        const statusInput = await ask(rl, "Status filter (active/inactive/all): ");
        const search = await ask(rl, "Search (optional): ");
        const status =
          statusInput && statusInput.toLowerCase() !== "all"
            ? normalizeEnum(statusInput, "status", ADMIN_STATUSES)
            : undefined;
        const rows = await listAdmins({
          companyId: companyId || undefined,
          status,
          search,
          limit: 100,
          skip: 0,
        });
        printTable("Admins", mapAdminRowsForPrint(rows));
      } else if (choice === "2") {
        const companyId = await ask(rl, "Company id: ");
        const email = await ask(rl, "Email: ");
        const name = await ask(rl, "Name: ");
        const password = await ask(rl, "Password (min 8 chars): ");
        const role = await ask(rl, "Role (superadmin/manager, default superadmin): ");
        const ok = await confirm(
          rl,
          `About to create admin ${email} for company ${companyId}.`,
        );
        if (!ok) {
          console.log("Cancelled.");
        } else {
          const result = await createAdmin({
            companyId,
            email,
            name,
            password,
            role: role || "SUPERADMIN",
            actor,
          });
          printObject("Admin created", result);
        }
      } else if (choice === "3" || choice === "4") {
        const userId = await ask(rl, "Admin user id: ");
        const reason = await ask(rl, "Reason (optional): ");
        const isActive = choice === "4";
        const ok = await confirm(
          rl,
          `About to ${isActive ? "activate" : "deactivate"} admin ${userId}.`,
        );
        if (!ok) {
          console.log("Cancelled.");
        } else {
          const result = await setAdminStatus({ userId, isActive, actor, reason });
          printObject("Admin updated", result);
        }
      } else {
        console.log("Invalid option.");
      }
    } catch (error) {
      console.error("Error:", error.message);
    }

    await pause(rl);
  }
}

async function runAuditMenu(rl, actor) {
  while (true) {
    console.log("\nAudit");
    console.log("  1) List audit events");
    console.log("  2) Add audit note");
    console.log("  3) Back");

    const choice = await ask(rl, "Choose an option: ");
    if (choice === "3") return;

    try {
      if (choice === "1") {
        const limitInput = await ask(rl, "Limit (default 50): ");
        const actorFilter = await ask(rl, "Actor filter (optional): ");
        const actionFilter = await ask(rl, "Action filter (optional): ");
        const companyId = await ask(rl, "Company id filter (optional): ");
        const limit = parseInteger(limitInput || undefined, "limit", {
          min: 1,
          fallback: 50,
        });
        const rows = await getAuditEvents({
          limit,
          actor: actorFilter || undefined,
          action: actionFilter || undefined,
          companyId: companyId || undefined,
        });
        printTable("Audit events", mapAuditRowsForPrint(rows));
      } else if (choice === "2") {
        const companyId = await ask(rl, "Company id: ");
        const message = await ask(rl, "Message: ");
        const ok = await confirm(rl, "About to append audit note.");
        if (!ok) {
          console.log("Cancelled.");
        } else {
          const result = await addAuditNote({
            actor,
            message,
            companyId,
          });
          printObject("Audit event appended", result);
        }
      } else {
        console.log("Invalid option.");
      }
    } catch (error) {
      console.error("Error:", error.message);
    }

    await pause(rl);
  }
}

async function runInteractiveMode(actor) {
  const rl = createRl();
  try {
    while (true) {
      console.log("\n=== Platform Management CLI ===");
      console.log(`Actor: ${actor}`);
      console.log("  1) Organizations");
      console.log("  2) Subscriptions");
      console.log("  3) Features");
      console.log("  4) Admins");
      console.log("  5) Audit");
      console.log("  6) Exit");

      const choice = await ask(rl, "Select section: ");
      if (choice === "6") return;
      if (choice === "1") {
        await runOrganizationsMenu(rl, actor);
      } else if (choice === "2") {
        await runSubscriptionsMenu(rl, actor);
      } else if (choice === "3") {
        await runFeaturesMenu(rl, actor);
      } else if (choice === "4") {
        await runAdminsMenu(rl, actor);
      } else if (choice === "5") {
        await runAuditMenu(rl, actor);
      } else {
        console.log("Invalid option.");
      }
    }
  } finally {
    rl.close();
  }
}

async function main() {
  if (hasFlag(rawArgs, "--help") || hasFlag(rawArgs, "-h")) {
    printUsage();
    return;
  }

  if (hasSection) {
    await runCommandMode();
    return;
  }

  const actor = requireActor(actorArg, "interactive mode");
  await runInteractiveMode(actor);
}

main()
  .catch((error) => {
    console.error("Error managing platform:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
