import { Prisma, type RetailLaybyStatus, type RetailTenderType } from "@prisma/client";
import { z } from "zod";

import { reserveIdentifier } from "@/lib/id-generator";
import { recordStockMovement } from "@/lib/inventory/stock-movements";
import { money, multiplyMoney, sumMoney, toNumberOrZero, ZERO } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { auditRecordEdited, auditSalePosted, RETAIL_AUDIT_EVENTS, writeRetailAuditEvent, type RetailAuditActor } from "@/lib/retail/audit";
import { calculateRetailCheckout } from "@/lib/retail/checkout";
import { assignRetailSaleFiscalDay, fiscaliseAfterPosting } from "@/lib/retail/fiscalisation";
import { earnPoints } from "@/lib/retail/loyalty/earn";
import { loadLoyaltySettings } from "@/lib/retail/loyalty/settings";
import { shopName } from "@/lib/retail/messages/send-now";
import { loadPaymentSettings, type PaymentSettings } from "@/lib/retail/payment-settings";
import { siteScopeOf } from "@/lib/retail/people/scope";
import { canRetailRoleDo, retailPermissionDenial, type RetailAction } from "@/lib/retail/permission-matrix";
import { resolveShelfPrices } from "@/lib/retail/shelf-pricing";
import { loadTillRules, tenderRuleProblem, type TillRules } from "@/lib/retail/till-rules";
import { laybyStateLabel, tenderLabel } from "@/lib/retail/words";
import { addDays, formatCount, formatWhen, todayIn } from "@/lib/workspace/format";
import { ensureRetailSaleAccountingPosted } from "@/app/api/v2/retail/_services";
import { normalizeRetailPostingPayments, postRetailJournal } from "@/app/api/v2/retail/_helpers";

import { defaultSiteFor } from "./default-site";
import { drawerHint, drawerLabel, noDrawer, resolveDrawer, type DrawerShift } from "./drawer";
import { laybyWhat, longDay, readyMessage, startedMessage, usd } from "./layby-words";
import { actorName, type ReversalActor } from "./reversal";

/**
 * Lay-bys (50-floor W-42, FLR-06): a customer puts goods aside with a
 * deposit and pays the rest over time, then collects them.
 *
 * - The goods leave the shelf when it starts (`ISSUE`, `LAYBY_ASIDE`) and stay
 *   the shop's stock in the books; the prices are held at that day's.
 * - Every payment is held for the customer on Lay-by deposits held (2260):
 *   `RETAIL_LAYBY_PAYMENT` debits its tender. Cash goes into one drawer as a
 *   `TAKEN_IN` movement, so what the drawer should hold rises with it.
 * - The hand-over is a sale paid "Lay-by" (the LAYBY tender maps to 2260), so
 *   the liability becomes revenue, VAT and cost of sales, with no second stock
 *   movement; it is fiscalised like any sale.
 * - A cancel pays back what was paid less the fee in Till rules (other
 *   income) and puts the goods back (`RECEIPT`, `LAYBY_BACK`).
 *
 * Every write checks the person's right, the company and their sites, and
 * writes its audit inside its transaction; journals and messages follow the
 * commit, as every retail act does.
 */

export type LaybyActor = ReversalActor;

/** Where the act is done: the till a till-PIN session or this host's paired till is on (SET-04); none in the back office. */
export type LaybyPlace = { registerId?: string | null };

type Options = { place?: LaybyPlace; now?: Date };

export class LaybyRefused extends Error {
  constructor(
    readonly status: 400 | 403 | 404 | 409,
    message: string,
    readonly fieldErrors?: Record<string, string>,
    readonly extra?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "LaybyRefused";
  }
}

export const LAYBY_NOT_FOUND = "Lay-by not found";
export const LAYBY_TRY_AGAIN = "Someone else was changing this lay-by at the same moment. Try again.";
export const PICK_THE_DRAWER = "Pick the drawer the cash goes into.";
export const OPEN_A_SHIFT_ON_THIS_TILL = "Open a shift on this till first: the cash goes into its drawer.";
/** How long the sheet suggests to pay over, from today. */
export const DEFAULT_DUE_DAYS = 17;

/** The tenders a lay-by takes, in the sheet's order. */
export const LAYBY_TENDERS = ["CASH", "ECOCASH", "CARD"] as const;
export type LaybyTender = (typeof LAYBY_TENDERS)[number];

const TENDER_SWITCH: Record<LaybyTender, keyof PaymentSettings["tenders"]> = { CASH: "cashUsd", ECOCASH: "ecocash", CARD: "card" };

const AMOUNT = /^\d{1,9}(\.\d{1,2})?$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const QUANTITY = /^\d{1,8}(\.\d{1,4})?$/;

const amountField = (message: string) => z.string().trim().regex(AMOUNT, message);
const tenderField = z.enum(LAYBY_TENDERS, { message: "Pick how they pay." });

export const startInput = z.object({
  customerId: z.string().uuid("Pick a customer."),
  lines: z
    .array(z.object({ productId: z.string().uuid("Add the goods to put aside."), quantity: z.string().trim().regex(QUANTITY, "Type how many.") }))
    .min(1, "Add the goods to put aside.")
    .max(50, "Keep it to 50 lines."),
  deposit: amountField("Type the deposit, like 20.00."),
  depositTender: tenderField,
  reference: z.string().trim().max(60).optional().nullable(),
  shiftId: z.string().uuid().optional().nullable(),
  dueOn: z.string().regex(DAY, "Pick the day they pay by."),
  remindWeekly: z.boolean().default(true),
});

export const payInput = z.object({
  amount: amountField("Type the amount, like 13.00."),
  tender: tenderField,
  reference: z.string().trim().max(60).optional().nullable(),
  shiftId: z.string().uuid().optional().nullable(),
  dueOn: z.string().regex(DAY, "Pick the day they pay by.").optional().nullable(),
});

export const dueInput = z.object({ dueOn: z.string().regex(DAY, "Pick the day they pay by.") });

export const handOverInput = z.object({
  amount: amountField("Type the amount, like 13.00.").optional().nullable(),
  tender: tenderField.optional().nullable(),
  reference: z.string().trim().max(60).optional().nullable(),
  shiftId: z.string().uuid().optional().nullable(),
});

export const cancelInput = z.object({
  tender: tenderField,
  reference: z.string().trim().max(60).optional().nullable(),
  shiftId: z.string().uuid().optional().nullable(),
});

/** A body's refusal under the sheet's field. */
const FIELD_OF: Record<string, string> = {
  customerId: "cust",
  lines: "lines",
  deposit: "dep",
  depositTender: "with",
  reference: "ref",
  shiftId: "drawer",
  dueOn: "due",
  amount: "amt",
  tender: "how",
};

