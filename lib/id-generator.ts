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
  | "SCHOOL_FEE_REFUND"
  | "CAR_SALES_LEAD"
  | "CAR_SALES_VEHICLE"
  | "CAR_SALES_DEAL"
  | "CAR_SALES_PAYMENT"
  | "GOLD_POUR"
  | "GOLD_RECEIPT"
  | "GOLD_PURCHASE"
  | "SCRAP_MATERIAL"
  | "SCRAP_METAL_PURCHASE"
  | "SCRAP_METAL_BATCH"
  | "SCRAP_METAL_SALE"
  | "RETAIL_REGISTER"
  | "RETAIL_PURCHASE_ORDER"
  | "RETAIL_GOODS_RECEIPT"
  | "RETAIL_SHIFT"
  | "RETAIL_HELD_CART"
  | "RETAIL_SALE"
  | "RETAIL_PROMOTION"
  | "CRM_CLIENT"
  | "CRM_LEAD"
  | "CRM_APPOINTMENT"
  | "CRM_PERSON"
  | "CRM_WORK_ORDER"
  | "CRM_DEAL"
  | "CRM_SITE"
  | "SALES_QUOTATION"
  | "SALES_INVOICE"
  | "SALES_RECEIPT";

type EntityConfig = {
  prefix: string;
  requiresSiteId: boolean;
  // True: use GlobalIdSequence (no companyId FK) so the counter is shared across tenants.
  // Required when the underlying table has a global @unique on the reference field.
  globalSequence?: boolean;
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
  STOCK_MOVEMENT: { prefix: "MOV", requiresSiteId: false, globalSequence: true },
  SCHOOL_STUDENT: { prefix: "STU", requiresSiteId: false },
  SCHOOL_GUARDIAN: { prefix: "GDN", requiresSiteId: false },
  SCHOOL_FEE_INVOICE: { prefix: "SFI", requiresSiteId: false },
  SCHOOL_FEE_RECEIPT: { prefix: "SFR", requiresSiteId: false },
  // SFR is taken by the receipt, so a refund reads SFRF.
  SCHOOL_FEE_REFUND: { prefix: "SFRF", requiresSiteId: false },
  CAR_SALES_LEAD: { prefix: "LEAD", requiresSiteId: false },
  CAR_SALES_VEHICLE: { prefix: "CAR", requiresSiteId: false },
  CAR_SALES_DEAL: { prefix: "DEAL", requiresSiteId: false },
  CAR_SALES_PAYMENT: { prefix: "PAY", requiresSiteId: false },
  GOLD_POUR: { prefix: "BAR", requiresSiteId: false },
  GOLD_RECEIPT: { prefix: "RCP", requiresSiteId: false },
  GOLD_PURCHASE: { prefix: "GPUR", requiresSiteId: false },
  SCRAP_MATERIAL: { prefix: "SCMAT", requiresSiteId: false },
  SCRAP_METAL_PURCHASE: { prefix: "SCPUR", requiresSiteId: false },
  SCRAP_METAL_BATCH: { prefix: "SCBAT", requiresSiteId: false },
  SCRAP_METAL_SALE: { prefix: "SCSAL", requiresSiteId: false },
  RETAIL_REGISTER: { prefix: "REG", requiresSiteId: true },
  RETAIL_PURCHASE_ORDER: { prefix: "RPO", requiresSiteId: true },
  RETAIL_GOODS_RECEIPT: { prefix: "RGR", requiresSiteId: true },
  RETAIL_SHIFT: { prefix: "RSH", requiresSiteId: true },
  RETAIL_HELD_CART: { prefix: "RHC", requiresSiteId: false },
  RETAIL_SALE: { prefix: "RSL", requiresSiteId: true },
  RETAIL_PROMOTION: { prefix: "RPM", requiresSiteId: false },
  CRM_CLIENT: { prefix: "CLI", requiresSiteId: false },
  CRM_LEAD: { prefix: "CRL", requiresSiteId: false },
  CRM_APPOINTMENT: { prefix: "SVT", requiresSiteId: false },
  CRM_PERSON: { prefix: "PSN", requiresSiteId: false },
  CRM_WORK_ORDER: { prefix: "CWO", requiresSiteId: false },
  // DEAL is already taken by CAR_SALES_DEAL, so the CRM deal reads CRMD.
  CRM_DEAL: { prefix: "CRMD", requiresSiteId: false },
  CRM_SITE: { prefix: "CSITE", requiresSiteId: false },
  SALES_QUOTATION: { prefix: "QTN", requiresSiteId: false },
  SALES_INVOICE: { prefix: "INV", requiresSiteId: false },
  SALES_RECEIPT: { prefix: "REC", requiresSiteId: false },
};

type DbClient = PrismaClient | Prisma.TransactionClient;

