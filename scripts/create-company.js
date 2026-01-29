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
  pnpm create-company --name <name>

Options:
  --name   Company name (required)
  --help   Show this help message
`);
}

async function main() {
  if (hasFlag("--help") || hasFlag("-h")) {
    printUsage();
    return;
  }

  const nameArg = getArg("--name");

  if (!nameArg) {
    printUsage();
    throw new Error("Missing required arguments.");
  }

  const name = nameArg.trim();
  if (!name) {
    throw new Error("Company name cannot be empty.");
  }

  const existingCompany = await prisma.company.findFirst({
    where: { name },
    select: { id: true, name: true },
  });

  if (existingCompany) {
    throw new Error(
      `Company already exists with name: ${existingCompany.name} (${existingCompany.id}).`,
    );
  }

  const company = await prisma.company.create({
    data: { name },
    select: { id: true, name: true },
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