export function laybyBodyRefusal(error: z.ZodError): LaybyRefused {
  const issue = error.issues[0];
  const key = String(issue?.path[0] ?? "");
  const message = issue?.message ?? "Check what you typed.";
  return new LaybyRefused(400, message, FIELD_OF[key] ? { [FIELD_OF[key]!]: message } : undefined);
}

function parse<T>(schema: z.ZodType<T>, raw: unknown): T {
  const parsed = schema.safeParse(raw ?? {});
  if (!parsed.success) throw laybyBodyRefusal(parsed.error);
  return parsed.data;
}

/* ── Small rules ──────────────────────────────────────────────────────── */

function assertCan(actor: LaybyActor, action: RetailAction): void {
  const denial = retailPermissionDenial({ user: { role: actor.userRole ?? null } }, "retail.laybys", action);
  if (denial) throw new LaybyRefused(403, denial);
}

const can = (actor: LaybyActor, action: RetailAction) => canRetailRoleDo(actor.userRole, "retail.laybys", action);

const auditActor = (actor: LaybyActor): RetailAuditActor => ({
  companyId: actor.companyId,
  userId: actor.userId,
  userName: actorName(actor),
  userRole: actor.userRole ?? null,
});

const dayOf = (date: Date) => date.toISOString().slice(0, 10);
const dateOf = (day: string) => new Date(`${day}T00:00:00.000Z`);

/** Pay by: a day after today and no further than the till rules' longest time to pay. */
export function dueProblem(dueOn: string, today: string, maxDays: number): string | null {
  if (dueOn <= today) return "Pick a day after today.";
  if (dueOn > addDays(today, maxDays)) return `Pick a date up to ${maxDays} days away.`;
  return null;
}

/** The smallest deposit: the till rules' percent of the total, rounded up to the cent. */
export function smallestDeposit(total: Prisma.Decimal, percent: Prisma.Decimal): Prisma.Decimal {
  return total.times(percent).dividedBy(100).toDecimalPlaces(2, Prisma.Decimal.ROUND_UP);
}

function tenderProblem(settings: PaymentSettings, rules: TillRules, tender: LaybyTender, reference: string | null | undefined, field: string) {
  if (!settings.tenders[TENDER_SWITCH[tender]]) {
    const message = `The shop does not take ${tenderLabel(tender)}.`;
    throw new LaybyRefused(400, message, { [field]: message });
  }
  const problem = tenderRuleProblem(rules, [{ tenderType: tender, reference: reference ?? null }]);
  if (problem) throw new LaybyRefused(400, problem, { ref: problem });
}

/** The tenders the shop takes among Cash, EcoCash and Card, as the sheet's segment. */
export function laybyTenders(settings: PaymentSettings): Array<{ value: LaybyTender; label: string }> {
  return LAYBY_TENDERS.filter((tender) => settings.tenders[TENDER_SWITCH[tender]]).map((tender) => ({ value: tender, label: tenderLabel(tender) }));
}

function lostRace(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") return true;
  const message = error instanceof Error ? error.message : "";
  return /deadlock detected|could not serialize access|40P01|40001/.test(message);
}

async function laybyTransaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  try {
    return await prisma.$transaction(work, { timeout: 20_000 });
  } catch (error) {
    if (lostRace(error)) throw new LaybyRefused(409, LAYBY_TRY_AGAIN);
    throw error;
  }
}

/* ── The drawer ───────────────────────────────────────────────────────── */

const SHIFT_SELECT = {
  id: true,
  shiftNo: true,
  siteId: true,
  registerId: true,
  registerCode: true,
  registerName: true,
  cashierId: true,
  cashierName: true,
  openedAt: true,
} satisfies Prisma.RetailShiftSelect;

async function tillShift(companyId: string, registerId: string): Promise<DrawerShift | null> {
  return prisma.retailShift.findFirst({ where: { companyId, registerId, status: "OPEN" }, select: SHIFT_SELECT, orderBy: { openedAt: "desc" } });
}

/**
 * The drawer cash goes into or out of (packet 56's rule): at a till, that
 * till's open shift; in the back office, the drawer picked, else the person's
 * own, else the only one open at the site, else they are asked.
 */
async function cashDrawer(
  actor: LaybyActor,
  place: LaybyPlace,
  site: { id: string; name: string },
  chosenShiftId: string | null | undefined,
  verb: "take cash" | "hand cash back",
): Promise<DrawerShift> {
  if (place.registerId) {
    const shift = await tillShift(actor.companyId, place.registerId);
    if (!shift) throw new LaybyRefused(409, OPEN_A_SHIFT_ON_THIS_TILL);
    if (shift.siteId !== site.id) throw new LaybyRefused(409, `This lay-by is kept at ${site.name}. Take the cash there.`);
    return shift;
  }
  const choice = await resolveDrawer(prisma, { companyId: actor.companyId, siteId: site.id, chosenShiftId, actorId: actor.userId });
  if ("shift" in choice) return choice.shift;
  if ("choose" in choice) throw new LaybyRefused(409, PICK_THE_DRAWER, { drawer: PICK_THE_DRAWER }, { choose: choice.choose });
  throw new LaybyRefused(409, noDrawer(site.name, verb));
}

/** The drawer found without asking anyone (a card payment, the hand-over's sale), else none. */
async function quietDrawer(actor: LaybyActor, place: LaybyPlace, siteId: string): Promise<DrawerShift | null> {
  if (place.registerId) {
    const shift = await tillShift(actor.companyId, place.registerId);
    return shift && shift.siteId === siteId ? shift : null;
  }
  const choice = await resolveDrawer(prisma, { companyId: actor.companyId, siteId, actorId: actor.userId });
  return "shift" in choice ? choice.shift : null;
}

export type DrawerWords = { shiftId: string; label: string; hint: string } | { choose: Array<{ shiftId: string; label: string }> } | null;

async function drawerWords(actor: LaybyActor, place: LaybyPlace, siteId: string): Promise<DrawerWords> {
  if (place.registerId) {
    const shift = await tillShift(actor.companyId, place.registerId);
    return shift && shift.siteId === siteId ? { shiftId: shift.id, label: drawerLabel(shift), hint: drawerHint(shift).replace("comes out of", "goes into") } : null;
  }
  const choice = await resolveDrawer(prisma, { companyId: actor.companyId, siteId, actorId: actor.userId });
  if ("shift" in choice) return { shiftId: choice.shift.id, label: drawerLabel(choice.shift), hint: drawerHint(choice.shift).replace("comes out of", "goes into") };
  if ("choose" in choice) return { choose: choice.choose.map(({ shiftId, label }) => ({ shiftId, label })) };
  return null;
}

