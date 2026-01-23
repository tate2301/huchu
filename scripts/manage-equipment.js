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

const rawArgs = process.argv.slice(2);
const hasCommand = rawArgs[0] && !rawArgs[0].startsWith("-");
const command = hasCommand ? rawArgs[0] : "list";
const args = hasCommand ? rawArgs.slice(1) : rawArgs;

const ALLOWED_CATEGORIES = new Set([
  "CRUSHER",
  "MILL",
  "PUMP",
  "GENERATOR",
  "VEHICLE",
  "OTHER",
]);

function getArg(flag) {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  return args[index + 1];
}

function hasFlag(flag) {
  return args.includes(flag);
}

function parseNumber(value, label, { min = 0 } = {}) {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  return parsed;
}

function parseInteger(value, label, { min = 0, fallback } = {}) {
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < min) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  return parsed;
}

function parseDate(value, label) {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${label} cannot be empty.`);
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  return parsed;
}

function parseCategory(value) {
  if (value === undefined) return undefined;
  const normalized = value.trim().toUpperCase();
  if (!ALLOWED_CATEGORIES.has(normalized)) {
    throw new Error(
      `Invalid category: ${value}. Use ${Array.from(ALLOWED_CATEGORIES)
        .map((category) => category.toLowerCase())
        .join(", ")}.`,
    );
  }
  return normalized;
}

function applyStringUpdate(data, value, fieldName, label) {
  if (value === undefined) return;
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${label} cannot be empty.`);
  }
  data[fieldName] = trimmed;
}

