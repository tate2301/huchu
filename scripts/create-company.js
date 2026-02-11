#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
"use strict";
require("dotenv").config();

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

function getArg(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function printUsage() {
  console.log(`Usage:
  pnpm create-company --name <name> [--slug <slug>] [--status <provisioning|active|suspended|disabled>] [--not-provisioned]

Options:
  --name             Company name (required)
  --slug             Company slug (optional; derived from name when omitted)
  --status           Tenant status (default: active)
  --not-provisioned  Set isProvisioned=false (default: true)
  --help             Show this help message
`);
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function normalizeStatus(value) {
  const allowed = new Set(["PROVISIONING", "ACTIVE", "SUSPENDED", "DISABLED"]);
  if (!value) return "ACTIVE";
  const normalized = value.trim().toUpperCase();
  if (!allowed.has(normalized)) {
    throw new Error(`Invalid --status: ${value}. Use provisioning, active, suspended, or disabled.`);
  }
  return normalized;
}

async function main() {
  if (hasFlag("--help") || hasFlag("-h")) {
    printUsage();
    return;
  }

  const nameArg = getArg("--name");
  const slugArg = getArg("--slug");
  const statusArg = getArg("--status");
  const isProvisioned = !hasFlag("--not-provisioned");

  if (!nameArg) {
    printUsage();
    throw new Error("Missing required arguments.");
  }

  const name = nameArg.trim();
  if (!name) {
    throw new Error("Company name cannot be empty.");
  }
  const slug = slugify(slugArg || name);
  if (!slug) {
    throw new Error("Company slug cannot be empty. Provide --slug.");
  }
  const tenantStatus = normalizeStatus(statusArg);

  const existingCompany = await prisma.company.findFirst({
    where: {
      OR: [{ name }, { slug }],
    },
    select: { id: true, name: true, slug: true },
  });

  if (existingCompany) {
    throw new Error(
      `Company already exists (${existingCompany.id}) with name "${existingCompany.name}" or slug "${existingCompany.slug}".`,
    );
  }

  const company = await prisma.company.create({
    data: {
      name,
      slug,
      tenantStatus,
      isProvisioned,
      suspendedAt: tenantStatus === "SUSPENDED" ? new Date() : null,
      disabledAt: tenantStatus === "DISABLED" ? new Date() : null,
    },
    select: { id: true, name: true, slug: true, tenantStatus: true, isProvisioned: true },
  });

  console.log("Company created:");
  console.log(company);
}

main()
  .catch((error) => {
    console.error("Error creating company:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
