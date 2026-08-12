import { Prisma, type RetailTenderType } from "@prisma/client";
import { normalizeProvidedId, reserveIdentifier } from "@/lib/id-generator";
import {
  ZERO,
  exceeds,
  money,
  multiplyMoney,
  rate,
  sumMoney,
  toNumberOrZero,
  type MoneyLike,
} from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { getRetailTenderPolicy, validateTenderReferences } from "@/lib/retail/tender-policy";
import {
  canManageRetailTransactions,
  ensureRetailRegisterAccess,
  ensureSiteAccess,
  getCashNetFromPayments,
  postRetailJournal,
  recordRetailInventoryMovement,
  type RetailAccountingResult,
  upsertRetailRegister,
} from "./_helpers";

export type RetailActorContext = {
  companyId: string;
  userId: string;
  userRole?: string | null;
  userName?: string | null;
  userEmail?: string | null;
};

export type RetailPaymentInput = {
  tenderType: RetailTenderType;
  amount: number;
  reference?: string | null;
  currency?: string | null;
};

export type RetailSaleLineInput = {
  inventoryItemId: string;
  inventoryUnit: string;
  catalogItemId?: string | null;
  sourceLineId?: string | null;
  itemName: string;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  taxAmount: number;
  lineTotal: number;
  costUnit: number;
  costTotal: number;
};

function round(value: number) {
  return Number(value.toFixed(2));
}

function resolveCashierName(actor: RetailActorContext) {
  return actor.userName || actor.userEmail || "Cashier";
}

function getRetailSourceType(saleType: string) {
  if (saleType === "REFUND") return "RETAIL_REFUND" as const;
  if (saleType === "VOID") return "RETAIL_VOID" as const;
  return "RETAIL_SALE" as const;
}

function getRetailSaleDescription(saleType: string, saleNo: string) {
  if (saleType === "REFUND") return `Retail refund ${saleNo}`;
  if (saleType === "VOID") return `Retail sale void ${saleNo}`;
  return `Retail sale ${saleNo}`;
}

async function ensureRetailSaleAccountingPosted(input: {
  actor: RetailActorContext;
    sale: {
      id: string;
      saleNo: string;
      saleType: string;
    siteId: string;
    postedAt: Date | null;
    createdAt: Date;
    // `MoneyLike` rather than `number`: these come straight off a `RetailSale`
    // row, and retail money is `Decimal` since R-1.1.
    subtotal: MoneyLike;
    discountAmount: MoneyLike;
    taxAmount: MoneyLike;
    totalAmount: MoneyLike;
    changeAmount: MoneyLike;
    lines: Array<{
      inventoryItemId: string;
      itemName: string;
      quantity: MoneyLike;
      costUnit: MoneyLike;
      costTotal: MoneyLike;
    }>;
    payments: Array<{
      tenderType: RetailTenderType;
      amount: MoneyLike;
      reference: string | null;
      currency?: string | null;
    }>;
  };
  registerCode?: string | null;
  periodOverrideReason?: string | null;
}) {
  const inventoryItems = input.sale.lines.length
    ? await prisma.inventoryItem.findMany({
        where: {
          id: { in: [...new Set(input.sale.lines.map((line) => line.inventoryItemId))] },
        },
        select: { id: true, unitCost: true },
      })
    : [];
  const fallbackCostByItemId = new Map(
    inventoryItems.map((item) => [item.id, item.unitCost ?? 0]),
  );

  // Derived once. The lines and the `totalCost` beneath them used to be two
  // independent walks over `input.sale.lines`, each re-deriving unit cost from the
  // fallback map — two chances for a total to stop matching the lines it totals.
  const postingLines = input.sale.lines.map((line) => {
    const fallbackUnitCost = fallbackCostByItemId.get(line.inventoryItemId) ?? 0;
    const lineCostUnit = money(line.costUnit);
    const unitCost = lineCostUnit.isZero() ? money(fallbackUnitCost).abs() : lineCostUnit.abs();
    const lineCostTotal = money(line.costTotal);
    const totalCost = lineCostTotal.isZero()
      ? multiplyMoney(money(line.quantity).abs(), unitCost)
      : lineCostTotal.abs();
    return {
      inventoryItemId: line.inventoryItemId,
      itemName: line.itemName,
      quantity: toNumberOrZero(money(line.quantity).abs()),
      unitCost: toNumberOrZero(unitCost),
      totalCost: toNumberOrZero(totalCost),
    };
  });

  return postRetailJournal({
    companyId: input.actor.companyId,
    sourceType: getRetailSourceType(input.sale.saleType),
    sourceId: input.sale.id,
    sourceSubtype: input.sale.saleType,
    siteId: input.sale.siteId,
    registerCode: input.registerCode ?? null,
    entryDate: input.sale.postedAt ?? input.sale.createdAt,
    description: getRetailSaleDescription(input.sale.saleType, input.sale.saleNo),
    createdById: input.actor.userId,
    actorRole: input.actor.userRole ?? undefined,
    periodOverrideReason: input.periodOverrideReason ?? undefined,
    amount: toNumberOrZero(money(input.sale.totalAmount).abs()),
    netAmount: toNumberOrZero(money(input.sale.subtotal).minus(money(input.sale.discountAmount)).abs()),
    taxAmount: toNumberOrZero(money(input.sale.taxAmount).abs()),
    grossAmount: toNumberOrZero(money(input.sale.totalAmount).abs()),
    invertDirection: input.sale.saleType === "REFUND" || input.sale.saleType === "VOID",
    payments: input.sale.payments.map((payment) => ({
      tenderType: payment.tenderType,
      amount: toNumberOrZero(money(payment.amount).abs()),
      reference: payment.reference,
      currency: payment.currency ?? null,
    })),
    inventory: {
      lines: postingLines,
      totalCost: postingLines.reduce((total, line) => total + line.totalCost, 0),
    },
  });
}