/** Cash into a drawer that is not a sale: one `TAKEN_IN` movement, what it should hold up by the amount. */
async function takeCashIn(
  tx: Prisma.TransactionClient,
  actor: LaybyActor,
  drawer: DrawerShift,
  amount: Prisma.Decimal,
  note: string,
): Promise<string> {
  const moved = await tx.retailShift.updateMany({
    where: { id: drawer.id, companyId: actor.companyId, status: "OPEN" },
    data: { expectedCash: { increment: amount } },
  });
  if (moved.count !== 1) throw new LaybyRefused(409, "That drawer is not open any more.");
  const movement = await tx.retailCashMovement.create({
    data: {
      companyId: actor.companyId,
      shiftId: drawer.id,
      type: "TAKEN_IN",
      amount,
      currency: "USD",
      exchangeRate: 1,
      baseAmount: amount,
      reasonCode: "LAYBY_PAYMENT",
      reason: note,
      recordedById: actor.userId,
      recordedByName: actorName(actor),
    },
    select: { id: true },
  });
  return movement.id;
}

/* ── Reading one ──────────────────────────────────────────────────────── */

const LAYBY_INCLUDE = {
  customer: { select: { id: true, name: true, phone: true, whatsapp: true } },
  site: { select: { id: true, name: true } },
  lines: { orderBy: { createdAt: "asc" } },
  payments: { orderBy: { createdAt: "asc" }, include: { receivedBy: { select: { name: true } } } },
  sale: { select: { saleNo: true } },
} satisfies Prisma.RetailLaybyInclude;

type LaybyRow = Prisma.RetailLaybyGetPayload<{ include: typeof LAYBY_INCLUDE }>;

async function laybyFor(actor: LaybyActor, id: string): Promise<LaybyRow> {
  const layby = await prisma.retailLayby.findFirst({ where: { id, companyId: actor.companyId }, include: LAYBY_INCLUDE });
  if (!layby) throw new LaybyRefused(404, LAYBY_NOT_FOUND);
  const scope = await siteScopeOf(actor.companyId, actor.userId);
  if (!scope.all && !scope.ids.includes(layby.siteId)) throw new LaybyRefused(404, LAYBY_NOT_FOUND);
  return layby;
}

/** Holds the lay-by for the rest of the transaction, so two payments or a payment and a cancel take turns. */
async function lockLayby(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw`SELECT "id" FROM "RetailLayby" WHERE "id" = ${id} FOR UPDATE`;
  return tx.retailLayby.findUniqueOrThrow({ where: { id }, select: { status: true, paid: true, total: true, dueOn: true, laybyNo: true } });
}

const leftOf = (layby: { total: Prisma.Decimal.Value; paid: Prisma.Decimal.Value }) => money(layby.total).minus(money(layby.paid));

/** The refusal for an act on a lay-by that is no longer open. */
function closedRefusal(layby: { laybyNo: string; status: RetailLaybyStatus }): LaybyRefused | null {
  if (layby.status === "COLLECTED") return new LaybyRefused(409, `${layby.laybyNo} was handed over.`);
  if (layby.status === "CANCELLED") return new LaybyRefused(409, `${layby.laybyNo} was cancelled.`);
  return null;
}

export type LaybyView = {
  id: string;
  laybyNo: string;
  status: RetailLaybyStatus;
  stateLabel: string;
  customer: { id: string; name: string; phone: string | null };
  site: { id: string; name: string };
  what: string;
  /** Money as "46.00". */
  total: string;
  paid: string;
  left: string;
  dueOn: string;
  dueOnText: string;
  saleNo: string | null;
  lines: Array<{ name: string; quantity: number; price: string; total: string }>;
  payments: Array<{ at: string; kind: string; tender: string; amount: string; by: string }>;
  /** The tender of the last money taken: what the sheet's "With" starts on. */
  lastTender: LaybyTender | null;
  tenders: Array<{ value: LaybyTender; label: string }>;
  referenceRequired: boolean;
  drawer: DrawerWords;
  noDrawer: string;
  maxDays: number;
  cancel: { fee: string; paidBack: string };
  can: { pay: boolean; handOver: boolean; cancel: boolean; changeDate: boolean };
};

const PAYMENT_KIND: Record<string, string> = { DEPOSIT: "Deposit", PAYMENT: "Payment", REFUND: "Paid back" };

export async function laybyView(actor: LaybyActor, id: string, options: Options = {}): Promise<LaybyView> {
  assertCan(actor, "view");
  const now = options.now ?? new Date();
  const layby = await laybyFor(actor, id);
  const [rules, settings] = await Promise.all([loadTillRules(actor.companyId), loadPaymentSettings(actor.companyId)]);
  const open = layby.status === "PAYING" || layby.status === "READY";
  const paid = money(layby.paid);
  const fee = money(rules.laybyCancelFee).greaterThan(paid) ? paid : money(rules.laybyCancelFee);
  const lines = layby.lines.map((line) => ({ name: line.itemName, quantity: line.quantity.toNumber() }));
  const lastIn = [...layby.payments].reverse().find((payment) => payment.kind !== "REFUND");
  const lastTender = lastIn && (LAYBY_TENDERS as readonly string[]).includes(lastIn.tenderType) ? (lastIn.tenderType as LaybyTender) : null;
  return {
    id: layby.id,
    laybyNo: layby.laybyNo,
    status: layby.status,
    stateLabel: laybyStateLabel({ status: layby.status, dueOn: dayOf(layby.dueOn) }, todayIn(undefined, now)),
    customer: { id: layby.customer.id, name: layby.customer.name, phone: layby.customer.whatsapp || layby.customer.phone || null },
    site: layby.site,
    what: laybyWhat(lines),
    total: money(layby.total).toFixed(2),
    paid: paid.toFixed(2),
    left: leftOf(layby).toFixed(2),
    dueOn: dayOf(layby.dueOn),
    dueOnText: longDay(dayOf(layby.dueOn)),
    saleNo: layby.sale?.saleNo ?? null,
    lines: layby.lines.map((line) => ({
      name: line.itemName,
      quantity: line.quantity.toNumber(),
      price: money(line.unitPrice).toFixed(2),
      total: money(line.lineTotal).toFixed(2),
    })),
    payments: layby.payments.map((payment) => ({
      at: formatWhen(payment.createdAt),
      kind: PAYMENT_KIND[payment.kind] ?? payment.kind,
      tender: tenderLabel(payment.tenderType),
      amount: money(payment.amount).toFixed(2),
      by: payment.receivedBy.name ?? "",
    })),
    lastTender,
    tenders: laybyTenders(settings),
    referenceRequired: rules.referenceRequired,
    drawer: open ? await drawerWords(actor, options.place ?? {}, layby.siteId) : null,
    noDrawer: noDrawer(layby.site.name, "take cash"),
    maxDays: rules.laybyMaxDays,
    cancel: { fee: fee.toFixed(2), paidBack: paid.minus(fee).toFixed(2) },
    can: {
      pay: layby.status === "PAYING" && can(actor, "update"),
      handOver: open && can(actor, "update"),
      cancel: open && can(actor, "delete"),
      changeDate: open && can(actor, "update"),
    },
  };
}