function buildCode(prefix: string, number: number, separator = "-", padWidth = PAD) {
  return `${prefix}${separator}${String(number).padStart(padWidth, "0")}`;
}

/**
 * The numbering a school is already using.
 *
 * A school does not adopt our numbering when it adopts the module — it arrives
 * with four hundred pupils numbered `S1000` upwards, in a register, on a wall, and
 * in a parent's phone. The configured prefix for `SCHOOL_STUDENT` is `STU`, and
 * `extractMaxFromCodes` only recognises `PREFIX-digits`, so the first pupil
 * admitted through the product was handed `STU-0001` and sat in a register beside
 * `S1002`. Two schemes in one school, and the second one starting at 1 — which
 * looks like a brand new school to anybody reading a list.
 *
 * So the existing codes decide. If the school's numbers agree on a prefix and a
 * separator — `S1000` or `CHS/0142` as readily as `STU-0001` — the next number
 * continues them. If they disagree, or there are none, the configured default
 * stands. Nothing here renumbers anything: a school's existing numbers are its
 * own, and the only question this answers is what the NEXT one looks like.
 *
 * Applied to the school entities only. The other modules' codes are all
 * product-issued from the first row, so there is nothing to continue.
 */
const SCHOOL_NUMBERING_PATTERN = /^([A-Za-z]{1,8})([-/ ]?)(\d{1,10})$/;