export async function openRetailShiftTransaction(input: {
  actor: RetailActorContext;
  siteId: string;
  registerId?: string | null;
  registerName?: string | null;
  registerCode?: string | null;
  shiftNo?: string | null;
  openingFloat?: number;
  notes?: string | null;
  periodOverrideReason?: string | null;
  openedAt?: Date;
}) {
  const site = await ensureSiteAccess(input.actor.companyId, input.siteId);
  if (!site) {
    throw new Error("Invalid site");
  }

  const existing = await prisma.retailShift.findFirst({
    where: {
      companyId: input.actor.companyId,
      cashierId: input.actor.userId,
      status: "OPEN",
    },
  });
  if (existing) {
    throw new Error("Close the current shift before opening a new one");
  }

  const register = input.registerId
    ? await ensureRetailRegisterAccess({
        companyId: input.actor.companyId,
        siteId: site.id,
        registerId: input.registerId,
      })
    : await upsertRetailRegister({
        companyId: input.actor.companyId,
        siteId: site.id,
        registerName: input.registerName?.trim() || "POS Register",
        registerCode: input.registerCode ?? undefined,
      });
  if (!register) {
    throw new Error("Invalid register");
  }

  const providedCode = input.shiftNo
    ? normalizeProvidedId(input.shiftNo, "RETAIL_SHIFT")
    : null;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const shiftNo =
      providedCode ??
      (await reserveIdentifier(prisma, {
        companyId: input.actor.companyId,
        entity: "RETAIL_SHIFT",
        siteId: site.id,
      }));

    try {
      const shift = await prisma.retailShift.create({
        data: {
          companyId: input.actor.companyId,
          shiftNo,
          registerCode: register.code,
          registerName: register.name,
          siteId: site.id,
          cashierId: input.actor.userId,
          cashierName: resolveCashierName(input.actor),
          openingFloat: input.openingFloat ?? 0,
          notes: input.notes?.trim() || null,
          status: "OPEN",
          expectedCash: input.openingFloat ?? 0,
          ...(input.openedAt ? { openedAt: input.openedAt } : {}),
        },
      });

      const openingFloat = money(shift.openingFloat);
      const accounting =
        exceeds(openingFloat, 0)
          ? await postRetailJournal({
              companyId: input.actor.companyId,
              sourceType: "RETAIL_SHIFT_OPEN",
              sourceId: shift.id,
              siteId: shift.siteId,
              registerCode: shift.registerCode,
              entryDate: shift.openedAt,
              description: `Retail shift open ${shift.shiftNo}`,
              createdById: input.actor.userId,
              actorRole: input.actor.userRole ?? undefined,
              periodOverrideReason: input.periodOverrideReason ?? undefined,
              amount: toNumberOrZero(openingFloat.abs()),
              netAmount: toNumberOrZero(openingFloat.abs()),
              taxAmount: 0,
              grossAmount: toNumberOrZero(openingFloat.abs()),
            })
          : ({
              accountingStatus: "POSTED",
              accountingError: null,
              accountingCode: null,
              journalEntryId: null,
            } satisfies RetailAccountingResult);

      return { shift, accounting };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        if (providedCode) {
          throw new Error("Shift number already exists");
        }
        continue;
      }
      throw error;
    }
  }

  throw new Error("Unable to generate shift number");
}

