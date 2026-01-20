#!/usr/bin/env node
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

const ALLOWED_MEASUREMENT_UNITS = new Set(["tonnes", "trips", "wheelbarrows"]);

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
  pnpm create-site --name <name> --code <code> [--company-id <uuid>] [--location <text>] [--measurement-unit <unit>]

Options:
  --name               Site name (required)
  --code               Site code, will be stored uppercase (required)
  --company-id         Company UUID (optional if only one company exists)
  --location           Site location (optional)
  --measurement-unit   tonnes | trips | wheelbarrows (optional, default: tonnes)
  --help               Show this help message
`);
}

async function resolveCompanyId(companyId) {
  if (companyId) {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true },
    });
    if (!company) {
      throw new Error(`Company not found for id: ${companyId}`);
    }
    return company.id;
  }

  const companies = await prisma.company.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  if (companies.length === 0) {
    throw new Error(
      "No companies found. Create a company before adding sites.",
    );
  }

  if (companies.length > 1) {
    const list = companies.map((c) => `- ${c.name}: ${c.id}`).join("\n");
    throw new Error(`Multiple companies found. Provide --company-id.\n${list}`);
  }

  return companies[0].id;
}

async function main() {
  if (hasFlag("--help") || hasFlag("-h")) {
    printUsage();
    return;
  }

  const nameArg = getArg("--name");
  const codeArg = getArg("--code");
  const companyIdArg = getArg("--company-id");
  const locationArg = getArg("--location");
  const measurementUnitArg = getArg("--measurement-unit");

  if (!nameArg || !codeArg) {
    printUsage();
    throw new Error("Missing required arguments.");
  }

  const name = nameArg.trim();
  const code = codeArg.trim().toUpperCase();
  const location = locationArg ? locationArg.trim() : undefined;
  const measurementUnit = measurementUnitArg
    ? measurementUnitArg.trim().toLowerCase()
    : "tonnes";

  if (!name) {
    throw new Error("Site name cannot be empty.");
  }

  if (!code) {
    throw new Error("Site code cannot be empty.");
  }

  if (!ALLOWED_MEASUREMENT_UNITS.has(measurementUnit)) {
    throw new Error(
      `Invalid measurement unit: ${measurementUnitArg}. Use tonnes, trips, or wheelbarrows.`,
    );
  }

  const companyId = await resolveCompanyId(companyIdArg);

  const existingSite = await prisma.site.findUnique({
    where: { code },
    select: { id: true, name: true },
  });

  if (existingSite) {
    throw new Error(
      `Site code already exists: ${code} (${existingSite.name}).`,
    );
  }

  const site = await prisma.site.create({
    data: {
      name,
      code,
      location,
      companyId,
      measurementUnit,
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      code: true,
      location: true,
      companyId: true,
      measurementUnit: true,
      isActive: true,
    },
  });

  console.log("Site created:");
  console.log(site);
}

main()
  .catch((error) => {
    console.error("Error creating site:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
