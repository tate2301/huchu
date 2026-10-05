import { Prisma, type RetailRateSource } from "@prisma/client";

import { rate as toRate, resolveExchangeRate, UnknownExchangeRateError } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { RETAIL_AUDIT_EVENTS, writeRetailAuditEvent, type RetailAuditActor } from "@/lib/retail/audit";
import {
  formatZigRate,
  roundingStep,
  TENDER_OPTIONS,
  tenderKeyOf,
  type TenderKey,
  type TillTender,
  type ZigRoundingStep,
} from "@/lib/retail/payment-words";

/**
 * Payments (SET-05, W-05): which tenders a shop takes, the ZiG rate and how
 * ZiG change rounds, and its EcoCash merchant — read by the Payments page,
 * the till (`devices/me`) and the server when it takes a payment.
 *
 * The ZiG rate is history, not a setting: each new rate is a `CurrencyRate`
 * row (USD → ZWG, quote units per one US dollar), the newest applies, and the
 * server stamps it on every ZiG payment — whatever rate the till believes.
 */

type Db = Prisma.TransactionClient | typeof prisma;

export type PaymentSettings = {
  tenders: Record<TenderKey, boolean>;
  zigRateSource: RetailRateSource;
  zigChangeRounding: ZigRoundingStep;
  ecocashMerchantCode: string | null;
  ecocashDisplayName: string | null;
  updatedById: string | null;
  updatedAt: Date | null;
};

/** The column of `RetailPaymentSettings` each tender's switch is kept in. */
export const TENDER_COLUMN = {
  cashUsd: "takeCashUsd",
  cashZig: "takeCashZig",
  card: "takeCard",
  ecocash: "takeEcocash",
  innbucks: "takeInnbucks",
  bankTransfer: "takeBankTransfer",
  onAccount: "takeOnAccount",
  vouchers: "takeVouchers",
} as const satisfies Record<TenderKey, keyof Prisma.RetailPaymentSettingsUncheckedCreateInput>;

/** A shop with no row takes what the schema's defaults say. */
const DEFAULTS: PaymentSettings = {
  tenders: {
    cashUsd: true,
    cashZig: true,
    card: false,
    ecocash: true,
    innbucks: false,
    bankTransfer: false,
    onAccount: false,
    vouchers: false,
  },
  zigRateSource: "MANUAL",
  zigChangeRounding: "1",
  ecocashMerchantCode: null,
  ecocashDisplayName: null,
  updatedById: null,
  updatedAt: null,
};

export async function loadPaymentSettings(companyId: string, db: Db = prisma): Promise<PaymentSettings> {
  const row = await db.retailPaymentSettings.findUnique({ where: { companyId } });
  if (!row) return { ...DEFAULTS, tenders: { ...DEFAULTS.tenders } };
  const tenders = Object.fromEntries(
    (Object.keys(TENDER_COLUMN) as TenderKey[]).map((key) => [key, row[TENDER_COLUMN[key]]]),
  ) as Record<TenderKey, boolean>;
  return {
    tenders,
    zigRateSource: row.zigRateSource,
    zigChangeRounding: roundingStep(row.zigChangeRounding.toString()) ?? "1",
    ecocashMerchantCode: row.ecocashMerchantCode,
    ecocashDisplayName: row.ecocashDisplayName,
    updatedById: row.updatedById,
    updatedAt: row.updatedAt,
  };
}

export type PaymentSettingsPatch = Partial<{
  tenders: Partial<Record<TenderKey, boolean>>;
  zigRateSource: RetailRateSource;
  zigChangeRounding: ZigRoundingStep;
  ecocashMerchantCode: string | null;
  ecocashDisplayName: string | null;
}>;

