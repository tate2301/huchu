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
  "FUEL",
  "SPARES",
  "CONSUMABLES",
  "PPE",
  "REAGENTS",
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

function parseCategory(value, { fallback } = {}) {
  if (value === undefined) return fallback;
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
  pnpm manage-inventory list [--company-id <uuid>] [--site-id <uuid>] [--category <category>] [--search <text>] [--limit <n>] [--skip <n>]
  pnpm manage-inventory show --id <uuid>
  pnpm manage-inventory show --item-code <code> [--site-id <uuid>] [--company-id <uuid>]
  pnpm manage-inventory create --item-code <code> --name <name> --unit <unit> --location-id <uuid> [--site-id <uuid>] [--company-id <uuid>] [--category <category>] [--current-stock <n>] [--min-stock <n>] [--max-stock <n>] [--unit-cost <n>]
  pnpm manage-inventory update --id <uuid> [--set-item-code <code>] [--name <name>] [--unit <unit>] [--location-id <uuid>] [--set-site-id <uuid>] [--category <category>] [--current-stock <n>] [--min-stock <n>] [--max-stock <n>] [--unit-cost <n>]
  pnpm manage-inventory update --item-code <code> [--site-id <uuid>] [--company-id <uuid>] [--set-item-code <code>] [--name <name>] [--unit <unit>] [--location-id <uuid>] [--set-site-id <uuid>] [--category <category>] [--current-stock <n>] [--min-stock <n>] [--max-stock <n>] [--unit-cost <n>]
  pnpm manage-inventory delete --id <uuid>
  pnpm manage-inventory delete --item-code <code> [--site-id <uuid>] [--company-id <uuid>]

Options:
  --category           Category (default: consumables for create)
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
    throw new Error("No sites found. Create a site before adding inventory.");
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

async function resolveLocation(locationId, siteId) {
  if (!locationId) {
    throw new Error("Missing --location-id.");
  }

  const location = await prisma.stockLocation.findUnique({
    where: { id: locationId },
    select: { id: true, name: true, siteId: true, isActive: true },
  });

  if (!location) {
    throw new Error(`Stock location not found for id: ${locationId}`);
  }

  if (location.siteId !== siteId) {
    throw new Error("Stock location does not belong to the specified site.");
  }

  if (!location.isActive) {
    throw new Error(`Stock location ${location.name} is not active.`);
  }

  return location;
}

async function resolveItem({ idArg, itemCodeArg, siteIdArg, companyIdArg }) {
  if (idArg) {
    const item = await prisma.inventoryItem.findUnique({
      where: { id: idArg },
      include: {
        site: { select: { id: true, name: true, code: true, companyId: true } },
        location: { select: { id: true, name: true } },
      },
    });

    if (!item) {
      throw new Error(`Inventory item not found for id: ${idArg}`);
    }

    if (siteIdArg && item.siteId !== siteIdArg) {
      throw new Error("Inventory item does not belong to the specified site.");
    }

    if (companyIdArg) {
      const companyId = await resolveCompanyId(companyIdArg);
      if (item.site.companyId !== companyId) {
        throw new Error("Inventory item does not belong to the specified company.");
      }
    }

    return item;
  }

  if (!itemCodeArg) {
    throw new Error("Provide --id or --item-code.");
  }

  const site = await resolveSite({ siteIdArg, companyIdArg });
  const itemCode = itemCodeArg.trim();
  if (!itemCode) {
    throw new Error("Item code cannot be empty.");
  }

  const item = await prisma.inventoryItem.findFirst({
    where: {
      siteId: site.id,
      itemCode,
    },
    include: {
      site: { select: { id: true, name: true, code: true, companyId: true } },
      location: { select: { id: true, name: true } },
    },
  });

  if (!item) {
    throw new Error(`Inventory item not found for code: ${itemCode}`);
  }

  return item;
}

async function listItems() {
  const companyIdArg = getArg("--company-id");
  const siteIdArg = getArg("--site-id");
  const categoryArg = getArg("--category");
  const searchArg = getArg("--search");
  const limit = parseInteger(getArg("--limit"), "limit", {
    min: 1,
    fallback: 100,
  });
  const skip = parseInteger(getArg("--skip"), "skip", { min: 0, fallback: 0 });

  const site = siteIdArg ? await resolveSite({ siteIdArg, companyIdArg }) : null;
  const companyId = site ? site.companyId : await resolveCompanyId(companyIdArg);
  const category = parseCategory(categoryArg);

  const where = site ? { siteId: site.id } : { site: { companyId } };
  if (category) where.category = category;
  if (searchArg) {
    const search = searchArg.trim();
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { itemCode: { contains: search, mode: "insensitive" } },
      ];
    }
  }

  const items = await prisma.inventoryItem.findMany({
    where,
    include: {
      site: { select: { name: true, code: true } },
      location: { select: { name: true } },
    },
    orderBy: { name: "asc" },
    skip,
    take: limit,
  });

  console.log(`Inventory items (${items.length}):`);
  console.log(items);
}