export async function closeRetailShiftTransaction(input: {
  actor: RetailActorContext;
  shiftId: string;
  countedCash: number;
  notes?: string | null;
  periodOverrideReason?: string | null;
  closedAt?: Date;
  allowManagerClose?: boolean;
}) {
  const existing = await prisma.retailShift.findFirst({
    where: { id: input.shiftId, companyId: input.actor.companyId },
  });
  if (!existing) {
    throw new Error("Shift not found");
  }
  if (existing.status !== "OPEN") {
    throw new Error("Only open shifts can be closed");
  }

  const allowManagerClose = input.allowManagerClose ?? true;
  if (existing.cashierId !== input.actor.userId) {
    if (!allowManagerClose || !canManageRetailTransactions(input.actor.userRole)) {
      throw new Error("Only the shift owner or a manager can close this shift");
    }
  }

  // In `Decimal`, not `round(a - b)`: a cash-up variance is the number a manager is
  // asked to explain, and the float subtraction it replaces could put a cent on it
  // that nobody counted.
  const variance = money(input.countedCash).minus(money(existing.expectedCash));
  const updated = await prisma.retailShift.update({
    where: { id: existing.id },
    data: {
      status: "CLOSED",
      countedCash: input.countedCash,
      variance,
      notes: input.notes?.trim() || existing.notes,
      closedAt: input.closedAt ?? new Date(),
    },
  });

  const accounting =
    !variance.isZero()
      ? await postRetailJournal({
          companyId: input.actor.companyId,
          sourceType: "RETAIL_SHIFT_VARIANCE",
          sourceId: updated.id,
          sourceSubtype: variance.isNegative() ? "SHORT" : "OVER",
          siteId: updated.siteId,
          registerCode: updated.registerCode,
          entryDate: updated.closedAt ?? new Date(),
          description: `Retail shift variance ${updated.shiftNo}`,
          createdById: input.actor.userId,
          actorRole: input.actor.userRole ?? undefined,
          periodOverrideReason: input.periodOverrideReason ?? undefined,
          amount: toNumberOrZero(variance.abs()),
          netAmount: toNumberOrZero(variance.abs()),
          taxAmount: 0,
          grossAmount: toNumberOrZero(variance.abs()),
          invertDirection: variance.isNegative(),
        })
      : ({
          accountingStatus: "POSTED",
          accountingError: null,
          accountingCode: null,
          journalEntryId: null,
        } satisfies RetailAccountingResult);

  return { shift: updated, accounting };
}

