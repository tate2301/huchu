import { Prisma, PrismaClient } from "@prisma/client";

export type ReservableIdEntity =
  | "SITE"
  | "DEPARTMENT"
  | "JOB_GRADE"
  | "DOWNTIME_CODE"
  | "EQUIPMENT"
  | "CHART_OF_ACCOUNT"
  | "COST_CENTER"
  | "TAX_CODE"
  | "FIXED_ASSET"
  | "INVENTORY_ITEM"
  | "STOCK_LOCATION"
  | "STOCK_MOVEMENT"
  | "GOLD_POUR"
  | "GOLD_RECEIPT";

type EntityConfig = {
  prefix: string;
  requiresSiteId: boolean;
};

const PAD = 4;
const GLOBAL_SCOPE = "GLOBAL";

export const ID_ENTITY_CONFIG: Record<ReservableIdEntity, EntityConfig> = {
  SITE: { prefix: "SITE", requiresSiteId: false },
  DEPARTMENT: { prefix: "DEPT", requiresSiteId: false },
  JOB_GRADE: { prefix: "GRD", requiresSiteId: false },
  DOWNTIME_CODE: { prefix: "DTC", requiresSiteId: true },
  EQUIPMENT: { prefix: "EQP", requiresSiteId: true },
  CHART_OF_ACCOUNT: { prefix: "ACC", requiresSiteId: false },
  COST_CENTER: { prefix: "CCTR", requiresSiteId: false },
  TAX_CODE: { prefix: "TAX", requiresSiteId: false },
  FIXED_ASSET: { prefix: "AST", requiresSiteId: false },
  INVENTORY_ITEM: { prefix: "INV", requiresSiteId: true },
  STOCK_LOCATION: { prefix: "LOC", requiresSiteId: true },
  STOCK_MOVEMENT: { prefix: "MOV", requiresSiteId: false },
  GOLD_POUR: { prefix: "BAR", requiresSiteId: false },
  GOLD_RECEIPT: { prefix: "RCP", requiresSiteId: false },
};

type DbClient = PrismaClient | Prisma.TransactionClient;

function buildCode(prefix: string, number: number) {
  return `${prefix}-${String(number).padStart(PAD, "0")}`;
}

function extractMaxFromCodes(codes: Array<string | null | undefined>, prefix: string) {
  const regex = new RegExp(`^${prefix}-(\\d+)$`, "i");
  let max = 0;
  for (const value of codes) {
    if (!value) continue;
    const match = value.match(regex);
    if (!match) continue;
    const parsed = Number.parseInt(match[1], 10);
    if (Number.isFinite(parsed)) {
      max = Math.max(max, parsed);
    }
  }
  return max;
}

export function normalizeProvidedId(
  rawValue: string,
  entity: ReservableIdEntity,
) {
  const trimmed = rawValue.trim().toUpperCase();
  const { prefix } = ID_ENTITY_CONFIG[entity];
  const regex = new RegExp(`^${prefix}-(\\d+)$`, "i");
  if (!regex.test(trimmed)) {
    throw new Error(`Invalid ${entity} identifier format. Expected ${prefix}-0001.`);
  }
  return trimmed;
}