/** Write the changed values, creating the shop's row from the defaults the first time. */
export async function savePaymentSettings(tx: Db, actor: RetailAuditActor, patch: PaymentSettingsPatch): Promise<void> {
  const data: Prisma.RetailPaymentSettingsUncheckedUpdateInput = { updatedById: actor.userId };
  for (const [key, on] of Object.entries(patch.tenders ?? {}) as Array<[TenderKey, boolean]>) {
    data[TENDER_COLUMN[key]] = on;
  }
  if (patch.zigRateSource) data.zigRateSource = patch.zigRateSource;
  if (patch.zigChangeRounding) data.zigChangeRounding = new Prisma.Decimal(patch.zigChangeRounding);
  if (patch.ecocashMerchantCode !== undefined) data.ecocashMerchantCode = patch.ecocashMerchantCode;
  if (patch.ecocashDisplayName !== undefined) data.ecocashDisplayName = patch.ecocashDisplayName;
  await tx.retailPaymentSettings.upsert({
    where: { companyId: actor.companyId },
    update: data,
    create: { ...(data as Prisma.RetailPaymentSettingsUncheckedCreateInput), companyId: actor.companyId },
  });
}

/* ── The ZiG rate ─────────────────────────────────────────────────────────── */

export type ZigRate = {
  /** "26.80". */
  rate: string;
  value: number;
  setAt: Date;
  /** Who typed it in; null for the RBZ feed. */
  setBy: string | null;
  source: "MANUAL" | "RBZ";
};

const ZIG_PAIR = { baseCurrency: "USD", quoteCurrency: "ZWG" } as const;

/** Today's rate: the newest USD → ZWG row, or null when the shop has never set one. */
export async function latestZigRate(companyId: string, db: Db = prisma): Promise<ZigRate | null> {
  const row = await db.currencyRate.findFirst({
    where: { companyId, ...ZIG_PAIR, effectiveDate: { lte: new Date() } },
    orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }],
    select: { rate: true, effectiveDate: true, source: true, createdBy: { select: { name: true } } },
  });
  if (!row) return null;
  return {
    rate: formatZigRate(row.rate),
    value: row.rate,
    setAt: row.effectiveDate,
    setBy: row.createdBy?.name ?? null,
    source: row.source,
  };
}

/**
 * A new rate from now on. The old ones stay (a sale keeps the rate it was
 * taken at); nothing is written when the rate is the one already in force.
 * Audited `RETAIL_ZIG_RATE.SET { rate, previous }` on the Payments page.
 */
export async function setZigRate(
  tx: Db,
  input: { actor: RetailAuditActor | null; companyId: string; rate: string | number; source: "MANUAL" | "RBZ"; at?: Date },
): Promise<boolean> {
  const previous = await latestZigRate(input.companyId, tx);
  const value = toRate(input.rate);
  if (previous && toRate(previous.value).equals(value)) return false;
  const at = input.at ?? new Date();
  await tx.currencyRate.create({
    data: {
      companyId: input.companyId,
      ...ZIG_PAIR,
      rate: value.toNumber(),
      effectiveDate: at,
      createdById: input.actor?.userId ?? null,
      source: input.source,
    },
  });
  if (input.actor) {
    await writeRetailAuditEvent(tx, {
      actor: input.actor,
      eventType: RETAIL_AUDIT_EVENTS.zigRateSet,
      entityType: "RetailSettings",
      entityId: "payments",
      payload: { rate: formatZigRate(value.toNumber()), previous: previous?.rate ?? null, source: input.source },
    });
  }
  return true;
}

/** A ZiG rate change refused for one of its fields ("zigRate" or "zigSource"). */
export class ZigRateRefused extends Error {
  constructor(
    message: string,
    readonly field: "zigRate" | "zigSource",
  ) {
    super(message);
    this.name = "ZigRateRefused";
  }
}

/**
 * The ZiG rate action (`POST /api/v2/retail/payments/zig-rate`, C-14): a new
 * rate by hand, and how the rate is updated. Owners and managers. A new rate
 * is a `CurrencyRate` row audited `RETAIL_ZIG_RATE.SET { rate, previous }`; a
 * new source is the settings row's, audited `RETAIL_ZIG_RATE.SET { source }`.
 * While the RBZ's daily rate is chosen nobody types one in.
 */