/* ── The New lay-by sheet's form ──────────────────────────────────────── */

export type LaybyForm = {
  siteId: string;
  siteName: string;
  minDepositPct: string;
  maxDays: number;
  defaultDue: string;
  tenders: Array<{ value: LaybyTender; label: string }>;
  referenceRequired: boolean;
  drawer: DrawerWords;
  noDrawer: string;
};

async function siteOf(actor: LaybyActor, place: LaybyPlace): Promise<{ id: string; name: string }> {
  let siteId: string | null = null;
  if (place.registerId) {
    const register = await prisma.retailRegister.findFirst({ where: { id: place.registerId, companyId: actor.companyId }, select: { siteId: true } });
    siteId = register?.siteId ?? null;
  }
  siteId ??= await defaultSiteFor(actor.companyId, actor.userId);
  const site = siteId ? await prisma.site.findFirst({ where: { id: siteId, companyId: actor.companyId }, select: { id: true, name: true } }) : null;
  if (!site) throw new LaybyRefused(409, "Set up a shop first: a lay-by is kept at one.");
  return site;
}

export async function laybyForm(actor: LaybyActor, options: Options = {}): Promise<LaybyForm> {
  assertCan(actor, "create");
  const place = options.place ?? {};
  const today = todayIn(undefined, options.now ?? new Date());
  const [site, rules, settings] = await Promise.all([siteOf(actor, place), loadTillRules(actor.companyId), loadPaymentSettings(actor.companyId)]);
  return {
    siteId: site.id,
    siteName: site.name,
    minDepositPct: Number(rules.laybyMinDepositPercent.toFixed(2)).toString(),
    maxDays: rules.laybyMaxDays,
    defaultDue: addDays(today, Math.min(DEFAULT_DUE_DAYS, rules.laybyMaxDays)),
    tenders: laybyTenders(settings),
    referenceRequired: rules.referenceRequired,
    drawer: await drawerWords(actor, place, site.id),
    noDrawer: noDrawer(site.name, "take cash"),
  };
}

/* ── Start ────────────────────────────────────────────────────────────── */

type PricedLine = {
  productId: string;
  inventoryItemId: string;
  name: string;
  unit: string;
  quantity: Prisma.Decimal;
  unitPrice: Prisma.Decimal;
  lineTotal: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
  costUnit: Prisma.Decimal;
  priceListId: string | null;
};

const onlySentence = (onHand: Prisma.Decimal, name: string) =>
  onHand.lessThanOrEqualTo(0) ? `No ${name} on hand.` : `Only ${formatCount(onHand.toNumber())} ${name} on hand.`;

async function priceLines(
  actor: LaybyActor,
  site: { id: string },
  place: LaybyPlace,
  customer: { priceListId: string | null },
  wanted: Map<string, Prisma.Decimal>,
  now: Date,
): Promise<PricedLine[]> {
  const productIds = [...wanted.keys()];
  const [products, items] = await Promise.all([
    prisma.product.findMany({
      where: { id: { in: productIds }, companyId: actor.companyId, isActive: true, archivedAt: null },
      select: { id: true, name: true },
    }),
    prisma.inventoryItem.findMany({
      where: { siteId: site.id, productId: { in: productIds } },
      orderBy: { createdAt: "asc" },
      select: { id: true, productId: true, unit: true, currentStock: true, unitCost: true },
    }),
  ]);
  const product = new Map(products.map((row) => [row.id, row]));
  const item = new Map<string, (typeof items)[number]>();
  for (const row of items) if (row.productId && !item.has(row.productId)) item.set(row.productId, row);

  for (const [productId, quantity] of wanted) {
    const goods = product.get(productId);
    const line = item.get(productId);
    if (!goods || !line) throw new LaybyRefused(400, "Pick products this shop sells.", { lines: "Pick products this shop sells." });
    if (quantity.lessThanOrEqualTo(0)) throw new LaybyRefused(400, "Type how many.", { lines: "Type how many." });
    if (quantity.greaterThan(line.currentStock)) {
      const message = onlySentence(line.currentStock, goods.name);
      throw new LaybyRefused(400, message, { lines: message });
    }
  }

  // Today's price at the site for this customer (PRD-05), held until it is collected.
  const shelf = await resolveShelfPrices(
    actor.companyId,
    productIds.map((productId) => ({ id: productId, productId, unitPrice: 0, taxPercent: 0, quantity: wanted.get(productId)!.toNumber() })),
    { siteId: site.id, registerId: place.registerId ?? null, at: now, customer: { accountPriceListId: customer.priceListId } },
  );
  const checkout = calculateRetailCheckout({
    lines: productIds.map((productId) => {
      const price = shelf.get(productId)!;
      return { id: productId, quantity: wanted.get(productId)!.toNumber(), unitPrice: price.unitPrice, taxPercent: price.taxPercent, taxInclusive: price.taxInclusive };
    }),
  });
  return checkout.lines.map((priced) => {
    const quantity = wanted.get(priced.id)!;
    const line = item.get(priced.id)!;
    const lineTotal = money(priced.lineTotal);
    return {
      productId: priced.id,
      inventoryItemId: line.id,
      name: product.get(priced.id)!.name,
      unit: line.unit,
      quantity,
      unitPrice: lineTotal.dividedBy(quantity).toDecimalPlaces(2),
      lineTotal,
      taxAmount: money(priced.taxAmount),
      costUnit: money(line.unitCost ?? 0),
      priceListId: shelf.get(priced.id)!.priceListId,
    };
  });
}

export type StartResult = { id: string; laybyNo: string; left: string; dueOn: string };