export async function createRetailSaleTransaction(input: {
  actor: RetailActorContext;
  shiftId: string;
  siteId: string;
  saleNo?: string | null;
  customerName?: string | null;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  payments: RetailPaymentInput[];
  lines: RetailSaleLineInput[];
  promotionCode?: string | null;
  overrideReason?: string | null;
  notes?: string | null;
  periodOverrideReason?: string | null;
  postedAt?: Date;
}) {
  const site = await ensureSiteAccess(input.actor.companyId, input.siteId);
  if (!site) {
    throw new Error("Invalid site");
  }

  const shift = await prisma.retailShift.findFirst({
    where: {
      id: input.shiftId,
      companyId: input.actor.companyId,
      status: "OPEN",
      cashierId: input.actor.userId,
    },
  });
  if (!shift) {
    throw new Error("Open shift not found for this cashier");
  }
  if (shift.siteId !== site.id) {
    throw new Error("Shift site does not match the selected site");
  }

  const normalizedPayments = input.payments.map((payment) => ({
    tenderType: payment.tenderType,
    amount: round(payment.amount),
    reference: payment.reference?.trim() || null,
    currency: payment.currency ?? null,
  }));
  const tenderPolicy = await getRetailTenderPolicy(input.actor.companyId);
  const paymentReferenceError = validateTenderReferences(tenderPolicy, normalizedPayments);
  if (paymentReferenceError) {
    throw new Error(paymentReferenceError);
  }

  const tenderedAmount = round(
    normalizedPayments.reduce((total, payment) => total + payment.amount, 0),
  );
  const nonCashTotal = round(
    normalizedPayments
      .filter((payment) => payment.tenderType !== "CASH")
      .reduce((total, payment) => total + payment.amount, 0),
  );
  const cashTotal = round(
    normalizedPayments
      .filter((payment) => payment.tenderType === "CASH")
      .reduce((total, payment) => total + payment.amount, 0),
  );

  if (nonCashTotal > input.totalAmount) {
    throw new Error("Non-cash tenders cannot exceed the sale total");
  }
  if (tenderedAmount < input.totalAmount) {
    throw new Error("Tendered amount is below the sale total");
  }

  const cashDue = round(Math.max(input.totalAmount - nonCashTotal, 0));
  const changeAmount = round(Math.max(cashTotal - cashDue, 0));
  const netCash = getCashNetFromPayments(normalizedPayments, changeAmount);
  const providedCode = input.saleNo
    ? normalizeProvidedId(input.saleNo, "RETAIL_SALE")
    : null;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const saleNo =
      providedCode ??
      (await reserveIdentifier(prisma, {
        companyId: input.actor.companyId,
        entity: "RETAIL_SALE",
        siteId: site.id,
      }));

    try {
      const sale = await prisma.$transaction(async (tx) => {
        const created = await tx.retailSale.create({
          data: {
            companyId: input.actor.companyId,
            saleNo,
            shiftId: shift.id,
            siteId: site.id,
            cashierId: input.actor.userId,
            cashierName: resolveCashierName(input.actor),
            customerName: input.customerName ?? null,
            subtotal: input.subtotal,
            discountAmount: input.discountAmount,
            taxAmount: input.taxAmount,
            totalAmount: input.totalAmount,
            tenderedAmount,
            changeAmount,
            promotionCode: input.promotionCode ?? null,
            overrideReason: input.overrideReason ?? null,
            status: "POSTED",
            notes: input.notes?.trim() || null,
            postedAt: input.postedAt ?? new Date(),
            tenderSummary: normalizedPayments,
            lines: {
              create: input.lines.map((line) => ({
                inventoryItemId: line.inventoryItemId,
                catalogItemId: line.catalogItemId ?? null,
                itemName: line.itemName,
                quantity: line.quantity,
                unitPrice: line.unitPrice,
                discountAmount: line.discountAmount,
                taxAmount: line.taxAmount,
                lineTotal: line.lineTotal,
                costUnit: line.costUnit,
                costTotal: line.costTotal,
              })),
            },
            payments: {
              create: normalizedPayments.map((payment) => ({
                tenderType: payment.tenderType,
                amount: payment.amount,
                reference: payment.reference,
              })),
            },
          },
          include: { lines: true, payments: true },
        });

        for (const line of input.lines) {
          await recordRetailInventoryMovement({
            companyId: input.actor.companyId,
            userId: input.actor.userId,
            itemId: line.inventoryItemId,
            movementType: "ISSUE",
            quantity: line.quantity,
            unit: line.inventoryUnit,
            unitCost: line.costUnit,
            notes: `Retail sale ${created.saleNo}`,
            sourceType: "RETAIL_SALE",
            sourceId: `${created.id}:${line.inventoryItemId}`,
            entryDate: created.postedAt ?? new Date(),
            tx,
          });
        }

        if (netCash !== 0) {
          const updatedShift = await tx.retailShift.updateMany({
            where: {
              id: shift.id,
              companyId: input.actor.companyId,
              status: "OPEN",
            },
            data: {
              expectedCash: {
                increment: netCash,
              },
            },
          });
          if (updatedShift.count !== 1) {
            throw new Error("Shift is no longer open.");
          }
        }

        return created;
      });

      const accounting = await ensureRetailSaleAccountingPosted({
        actor: input.actor,
        sale,
        registerCode: shift.registerCode,
        periodOverrideReason: input.periodOverrideReason ?? null,
      });

      return { sale, accounting };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002" &&
        providedCode
      ) {
        const existing = await prisma.retailSale.findFirst({
          where: {
            companyId: input.actor.companyId,
            saleNo: providedCode,
          },
          include: { lines: true, payments: true },
        });
        if (existing) {
          const accounting = await ensureRetailSaleAccountingPosted({
            actor: input.actor,
            sale: existing,
            registerCode: shift.registerCode,
            periodOverrideReason: input.periodOverrideReason ?? null,
          });
          return { sale: existing, accounting };
        }
      }

      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        continue;
      }
      throw error;
    }
  }

  throw new Error("Unable to generate sale number");
}