export function inferNumbering(
  codes: Array<string | null | undefined>,
  fallbackPrefix: string,
): { prefix: string; separator: string; max: number } {
  const tallies = new Map<string, { prefix: string; separator: string; count: number; max: number }>();

  for (const code of codes) {
    const match = code?.trim().match(SCHOOL_NUMBERING_PATTERN);
    if (!match) continue;
    const [, prefix, separator, digits] = match;
    const key = `${prefix.toUpperCase()}|${separator}`;
    const parsed = Number.parseInt(digits, 10);
    const entry = tallies.get(key) ?? { prefix, separator, count: 0, max: 0 };
    entry.count += 1;
    if (Number.isFinite(parsed)) entry.max = Math.max(entry.max, parsed);
    tallies.set(key, entry);
  }

  if (tallies.size === 0) {
    return { prefix: fallbackPrefix, separator: "-", max: 0 };
  }

  // The commonest scheme wins, and ties break on the higher number — a school that
  // renamed its prefix last year should continue the one it is using now, not the
  // one it used to.
  const winner = [...tallies.values()].sort(
    (left, right) => right.count - left.count || right.max - left.max,
  )[0];

  return { prefix: winner.prefix, separator: winner.separator, max: winner.max };
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
      // referenceId has a global @unique constraint — scan all records, not per-company.
      const records = await db.stockMovement.findMany({
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
    case "SCHOOL_FEE_REFUND": {
      const records = await db.schoolFeeRefund.findMany({
        where: { companyId },
        select: { refundNo: true },
      });
      return extractMaxFromCodes(records.map((record) => record.refundNo), prefix);
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
    case "SCRAP_MATERIAL": {
      const records = await db.scrapMaterial.findMany({
        where: { companyId },
        select: { code: true },
      });
      return extractMaxFromCodes(records.map((record) => record.code), prefix);
    }
    case "SCRAP_METAL_PURCHASE": {
      const records = await db.scrapMetalPurchase.findMany({
        where: { companyId },
        select: { purchaseNumber: true },
      });
      return extractMaxFromCodes(records.map((record) => record.purchaseNumber), prefix);
    }
    case "SCRAP_METAL_BATCH": {
      const records = await db.scrapMetalBatch.findMany({
        where: { companyId },
        select: { batchNumber: true },
      });
      return extractMaxFromCodes(records.map((record) => record.batchNumber), prefix);
    }
    case "SCRAP_METAL_SALE": {
      const records = await db.scrapMetalSale.findMany({
        where: { companyId },
        select: { saleNumber: true },
      });
      return extractMaxFromCodes(records.map((record) => record.saleNumber), prefix);
    }
    case "RETAIL_REGISTER": {
      if (!siteId) return 0;
      const records = await db.retailRegister.findMany({
        where: { companyId, siteId },
        select: { code: true },
      });
      return extractMaxFromCodes(records.map((record) => record.code), prefix);
    }
    case "RETAIL_PURCHASE_ORDER": {
      if (!siteId) return 0;
      const records = await db.retailPurchaseOrder.findMany({
        where: { companyId, siteId },
        select: { poNo: true },
      });
      return extractMaxFromCodes(records.map((record) => record.poNo), prefix);
    }
    case "RETAIL_GOODS_RECEIPT": {
      if (!siteId) return 0;
      const records = await db.retailGoodsReceipt.findMany({
        where: { companyId, siteId },
        select: { receiptNo: true },
      });
      return extractMaxFromCodes(records.map((record) => record.receiptNo), prefix);
    }
    case "RETAIL_SHIFT": {
      if (!siteId) return 0;
      const records = await db.retailShift.findMany({
        where: { companyId, siteId },
        select: { shiftNo: true },
      });
      return extractMaxFromCodes(records.map((record) => record.shiftNo), prefix);
    }
    case "RETAIL_HELD_CART": {
      const records = await db.retailHeldCart.findMany({
        where: { companyId },
        select: { holdNo: true },
      });
      return extractMaxFromCodes(records.map((record) => record.holdNo), prefix);
    }
    case "RETAIL_SALE": {
      if (!siteId) return 0;
      const records = await db.retailSale.findMany({
        where: { companyId, siteId },
        select: { saleNo: true },
      });
      return extractMaxFromCodes(records.map((record) => record.saleNo), prefix);
    }
    case "RETAIL_PROMOTION": {
      const records = await db.retailPromotion.findMany({
        where: { companyId },
        select: { promoCode: true },
      });
      return extractMaxFromCodes(records.map((record) => record.promoCode), prefix);
    }
    // CRM entities seed from existing rows so a lost IdSequence row cannot
    // restart the counter at 0001 and collide with the unique constraint.
    case "CRM_CLIENT": {
      const records = await db.crmClient.findMany({
        where: { companyId },
        select: { clientNo: true },
      });
      return extractMaxFromCodes(records.map((record) => record.clientNo), prefix);
    }
    case "CRM_LEAD": {
      const records = await db.crmLead.findMany({
        where: { companyId },
        select: { leadNo: true },
      });
      return extractMaxFromCodes(records.map((record) => record.leadNo), prefix);
    }
    case "CRM_APPOINTMENT": {
      const records = await db.crmAppointment.findMany({
        where: { companyId },
        select: { appointmentNo: true },
      });
      return extractMaxFromCodes(records.map((record) => record.appointmentNo), prefix);
    }
    case "CRM_PERSON": {
      const records = await db.crmPerson.findMany({
        where: { companyId },
        select: { personNo: true },
      });
      return extractMaxFromCodes(records.map((record) => record.personNo), prefix);
    }
    case "CRM_WORK_ORDER": {
      const records = await db.crmWorkOrder.findMany({
        where: { companyId },
        select: { workOrderNo: true },
      });
      return extractMaxFromCodes(records.map((record) => record.workOrderNo), prefix);
    }
    case "CRM_DEAL": {
      const records = await db.crmDeal.findMany({
        where: { companyId },
        select: { dealNo: true },
      });
      return extractMaxFromCodes(records.map((record) => record.dealNo), prefix);
    }
    case "CRM_SITE": {
      const records = await db.crmSite.findMany({
        where: { companyId },
        select: { siteNo: true },
      });
      return extractMaxFromCodes(records.map((record) => record.siteNo), prefix);
    }
    case "SALES_QUOTATION": {
      const records = await db.salesQuotation.findMany({
        where: { companyId },
        select: { quotationNumber: true },
      });
      return extractMaxFromCodes(records.map((record) => record.quotationNumber), prefix);
    }
    case "SALES_INVOICE": {
      const records = await db.salesInvoice.findMany({
        where: { companyId },
        select: { invoiceNumber: true },
      });
      return extractMaxFromCodes(records.map((record) => record.invoiceNumber), prefix);
    }
    case "SALES_RECEIPT": {
      const records = await db.salesReceipt.findMany({
        where: { companyId },
        select: { receiptNumber: true },
      });
      return extractMaxFromCodes(records.map((record) => record.receiptNumber), prefix);
    }
    default:
      return 0;
  }
}


/** The school entities whose existing numbering is continued rather than replaced. */
const SCHOOL_NUMBERED_ENTITIES = new Set<ReservableIdEntity>([
  "SCHOOL_STUDENT",
  "SCHOOL_GUARDIAN",
  "SCHOOL_FEE_INVOICE",
  "SCHOOL_FEE_RECEIPT",
  "SCHOOL_FEE_REFUND",
]);

async function readSchoolCodes(
  db: Prisma.TransactionClient,
  companyId: string,
  entity: ReservableIdEntity,
): Promise<Array<string | null>> {
  switch (entity) {
    case "SCHOOL_STUDENT":
      return (
        await db.schoolStudent.findMany({ where: { companyId }, select: { studentNo: true } })
      ).map((row) => row.studentNo);
    case "SCHOOL_GUARDIAN":
      return (
        await db.schoolGuardian.findMany({ where: { companyId }, select: { guardianNo: true } })
      ).map((row) => row.guardianNo);
    case "SCHOOL_FEE_INVOICE":
      return (
        await db.schoolFeeInvoice.findMany({ where: { companyId }, select: { invoiceNo: true } })
      ).map((row) => row.invoiceNo);
    case "SCHOOL_FEE_RECEIPT":
      return (
        await db.schoolFeeReceipt.findMany({ where: { companyId }, select: { receiptNo: true } })
      ).map((row) => row.receiptNo);
    case "SCHOOL_FEE_REFUND":
      return (
        await db.schoolFeeRefund.findMany({ where: { companyId }, select: { refundNo: true } })
      ).map((row) => row.refundNo);
    default:
      return [];
  }
}

export async function reserveIdentifier(
  db: PrismaClient | Prisma.TransactionClient,
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

  const scopeKey = config.requiresSiteId && input.siteId ? input.siteId : GLOBAL_SCOPE;

  // Entities with globalSequence use GlobalIdSequence (no companyId FK) so the counter
  // is shared across all tenants, preventing collisions on globally-unique reference fields.
  if (config.globalSequence) {
    const globalWhere = {
      entityKey_scopeKey: { entityKey: input.entity, scopeKey },
    } as const;

    const runGlobal = async (tx: Prisma.TransactionClient) => {
      const existing = await tx.globalIdSequence.findUnique({
        where: globalWhere,
        select: { id: true },
      });

      if (!existing) {
        const maxExisting = await findEntityMaxExistingCode(tx, input);
        await tx.globalIdSequence.createMany({
          data: [{ entityKey: input.entity, scopeKey, lastNumber: maxExisting }],
          skipDuplicates: true,
        });
      }

      const next = await tx.globalIdSequence.update({
        where: globalWhere,
        data: { lastNumber: { increment: 1 } },
        select: { lastNumber: true },
      });

      return buildCode(config.prefix, next.lastNumber);
    };

    if ("$transaction" in db) {
      return (db as PrismaClient).$transaction(runGlobal);
    }
    return runGlobal(db as Prisma.TransactionClient);
  }

  const where = {
    companyId_entityKey_scopeKey: {
      companyId: input.companyId,
      entityKey: input.entity,
      scopeKey,
    },
  } as const;

  const run = async (tx: Prisma.TransactionClient) => {
    const existing = await tx.idSequence.findUnique({
      where,
      select: { id: true },
    });

    // A school arrives with its own numbering. See `inferNumbering`: the existing
    // codes decide what the next one looks like, so a pupil admitted through the
    // product continues `S1000` rather than starting a second scheme at `STU-0001`.
    //
    // Unless the office has said otherwise. An explicit format in
    // `SchoolIdentitySettings` is the school's own answer, and it beats the
    // inferred one — that is the whole point of writing it down.
    const declared =
      input.entity === "SCHOOL_STUDENT"
        ? await tx.schoolIdentitySettings.findUnique({
            where: { companyId: input.companyId },
            select: { studentPrefix: true, studentSeparator: true, studentPadWidth: true },
          })
        : null;
    const numbering =
      declared?.studentPrefix != null
        ? {
            prefix: declared.studentPrefix,
            separator: declared.studentSeparator ?? "-",
            max: inferNumbering(
              await readSchoolCodes(tx, input.companyId, input.entity),
              declared.studentPrefix,
            ).max,
            padWidth: declared.studentPadWidth ?? PAD,
          }
        : SCHOOL_NUMBERED_ENTITIES.has(input.entity)
          ? {
              ...inferNumbering(
                await readSchoolCodes(tx, input.companyId, input.entity),
                config.prefix,
              ),
              padWidth: PAD,
            }
          : { prefix: config.prefix, separator: "-", max: 0, padWidth: PAD };

    if (!existing) {
      const maxExisting = SCHOOL_NUMBERED_ENTITIES.has(input.entity)
        ? numbering.max
        : await findEntityMaxExistingCode(tx, input);
      // Use createMany with skipDuplicates instead of create + P2002 catch.
      // Catching P2002 and continuing inside a transaction causes PostgreSQL to enter
      // an "aborted" state, making every subsequent query fail with
      // "current transaction is aborted". createMany/skipDuplicates translates to
      // INSERT ... ON CONFLICT DO NOTHING which is safe inside a parent transaction.
      await tx.idSequence.createMany({
        data: [
          {
            companyId: input.companyId,
            entityKey: input.entity,
            scopeKey,
            lastNumber: maxExisting,
          },
        ],
        skipDuplicates: true,
      });
    }

    const next = await tx.idSequence.update({
      where,
      data: { lastNumber: { increment: 1 } },
      select: { lastNumber: true },
    });

    return buildCode(numbering.prefix, next.lastNumber, numbering.separator, numbering.padWidth);
  };

  // When already inside a transaction (no $transaction method), run directly.
  // Otherwise wrap in a new transaction for atomicity.
  if ("$transaction" in db) {
    return (db as PrismaClient).$transaction(run);
  }
  return run(db as Prisma.TransactionClient);
}