function printUsage() {
  console.log(`Usage:
  pnpm manage-equipment list [--company-id <uuid>] [--site-id <uuid>] [--active|--inactive] [--search <text>] [--limit <n>] [--skip <n>]
  pnpm manage-equipment show --id <uuid>
  pnpm manage-equipment show --equipment-code <code> [--site-id <uuid>] [--company-id <uuid>]
  pnpm manage-equipment create --equipment-code <code> --name <name> --category <category> [--site-id <uuid>] [--company-id <uuid>] [--qr-code <text>] [--last-service-date <date>] [--next-service-due <date>] [--service-hours <n>] [--service-days <n>] [--inactive]
  pnpm manage-equipment update --id <uuid> [--set-equipment-code <code>] [--name <name>] [--category <category>] [--qr-code <text>] [--last-service-date <date>] [--next-service-due <date>] [--service-hours <n>] [--service-days <n>] [--set-site-id <uuid>] [--active|--inactive]
  pnpm manage-equipment update --equipment-code <code> [--site-id <uuid>] [--company-id <uuid>] [--set-equipment-code <code>] [--name <name>] [--category <category>] [--qr-code <text>] [--last-service-date <date>] [--next-service-due <date>] [--service-hours <n>] [--service-days <n>] [--set-site-id <uuid>] [--active|--inactive]
  pnpm manage-equipment activate --id <uuid>
  pnpm manage-equipment activate --equipment-code <code> [--site-id <uuid>] [--company-id <uuid>]
  pnpm manage-equipment deactivate --id <uuid>
  pnpm manage-equipment deactivate --equipment-code <code> [--site-id <uuid>] [--company-id <uuid>]
  pnpm manage-equipment delete --id <uuid>
  pnpm manage-equipment delete --equipment-code <code> [--site-id <uuid>] [--company-id <uuid>]

Options:
  --company-id         Company UUID (optional if only one company exists)
  --site-id            Site UUID (optional if only one site exists for company)
  --set-site-id        Site UUID for updates
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

async function resolveSite({ siteIdArg, companyIdArg, requireActive = false }) {
  if (siteIdArg) {
    const site = await prisma.site.findUnique({
      where: { id: siteIdArg },
      select: { id: true, name: true, code: true, companyId: true, isActive: true },
    });

    if (!site) {
      throw new Error(`Site not found for id: ${siteIdArg}`);
    }

    if (companyIdArg) {
      const companyId = await resolveCompanyId(companyIdArg);
      if (site.companyId !== companyId) {
        throw new Error("Site does not belong to the specified company.");
      }
    }

    if (requireActive && !site.isActive) {
      throw new Error(`Site ${site.name} (${site.code}) is not active.`);
    }

    return site;
  }

  const companyId = await resolveCompanyId(companyIdArg);

  const sites = await prisma.site.findMany({
    where: { companyId },
    select: { id: true, name: true, code: true, companyId: true, isActive: true },
    orderBy: { name: "asc" },
  });

  if (sites.length === 0) {
    throw new Error("No sites found. Create a site before adding equipment.");
  }

  if (sites.length > 1) {
    const list = sites.map((s) => `- ${s.name} (${s.code}): ${s.id}`).join("\n");
    throw new Error(`Multiple sites found. Provide --site-id.\n${list}`);
  }

  const site = sites[0];
  if (requireActive && !site.isActive) {
    throw new Error(`Site ${site.name} (${site.code}) is not active.`);
  }

  return site;
}

async function resolveEquipment({ idArg, equipmentCodeArg, siteIdArg, companyIdArg }) {
  if (idArg) {
    const equipment = await prisma.equipment.findUnique({
      where: { id: idArg },
      include: {
        site: { select: { id: true, name: true, code: true, companyId: true } },
      },
    });

    if (!equipment) {
      throw new Error(`Equipment not found for id: ${idArg}`);
    }

    if (siteIdArg && equipment.siteId !== siteIdArg) {
      throw new Error("Equipment does not belong to the specified site.");
    }

    if (companyIdArg) {
      const companyId = await resolveCompanyId(companyIdArg);
      if (equipment.site.companyId !== companyId) {
        throw new Error("Equipment does not belong to the specified company.");
      }
    }

    return equipment;
  }

  if (!equipmentCodeArg) {
    throw new Error("Provide --id or --equipment-code.");
  }

  const site = await resolveSite({ siteIdArg, companyIdArg });
  const equipmentCode = equipmentCodeArg.trim();
  if (!equipmentCode) {
    throw new Error("Equipment code cannot be empty.");
  }

  const equipment = await prisma.equipment.findFirst({
    where: {
      siteId: site.id,
      equipmentCode,
    },
    include: {
      site: { select: { id: true, name: true, code: true, companyId: true } },
    },
  });

  if (!equipment) {
    throw new Error(`Equipment not found for code: ${equipmentCode}`);
  }

  return equipment;
}

async function listEquipment() {
  const companyIdArg = getArg("--company-id");
  const siteIdArg = getArg("--site-id");
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

  const site = siteIdArg ? await resolveSite({ siteIdArg, companyIdArg }) : null;
  const companyId = site ? site.companyId : await resolveCompanyId(companyIdArg);

  const where = site ? { siteId: site.id } : { site: { companyId } };
  if (filterActive) where.isActive = true;
  if (filterInactive) where.isActive = false;
  if (searchArg) {
    const search = searchArg.trim();
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { equipmentCode: { contains: search, mode: "insensitive" } },
      ];
    }
  }

  const equipment = await prisma.equipment.findMany({
    where,
    include: { site: { select: { name: true, code: true } } },
    orderBy: { name: "asc" },
    skip,
    take: limit,
  });

  console.log(`Equipment (${equipment.length}):`);
  console.log(equipment);
}

async function showEquipment() {
  const idArg = getArg("--id");
  const equipmentCodeArg = getArg("--equipment-code");
  const siteIdArg = getArg("--site-id");
  const companyIdArg = getArg("--company-id");

  const equipment = await resolveEquipment({
    idArg,
    equipmentCodeArg,
    siteIdArg,
    companyIdArg,
  });

  console.log("Equipment:");
  console.log(equipment);
}

async function createEquipment() {
  const equipmentCodeArg = getArg("--equipment-code");
  const nameArg = getArg("--name");
  const categoryArg = getArg("--category");
  const siteIdArg = getArg("--site-id");
  const companyIdArg = getArg("--company-id");
  const qrCodeArg = getArg("--qr-code");

  if (!equipmentCodeArg || !nameArg || !categoryArg) {
    printUsage();
    throw new Error("Missing required arguments.");
  }

  const equipmentCode = equipmentCodeArg.trim();
  const name = nameArg.trim();
  const category = parseCategory(categoryArg);
  const qrCode = qrCodeArg ? qrCodeArg.trim() : undefined;

  if (!equipmentCode) throw new Error("Equipment code cannot be empty.");
  if (!name) throw new Error("Equipment name cannot be empty.");

  const site = await resolveSite({
    siteIdArg,
    companyIdArg,
    requireActive: true,
  });

  const existing = await prisma.equipment.findFirst({
    where: { equipmentCode, siteId: site.id },
    select: { id: true },
  });

  if (existing) {
    throw new Error(`Equipment code already exists for site: ${equipmentCode}`);
  }

  if (qrCode) {
    const duplicateQr = await prisma.equipment.findFirst({
      where: { qrCode },
      select: { id: true },
    });
    if (duplicateQr) {
      throw new Error(`QR code already in use: ${qrCode}`);
    }
  }

  const lastServiceDate = parseDate(
    getArg("--last-service-date"),
    "last-service-date",
  );
  const nextServiceDue = parseDate(
    getArg("--next-service-due"),
    "next-service-due",
  );
  const serviceHours = parseNumber(getArg("--service-hours"), "service-hours", {
    min: 0,
  });
  const serviceDays = parseInteger(getArg("--service-days"), "service-days", {
    min: 0,
  });

  const isActive = !hasFlag("--inactive");

  const equipment = await prisma.equipment.create({
    data: {
      equipmentCode,
      name,
      category,
      siteId: site.id,
      qrCode,
      lastServiceDate,
      nextServiceDue,
      serviceHours,
      serviceDays,
      isActive,
    },
    include: { site: { select: { name: true, code: true } } },
  });

  console.log("Equipment created:");
  console.log(equipment);
}

async function updateEquipment() {
  const idArg = getArg("--id");
  const equipmentCodeArg = getArg("--equipment-code");
  const siteIdArg = getArg("--site-id");
  const companyIdArg = getArg("--company-id");
  const setSiteIdArg = getArg("--set-site-id");

  const equipment = await resolveEquipment({
    idArg,
    equipmentCodeArg,
    siteIdArg,
    companyIdArg,
  });

  const data = {};
  applyStringUpdate(
    data,
    getArg("--set-equipment-code"),
    "equipmentCode",
    "Equipment code",
  );
  applyStringUpdate(data, getArg("--name"), "name", "Equipment name");

  const category = parseCategory(getArg("--category"));
  if (category) data.category = category;

  const qrCodeArg = getArg("--qr-code");
  if (qrCodeArg !== undefined) {
    const trimmed = qrCodeArg.trim();
    if (!trimmed) {
      throw new Error("QR code cannot be empty.");
    }
    data.qrCode = trimmed;
  }

  const lastServiceDate = parseDate(
    getArg("--last-service-date"),
    "last-service-date",
  );
  const nextServiceDue = parseDate(
    getArg("--next-service-due"),
    "next-service-due",
  );
  const serviceHours = parseNumber(getArg("--service-hours"), "service-hours", {
    min: 0,
  });
  const serviceDays = parseInteger(getArg("--service-days"), "service-days", {
    min: 0,
  });

  if (lastServiceDate !== undefined) data.lastServiceDate = lastServiceDate;
  if (nextServiceDue !== undefined) data.nextServiceDue = nextServiceDue;
  if (serviceHours !== undefined) data.serviceHours = serviceHours;
  if (serviceDays !== undefined) data.serviceDays = serviceDays;

  const setActive = hasFlag("--active");
  const setInactive = hasFlag("--inactive");
  if (setActive && setInactive) {
    throw new Error("Use only one of --active or --inactive.");
  }
  if (setActive) data.isActive = true;
  if (setInactive) data.isActive = false;

  if (setSiteIdArg && setSiteIdArg !== equipment.siteId) {
    const site = await resolveSite({
      siteIdArg: setSiteIdArg,
      companyIdArg,
      requireActive: true,
    });
    data.siteId = site.id;
  }

  if (Object.keys(data).length === 0) {
    throw new Error("No update fields provided.");
  }

  if (data.qrCode && data.qrCode !== equipment.qrCode) {
    const duplicateQr = await prisma.equipment.findFirst({
      where: { qrCode: data.qrCode, NOT: { id: equipment.id } },
      select: { id: true },
    });
    if (duplicateQr) {
      throw new Error(`QR code already in use: ${data.qrCode}`);
    }
  }

  const targetSiteId = data.siteId ?? equipment.siteId;
  const targetCode = data.equipmentCode ?? equipment.equipmentCode;
  if (targetSiteId !== equipment.siteId || targetCode !== equipment.equipmentCode) {
    const duplicate = await prisma.equipment.findFirst({
      where: {
        siteId: targetSiteId,
        equipmentCode: targetCode,
        NOT: { id: equipment.id },
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new Error(`Equipment code already exists for site: ${targetCode}`);
    }
  }

  const updated = await prisma.equipment.update({
    where: { id: equipment.id },
    data,
    include: { site: { select: { name: true, code: true } } },
  });

  console.log("Equipment updated:");
  console.log(updated);
}

async function setEquipmentActive(isActive) {
  const idArg = getArg("--id");
  const equipmentCodeArg = getArg("--equipment-code");
  const siteIdArg = getArg("--site-id");
  const companyIdArg = getArg("--company-id");

  const equipment = await resolveEquipment({
    idArg,
    equipmentCodeArg,
    siteIdArg,
    companyIdArg,
  });

  const updated = await prisma.equipment.update({
    where: { id: equipment.id },
    data: { isActive },
    include: { site: { select: { name: true, code: true } } },
  });

  console.log("Equipment updated:");
  console.log(updated);
}

async function deleteEquipment() {
  const idArg = getArg("--id");
  const equipmentCodeArg = getArg("--equipment-code");
  const siteIdArg = getArg("--site-id");
  const companyIdArg = getArg("--company-id");

  const equipment = await resolveEquipment({
    idArg,
    equipmentCodeArg,
    siteIdArg,
    companyIdArg,
  });

  const workOrderCount = await prisma.workOrder.count({
    where: { equipmentId: equipment.id },
  });

  if (workOrderCount > 0) {
    throw new Error("Equipment has work orders and cannot be deleted.");
  }

  await prisma.equipment.delete({ where: { id: equipment.id } });

  console.log("Equipment deleted:");
  console.log({ id: equipment.id, equipmentCode: equipment.equipmentCode });
}

async function main() {
  if (hasFlag("--help") || hasFlag("-h")) {
    printUsage();
    return;
  }

  switch (command) {
    case "list":
      await listEquipment();
      break;
    case "show":
      await showEquipment();
      break;
    case "create":
      await createEquipment();
      break;
    case "update":
      await updateEquipment();
      break;
    case "activate":
      await setEquipmentActive(true);
      break;
    case "deactivate":
      await setEquipmentActive(false);
      break;
    case "delete":
      await deleteEquipment();
      break;
    default:
      printUsage();
      throw new Error(`Unknown command: ${command}`);
  }
}

main()
  .catch((error) => {
    console.error("Error managing equipment:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