async function showItem() {
  const idArg = getArg("--id");
  const itemCodeArg = getArg("--item-code");
  const siteIdArg = getArg("--site-id");
  const companyIdArg = getArg("--company-id");

  const item = await resolveItem({ idArg, itemCodeArg, siteIdArg, companyIdArg });

  console.log("Inventory item:");
  console.log(item);
}

async function createItem() {
  const itemCodeArg = getArg("--item-code");
  const nameArg = getArg("--name");
  const unitArg = getArg("--unit");
  const locationIdArg = getArg("--location-id");
  const siteIdArg = getArg("--site-id");
  const companyIdArg = getArg("--company-id");
  const categoryArg = getArg("--category");

  if (!itemCodeArg || !nameArg || !unitArg) {
    printUsage();
    throw new Error("Missing required arguments.");
  }

  const itemCode = itemCodeArg.trim();
  const name = nameArg.trim();
  const unit = unitArg.trim();
  const category = parseCategory(categoryArg, { fallback: "CONSUMABLES" });

  if (!itemCode) throw new Error("Item code cannot be empty.");
  if (!name) throw new Error("Item name cannot be empty.");
  if (!unit) throw new Error("Unit cannot be empty.");

  const site = await resolveSite({
    siteIdArg,
    companyIdArg,
    requireActive: true,
  });

  await resolveLocation(locationIdArg, site.id);

  const existing = await prisma.inventoryItem.findFirst({
    where: { itemCode, siteId: site.id },
    select: { id: true },
  });

  if (existing) {
    throw new Error(`Item code already exists for site: ${itemCode}`);
  }

  const currentStock = parseNumber(getArg("--current-stock"), "current-stock", {
    min: 0,
  });
  const minStock = parseNumber(getArg("--min-stock"), "min-stock", { min: 0 });
  const maxStock = parseNumber(getArg("--max-stock"), "max-stock", { min: 0 });
  const unitCost = parseNumber(getArg("--unit-cost"), "unit-cost", { min: 0 });

  if (
    minStock !== undefined &&
    maxStock !== undefined &&
    minStock > maxStock
  ) {
    throw new Error("min-stock must be less than or equal to max-stock.");
  }

  const item = await prisma.inventoryItem.create({
    data: {
      itemCode,
      name,
      unit,
      category,
      siteId: site.id,
      locationId: locationIdArg,
      currentStock: currentStock ?? 0,
      minStock,
      maxStock,
      unitCost,
    },
    include: {
      site: { select: { name: true, code: true } },
      location: { select: { name: true } },
    },
  });

  console.log("Inventory item created:");
  console.log(item);
}