async function findEntityMaxExistingCode(
  db: DbClient,
  input: { companyId: string; entity: ReservableIdEntity; siteId?: string },
) {
  const { companyId, entity, siteId } = input;
  const { prefix } = ID_ENTITY_CONFIG[entity];

  switch (entity) {
    case "SITE": {
      const records = await db.site.findMany({
        where: { companyId },
        select: { code: true },
      });
      return extractMaxFromCodes(records.map((record) => record.code), prefix);
    }
    case "DEPARTMENT": {
      const records = await db.department.findMany({
        where: { companyId },
        select: { code: true },
      });
      return extractMaxFromCodes(records.map((record) => record.code), prefix);
    }
    case "JOB_GRADE": {
      const records = await db.jobGrade.findMany({
        where: { companyId },
        select: { code: true },
      });
      return extractMaxFromCodes(records.map((record) => record.code), prefix);
    }
    case "DOWNTIME_CODE": {
      if (!siteId) return 0;
      const records = await db.downtimeCode.findMany({
        where: {
          siteId,
          site: { companyId },
        },
        select: { code: true },
      });
      return extractMaxFromCodes(records.map((record) => record.code), prefix);
    }
    case "EQUIPMENT": {
      if (!siteId) return 0;
      const records = await db.equipment.findMany({
        where: { siteId, site: { companyId } },
        select: { equipmentCode: true },
      });
      return extractMaxFromCodes(records.map((record) => record.equipmentCode), prefix);
    }
    case "CHART_OF_ACCOUNT": {
      const records = await db.chartOfAccount.findMany({
        where: { companyId },
        select: { code: true },
      });
      return extractMaxFromCodes(records.map((record) => record.code), prefix);
    }
    case "COST_CENTER": {
      const records = await db.costCenter.findMany({
        where: { companyId },
        select: { code: true },
      });
      return extractMaxFromCodes(records.map((record) => record.code), prefix);
    }
    case "TAX_CODE": {
      const records = await db.taxCode.findMany({
        where: { companyId },
        select: { code: true },
      });
      return extractMaxFromCodes(records.map((record) => record.code), prefix);
    }
    case "FIXED_ASSET": {
      const records = await db.fixedAsset.findMany({
        where: { companyId },
        select: { assetCode: true },
      });
      return extractMaxFromCodes(records.map((record) => record.assetCode), prefix);
    }
    case "INVENTORY_ITEM": {
      if (!siteId) return 0;
      const records = await db.inventoryItem.findMany({
        where: { siteId, site: { companyId } },
        select: { itemCode: true },
      });
      return extractMaxFromCodes(records.map((record) => record.itemCode), prefix);
    }
    case "STOCK_LOCATION": {
      if (!siteId) return 0;
      const records = await db.stockLocation.findMany({
        where: { siteId, site: { companyId } },
        select: { code: true },
      });
      return extractMaxFromCodes(records.map((record) => record.code), prefix);
    }
    case "STOCK_MOVEMENT": {
      const records = await db.stockMovement.findMany({
        where: { item: { site: { companyId } } },
        select: { referenceId: true },
      });
      return extractMaxFromCodes(records.map((record) => record.referenceId), prefix);
    }
    case "GOLD_POUR": {
      const records = await db.goldPour.findMany({
        where: { site: { companyId } },
        select: { pourBarId: true },
      });
      return extractMaxFromCodes(records.map((record) => record.pourBarId), prefix);
    }
    case "GOLD_RECEIPT": {
      const records = await db.buyerReceipt.findMany({
        where: { goldDispatch: { goldPour: { site: { companyId } } } },
        select: { receiptNumber: true },
      });
      return extractMaxFromCodes(records.map((record) => record.receiptNumber), prefix);
    }
    default:
      return 0;
  }
}

export async function reserveIdentifier(
  db: PrismaClient,
  input: {
    companyId: string;
    entity: ReservableIdEntity;
    siteId?: string;
  },
) {
  const config = ID_ENTITY_CONFIG[input.entity];
  if (config.requiresSiteId && !input.siteId) {
    throw new Error(`siteId is required for ${input.entity}`);
  }

  const scopeKey = input.siteId ?? GLOBAL_SCOPE;
  const where = {
    companyId_entityKey_scopeKey: {
      companyId: input.companyId,
      entityKey: input.entity,
      scopeKey,
    },
  } as const;

  return db.$transaction(async (tx) => {
    const existing = await tx.idSequence.findUnique({
      where,
      select: { id: true },
    });

    if (!existing) {
      const maxExisting = await findEntityMaxExistingCode(tx, input);
      try {
        await tx.idSequence.create({
          data: {
            companyId: input.companyId,
            entityKey: input.entity,
            scopeKey,
            lastNumber: maxExisting,
          },
        });
      } catch (error) {
        const known = error as Prisma.PrismaClientKnownRequestError;
        if (!(known && known.code === "P2002")) {
          throw error;
        }
      }
    }

    const next = await tx.idSequence.update({
      where,
      data: {
        lastNumber: {
          increment: 1,
        },
      },
      select: { lastNumber: true },
    });

    return buildCode(config.prefix, next.lastNumber);
  });
}