export async function refundRetailSaleTransaction(input: {
  actor: RetailActorContext;
  saleId: string;
  shiftId: string;
  reason: string;
  lines: Array<{ saleLineId: string; quantity: number }>;
  payments: RetailPaymentInput[];
  notes?: string | null;
  periodOverrideReason?: string | null;
  postedAt?: Date;
}) {
  if (!canManageRetailTransactions(input.actor.userRole)) {
    throw new Error("Only retail managers can process refunds");
  }

  const [sourceSale, shift] = await Promise.all([
    prisma.retailSale.findFirst({
      where: { id: input.saleId, companyId: input.actor.companyId },
      include: { lines: true },
    }),
    prisma.retailShift.findFirst({
      where: {
        id: input.shiftId,
        companyId: input.actor.companyId,
        status: "OPEN",
        cashierId: input.actor.userId,
      },
    }),
  ]);

  if (!sourceSale) {
    throw new Error("Sale not found");
  }
  if (!shift) {
    throw new Error("Open shift not found for this cashier");
  }
  if (sourceSale.saleType !== "SALE" || sourceSale.status !== "POSTED") {
    throw new Error("Only posted sales can be refunded");
  }
  if (shift.siteId !== sourceSale.siteId) {
    throw new Error("Refund shift site does not match sale site");
  }

  const refundNo = await reserveIdentifier(prisma, {
    companyId: input.actor.companyId,
    entity: "RETAIL_SALE",
    siteId: sourceSale.siteId,
  });
  const requestedByLine = input.lines.reduce<Map<string, number>>((accumulator, line) => {
    accumulator.set(line.saleLineId, round((accumulator.get(line.saleLineId) ?? 0) + line.quantity));
    return accumulator;
  }, new Map());
  const normalizedLineRequests = [...requestedByLine.entries()].map(([saleLineId, quantity]) => ({
    saleLineId,
    quantity,
  }));

  const refundPayments = input.payments.map((payment) => ({
    tenderType: payment.tenderType,
    amount: round(payment.amount),
    reference: payment.reference?.trim() || null,
    currency: payment.currency ?? null,
  }));
  const tenderPolicy = await getRetailTenderPolicy(input.actor.companyId);
  const paymentReferenceError = validateTenderReferences(tenderPolicy, refundPayments);
  if (paymentReferenceError) {
    throw new Error(paymentReferenceError);
  }
  const negativePayments = refundPayments.map((payment) => ({
    ...payment,
    amount: -payment.amount,
  }));

  const refund = await prisma.$transaction(async (tx) => {
    const currentSourceSale = await tx.retailSale.findFirst({
      where: { id: input.saleId, companyId: input.actor.companyId },
      include: { lines: true },
    });
    if (!currentSourceSale || currentSourceSale.saleType !== "SALE" || currentSourceSale.status !== "POSTED") {
      throw new Error("Only posted sales can be refunded");
    }

    const priorRefunds = await tx.retailSale.findMany({
      where: {
        companyId: input.actor.companyId,
        sourceSaleId: currentSourceSale.id,
        saleType: { in: ["REFUND", "VOID"] },
      },
      include: { lines: true },
    });

    // Quantities are `Decimal(12,4)` and money `Decimal(14,2)`, so the whole
    // apportionment below runs in `Decimal` and rounds once per amount. The ratio
    // itself is deliberately left unrounded: rounding it before multiplying is how
    // a refund of every line stops adding up to the sale it reverses.
    const refundedByLine = priorRefunds
      .flatMap((sale) => sale.lines)
      .reduce<Map<string, Prisma.Decimal>>((accumulator, line) => {
        if (!line.sourceLineId) return accumulator;
        accumulator.set(
          line.sourceLineId,
          (accumulator.get(line.sourceLineId) ?? ZERO).plus(rate(line.quantity).abs()),
        );
        return accumulator;
      }, new Map());

    const requestedLines = normalizedLineRequests.map((line) => {
      const sourceLine = currentSourceSale.lines.find((entry) => entry.id === line.saleLineId);
      if (!sourceLine) {
        throw new Error("One or more refund lines are invalid.");
      }
      const sourceQuantity = rate(sourceLine.quantity);
      const requestedQuantity = rate(line.quantity);
      const alreadyRefunded = refundedByLine.get(sourceLine.id) ?? ZERO;
      const remaining = sourceQuantity.minus(alreadyRefunded);
      const refundableQty = remaining.isNegative() ? ZERO : remaining;
      if (requestedQuantity.greaterThan(refundableQty)) {
        throw new Error(`Refund quantity exceeds remaining quantity for ${sourceLine.itemName}.`);
      }

      const ratio = sourceQuantity.isZero() ? ZERO : requestedQuantity.div(sourceQuantity);
      const sourceCostUnit = money(sourceLine.costUnit).abs();
      const sourceCostTotal = money(sourceLine.costTotal);
      const wholeLineCost = sourceCostTotal.isZero()
        ? multiplyMoney(sourceQuantity, sourceCostUnit)
        : sourceCostTotal.abs();

      return {
        sourceLine,
        quantity: requestedQuantity,
        baseAmount: multiplyMoney(requestedQuantity, sourceLine.unitPrice),
        discountAmount: multiplyMoney(money(sourceLine.discountAmount).abs(), ratio).negated(),
        taxAmount: multiplyMoney(money(sourceLine.taxAmount).abs(), ratio).negated(),
        lineTotal: multiplyMoney(money(sourceLine.lineTotal).abs(), ratio).negated(),
        costUnit: sourceCostUnit,
        costTotal: multiplyMoney(wholeLineCost, ratio),
      };
    });

    const subtotal = sumMoney(requestedLines.map((line) => line.baseAmount)).negated();
    const discountAmount = sumMoney(requestedLines.map((line) => line.discountAmount));
    const taxAmount = sumMoney(requestedLines.map((line) => line.taxAmount));
    const totalAmount = sumMoney(requestedLines.map((line) => line.lineTotal));
    const refundValue = totalAmount.abs();
    const paymentTotal = sumMoney(refundPayments.map((payment) => payment.amount));
    // Exactly equal, not within a cent. The `Math.abs(a - b) > 0.01` this replaces
    // is the epsilon fudge `lib/money.ts` exists to retire — it let a refund be a
    // cent off the money actually handed back, every time, and called it balanced.
    if (!paymentTotal.equals(refundValue)) {
      throw new Error("Refund payments must match the refund value");
    }

    const inventoryItems = await tx.inventoryItem.findMany({
      where: {
        id: { in: [...new Set(requestedLines.map((line) => line.sourceLine.inventoryItemId))] },
      },
      select: { id: true, unit: true, unitCost: true },
    });
    const inventoryItemMap = new Map(inventoryItems.map((item) => [item.id, item]));

    const created = await tx.retailSale.create({
      data: {
        companyId: input.actor.companyId,
        saleNo: refundNo,
        shiftId: shift.id,
        sourceSaleId: currentSourceSale.id,
        siteId: currentSourceSale.siteId,
        cashierId: input.actor.userId,
        cashierName: resolveCashierName(input.actor),
        customerName: currentSourceSale.customerName,
        saleType: "REFUND",
        subtotal,
        discountAmount,
        taxAmount,
        totalAmount,
        tenderedAmount: -paymentTotal,
        changeAmount: 0,
        overrideReason: input.reason.trim(),
        status: "POSTED",
        notes: input.notes?.trim() || null,
        postedAt: input.postedAt ?? new Date(),
        tenderSummary: negativePayments,
        lines: {
          create: requestedLines.map((line) => ({
            sourceLineId: line.sourceLine.id,
            inventoryItemId: line.sourceLine.inventoryItemId,
            catalogItemId: line.sourceLine.catalogItemId,
            itemName: line.sourceLine.itemName,
            quantity: line.quantity,
            unitPrice: line.sourceLine.unitPrice,
            discountAmount: line.discountAmount,
            taxAmount: line.taxAmount,
            lineTotal: line.lineTotal,
            costUnit: line.costUnit,
            costTotal: line.costTotal,
          })),
        },
        payments: {
          create: negativePayments.map((payment) => ({
            tenderType: payment.tenderType,
            amount: payment.amount,
            reference: payment.reference,
          })),
        },
      },
      include: { lines: true, payments: true },
    });

    for (const line of requestedLines) {
      const item = inventoryItemMap.get(line.sourceLine.inventoryItemId);
      if (!item) {
        throw new Error(`Inventory item missing for ${line.sourceLine.itemName}.`);
      }
      await recordRetailInventoryMovement({
        companyId: input.actor.companyId,
        userId: input.actor.userId,
        itemId: item.id,
        movementType: "RECEIPT",
        // The inventory movement table is still `Float`; the crossing happens here.
        quantity: toNumberOrZero(line.quantity),
        unit: item.unit,
        unitCost: item.unitCost ?? 0,
        notes: `Retail refund ${created.saleNo}`,
        sourceType: "RETAIL_REFUND",
        sourceId: `${created.id}:${item.id}`,
        entryDate: created.postedAt ?? new Date(),
        tx,
      });
    }

    const netCash = getCashNetFromPayments(negativePayments, 0);
    if (netCash !== 0) {
      const updatedShift = await tx.retailShift.updateMany({
        where: {
          id: shift.id,
          companyId: input.actor.companyId,
          status: "OPEN",
        },
        data: {
          expectedCash: {
            increment: netCash,
          },
        },
      });
      if (updatedShift.count !== 1) {
        throw new Error("Shift is no longer open.");
      }
    }

    return created;
  });

  const accounting = await ensureRetailSaleAccountingPosted({
    actor: input.actor,
    sale: refund,
    registerCode: shift.registerCode,
    periodOverrideReason: input.periodOverrideReason ?? null,
  });

  return { sale: refund, accounting };
}

