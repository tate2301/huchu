#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
"use strict";
require("dotenv").config();

const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.warn("DATABASE_URL not set. Prisma will use PG* env vars.");
}

const pool = connectionString ? new Pool({ connectionString }) : new Pool();
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const ALLOWED_ROLES = new Set(["SUPERADMIN", "MANAGER", "CLERK"]);

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
  pnpm create-user --email <email> --name <name> --password <password> --role <superadmin|manager|clerk> [--company-id <uuid>]

Options:
  --email        User email (required)
  --name         User name (required)
  --password     Plaintext password (required)
  --role         superadmin | manager | clerk (required)
  --company-id   Company UUID (optional if only one company exists)
  --help         Show this help message
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
      "No companies found. Create a company before adding users.",
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

  const emailArg = getArg("--email");
  const name = getArg("--name");
  const password = getArg("--password");
  const roleArg = getArg("--role");
  const companyIdArg = getArg("--company-id");

  if (!emailArg || !name || !password || !roleArg) {
    printUsage();
    throw new Error("Missing required arguments.");
  }

  const email = emailArg.trim().toLowerCase();
  const role = roleArg.trim().toUpperCase();

  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters long.");
  }

  if (!ALLOWED_ROLES.has(role)) {
    throw new Error(
      `Invalid role: ${roleArg}. Use superadmin, manager, or clerk.`,
    );
  }

  const companyId = await resolveCompanyId(companyIdArg);

  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (existingUser) {
    throw new Error(`User already exists with email: ${email}`);
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.create({
    data: {
      email,
      name,
      password: passwordHash,
      role,
      companyId,
      isActive: true,
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      companyId: true,
    },
  });

  console.log("User created:");
  console.log(user);
}

main()
  .catch((error) => {
    console.error("Error creating user:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
