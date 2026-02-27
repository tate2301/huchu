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
  | "TAX_CATEGORY"
  | "TAX_TEMPLATE"
  | "FIXED_ASSET"
  | "INVENTORY_ITEM"
  | "STOCK_LOCATION"
  | "STOCK_MOVEMENT"
  | "SCHOOL_STUDENT"
  | "SCHOOL_GUARDIAN"
  | "SCHOOL_FEE_INVOICE"
  | "SCHOOL_FEE_RECEIPT"
  | "CAR_SALES_LEAD"
  | "CAR_SALES_VEHICLE"
  | "CAR_SALES_DEAL"
  | "CAR_SALES_PAYMENT"
  | "GOLD_POUR"
  | "GOLD_RECEIPT"
  | "GOLD_PURCHASE";

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
  TAX_CATEGORY: { prefix: "TCAT", requiresSiteId: false },
  TAX_TEMPLATE: { prefix: "TTMP", requiresSiteId: false },
  FIXED_ASSET: { prefix: "AST", requiresSiteId: false },
  INVENTORY_ITEM: { prefix: "INV", requiresSiteId: true },
  STOCK_LOCATION: { prefix: "LOC", requiresSiteId: true },
  STOCK_MOVEMENT: { prefix: "MOV", requiresSiteId: false },
  SCHOOL_STUDENT: { prefix: "STU", requiresSiteId: false },
  SCHOOL_GUARDIAN: { prefix: "GDN", requiresSiteId: false },
  SCHOOL_FEE_INVOICE: { prefix: "SFI", requiresSiteId: false },
  SCHOOL_FEE_RECEIPT: { prefix: "SFR", requiresSiteId: false },
  CAR_SALES_LEAD: { prefix: "LEAD", requiresSiteId: false },
  CAR_SALES_VEHICLE: { prefix: "CAR", requiresSiteId: false },
  CAR_SALES_DEAL: { prefix: "DEAL", requiresSiteId: false },
  CAR_SALES_PAYMENT: { prefix: "PAY", requiresSiteId: false },
  GOLD_POUR: { prefix: "BAR", requiresSiteId: false },
  GOLD_RECEIPT: { prefix: "RCP", requiresSiteId: false },
  GOLD_PURCHASE: { prefix: "GPUR", requiresSiteId: false },
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
    case "TAX_CATEGORY": {
      const records = await db.taxCategory.findMany({
        where: { companyId },
        select: { code: true },
      });
      return extractMaxFromCodes(records.map((record) => record.code), prefix);
    }
    case "TAX_TEMPLATE": {
      const records = await db.taxTemplate.findMany({
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
    case "SCHOOL_STUDENT": {
      const records = await db.schoolStudent.findMany({
        where: { companyId },
        select: { studentNo: true },
      });
      return extractMaxFromCodes(records.map((record) => record.studentNo), prefix);
    }
    case "SCHOOL_GUARDIAN": {
      const records = await db.schoolGuardian.findMany({
        where: { companyId },
        select: { guardianNo: true },
      });
      return extractMaxFromCodes(records.map((record) => record.guardianNo), prefix);
    }
    case "SCHOOL_FEE_INVOICE": {
      const records = await db.schoolFeeInvoice.findMany({
        where: { companyId },
        select: { invoiceNo: true },
      });
      return extractMaxFromCodes(records.map((record) => record.invoiceNo), prefix);
    }
    case "SCHOOL_FEE_RECEIPT": {
      const records = await db.schoolFeeReceipt.findMany({
        where: { companyId },
        select: { receiptNo: true },
      });
      return extractMaxFromCodes(records.map((record) => record.receiptNo), prefix);
    }
    case "CAR_SALES_LEAD": {
      const records = await db.carSalesLead.findMany({
        where: { companyId },
        select: { leadNo: true },
      });
      return extractMaxFromCodes(records.map((record) => record.leadNo), prefix);
    }
    case "CAR_SALES_VEHICLE": {
      const records = await db.carSalesVehicle.findMany({
        where: { companyId },
        select: { stockNo: true },
      });
      return extractMaxFromCodes(records.map((record) => record.stockNo), prefix);
    }
    case "CAR_SALES_DEAL": {
      const records = await db.carSalesDeal.findMany({
        where: { companyId },
        select: { dealNo: true },
      });
      return extractMaxFromCodes(records.map((record) => record.dealNo), prefix);
    }
    case "CAR_SALES_PAYMENT": {
      const records = await db.carSalesPayment.findMany({
        where: { companyId },
        select: { paymentNo: true },
      });
      return extractMaxFromCodes(records.map((record) => record.paymentNo), prefix);
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
        where: {
          OR: [
            { goldPour: { is: { site: { companyId } } } },
            { goldDispatch: { is: { goldPour: { site: { companyId } } } } },
          ],
        },
        select: { receiptNumber: true },
      });
      return extractMaxFromCodes(records.map((record) => record.receiptNumber), prefix);
    }
    case "GOLD_PURCHASE": {
      const records = await db.goldPurchase.findMany({
        where: { companyId },
        select: { purchaseNumber: true },
      });
      return extractMaxFromCodes(records.map((record) => record.purchaseNumber), prefix);
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