export async function voidRetailSaleTransaction(input: {
  actor: RetailActorContext;
  saleId: string;
  shiftId: string;
  reason: string;
  notes?: string | null;
  periodOverrideReason?: string | null;
  postedAt?: Date;
}) {
  if (!canManageRetailTransactions(input.actor.userRole)) {
    throw new Error("Only retail managers can void sales");
  }

  const [sourceSale, shift] = await Promise.all([
    prisma.retailSale.findFirst({
      where: { id: input.saleId, companyId: input.actor.companyId },
      include: { lines: true, payments: true },
    }),
    prisma.retailShift.findFirst({
      where: {
        id: input.shiftId,
        companyId: input.actor.companyId,
        status: "OPEN",
        cashierId: input.actor.userId,
      },
    }),
  ]);

  if (!sourceSale) {
    throw new Error("Sale not found");
  }
  if (!shift) {
    throw new Error("Open shift not found for this cashier");
  }
  if (sourceSale.saleType !== "SALE" || sourceSale.status !== "POSTED") {
    throw new Error("Only posted sales can be voided");
  }
  if (shift.siteId !== sourceSale.siteId) {
    throw new Error("Void shift site does not match sale site");
  }

  const voidNo = await reserveIdentifier(prisma, {
    companyId: input.actor.companyId,
    entity: "RETAIL_SALE",
    siteId: sourceSale.siteId,
  });

  const reversal = await prisma.$transaction(async (tx) => {
    const currentSourceSale = await tx.retailSale.findFirst({
      where: { id: input.saleId, companyId: input.actor.companyId },
      include: { lines: true, payments: true },
    });
    if (!currentSourceSale || currentSourceSale.saleType !== "SALE" || currentSourceSale.status !== "POSTED") {
      throw new Error("Only posted sales can be voided");
    }

    const existingReversals = await tx.retailSale.findMany({
      where: {
        companyId: input.actor.companyId,
        sourceSaleId: input.saleId,
        saleType: { in: ["REFUND", "VOID"] },
      },
      select: { id: true },
    });
    if (existingReversals.length > 0) {
      throw new Error("Sales with refunds or existing reversals cannot be voided");
    }

    const negativePayments = currentSourceSale.payments.map((payment) => ({
      tenderType: payment.tenderType,
      amount: toNumberOrZero(money(payment.amount).abs().negated()),
      reference: payment.reference?.trim() || null,
      currency: null,
    }));

    const inventoryItems = await tx.inventoryItem.findMany({
      where: {
        id: { in: [...new Set(currentSourceSale.lines.map((line) => line.inventoryItemId))] },
      },
      select: { id: true, unit: true, unitCost: true },
    });
    const inventoryItemMap = new Map(inventoryItems.map((item) => [item.id, item]));

    const created = await tx.retailSale.create({
      data: {
        companyId: input.actor.companyId,
        saleNo: voidNo,
        shiftId: shift.id,
        sourceSaleId: currentSourceSale.id,
        siteId: currentSourceSale.siteId,
        cashierId: input.actor.userId,
        cashierName: resolveCashierName(input.actor),
        customerName: currentSourceSale.customerName,
        saleType: "VOID",
        subtotal: money(currentSourceSale.subtotal).abs().negated(),
        discountAmount: money(currentSourceSale.discountAmount).abs().negated(),
        taxAmount: money(currentSourceSale.taxAmount).abs().negated(),
        totalAmount: money(currentSourceSale.totalAmount).abs().negated(),
        tenderedAmount: money(
          currentSourceSale.tenderedAmount ?? currentSourceSale.totalAmount,
        )
          .abs()
          .negated(),
        changeAmount: 0,
        promotionCode: currentSourceSale.promotionCode,
        overrideReason: input.reason.trim(),
        status: "POSTED",
        notes: input.notes?.trim() || null,
        postedAt: input.postedAt ?? new Date(),
        tenderSummary: negativePayments,
        lines: {
          create: currentSourceSale.lines.map((line) => ({
            sourceLineId: line.id,
            inventoryItemId: line.inventoryItemId,
            catalogItemId: line.catalogItemId,
            itemName: line.itemName,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            discountAmount: money(line.discountAmount).abs().negated(),
            taxAmount: money(line.taxAmount).abs().negated(),
            lineTotal: money(line.lineTotal).abs().negated(),
            costUnit: money(line.costUnit),
            // `costTotal` is non-nullable and defaults to 0, so `??` never fired —
            // a line whose cost was genuinely zero kept zero, and one that was not
            // was already stored. Falling back on the product only when it is zero
            // is what the `??` was reaching for.
            costTotal: money(line.costTotal).isZero()
              ? multiplyMoney(money(line.quantity).abs(), money(line.costUnit))
              : money(line.costTotal),
          })),
        },
        payments: {
          create: negativePayments.map((payment) => ({
            tenderType: payment.tenderType,
            amount: payment.amount,
            reference: payment.reference,
          })),
        },
      },
      include: { lines: true, payments: true },
    });

    for (const line of currentSourceSale.lines) {
      const item = inventoryItemMap.get(line.inventoryItemId);
      if (!item) {
        throw new Error(`Inventory item missing for ${line.itemName}.`);
      }
      await recordRetailInventoryMovement({
        companyId: input.actor.companyId,
        userId: input.actor.userId,
        itemId: item.id,
        movementType: "RECEIPT",
        // The inventory movement table is still `Float`; the crossing happens here.
        quantity: toNumberOrZero(line.quantity),
        unit: item.unit,
        unitCost: item.unitCost ?? 0,
        notes: `Retail sale void ${created.saleNo}`,
        sourceType: "RETAIL_VOID",
        sourceId: `${created.id}:${item.id}`,
        entryDate: created.postedAt ?? new Date(),
        tx,
      });
    }

    const netCash = getCashNetFromPayments(negativePayments, 0);
    if (netCash !== 0) {
      const updatedShift = await tx.retailShift.updateMany({
        where: {
          id: shift.id,
          companyId: input.actor.companyId,
          status: "OPEN",
        },
        data: {
          expectedCash: {
            increment: netCash,
          },
        },
      });
      if (updatedShift.count !== 1) {
        throw new Error("Shift is no longer open.");
      }
    }

    await tx.retailSale.update({
      where: { id: currentSourceSale.id },
      data: {
        status: "VOIDED",
        voidReason: input.reason.trim(),
      },
    });

    return created;
  });

  const accounting = await ensureRetailSaleAccountingPosted({
    actor: input.actor,
    sale: reversal,
    registerCode: shift.registerCode,
    periodOverrideReason: input.periodOverrideReason ?? null,
  });

  return { sale: reversal, accounting };
}
