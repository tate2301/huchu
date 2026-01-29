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

const rawArgs = process.argv.slice(2);
const hasCommand = rawArgs[0] && !rawArgs[0].startsWith("-");
const command = hasCommand ? rawArgs[0] : "list";
const args = hasCommand ? rawArgs.slice(1) : rawArgs;

function getArg(flag) {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  return args[index + 1];
}

function hasFlag(flag) {
  return args.includes(flag);
}

function parseInteger(value, label, { min = 0, fallback } = {}) {
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < min) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  return parsed;
}

function printUsage() {
  console.log(`Usage:
  pnpm manage-employees list [--company-id <uuid>] [--active|--inactive] [--search <text>] [--limit <n>] [--skip <n>]
  pnpm manage-employees show --id <uuid>
  pnpm manage-employees show --employee-id <id> [--company-id <uuid>]
  pnpm manage-employees update --id <uuid> [--name <name>] [--phone <phone>] [--next-of-kin-name <name>] [--next-of-kin-phone <phone>] [--passport-photo-url <url>] [--village-of-origin <text>] [--active|--inactive]
  pnpm manage-employees update --employee-id <id> [--company-id <uuid>] [--name <name>] [--phone <phone>] [--next-of-kin-name <name>] [--next-of-kin-phone <phone>] [--passport-photo-url <url>] [--village-of-origin <text>] [--active|--inactive]
  pnpm manage-employees activate --id <uuid>
  pnpm manage-employees activate --employee-id <id> [--company-id <uuid>]
  pnpm manage-employees deactivate --id <uuid>
  pnpm manage-employees deactivate --employee-id <id> [--company-id <uuid>]
  pnpm manage-employees delete --id <uuid>
  pnpm manage-employees delete --employee-id <id> [--company-id <uuid>]

Options:
  --company-id         Company UUID (optional if only one company exists)
  --active             Set employee active (update/activate) or filter active (list)
  --inactive           Set employee inactive (update/deactivate) or filter inactive (list)
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
    throw new Error("No companies found.");
  }

  if (companies.length > 1) {
    const list = companies.map((c) => `- ${c.name}: ${c.id}`).join("\n");
    throw new Error(`Multiple companies found. Provide --company-id.\n${list}`);
  }

  return companies[0].id;
}

async function resolveEmployee({ idArg, employeeIdArg, companyIdArg }) {
  if (idArg) {
    const companyId = companyIdArg ? await resolveCompanyId(companyIdArg) : null;
    const employee = await prisma.employee.findUnique({
      where: { id: idArg },
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
    if (!employee) {
      throw new Error(`Employee not found for id: ${idArg}`);
    }
    if (companyId && employee.companyId !== companyId) {
      throw new Error("Employee does not belong to the specified company.");
    }
    return employee;
  }

  if (!employeeIdArg) {
    throw new Error("Provide --id or --employee-id.");
  }

  const companyId = await resolveCompanyId(companyIdArg);
  const employeeId = employeeIdArg.trim();
  if (!employeeId) {
    throw new Error("Employee ID cannot be empty.");
  }
  const employee = await prisma.employee.findFirst({
    where: {
      companyId,
      employeeId,
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

  if (!employee) {
    throw new Error(`Employee not found for employeeId: ${employeeIdArg}`);
  }

  return employee;
}

function applyStringUpdate(data, value, fieldName, label) {
  if (value === undefined) return;
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${label} cannot be empty.`);
  }
  data[fieldName] = trimmed;
}

async function listEmployees() {
  const companyIdArg = getArg("--company-id");
  const searchArg = getArg("--search");
  const limit = parseInteger(getArg("--limit"), "limit", {
    min: 1,
    fallback: 100,
  });
  const skip = parseInteger(getArg("--skip"), "skip", { min: 0, fallback: 0 });
  const filterActive = hasFlag("--active");
  const filterInactive = hasFlag("--inactive");
  if (filterActive && filterInactive) {
    throw new Error("Use only one of --active or --inactive.");
  }

  const companyId = await resolveCompanyId(companyIdArg);

  const where = { companyId };
  if (filterActive) where.isActive = true;
  if (filterInactive) where.isActive = false;
  if (searchArg) {
    const search = searchArg.trim();
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { employeeId: { contains: search, mode: "insensitive" } },
        { phone: { contains: search, mode: "insensitive" } },
      ];
    }
  }

  const employees = await prisma.employee.findMany({
    where,
    select: {
      id: true,
      employeeId: true,
      name: true,
      phone: true,
      isActive: true,
      companyId: true,
    },
    orderBy: { name: "asc" },
    skip,
    take: limit,
  });

  console.log(`Employees (${employees.length}):`);
  console.log(employees);
}