export async function changeZigRate(
  actor: RetailAuditActor,
  input: { rate?: string; source?: RetailRateSource },
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const before = await loadPaymentSettings(actor.companyId, tx);
    const source = input.source ?? before.zigRateSource;
    if (input.source && input.source !== before.zigRateSource) {
      await savePaymentSettings(tx, actor, { zigRateSource: input.source });
      await writeRetailAuditEvent(tx, {
        actor,
        eventType: RETAIL_AUDIT_EVENTS.zigRateSet,
        entityType: "RetailSettings",
        entityId: "payments",
        payload: { source: input.source, previousSource: before.zigRateSource },
      });
    }
    if (input.rate !== undefined) {
      if (source === "RBZ_DAILY") {
        throw new ZigRateRefused("The RBZ sets the rate while it is updated daily.", "zigRate");
      }
      await setZigRate(tx, { actor, companyId: actor.companyId, rate: input.rate, source: "MANUAL" });
    }
  });
}

/* ── At the till ──────────────────────────────────────────────────────────── */

export type { TillTender };

/**
 * A sale on account names the account and who is buying (CUS-10); until the
 * till can, the tender is kept off it and refused by the server.
 */
export const ON_ACCOUNT_NOT_AT_THE_TILL = "Selling on account needs the customer’s account, which the till cannot take yet.";

/** The tenders that are on, in the board's order, as the till lists them. */
export function tillTenders(settings: PaymentSettings): TillTender[] {
  return TENDER_OPTIONS.filter((option) => settings.tenders[option.key] && option.key !== "onAccount").map(
    (option) => ({ tender: option.tender, currency: option.currency, label: option.tillLabel }),
  );
}

/** What the till carries about payments: the tenders on, and today's rate while it takes ZiG. */
export async function tillPayments(companyId: string): Promise<{
  tenders: TillTender[];
  zig: { rate: string; setAt: string; rounding: string } | null;
}> {
  const [settings, zig] = await Promise.all([loadPaymentSettings(companyId), latestZigRate(companyId)]);
  return {
    tenders: tillTenders(settings),
    zig:
      settings.tenders.cashZig && zig
        ? { rate: zig.rate, setAt: zig.setAt.toISOString(), rounding: settings.zigChangeRounding }
        : null,
  };
}

/** A payment the shop has turned off: "InnBucks is turned off in Payments." */
export function tenderOffProblem(
  settings: PaymentSettings,
  tender: string,
  currency: string | null | undefined,
): string | null {
  const key = tenderKeyOf(tender, currency);
  if (!key) return "That is not a way this shop is paid.";
  if (key === "onAccount") return ON_ACCOUNT_NOT_AT_THE_TILL;
  if (settings.tenders[key]) return null;
  const label = TENDER_OPTIONS.find((option) => option.key === key)!.label;
  return `${label} is turned off in Payments.`;
}

export class NoZigRate extends Error {
  constructor() {
    super("There is no ZiG rate yet. Set it in Payments.");
    this.name = "NoZigRate";
  }
}

/**
 * The rate the server stamps on a payment in `currency` against a sale in
 * `saleCurrency` (quote units per one sale unit): 1 in the sale's own
 * currency, else from the shop's rates (`resolveExchangeRate`). A ZiG-priced
 * shop taking US dollars uses the inverse of the US dollar's rate.
 */
export async function paymentRate(
  companyId: string,
  saleCurrency: string,
  currency: string,
  on: Date = new Date(),
): Promise<Prisma.Decimal> {
  const sale = saleCurrency.toUpperCase();
  const paid = currency.toUpperCase();
  if (sale === paid) return new Prisma.Decimal(1);
  try {
    return await resolveExchangeRate({ companyId, currency: paid, baseCurrency: sale, on });
  } catch (error) {
    if (!(error instanceof UnknownExchangeRateError)) throw error;
  }
  try {
    const inverse = await resolveExchangeRate({ companyId, currency: sale, baseCurrency: paid, on });
    return toRate(new Prisma.Decimal(1).dividedBy(inverse));
  } catch (error) {
    if (error instanceof UnknownExchangeRateError) throw new NoZigRate();
    throw error;
  }
}