export async function startLayby(actor: LaybyActor, raw: unknown, options: Options = {}): Promise<StartResult> {
  assertCan(actor, "create");
  const body = parse(startInput, raw);
  const now = options.now ?? new Date();
  const place = options.place ?? {};
  const today = todayIn(undefined, now);

  const customer = await prisma.customer.findFirst({
    where: { id: body.customerId, companyId: actor.companyId, archivedAt: null, mergedIntoId: null },
    select: { id: true, name: true, phone: true, whatsapp: true, priceListId: true },
  });
  if (!customer) throw new LaybyRefused(400, "Pick a customer.", { cust: "Pick a customer." });
  const to = customer.whatsapp?.trim() || customer.phone?.trim() || null;
  if (body.remindWeekly && !to) {
    const message = `${customer.name} has no phone number. Add one to send reminders.`;
    throw new LaybyRefused(400, message, { cust: message });
  }

  const [site, rules, settings] = await Promise.all([siteOf(actor, place), loadTillRules(actor.companyId), loadPaymentSettings(actor.companyId)]);

  const wanted = new Map<string, Prisma.Decimal>();
  for (const line of body.lines) wanted.set(line.productId, (wanted.get(line.productId) ?? ZERO).plus(line.quantity));
  const lines = await priceLines(actor, site, place, customer, wanted, now);
  const total = sumMoney(lines.map((line) => line.lineTotal));

  const deposit = money(body.deposit);
  const least = smallestDeposit(total, rules.laybyMinDepositPercent);
  if (deposit.lessThan(least) || deposit.lessThanOrEqualTo(0)) {
    const message = `At least ${usd(least.toFixed(2))}.`;
    throw new LaybyRefused(400, message, { dep: message });
  }
  if (!deposit.lessThan(total)) throw new LaybyRefused(400, "That pays it all. Sell it instead.", { dep: "That pays it all. Sell it instead." });

  const due = dueProblem(body.dueOn, today, rules.laybyMaxDays);
  if (due) throw new LaybyRefused(400, due, { due });
  tenderProblem(settings, rules, body.depositTender, body.reference, "with");

  const drawer = body.depositTender === "CASH" ? await cashDrawer(actor, place, site, body.shiftId, "take cash") : await quietDrawer(actor, place, site.id);
  const laybyNo = await reserveIdentifier(prisma, { companyId: actor.companyId, entity: "RETAIL_LAYBY" });

  const created = await laybyTransaction(async (tx) => {
    // Two lay-bys after the last bottle take turns here: the second reads what the first left.
    const itemIds = [...new Set(lines.map((line) => line.inventoryItemId))].sort();
    await tx.$queryRaw`SELECT "id" FROM "InventoryItem" WHERE "id" IN (${Prisma.join(itemIds)}) ORDER BY "id" FOR UPDATE`;
    const stock = await tx.inventoryItem.findMany({ where: { id: { in: itemIds } }, select: { id: true, currentStock: true } });
    for (const line of lines) {
      const onHand = stock.find((row) => row.id === line.inventoryItemId)?.currentStock ?? ZERO;
      if (line.quantity.greaterThan(onHand)) {
        const message = onlySentence(onHand, line.name);
        throw new LaybyRefused(400, message, { lines: message });
      }
    }

    const cashMovementId = body.depositTender === "CASH" ? await takeCashIn(tx, actor, drawer!, deposit, `${laybyNo} deposit`) : null;
    const layby = await tx.retailLayby.create({
      data: {
        companyId: actor.companyId,
        laybyNo,
        siteId: site.id,
        customerId: customer.id,
        status: "PAYING",
        total,
        paid: deposit,
        dueOn: dateOf(body.dueOn),
        remindWeekly: body.remindWeekly,
        createdById: actor.userId,
        createdAt: now,
        lines: {
          create: lines.map((line) => ({
            companyId: actor.companyId,
            productId: line.productId,
            inventoryItemId: line.inventoryItemId,
            itemName: line.name,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            lineTotal: line.lineTotal,
            taxAmount: line.taxAmount,
            costUnit: line.costUnit,
            priceListId: line.priceListId,
          })),
        },
        payments: {
          create: {
            companyId: actor.companyId,
            kind: "DEPOSIT",
            tenderType: body.depositTender,
            amount: deposit,
            baseAmount: deposit,
            reference: body.reference?.trim() || null,
            shiftId: drawer?.id ?? null,
            cashMovementId,
            receivedById: actor.userId,
            createdAt: now,
          },
        },
      },
      include: { payments: true },
    });

    // Off the shelf: no journal of its own, the goods stay the shop's until they are handed over.
    for (const line of lines) {
      await recordStockMovement({
        companyId: actor.companyId,
        userId: actor.userId,
        itemId: line.inventoryItemId,
        movementType: "ISSUE",
        quantity: line.quantity,
        unit: line.unit,
        notes: `Put aside for ${laybyNo}`,
        reason: "LAYBY_ASIDE",
        reference: laybyNo,
        sourceType: "RETAIL_LAYBY_PAYMENT",
        sourceId: `${layby.id}:${line.inventoryItemId}`,
        entryDate: now,
        tx,
      });
    }

    await writeRetailAuditEvent(tx, {
      actor: auditActor(actor),
      eventType: RETAIL_AUDIT_EVENTS.laybyStarted,
      entityType: "RetailLayby",
      entityId: layby.id,
      payload: { laybyNo, total: total.toFixed(2), deposit: deposit.toFixed(2), dueOn: body.dueOn, customerId: customer.id },
    });
    return layby;
  });

  await postPaymentJournal(actor, { id: created.id, laybyNo, siteId: site.id }, created.payments[0]!, drawer?.registerCode ?? null);
  const left = total.minus(deposit);
  if (body.remindWeekly && to) {
    await queueLaybyMessage(actor, {
      template: "layby-started",
      to,
      customerId: customer.id,
      laybyId: created.id,
      body: startedMessage({ laybyNo, shop: await shopName(actor.companyId), paid: deposit.toFixed(2), left: left.toFixed(2), dueOn: body.dueOn }),
    });
  }
  return { id: created.id, laybyNo, left: left.toFixed(2), dueOn: body.dueOn };
}

/* ── Pay, change the date ─────────────────────────────────────────────── */

export type PayResult = { laybyNo: string; amount: string; paid: string; left: string; status: RetailLaybyStatus };

