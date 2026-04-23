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

export type RetailAccountingStatus = "POSTED" | "PENDING" | "FAILED";

export type RetailAccountingResult = {
  accountingStatus: RetailAccountingStatus;
  accountingError: string | null;
  accountingCode?: string | null;
  journalEntryId?: string | null;
};

function round(value: number) {
  return Number(value.toFixed(2));
}

const RETAIL_PENDING_POSTING_CODES = new Set([
  "PERIOD_LOCKED",
  "PERIOD_OVERRIDE_FORBIDDEN",
  "PERIOD_OVERRIDE_REASON_REQUIRED",
]);

export function normalizeRetailPostingPayments(input: {
  payments: Array<{
    tenderType: string;
    amount: number;
    reference?: string | null;
    currency?: string | null;
  }>;
  changeAmount?: number;
}) {
  const changeAmount = Math.max(round(input.changeAmount ?? 0), 0);
  const normalized = input.payments.map((payment) => ({
    tenderType: payment.tenderType,
    amount: round(Math.abs(payment.amount)),
    reference: payment.reference ?? null,
    currency: payment.currency ?? null,
  }));

  if (changeAmount <= 0) {
    return normalized.filter((payment) => payment.amount > 0);
  }

  let remainingChange = changeAmount;
  return normalized
    .flatMap((payment) => {
      if (payment.tenderType !== "CASH") {
        return [payment];
      }
      const offset = Math.min(payment.amount, remainingChange);
      remainingChange = round(remainingChange - offset);
      const amount = round(payment.amount - offset);
      return amount > 0 ? [{ ...payment, amount }] : [];
    })
    .filter((payment) => payment.amount > 0);
}

export async function postRetailJournal(input: Parameters<typeof createJournalEntryFromSource>[0]) {
  const result = await createJournalEntryFromSource(input);
  if (result.entryId || result.skipped) {
    return {
      accountingStatus: "POSTED",
      accountingError: null,
      accountingCode: null,
      journalEntryId: result.entryId ?? null,
    } satisfies RetailAccountingResult;
  }

  return {
    accountingStatus: RETAIL_PENDING_POSTING_CODES.has(result.code ?? "") ? "PENDING" : "FAILED",
    accountingError: result.error ?? "Accounting posting failed",
    accountingCode: result.code ?? null,
    journalEntryId: null,
  } satisfies RetailAccountingResult;
}

export async function getAccountingStatusForSource(input: {
  companyId: string;
  sourceType: string;
  sourceId: string | null | undefined;
}) {
  if (!input.sourceId) {
    return {
      accountingStatus: "PENDING",
      accountingError: null,
      accountingCode: null,
      journalEntryId: null,
    } satisfies RetailAccountingResult;
  }

  const event = await prisma.accountingIntegrationEvent.findFirst({
    where: {
      companyId: input.companyId,
      sourceType: input.sourceType as never,
      sourceId: input.sourceId,
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    select: {
      status: true,
      lastError: true,
      journalEntryId: true,
    },
  });

  if (!event) {
    return {
      accountingStatus: "PENDING",
      accountingError: null,
      accountingCode: null,
      journalEntryId: null,
    } satisfies RetailAccountingResult;
  }

  return {
    accountingStatus:
      event.status === "POSTED"
        ? "POSTED"
        : event.status === "FAILED"
          ? "FAILED"
          : "PENDING",
    accountingError: event.lastError ?? null,
    accountingCode: null,
    journalEntryId: event.journalEntryId ?? null,
  } satisfies RetailAccountingResult;
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

export async function ensureRetailRegisterAccess(input: {
  companyId: string;
  siteId: string;
  registerId: string;
}) {
  const register = await prisma.retailRegister.findUnique({
    where: { id: input.registerId },
    select: {
      id: true,
      companyId: true,
      siteId: true,
      name: true,
      code: true,
      isActive: true,
    },
  });

  if (
    !register ||
    register.companyId !== input.companyId ||
    register.siteId !== input.siteId ||
    !register.isActive
  ) {
    return null;
  }

  return register;
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
    | "RETAIL_VOID"
    | "RETAIL_STOCK_ADJUSTMENT"
    | "RETAIL_STOCK_TRANSFER"
    | "RETAIL_SHIFT_VARIANCE";
  sourceId: string;
  entryDate?: Date;
  tx?: Prisma.TransactionClient;
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
    // No retry loop here: reserveIdentifier uses an atomic sequence increment so
    // P2002 collisions on stockMovement.create are not expected. A retry loop that
    // catches P2002 and continues inside a PostgreSQL transaction would leave the
    // transaction in an "aborted" state, causing every subsequent query to fail with
    // "current transaction is aborted". Let any error propagate cleanly.
    const referenceId = await reserveIdentifier(tx, {
      companyId: input.companyId,
      entity: "STOCK_MOVEMENT",
    });

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
  };
  const movement = input.tx ? await writeMovement(input.tx) : await prisma.$transaction(writeMovement);

  return movement;
}

export function retailValidationError(message: string, status = 400, details?: unknown) {
  return errorResponse(message, status, details);
}
