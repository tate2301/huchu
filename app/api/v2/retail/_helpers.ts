import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { createJournalEntryFromSource } from "@/lib/accounting/posting";
import { errorResponse, validateSession } from "@/lib/api-utils";
import { normalizeProvidedId, reserveIdentifier } from "@/lib/id-generator";
import { prisma } from "@/lib/prisma";
import { hasRole, type UserRole } from "@/lib/roles";

export type RetailSession = Awaited<ReturnType<typeof validateSession>> extends infer TResult
  ? TResult extends NextResponse
    ? never
    : TResult extends { session: infer TSession }
      ? TSession
      : never
  : never;

export async function requireRetailSession(request: NextRequest) {
  const sessionResult = await validateSession(request);
  if (sessionResult instanceof NextResponse) {
    return { response: sessionResult, session: null as RetailSession | null };
  }
  return { response: null, session: sessionResult.session as RetailSession };
}

const RETAIL_MANAGER_ROLES: UserRole[] = ["SUPERADMIN", "MANAGER", "SHOP_MANAGER"];
const POS_SUPPORTED_PROMOTION_TYPES = ["PERCENT", "AMOUNT"] as const;

export function canManageRetailTransactions(role: string | null | undefined) {
  return hasRole(role, RETAIL_MANAGER_ROLES);
}

export function isPosSupportedPromotionType(type: string | null | undefined) {
  return POS_SUPPORTED_PROMOTION_TYPES.includes((type ?? "") as (typeof POS_SUPPORTED_PROMOTION_TYPES)[number]);
}

export function getPosSupportedPromotionTypes() {
  return [...POS_SUPPORTED_PROMOTION_TYPES];
}

export function getCashNetFromPayments(
  payments: Array<{ tenderType: string; amount: number }>,
  changeAmount = 0,
) {
  return payments
    .filter((payment) => payment.tenderType === "CASH")
    .reduce((total, payment) => total + payment.amount, 0) - changeAmount;
}

export async function ensureSiteAccess(companyId: string, siteId: string) {
  const site = await prisma.site.findUnique({
    where: { id: siteId },
    select: { id: true, companyId: true, isActive: true, name: true, code: true },
  });

  if (!site || site.companyId !== companyId || !site.isActive) {
    return null;
  }

  return site;
}

export async function ensureLocationAccess(siteId: string, locationId: string) {
  const location = await prisma.stockLocation.findUnique({
    where: { id: locationId },
    select: { id: true, siteId: true, isActive: true, name: true, code: true },
  });

  if (!location || location.siteId !== siteId || !location.isActive) {
    return null;
  }

  return location;
}

export async function ensureInventoryItemAccess(companyId: string, inventoryItemId: string) {
  const item = await prisma.inventoryItem.findUnique({
    where: { id: inventoryItemId },
    include: {
      site: { select: { companyId: true, name: true, code: true } },
      location: { select: { id: true, name: true, code: true } },
    },
  });

  if (!item || item.site.companyId !== companyId) {
    return null;
  }

  return item;
}

export async function upsertRetailRegister(input: {
  companyId: string;
  siteId: string;
  registerName: string;
  registerCode?: string | null;
}) {
  const normalizedName = input.registerName.trim();
  if (!normalizedName) {
    throw new Error("Register name is required.");
  }

  const existing = await prisma.retailRegister.findFirst({
    where: {
      companyId: input.companyId,
      siteId: input.siteId,
      name: { equals: normalizedName, mode: "insensitive" },
    },
  });

  if (existing) {
    return existing;
  }

  const code = input.registerCode
    ? normalizeProvidedId(input.registerCode, "RETAIL_REGISTER")
    : await reserveIdentifier(prisma, {
        companyId: input.companyId,
        entity: "RETAIL_REGISTER",
        siteId: input.siteId,
      });

  return prisma.retailRegister.create({
    data: {
      companyId: input.companyId,
      siteId: input.siteId,
      code,
      name: normalizedName,
    },
  });
}

export async function recordRetailInventoryMovement(input: {
  companyId: string;
  userId: string;
  itemId: string;
  movementType: "RECEIPT" | "ISSUE" | "ADJUSTMENT" | "TRANSFER";
  quantity: number;
  unit: string;
  unitCost?: number | null;
  notes?: string | null;
  toLocationId?: string | null;
  sourceType:
    | "RETAIL_GOODS_RECEIPT"
    | "RETAIL_SALE"
    | "RETAIL_REFUND"
    | "RETAIL_SHIFT_VARIANCE";
  sourceId: string;
  entryDate?: Date;
  tx?: Prisma.TransactionClient;
  postAccounting?: boolean;
}) {
  const db = input.tx ?? prisma;
  const item = await db.inventoryItem.findUnique({
    where: { id: input.itemId },
    include: { site: { select: { companyId: true } } },
  });

  if (!item || item.site.companyId !== input.companyId) {
    throw new Error("Invalid inventory item.");
  }

  if (item.unit !== input.unit) {
    throw new Error("Stock unit mismatch.");
  }

  const absoluteQuantity = Math.abs(input.quantity);
  if (input.movementType === "ISSUE" && item.currentStock < absoluteQuantity) {
    throw new Error("Insufficient stock.");
  }

  let nextStock = item.currentStock;
  if (input.movementType === "RECEIPT") nextStock += absoluteQuantity;
  if (input.movementType === "ISSUE") nextStock -= absoluteQuantity;
  if (input.movementType === "ADJUSTMENT") nextStock += input.quantity;

  if (nextStock < 0) {
    throw new Error("Stock cannot be negative.");
  }

  const createdAt = input.entryDate ?? new Date();
  const writeMovement = async (tx: Prisma.TransactionClient) => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const referenceId = await reserveIdentifier(tx, {
        companyId: input.companyId,
        entity: "STOCK_MOVEMENT",
      });

      try {
        const created = await tx.stockMovement.create({
          data: {
            referenceId,
            itemId: input.itemId,
            toLocationId: input.toLocationId ?? undefined,
            movementType: input.movementType,
            quantity: input.movementType === "ADJUSTMENT" ? input.quantity : absoluteQuantity,
            unit: input.unit,
            notes: input.notes ?? undefined,
            issuedById: input.userId,
            createdAt,
          },
        });

        await tx.inventoryItem.update({
          where: { id: input.itemId },
          data: {
            currentStock: nextStock,
            ...(input.unitCost !== undefined && input.unitCost !== null ? { unitCost: input.unitCost } : {}),
          },
        });

        return created;
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          continue;
        }
        throw error;
      }
    }

    throw new Error("Unable to generate stock movement reference.");
  };
  const movement = input.tx ? await writeMovement(input.tx) : await prisma.$transaction(writeMovement);

  const unitCost = input.unitCost ?? item.unitCost ?? 0;
  const amount = Math.abs(absoluteQuantity * unitCost);
  const shouldPostAccounting = input.postAccounting ?? !input.tx;
  if (amount > 0 && shouldPostAccounting) {
    try {
      await createJournalEntryFromSource({
        companyId: input.companyId,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        entryDate: createdAt,
        description: `Retail ${input.movementType.toLowerCase()} - ${item.name}`,
        createdById: input.userId,
        amount,
        netAmount: amount,
        taxAmount: 0,
        grossAmount: amount,
      });
    } catch (error) {
      console.error("[Accounting] Retail stock movement auto-post failed:", error);
    }
  }

  return movement;
}

export function retailValidationError(message: string, status = 400, details?: unknown) {
  return errorResponse(message, status, details);
}