export async function payLayby(actor: LaybyActor, id: string, raw: unknown, options: Options = {}): Promise<PayResult> {
  assertCan(actor, "update");
  const body = parse(payInput, raw);
  const now = options.now ?? new Date();
  const layby = await laybyFor(actor, id);
  const closed = closedRefusal(layby);
  if (closed) throw closed;
  if (layby.status !== "PAYING") throw new LaybyRefused(409, `${layby.laybyNo} is paid already.`);
  const amount = money(body.amount);
  checkAmount(amount, leftOf(layby));
  const rules = await loadTillRules(actor.companyId);
  const settings = await loadPaymentSettings(actor.companyId);
  tenderProblem(settings, rules, body.tender, body.reference, "how");
  const newDue = body.dueOn && body.dueOn !== dayOf(layby.dueOn) ? body.dueOn : null;
  if (newDue) {
    const due = dueProblem(newDue, todayIn(undefined, now), rules.laybyMaxDays);
    if (due) throw new LaybyRefused(400, due, { due });
  }
  const place = options.place ?? {};
  const drawer = body.tender === "CASH" ? await cashDrawer(actor, place, layby.site, body.shiftId, "take cash") : await quietDrawer(actor, place, layby.siteId);

  const done = await laybyTransaction(async (tx) => {
    const locked = await lockLayby(tx, layby.id);
    const lockedClosed = closedRefusal(locked);
    if (lockedClosed) throw lockedClosed;
    if (locked.status !== "PAYING") throw new LaybyRefused(409, `${locked.laybyNo} is paid already.`);
    checkAmount(amount, leftOf(locked));
    const payment = await takePayment(tx, actor, { id: layby.id, laybyNo: layby.laybyNo, total: locked.total, paid: locked.paid }, {
      amount,
      tender: body.tender,
      reference: body.reference,
      drawer,
      now,
    });
    if (newDue) {
      await tx.retailLayby.update({ where: { id: layby.id }, data: { dueOn: dateOf(newDue) } });
      await auditRecordEdited(tx, {
        actor: auditActor(actor),
        entityType: "RetailLayby",
        entityId: layby.id,
        field: "dueOn",
        label: "Pay by",
        from: longDay(dayOf(locked.dueOn)),
        to: longDay(newDue),
      });
    }
    return payment;
  });

  await postPaymentJournal(actor, layby, done.payment, drawer?.registerCode ?? null);
  const to = layby.customer.whatsapp?.trim() || layby.customer.phone?.trim() || null;
  if (done.status === "READY" && to) {
    await queueLaybyMessage(actor, {
      template: "layby-ready",
      to,
      customerId: layby.customer.id,
      laybyId: layby.id,
      body: readyMessage({ laybyNo: layby.laybyNo, shop: await shopName(actor.companyId) }),
    });
  }
  return { laybyNo: layby.laybyNo, amount: amount.toFixed(2), paid: done.paid.toFixed(2), left: done.left.toFixed(2), status: done.status };
}

function checkAmount(amount: Prisma.Decimal, left: Prisma.Decimal): void {
  if (amount.lessThanOrEqualTo(0)) throw new LaybyRefused(400, "Type the amount, like 13.00.", { amt: "Type the amount, like 13.00." });
  if (amount.greaterThan(left)) {
    const message = `Only ${usd(left.toFixed(2))} is left.`;
    throw new LaybyRefused(400, message, { amt: message });
  }
}

/** One payment towards a lay-by, inside its transaction: the row, the drawer, what is paid, READY once all of it is. */
async function takePayment(
  tx: Prisma.TransactionClient,
  actor: LaybyActor,
  layby: { id: string; laybyNo: string; total: Prisma.Decimal; paid: Prisma.Decimal },
  input: { amount: Prisma.Decimal; tender: LaybyTender; reference?: string | null; drawer: DrawerShift | null; now: Date },
) {
  const cashMovementId = input.tender === "CASH" ? await takeCashIn(tx, actor, input.drawer!, input.amount, `${layby.laybyNo} payment`) : null;
  const payment = await tx.retailLaybyPayment.create({
    data: {
      companyId: actor.companyId,
      laybyId: layby.id,
      kind: "PAYMENT",
      tenderType: input.tender,
      amount: input.amount,
      baseAmount: input.amount,
      reference: input.reference?.trim() || null,
      shiftId: input.drawer?.id ?? null,
      cashMovementId,
      receivedById: actor.userId,
      createdAt: input.now,
    },
  });
  const paid = money(layby.paid).plus(input.amount);
  const left = money(layby.total).minus(paid);
  const status: RetailLaybyStatus = left.lessThanOrEqualTo(0) ? "READY" : "PAYING";
  await tx.retailLayby.update({ where: { id: layby.id }, data: { paid, status } });
  await writeRetailAuditEvent(tx, {
    actor: auditActor(actor),
    eventType: RETAIL_AUDIT_EVENTS.laybyPaid,
    entityType: "RetailLayby",
    entityId: layby.id,
    payload: { laybyNo: layby.laybyNo, amount: input.amount.toFixed(2), tender: input.tender, left: left.toFixed(2) },
  });
  return { payment, paid, left, status };
}

export async function changeDue(actor: LaybyActor, id: string, raw: unknown, options: Options = {}): Promise<{ laybyNo: string; dueOn: string }> {
  assertCan(actor, "update");
  const body = parse(dueInput, raw);
  const layby = await laybyFor(actor, id);
  const closed = closedRefusal(layby);
  if (closed) throw closed;
  const rules = await loadTillRules(actor.companyId);
  const due = dueProblem(body.dueOn, todayIn(undefined, options.now ?? new Date()), rules.laybyMaxDays);
  if (due) throw new LaybyRefused(400, due, { due });
  await laybyTransaction(async (tx) => {
    const locked = await lockLayby(tx, layby.id);
    const lockedClosed = closedRefusal(locked);
    if (lockedClosed) throw lockedClosed;
    if (dayOf(locked.dueOn) === body.dueOn) return;
    await tx.retailLayby.update({ where: { id: layby.id }, data: { dueOn: dateOf(body.dueOn) } });
    await auditRecordEdited(tx, {
      actor: auditActor(actor),
      entityType: "RetailLayby",
      entityId: layby.id,
      field: "dueOn",
      label: "Pay by",
      from: longDay(dayOf(locked.dueOn)),
      to: longDay(body.dueOn),
    });
  });
  return { laybyNo: layby.laybyNo, dueOn: body.dueOn };
}

/* ── Hand over ────────────────────────────────────────────────────────── */

export type HandOverResult = { laybyNo: string; saleId: string; saleNo: string };