async function showEmployee() {
  const idArg = getArg("--id");
  const employeeIdArg = getArg("--employee-id");
  const companyIdArg = getArg("--company-id");

  const employee = await resolveEmployee({
    idArg,
    employeeIdArg,
    companyIdArg,
  });

  console.log("Employee:");
  console.log(employee);
}

async function updateEmployee() {
  const idArg = getArg("--id");
  const employeeIdArg = getArg("--employee-id");
  const companyIdArg = getArg("--company-id");
  const setEmployeeIdArg = getArg("--set-employee-id");

  const employee = await resolveEmployee({
    idArg,
    employeeIdArg,
    companyIdArg,
  });

  const data = {};
  if (setEmployeeIdArg !== undefined) {
    throw new Error("Employee IDs are auto-generated and cannot be updated.");
  }
  applyStringUpdate(data, getArg("--name"), "name", "Employee name");
  applyStringUpdate(data, getArg("--phone"), "phone", "Employee phone");
  applyStringUpdate(
    data,
    getArg("--next-of-kin-name"),
    "nextOfKinName",
    "Next of kin name",
  );
  applyStringUpdate(
    data,
    getArg("--next-of-kin-phone"),
    "nextOfKinPhone",
    "Next of kin phone",
  );
  applyStringUpdate(
    data,
    getArg("--passport-photo-url"),
    "passportPhotoUrl",
    "Passport photo URL",
  );
  applyStringUpdate(
    data,
    getArg("--village-of-origin"),
    "villageOfOrigin",
    "Village of origin",
  );

  const setActive = hasFlag("--active");
  const setInactive = hasFlag("--inactive");
  if (setActive && setInactive) {
    throw new Error("Use only one of --active or --inactive.");
  }
  if (setActive) data.isActive = true;
  if (setInactive) data.isActive = false;

  if (Object.keys(data).length === 0) {
    throw new Error("No update fields provided.");
  }

  const updated = await prisma.employee.update({
    where: { id: employee.id },
    data,
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

  console.log("Employee updated:");
  console.log(updated);
}

async function setEmployeeActive(isActive) {
  const idArg = getArg("--id");
  const employeeIdArg = getArg("--employee-id");
  const companyIdArg = getArg("--company-id");

  const employee = await resolveEmployee({
    idArg,
    employeeIdArg,
    companyIdArg,
  });

  const updated = await prisma.employee.update({
    where: { id: employee.id },
    data: { isActive },
    select: {
      id: true,
      employeeId: true,
      name: true,
      phone: true,
      isActive: true,
      companyId: true,
    },
  });

  console.log("Employee updated:");
  console.log(updated);
}

async function deleteEmployee() {
  const idArg = getArg("--id");
  const employeeIdArg = getArg("--employee-id");
  const companyIdArg = getArg("--company-id");

  const employee = await resolveEmployee({
    idArg,
    employeeIdArg,
    companyIdArg,
  });

  const [
    attendanceCount,
    shiftCount,
    workOrderCount,
    witnessCount,
    dispatchCount,
  ] = await Promise.all([
    prisma.attendance.count({ where: { employeeId: employee.id } }),
    prisma.shiftReport.count({ where: { groupLeaderId: employee.id } }),
    prisma.workOrder.count({ where: { technicianId: employee.id } }),
    prisma.goldPour.count({
      where: {
        OR: [{ witness1Id: employee.id }, { witness2Id: employee.id }],
      },
    }),
    prisma.goldDispatch.count({ where: { handedOverById: employee.id } }),
  ]);

  const totalLinks =
    attendanceCount +
    shiftCount +
    workOrderCount +
    witnessCount +
    dispatchCount;

  if (totalLinks > 0) {
    throw new Error(
      "Employee has linked records and cannot be deleted. Deactivate instead.",
    );
  }

  await prisma.employee.delete({ where: { id: employee.id } });

  console.log("Employee deleted:");
  console.log({ id: employee.id, employeeId: employee.employeeId });
}

async function main() {
  if (hasFlag("--help") || hasFlag("-h")) {
    printUsage();
    return;
  }

  switch (command) {
    case "list":
      await listEmployees();
      break;
    case "show":
      await showEmployee();
      break;
    case "update":
      await updateEmployee();
      break;
    case "activate":
      await setEmployeeActive(true);
      break;
    case "deactivate":
      await setEmployeeActive(false);
      break;
    case "delete":
      await deleteEmployee();
      break;
    default:
      printUsage();
      throw new Error(`Unknown command: ${command}`);
  }
}

main()
  .catch((error) => {
    console.error("Error managing employees:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