async function updateItem() {
  const idArg = getArg("--id");
  const itemCodeArg = getArg("--item-code");
  const siteIdArg = getArg("--site-id");
  const companyIdArg = getArg("--company-id");
  const locationIdArg = getArg("--location-id");
  const categoryArg = getArg("--category");
  const setSiteIdArg = getArg("--set-site-id");

  const item = await resolveItem({ idArg, itemCodeArg, siteIdArg, companyIdArg });

  const data = {};
  applyStringUpdate(data, getArg("--set-item-code"), "itemCode", "Item code");
  applyStringUpdate(data, getArg("--name"), "name", "Item name");
  applyStringUpdate(data, getArg("--unit"), "unit", "Unit");

  const category = parseCategory(categoryArg);
  if (category) data.category = category;

  const currentStock = parseNumber(getArg("--current-stock"), "current-stock", {
    min: 0,
  });
  const minStock = parseNumber(getArg("--min-stock"), "min-stock", { min: 0 });
  const maxStock = parseNumber(getArg("--max-stock"), "max-stock", { min: 0 });
  const unitCost = parseNumber(getArg("--unit-cost"), "unit-cost", { min: 0 });

  if (currentStock !== undefined) data.currentStock = currentStock;
  if (minStock !== undefined) data.minStock = minStock;
  if (maxStock !== undefined) data.maxStock = maxStock;
  if (unitCost !== undefined) data.unitCost = unitCost;

  if (setSiteIdArg && setSiteIdArg !== item.siteId) {
    if (!locationIdArg) {
      throw new Error("Provide --location-id when changing site.");
    }
    const site = await resolveSite({
      siteIdArg: setSiteIdArg,
      companyIdArg,
      requireActive: true,
    });
    data.siteId = site.id;
  }

  const targetSiteId = data.siteId ?? item.siteId;

  if (locationIdArg) {
    await resolveLocation(locationIdArg, targetSiteId);
    data.locationId = locationIdArg;
  }

  if (Object.keys(data).length === 0) {
    throw new Error("No update fields provided.");
  }

  const nextMinStock =
    data.minStock !== undefined ? data.minStock : item.minStock;
  const nextMaxStock =
    data.maxStock !== undefined ? data.maxStock : item.maxStock;
  if (
    nextMinStock !== null &&
    nextMinStock !== undefined &&
    nextMaxStock !== null &&
    nextMaxStock !== undefined &&
    nextMinStock > nextMaxStock
  ) {
    throw new Error("min-stock must be less than or equal to max-stock.");
  }

  const targetItemCode = data.itemCode ?? item.itemCode;
  if (targetItemCode !== item.itemCode || targetSiteId !== item.siteId) {
    const duplicate = await prisma.inventoryItem.findFirst({
      where: {
        siteId: targetSiteId,
        itemCode: targetItemCode,
        NOT: { id: item.id },
      },
      select: { id: true },
    });

    if (duplicate) {
      throw new Error(
        `Item code already exists for site: ${targetItemCode}`,
      );
    }
  }

  const updated = await prisma.inventoryItem.update({
    where: { id: item.id },
    data,
    include: {
      site: { select: { name: true, code: true } },
      location: { select: { name: true } },
    },
  });

  console.log("Inventory item updated:");
  console.log(updated);
}

async function deleteItem() {
  const idArg = getArg("--id");
  const itemCodeArg = getArg("--item-code");
  const siteIdArg = getArg("--site-id");
  const companyIdArg = getArg("--company-id");

  const item = await resolveItem({ idArg, itemCodeArg, siteIdArg, companyIdArg });

  const movementCount = await prisma.stockMovement.count({
    where: { itemId: item.id },
  });

  if (movementCount > 0) {
    throw new Error(
      "Inventory item has stock movements and cannot be deleted.",
    );
  }

  await prisma.inventoryItem.delete({ where: { id: item.id } });

  console.log("Inventory item deleted:");
  console.log({ id: item.id, itemCode: item.itemCode });
}

async function main() {
  if (hasFlag("--help") || hasFlag("-h")) {
    printUsage();
    return;
  }

  switch (command) {
    case "list":
      await listItems();
      break;
    case "show":
      await showItem();
      break;
    case "create":
      await createItem();
      break;
    case "update":
      await updateItem();
      break;
    case "delete":
      await deleteItem();
      break;
    default:
      printUsage();
      throw new Error(`Unknown command: ${command}`);
  }
}

main()
  .catch((error) => {
    console.error("Error managing inventory:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
