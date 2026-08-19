import { NextRequest, NextResponse } from "next/server";
import { type RetailTenderType } from "@prisma/client";
import { createJournalEntryFromSource } from "@/lib/accounting/posting";
import { errorResponse, validateSession } from "@/lib/api-utils";
import { normalizeProvidedId, reserveIdentifier } from "@/lib/id-generator";
import { prisma } from "@/lib/prisma";

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

/*
  R-2.4. Four gates used to live here, and they are gone.

  `RETAIL_MANAGER_ROLES`, `RETAIL_STOCK_ROLES` and `RETAIL_POS_ROLES` were role
  sets, and `requireRetailManager`, `requireRetailStock`, `requireRetailPos` and
  `canManageRetailTransactions` asked them "is this person a manager / a stock
  person / a till person". Every retail route now asks `lib/retail/permissions.ts`
  a different question — may this person do *this*, to *that* — and the difference
  is not cosmetic:

   - A role set cannot say `view` without `view-cost`, so the catalogue handed a
     cashier the buying price alongside the shelf price.
   - It cannot separate raising a purchase order from receiving against one, so
     `requireRetailStock` let a stock clerk decide what the shop buys.
   - It refused with "Insufficient permissions", which tells the person at the
     counter nothing. The matrix refuses with the verb and the noun.
   - And `requireRetailPos` admitted CASHIER to the two reversal endpoints while
     the matrix, the UI and the shop's own rules all said no. That one was a live
     privilege gap, closed in S-7.7 and the reason this ticket stopped being
     tidying.

  `canAccessPosPortal` in `lib/retail/pos-host.ts` is deliberately not folded in.
  It answers "which portal may you sign into", which is a question about hosts and
  sessions rather than about resources, and collapsing it here would confuse two
  different doors.
*/

const POS_SUPPORTED_PROMOTION_TYPES = ["PERCENT", "AMOUNT"] as const;

export function isPosSupportedPromotionType(type: string | null | undefined) {
  return POS_SUPPORTED_PROMOTION_TYPES.includes((type ?? "") as (typeof POS_SUPPORTED_PROMOTION_TYPES)[number]);
}

export function getPosSupportedPromotionTypes() {
  return [...POS_SUPPORTED_PROMOTION_TYPES];
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
    tenderType: RetailTenderType;
    amount: number;
    reference?: string | null;
    /**
     * The tender's own currency. R-1.5 gave `RetailSalePayment` a column for
     * this; before that it was accepted here, carried through, and dropped on the
     * floor, so a till taking USD and ZWG recorded both as bare numbers in one
     * pool and the drawer could not be counted against them.
     */
    currency?: string | null;
    /** Quote units per one base unit for this tender: 27.5 ZWG buys one USD. */
    exchangeRate?: number | null;
  }>;
  changeAmount?: number;
}) {
  const changeAmount = Math.max(round(input.changeAmount ?? 0), 0);
  const normalized = input.payments.map((payment) => ({
    tenderType: payment.tenderType,
    amount: round(Math.abs(payment.amount)),
    reference: payment.reference ?? null,
    currency: payment.currency ?? null,
    exchangeRate: payment.exchangeRate ?? null,
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

export async function postRetailJournal(
  input: Parameters<typeof createJournalEntryFromSource>[0],
  options: { throwOnFail?: boolean } = {},
) {
  const result = await createJournalEntryFromSource(input);
  if (result.entryId || result.skipped) {
    return {
      accountingStatus: "POSTED",
      accountingError: null,
      accountingCode: null,
      journalEntryId: result.entryId ?? null,
    } satisfies RetailAccountingResult;
  }

  const isPending = RETAIL_PENDING_POSTING_CODES.has(result.code ?? "");
  if (!isPending && options.throwOnFail === true) {
    throw new Error(result.error ?? "Accounting posting failed");
  }

  return {
    accountingStatus: isPending ? "PENDING" : "FAILED",
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

/**
 * The site a retail request is about, asked for only when it is genuinely a
 * question.
 *
 * Seven retail routes took `siteId: z.string().uuid()` as required, so a bottle
 * store with one shop had to name its branch on every sale, shift, order and
 * count — and the shift dialog could not be submitted until the cashier picked
 * the single item in a list of one. That is the trap the vertical-building doc
 * names outright: *do not gate a lookup on a narrowing field*. A site narrows a
 * register; it is not a prerequisite for having one.
 *
 *  - given a site, it is validated exactly as before;
 *  - given none, a tenant with exactly one active site gets that site;
 *  - given none with several sites, the caller is told to choose, because now it
 *    really is a question;
 *  - given none with no sites at all, the caller is told to create one, which is
 *    a setup problem and should not read as "invalid site".
 *
 * Returns the site, or a `NextResponse` to return as-is.
 */
export async function resolveRetailSite(
  companyId: string,
  siteId?: string | null,
): Promise<
  { site: Awaited<ReturnType<typeof ensureSiteAccess>>; response: null } | { site: null; response: NextResponse }
> {
  if (siteId) {
    const site = await ensureSiteAccess(companyId, siteId);
    if (!site) return { site: null, response: retailValidationError("Invalid site", 400) };
    return { site, response: null };
  }

  const active = await prisma.site.findMany({
    where: { companyId, isActive: true },
    select: { id: true, companyId: true, isActive: true, name: true, code: true },
    orderBy: { createdAt: "asc" },
    take: 2,
  });

  if (active.length === 0) {
    return {
      site: null,
      response: retailValidationError(
        "This workspace has no active site yet. Add one in Setup before trading.",
        400,
      ),
    };
  }
  if (active.length > 1) {
    return {
      site: null,
      response: retailValidationError(
        "This workspace has more than one site — say which one this is for.",
        400,
      ),
    };
  }
  return { site: active[0], response: null };
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

export function retailValidationError(message: string, status = 400, details?: unknown) {
  return errorResponse(message, status, details);
}