export async function handOver(actor: LaybyActor, id: string, raw: unknown, options: Options = {}): Promise<HandOverResult> {
  assertCan(actor, "update");
  const body = parse(handOverInput, raw);
  const now = options.now ?? new Date();
  const place = options.place ?? {};
  const layby = await laybyFor(actor, id);
  const closed = closedRefusal(layby);
  if (closed) throw closed;
  const left = leftOf(layby);

  // With the rest: taken and handed over in one.
  const amount = body.amount ? money(body.amount) : null;
  let payDrawer: DrawerShift | null = null;
  if (amount) {
    if (layby.status !== "PAYING") throw new LaybyRefused(409, `${layby.laybyNo} is paid already.`);
    checkAmount(amount, left);
    if (!amount.equals(left)) {
      const message = `Take all of the ${usd(left.toFixed(2))} left to hand it over.`;
      throw new LaybyRefused(400, message, { amt: message });
    }
    if (!body.tender) throw new LaybyRefused(400, "Pick how they pay.", { how: "Pick how they pay." });
    const [rules, settings] = await Promise.all([loadTillRules(actor.companyId), loadPaymentSettings(actor.companyId)]);
    tenderProblem(settings, rules, body.tender, body.reference, "how");
    payDrawer = body.tender === "CASH" ? await cashDrawer(actor, place, layby.site, body.shiftId, "take cash") : null;
  } else if (layby.status !== "READY") {
    throw new LaybyRefused(409, `${usd(left.toFixed(2))} is still to pay.`);
  }
  const saleDrawer = payDrawer ?? (await quietDrawer(actor, place, layby.siteId));
  const saleNo = await reserveIdentifier(prisma, { companyId: actor.companyId, entity: "RETAIL_SALE" });

  const done = await laybyTransaction(async (tx) => {
    const locked = await lockLayby(tx, layby.id);
    const lockedClosed = closedRefusal(locked);
    if (lockedClosed) throw lockedClosed;
    let payment = null;
    if (amount) {
      if (locked.status !== "PAYING" || !amount.equals(leftOf(locked))) throw new LaybyRefused(409, LAYBY_TRY_AGAIN);
      payment = (await takePayment(tx, actor, { id: layby.id, laybyNo: layby.laybyNo, total: locked.total, paid: locked.paid }, {
        amount,
        tender: body.tender!,
        reference: body.reference,
        drawer: payDrawer ?? (await quietDrawer(actor, place, layby.siteId)),
        now,
      })).payment;
    } else if (locked.status !== "READY") {
      throw new LaybyRefused(409, `${usd(leftOf(locked).toFixed(2))} is still to pay.`);
    }

    // The sale at the held prices, paid by the lay-by's deposits: no stock moves, the goods left at LAYBY_ASIDE.
    const total = money(layby.total);
    const taxAmount = sumMoney(layby.lines.map((line) => line.taxAmount));
    const sale = await tx.retailSale.create({
      data: {
        companyId: actor.companyId,
        saleNo,
        shiftId: saleDrawer?.id ?? null,
        registerId: saleDrawer?.registerId ?? null,
        siteId: layby.siteId,
        cashierId: actor.userId,
        cashierName: actorName(actor),
        customerId: layby.customerId,
        customerName: layby.customer.name,
        saleType: "SALE",
        subtotal: total.minus(taxAmount),
        discountAmount: 0,
        taxAmount,
        totalAmount: total,
        tenderedAmount: total,
        changeAmount: 0,
        currency: "USD",
        exchangeRate: 1,
        baseAmount: total,
        status: "POSTED",
        postedAt: now,
        notes: `Handed over from ${layby.laybyNo}`,
        tenderSummary: [{ tenderType: "LAYBY", amount: toNumberOrZero(total), currency: "USD" }],
        lines: {
          create: layby.lines.map((line) => ({
            companyId: actor.companyId,
            inventoryItemId: line.inventoryItemId,
            productId: line.productId,
            priceListId: line.priceListId,
            itemName: line.itemName,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            discountAmount: 0,
            taxAmount: line.taxAmount,
            lineTotal: line.lineTotal,
            costUnit: line.costUnit,
            costTotal: multiplyMoney(line.quantity, line.costUnit),
          })),
        },
        payments: {
          create: {
            companyId: actor.companyId,
            tenderType: "LAYBY",
            amount: total,
            currency: "USD",
            exchangeRate: 1,
            baseAmount: total,
            reference: layby.laybyNo,
          },
        },
      },
      include: { lines: true },
    });
    await tx.retailLayby.update({
      where: { id: layby.id },
      data: { status: "COLLECTED", saleId: sale.id, collectedAt: now, collectedById: actor.userId },
    });
    // CUS-01: the customer earns on the sale, as on any.
    await earnPoints(
      tx,
      { id: sale.id, companyId: actor.companyId, customerId: layby.customerId, postedAt: now, cashierName: sale.cashierName, lines: sale.lines },
      await loadLoyaltySettings(actor.companyId, tx),
    );
    await auditSalePosted(tx, {
      actor: auditActor(actor),
      saleId: sale.id,
      saleNo,
      shiftId: sale.shiftId,
      siteId: sale.siteId,
      totalAmount: total,
      currency: "USD",
      baseAmount: total,
      lineCount: sale.lines.length,
    });
    await writeRetailAuditEvent(tx, {
      actor: auditActor(actor),
      eventType: RETAIL_AUDIT_EVENTS.laybyHandedOver,
      entityType: "RetailLayby",
      entityId: layby.id,
      payload: { laybyNo: layby.laybyNo, saleNo, saleId: sale.id },
    });
    const fiscal = await assignRetailSaleFiscalDay(tx, { companyId: actor.companyId, saleId: sale.id });
    const full = await tx.retailSale.findUniqueOrThrow({ where: { id: sale.id }, include: { lines: true, payments: true } });
    return { sale: full, payment, fiscal };
  });

  if (done.payment) await postPaymentJournal(actor, layby, done.payment, payDrawer?.registerCode ?? null);
  await ensureRetailSaleAccountingPosted({ actor, sale: done.sale, registerCode: saleDrawer?.registerCode ?? null });
  await fiscaliseAfterPosting({ companyId: actor.companyId, saleId: done.sale.id, assigned: done.fiscal });
  return { laybyNo: layby.laybyNo, saleId: done.sale.id, saleNo };
}

/* ── Cancel ───────────────────────────────────────────────────────────── */

export type CancelResult = { laybyNo: string; paidBack: string; fee: string };

