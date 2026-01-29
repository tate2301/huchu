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
  pnpm create-employee --name <name> --phone <phone> --next-of-kin-name <name> --next-of-kin-phone <phone> --passport-photo-url <url> --village-of-origin <text> [--company-id <uuid>] [--inactive]

Options:
  --name                Employee name (required)
  --phone               Employee phone number (required)
  --next-of-kin-name    Next of kin name (required)
  --next-of-kin-phone   Next of kin phone number (required)
  --passport-photo-url  Passport photo URL (required)
  --village-of-origin   Village of origin (required)
  --company-id          Company UUID (optional if only one company exists)
  --inactive            Create employee as inactive
  --help                Show this help message
`);
}

const EMPLOYEE_ID_PREFIX = "EMP-";
const EMPLOYEE_ID_PAD = 4;

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
      "No companies found. Create a company before adding employees.",
    );
  }

  if (companies.length > 1) {
    const list = companies.map((c) => `- ${c.name}: ${c.id}`).join("\n");
    throw new Error(`Multiple companies found. Provide --company-id.\n${list}`);
  }

  return companies[0].id;
}

async function generateEmployeeId(companyId) {
  const employees = await prisma.employee.findMany({
    where: { companyId },
    select: { employeeId: true },
  });

  let max = 0;
  const existingIds = new Set();

  employees.forEach((employee) => {
    existingIds.add(employee.employeeId);
    const match = employee.employeeId.match(/^EMP-(\d+)$/i);
    if (!match) return;
    const value = Number(match[1]);
    if (Number.isFinite(value)) {
      max = Math.max(max, value);
    }
  });

  let next = max + 1;
  let candidate = `${EMPLOYEE_ID_PREFIX}${String(next).padStart(EMPLOYEE_ID_PAD, "0")}`;
  while (existingIds.has(candidate)) {
    next += 1;
    candidate = `${EMPLOYEE_ID_PREFIX}${String(next).padStart(EMPLOYEE_ID_PAD, "0")}`;
  }

  return candidate;
}

async function main() {
  if (hasFlag("--help") || hasFlag("-h")) {
    printUsage();
    return;
  }

  const employeeIdArg = getArg("--employee-id");
  const nameArg = getArg("--name");
  const phoneArg = getArg("--phone");
  const nextOfKinNameArg = getArg("--next-of-kin-name");
  const nextOfKinPhoneArg = getArg("--next-of-kin-phone");
  const passportPhotoUrlArg = getArg("--passport-photo-url");
  const villageOfOriginArg = getArg("--village-of-origin");
  const companyIdArg = getArg("--company-id");
  const isActive = !hasFlag("--inactive");

  if (
    !nameArg ||
    !phoneArg ||
    !nextOfKinNameArg ||
    !nextOfKinPhoneArg ||
    !passportPhotoUrlArg ||
    !villageOfOriginArg
  ) {
    printUsage();
    throw new Error("Missing required arguments.");
  }

  if (employeeIdArg) {
    throw new Error("Employee IDs are auto-generated. Remove --employee-id.");
  }

  const name = nameArg.trim();
  const phone = phoneArg.trim();
  const nextOfKinName = nextOfKinNameArg.trim();
  const nextOfKinPhone = nextOfKinPhoneArg.trim();
  const passportPhotoUrl = passportPhotoUrlArg.trim();
  const villageOfOrigin = villageOfOriginArg.trim();

  if (!employeeId) throw new Error("Employee ID cannot be empty.");
  if (!name) throw new Error("Employee name cannot be empty.");
  if (!phone) throw new Error("Employee phone cannot be empty.");
  if (!nextOfKinName) throw new Error("Next of kin name cannot be empty.");
  if (!nextOfKinPhone) throw new Error("Next of kin phone cannot be empty.");
  if (!passportPhotoUrl) {
    throw new Error("Passport photo URL cannot be empty.");
  }
  if (!villageOfOrigin) {
    throw new Error("Village of origin cannot be empty.");
  }

  const companyId = await resolveCompanyId(companyIdArg);
  const employeeId = await generateEmployeeId(companyId);

  if (!employeeId) throw new Error("Employee ID cannot be empty.");

  const existingEmployee = await prisma.employee.findFirst({
    where: {
      companyId,
      employeeId,
    },
    select: { id: true },
  });

  if (existingEmployee) {
    throw new Error(`Employee ID already exists: ${employeeId}`);
  }

  const employee = await prisma.employee.create({
    data: {
      employeeId,
      name,
      phone,
      nextOfKinName,
      nextOfKinPhone,
      passportPhotoUrl,
      villageOfOrigin,
      isActive,
      companyId,
    },
    select: {
      id: true,
      employeeId: true,
      name: true,
      phone: true,
      nextOfKinName: true,
      nextOfKinPhone: true,
      passportPhotoUrl: true,
      villageOfOrigin: true,
      isActive: true,
      companyId: true,
    },
  });

  console.log("Employee created:");
  console.log(employee);
}

main()
  .catch((error) => {
    console.error("Error creating employee:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