export async function cancelLayby(actor: LaybyActor, id: string, raw: unknown, options: Options = {}): Promise<CancelResult> {
  assertCan(actor, "delete");
  const body = parse(cancelInput, raw);
  const now = options.now ?? new Date();
  const place = options.place ?? {};
  const layby = await laybyFor(actor, id);
  const closed = closedRefusal(layby);
  if (closed) throw closed;
  const [rules, settings] = await Promise.all([loadTillRules(actor.companyId), loadPaymentSettings(actor.companyId)]);
  const paid = money(layby.paid);
  const fee = money(rules.laybyCancelFee).greaterThan(paid) ? paid : money(rules.laybyCancelFee);
  const paidBack = paid.minus(fee);
  if (paidBack.greaterThan(0) && !settings.tenders[TENDER_SWITCH[body.tender]]) {
    const message = `The shop does not take ${tenderLabel(body.tender)}.`;
    throw new LaybyRefused(400, message, { how: message });
  }
  const drawer =
    paidBack.greaterThan(0) && body.tender === "CASH"
      ? await cashDrawer(actor, place, layby.site, body.shiftId, "hand cash back")
      : await quietDrawer(actor, place, layby.siteId);

  const done = await laybyTransaction(async (tx) => {
    const locked = await lockLayby(tx, layby.id);
    const lockedClosed = closedRefusal(locked);
    if (lockedClosed) throw lockedClosed;
    if (!money(locked.paid).equals(paid)) throw new LaybyRefused(409, LAYBY_TRY_AGAIN);

    let refund = null;
    if (paidBack.greaterThan(0)) {
      let cashMovementId: string | null = null;
      if (body.tender === "CASH") {
        // Never more out of the drawer than should be in it.
        const moved = await tx.retailShift.updateMany({
          where: { id: drawer!.id, companyId: actor.companyId, status: "OPEN", expectedCash: { gte: paidBack } },
          data: { expectedCash: { decrement: paidBack } },
        });
        if (moved.count !== 1) {
          const shift = await tx.retailShift.findUnique({ where: { id: drawer!.id }, select: { expectedCash: true, status: true } });
          if (shift?.status !== "OPEN") throw new LaybyRefused(409, "That drawer is not open any more.");
          const message = `Only ${usd(money(shift.expectedCash).toFixed(2))} should be in the drawer.`;
          throw new LaybyRefused(400, message, { how: message });
        }
        const movement = await tx.retailCashMovement.create({
          data: {
            companyId: actor.companyId,
            shiftId: drawer!.id,
            type: "PAYOUT",
            amount: paidBack,
            currency: "USD",
            exchangeRate: 1,
            baseAmount: paidBack,
            reasonCode: "LAYBY_REFUND",
            reason: `${layby.laybyNo} cancelled`,
            recordedById: actor.userId,
            recordedByName: actorName(actor),
          },
          select: { id: true },
        });
        cashMovementId = movement.id;
      }
      refund = await tx.retailLaybyPayment.create({
        data: {
          companyId: actor.companyId,
          laybyId: layby.id,
          kind: "REFUND",
          tenderType: body.tender,
          amount: paidBack.negated(),
          baseAmount: paidBack.negated(),
          reference: body.reference?.trim() || null,
          shiftId: drawer?.id ?? null,
          cashMovementId,
          receivedById: actor.userId,
          createdAt: now,
        },
      });
    }

    await tx.retailLayby.update({
      where: { id: layby.id },
      data: { status: "CANCELLED", cancelledAt: now, cancelledById: actor.userId, cancelFee: fee },
    });
    // Back on the shelf.
    for (const line of layby.lines) {
      const item = await tx.inventoryItem.findUniqueOrThrow({ where: { id: line.inventoryItemId }, select: { unit: true, unitCost: true } });
      await recordStockMovement({
        companyId: actor.companyId,
        userId: actor.userId,
        itemId: line.inventoryItemId,
        movementType: "RECEIPT",
        quantity: line.quantity,
        unit: item.unit,
        // At what the line costs now: putting goods back does not reprice the shelf.
        unitCost: item.unitCost ?? undefined,
        notes: `Back from ${layby.laybyNo}, cancelled`,
        reason: "LAYBY_BACK",
        reference: layby.laybyNo,
        sourceType: "RETAIL_LAYBY_CANCEL",
        sourceId: `${layby.id}:${line.inventoryItemId}:back`,
        entryDate: now,
        tx,
      });
    }
    await writeRetailAuditEvent(tx, {
      actor: auditActor(actor),
      eventType: RETAIL_AUDIT_EVENTS.laybyCancelled,
      entityType: "RetailLayby",
      entityId: layby.id,
      payload: { laybyNo: layby.laybyNo, paidBack: paidBack.toFixed(2), fee: fee.toFixed(2), tender: body.tender },
    });
    return { refund };
  });

  const amount = toNumberOrZero(paid);
  if (amount > 0) {
    await postRetailJournal({
      companyId: actor.companyId,
      sourceType: "RETAIL_LAYBY_CANCEL",
      sourceId: layby.id,
      siteId: layby.siteId,
      registerCode: drawer?.registerCode ?? null,
      entryDate: now,
      description: `Lay-by ${layby.laybyNo} cancelled`,
      createdById: actor.userId,
      actorRole: actor.userRole ?? undefined,
      amount,
      netAmount: amount,
      taxAmount: 0,
      grossAmount: amount,
      payload: { paid: amount, fee: toNumberOrZero(fee), paidBack: toNumberOrZero(paidBack) },
      payments: done.refund ? normalizeRetailPostingPayments({ payments: [{ tenderType: body.tender, amount: toNumberOrZero(paidBack), currency: "USD" }] }) : [],
    });
  }
  return { laybyNo: layby.laybyNo, paidBack: paidBack.toFixed(2), fee: fee.toFixed(2) };
}

/* ── After the commit ─────────────────────────────────────────────────── */

/** Dr the tender, Cr Lay-by deposits held (2260): one journal per deposit or payment. */
async function postPaymentJournal(
  actor: LaybyActor,
  layby: { id: string; laybyNo: string; siteId: string },
  payment: { id: string; kind: string; tenderType: RetailTenderType; amount: Prisma.Decimal; reference: string | null; createdAt: Date },
  registerCode: string | null,
) {
  const amount = toNumberOrZero(money(payment.amount).abs());
  return postRetailJournal({
    companyId: actor.companyId,
    sourceType: "RETAIL_LAYBY_PAYMENT",
    sourceId: payment.id,
    sourceSubtype: payment.kind,
    siteId: layby.siteId,
    registerCode,
    entryDate: payment.createdAt,
    description: `Lay-by ${layby.laybyNo} ${payment.kind === "DEPOSIT" ? "deposit" : "payment"}`,
    createdById: actor.userId,
    actorRole: actor.userRole ?? undefined,
    amount,
    netAmount: amount,
    taxAmount: 0,
    grossAmount: amount,
    payload: { laybyId: layby.id },
    payments: normalizeRetailPostingPayments({ payments: [{ tenderType: payment.tenderType, amount, reference: payment.reference, currency: "USD" }] }),
  });
}

/** A WhatsApp in the outbox to the lay-by's customer (SET-07); the drain sends it once WhatsApp is connected. */
async function queueLaybyMessage(
  actor: LaybyActor,
  input: { template: string; to: string; customerId: string; laybyId: string; body: string },
) {
  await prisma.retailMessage.create({
    data: {
      companyId: actor.companyId,
      channel: "WHATSAPP",
      to: input.to,
      template: input.template,
      body: input.body,
      customerId: input.customerId,
      entityType: "RetailLayby",
      entityId: input.laybyId,
      createdById: actor.userId,
    },
  });
}
