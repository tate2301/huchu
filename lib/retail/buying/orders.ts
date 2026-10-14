import { Prisma, type RetailOrderChaseAction, type RetailOrderPayment, type RetailOrderSentVia, type VendorContactSends } from "@prisma/client";

import { writePlatformAuditEvent } from "@/lib/audit/platform";
import { reserveIdentifier } from "@/lib/id-generator";
import { money, quantity, sumMoney, toNumberOrZero } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { takeOn, VaneDraftNotTakenOn } from "@/lib/vane/drafts";
import { auditAmount, auditRecordEdited, RETAIL_AUDIT_EVENTS, writeRetailAuditEvent, type RetailAuditActor } from "@/lib/retail/audit";
import { BinRefusal, moveToBin } from "@/lib/retail/bin";
import { shopName } from "@/lib/retail/messages/send-now";
import { OrderRefused, orderStatusFor, outstanding, planOrderLineEdits } from "@/lib/retail/purchase-orders";
import { startOfDayIn } from "@/lib/reports/list-query";
import { dayKey, DEFAULT_TIME_ZONE, formatCount, formatDay, formatMoney } from "@/lib/workspace/format";

import { orderPdfLink } from "./documents";
import { lineValue, orderTotals } from "./figures";
import { listMoneyAccounts } from "./money-accounts";
import { askForMoneyIn, cancelOrderRequisitionsIn, RequisitionRefusal, tellApprovers, type Asked } from "./requisitions";
import { e164Of } from "./suppliers";
import { cancelRestMessage, dayMonth, firstWord, payingWords, type OrderChannel, type OwedLine } from "./words";

/**
 * Orders (40-buying W-30, W-34, W-70, BUY-02, BUY-03): raise one (as a draft
 * or sent), send a draft, change its lines and dates (telling the supplier or
 * not), duplicate it, close it with what came and reopen it, chase a late one,
 * cancel what is left, and send or cancel several at once. Every write is one
 * transaction with its audit; the order number is reserved before it, as a
 * rolled-back sequence would hand a number out twice. Sending queues one
 * `RetailMessage` per recipient with a signed 30-day link to the order's PDF;
 * the outbox drain delivers them.
 */

type Tx = Prisma.TransactionClient;

export class OrderRefusal extends Error {
  constructor(
    readonly status: 400 | 404 | 409,
    message: string,
    readonly fieldErrors: Record<string, string> | null = null,
  ) {
    super(message);
    this.name = "OrderRefusal";
  }
}

export const NOT_FOUND = "Order not found";
export const QUANTITY_NEEDED = "Each line needs a quantity.";
export const LINE_NEEDED = "Add at least one line.";
export const SITE_LOCKED = "Part of this order has been delivered to its branch; it cannot move to another.";
export const NO_CASH_ACCOUNT = "Add a money account in US dollars first.";

export const stoppedSupplier = (name: string) => `You stopped buying from ${name}.`;
export const alreadySent = (poNo: string) => `${poNo} has already been sent.`;
export const orderDone = (poNo: string) => `${poNo} is done. Duplicate it to order again.`;

/** What a service needs beyond the actor: the address the request came to (for the PDF link) and the clock. */
export type OrderDeps = { requestUrl: string; now?: Date };

export type LineInput = { id?: string | null; productId: string; quantity: number | string; unitCost: number | string };

export type RaiseInput = {
  supplierId: string;
  siteId: string;
  /** `YYYY-MM-DD`, a shop day. */
  expectedDate?: string | null;
  lines: LineInput[];
  payment: RetailOrderPayment;
  askForCash?: boolean;
  noteToSupplier?: string | null;
  send: boolean;
  /**
   * Vane's draft (`lib/vane/draft-tool.ts`): marked `madeByVane`, with no
   * maker, and never sent or paid for as it is raised. A person confirms it as
   * theirs when they send it.
   */
  madeByVane?: boolean;
};

export type QueuedMessage = { id: string; to: string; channel: "WHATSAPP" | "EMAIL"; name: string };

const DAY_MS = 86_400_000;

/** A shop day (`YYYY-MM-DD`) as the instant it starts. */
export const dayStart = (day: string) => startOfDayIn(day, DEFAULT_TIME_ZONE);

/** Today plus a supplier's lead time, as a shop day. */
export function expectedFor(leadTimeDays: number | null, now: Date): string {
  return dayKey(new Date(now.getTime() + (leadTimeDays ?? 0) * DAY_MS));
}

/** "Wednesday 7 October". */
function weekdayDay(value: Date): string {
  const weekday = new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: DEFAULT_TIME_ZONE }).format(value);
  return `${weekday} ${formatDay(value).replace(/ \d{4}$/, "")}`;
}

/* ── Who an order goes to ───────────────────────────────────────────────── */

export type RecipientVendor = {
  name: string;
  whatsapp: string | null;
  email: string | null;
  sendOrdersOnWhatsapp: boolean;
  contactName: string | null;
  contacts: Array<{ name: string; phone: string | null; email: string | null; sends: VendorContactSends }>;
};

export type Recipient = { name: string | null; firstName: string | null; channel: "WHATSAPP" | "EMAIL"; to: string };

/**
 * Who gets an order (W-30): each contact who is sent orders — on WhatsApp to
 * their phone when the supplier takes orders on WhatsApp, else by email —
 * else the supplier's own WhatsApp number, else its email. Nobody: by hand.
 */
export function orderRecipients(vendor: RecipientVendor): Recipient[] {
  const wantsWhatsApp = vendor.sendOrdersOnWhatsapp;
  const people: Recipient[] = [];
  for (const contact of vendor.contacts.filter((row) => row.sends === "ORDERS")) {
    const first = contact.name.trim().split(/\s+/)[0] ?? null;
    if (wantsWhatsApp && contact.phone) people.push({ name: contact.name, firstName: first, channel: "WHATSAPP", to: e164Of(contact.phone) });
    else if (contact.email) people.push({ name: contact.name, firstName: first, channel: "EMAIL", to: contact.email.trim() });
    else if (contact.phone) people.push({ name: contact.name, firstName: first, channel: "WHATSAPP", to: e164Of(contact.phone) });
  }
  if (people.length > 0) return people;
  if (wantsWhatsApp && vendor.whatsapp) return [{ name: null, firstName: null, channel: "WHATSAPP", to: e164Of(vendor.whatsapp) }];
  if (vendor.email) return [{ name: null, firstName: null, channel: "EMAIL", to: vendor.email.trim() }];
  if (vendor.whatsapp) return [{ name: null, firstName: null, channel: "WHATSAPP", to: e164Of(vendor.whatsapp) }];
  return [];
}

/** How the order goes: WhatsApp when anyone gets it there, else email, else by hand. */
export function channelOf(recipients: Recipient[]): OrderChannel {
  if (recipients.some((r) => r.channel === "WHATSAPP")) return "WHATSAPP";
  if (recipients.length > 0) return "EMAIL";
  return "BY_HAND";
}

const VENDOR_SELECT = {
  id: true,
  name: true,
  whatsapp: true,
  email: true,
  sendOrdersOnWhatsapp: true,
  contactName: true,
  payTermsDays: true,
  leadTimeDays: true,
  stoppedAt: true,
  contacts: {
    where: { removedAt: null },
    orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }],
    select: { name: true, phone: true, email: true, sends: true },
  },
} satisfies Prisma.VendorSelect;

/** A supplier's channel, for the sheet's primary ("Send on WhatsApp"). */
export async function vendorChannel(companyId: string, vendorId: string): Promise<OrderChannel> {
  const vendor = await prisma.vendor.findFirst({ where: { id: vendorId, companyId }, select: VENDOR_SELECT });
  return vendor ? channelOf(orderRecipients(vendor)) : "BY_HAND";
}

/* ── The messages ───────────────────────────────────────────────────────── */

type MessageLine = { itemName: string; quantity: Prisma.Decimal | number | string };

/**
 * The order as the supplier reads it: "Hello Tinashe, here is order PO-0031
 * from Harare Bottle Store for Harare Main Branch, expected Wednesday 7
 * October: Castle Lager 340ml 240, …. Total US$643.08, on account, 30 days.
 * <note> The order is attached." An email ends with the link instead.
 */
export function orderMessageBody(input: {
  firstName: string | null;
  poNo: string;
  shop: string;
  site: string;
  expected: Date | null;
  lines: MessageLine[];
  total: number;
  payment: RetailOrderPayment;
  payTermsDays: number | null;
  note: string | null;
  channel: "WHATSAPP" | "EMAIL";
  link: string;
}): string {
  const hello = input.firstName ? `Hello ${input.firstName}` : "Hello";
  const expected = input.expected ? `, expected ${weekdayDay(input.expected)}` : "";
  const lines = input.lines.map((line) => `${line.itemName} ${formatCount(toNumberOrZero(line.quantity))}`).join(", ");
  const note = input.note?.trim() ? ` ${input.note.trim().replace(/([^.!?])$/, "$1.")}` : "";
  const end = input.channel === "EMAIL" ? ` The order: ${input.link}` : " The order is attached.";
  return `${hello}, here is order ${input.poNo} from ${input.shop} for ${input.site}${expected}: ${lines}. Total ${formatMoney(input.total)}, ${payingWords(
    input.payment,
    input.payTermsDays,
  )}.${note}${end}`;
}

/** "PO-0003 has changed: Castle Lager 340ml 240 → 300. Expected 7 October. The new order is attached." */
export function changedMessageBody(input: {
  poNo: string;
  changes: Change[];
  expected: Date | null;
  channel: "WHATSAPP" | "EMAIL";
  link: string;
}): string {
  const parts = input.changes.map((change) =>
    change.from === null ? `${change.item} ${change.to} added` : change.to === null ? `${change.item} taken off` : `${change.item} ${change.from} → ${change.to}`,
  );
  const what = parts.length ? `: ${parts.join(", ")}.` : ".";
  const expected = input.expected ? ` Expected ${formatDay(input.expected).replace(/ \d{4}$/, "")}.` : "";
  const end = input.channel === "EMAIL" ? ` The new order: ${input.link}` : " The new order is attached.";
  return `${input.poNo} has changed${what}${expected}${end}`;
}

async function companySlug(companyId: string): Promise<string> {
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { slug: true } });
  return company?.slug ?? "";
}

/** One message per recipient, with the order's PDF; nothing for nobody. */
async function queueMessages(
  tx: Tx,
  actor: RetailAuditActor,
  input: {
    order: { id: string; poNo: string };
    recipients: Recipient[];
    template: "purchase-order" | "order-changed";
    body: (recipient: Recipient, link: string) => string;
    deps: OrderDeps;
    slug: string;
  },
): Promise<QueuedMessage[]> {
  const queued: QueuedMessage[] = [];
  if (input.recipients.length === 0) return queued;
  const link = orderPdfLink({ id: input.order.id, slug: input.slug, requestUrl: input.deps.requestUrl, now: input.deps.now });
  for (const recipient of input.recipients) {
    const created = await tx.retailMessage.create({
      data: {
        companyId: actor.companyId,
        channel: recipient.channel,
        to: recipient.to,
        template: input.template,
        body: input.body(recipient, link),
        direction: "OUT",
        entityType: "RetailPurchaseOrder",
        entityId: input.order.id,
        mediaUrl: link,
        mediaName: `${input.order.poNo}.pdf`,
        mediaKind: "DOCUMENT",
        createdById: actor.userId,
        createdAt: input.deps.now,
      },
      select: { id: true },
    });
    queued.push({ id: created.id, to: recipient.to, channel: recipient.channel, name: recipient.name ?? recipient.to });
  }
  return queued;
}

/* ── Lines ──────────────────────────────────────────────────────────────── */

type ResolvedLine = { inventoryItemId: string; productId: string; itemName: string; vatRate: Prisma.Decimal };

/** Each product's stock line at the site, with its name and VAT rate; refused when one is not kept there. */
async function linesAt(tx: Tx, companyId: string, siteId: string, siteName: string, productIds: string[]): Promise<Map<string, ResolvedLine>> {
  const ids = [...new Set(productIds)];
  if (ids.length === 0) return new Map();
  const items = await tx.inventoryItem.findMany({
    where: { siteId, productId: { in: ids }, product: { companyId } },
    orderBy: { createdAt: "asc" },
    select: { id: true, productId: true, product: { select: { name: true, defaultTaxRate: true } } },
  });
  const found = new Map<string, ResolvedLine>();
  for (const item of items) {
    if (!item.productId || !item.product || found.has(item.productId)) continue;
    found.set(item.productId, { inventoryItemId: item.id, productId: item.productId, itemName: item.product.name, vatRate: item.product.defaultTaxRate });
  }
  const missing = ids.find((id) => !found.has(id));
  if (missing) {
    const product = await tx.product.findFirst({ where: { id: missing, companyId }, select: { name: true } });
    throw new OrderRefusal(400, "Validation failed", {
      lines: product ? `${product.name} is not kept at ${siteName}.` : "One of the products is not this shop's.",
    });
  }
  return found;
}

/** Whole numbers above nought, or the sheet's sentence; a cost at nought or more. */
function checkLines(lines: LineInput[]): Array<{ id: string | null; productId: string; quantity: number; unitCost: Prisma.Decimal }> {
  return lines.map((line) => {
    const qty = Number(line.quantity);
    if (!Number.isInteger(qty) || qty <= 0) throw new OrderRefusal(400, "Validation failed", { lines: QUANTITY_NEEDED });
    const cost = Number(line.unitCost);
    if (!Number.isFinite(cost) || cost < 0) throw new OrderRefusal(400, "Validation failed", { lines: "Each line needs a cost." });
    return { id: line.id ?? null, productId: line.productId, quantity: qty, unitCost: money(cost) };
  });
}

/* ── Raise ──────────────────────────────────────────────────────────────── */

export type Raised = {
  id: string;
  poNo: string;
  status: string;
  sentVia: RetailOrderSentVia | null;
  supplier: string;
  messages: QueuedMessage[];
  /** The requisition "Ask for the cash now" made with it. */
  asked: Asked | null;
};

export async function raiseOrder(actor: RetailAuditActor, input: RaiseInput, deps: OrderDeps): Promise<Raised> {
  const companyId = actor.companyId;
  const now = deps.now ?? new Date();
  const vendor = await prisma.vendor.findFirst({ where: { id: input.supplierId, companyId }, select: VENDOR_SELECT });
  if (!vendor) throw new OrderRefusal(400, "Validation failed", { sup: "Choose who you are ordering from." });
  if (vendor.stoppedAt) throw new OrderRefusal(409, stoppedSupplier(vendor.name));
  const site = await prisma.site.findFirst({ where: { id: input.siteId, companyId, isActive: true }, select: { id: true, name: true } });
  if (!site) throw new OrderRefusal(400, "Validation failed", { site: "Choose where it is delivered." });
  const lines = checkLines(input.lines);
  if (input.madeByVane && (input.send || input.askForCash)) throw new OrderRefusal(409, "Vane only drafts: a person sends the order and asks for the cash.");
  if (input.send && lines.length === 0) throw new OrderRefusal(400, LINE_NEEDED, { lines: LINE_NEEDED });
  const note = input.noteToSupplier?.trim() || null;
  if (note && note.length > 500) throw new OrderRefusal(400, "Validation failed", { msg: "Keep it to 500 characters." });
  const expected = input.expectedDate ? dayStart(input.expectedDate) : null;
  const [shop, slug] = await Promise.all([shopName(companyId), companySlug(companyId)]);
  // "Ask for the cash now" (W-31): the order total from the first cash account in US dollars, asked in the same transaction.
  let payFromId: string | null = null;
  if (input.askForCash) {
    if (lines.length === 0) throw new OrderRefusal(400, LINE_NEEDED, { lines: LINE_NEEDED });
    const accounts = (await listMoneyAccounts(companyId)).filter((account) => account.currency.toUpperCase() === "USD");
    payFromId = (accounts.find((account) => account.kind === "CASH") ?? accounts[0])?.id ?? null;
    if (!payFromId) throw new OrderRefusal(400, NO_CASH_ACCOUNT, { ask: NO_CASH_ACCOUNT });
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const poNo = await reserveIdentifier(prisma, { companyId, entity: "RETAIL_PURCHASE_ORDER" });
    try {
      return await prisma.$transaction(async (tx) => {
        const resolved = await linesAt(tx, companyId, site.id, site.name, lines.map((line) => line.productId));
        const recipients = input.send ? orderRecipients(vendor) : [];
        const via: RetailOrderSentVia | null = input.send ? channelOf(recipients) : null;
        const order = await tx.retailPurchaseOrder.create({
          data: {
            companyId,
            poNo,
            siteId: site.id,
            vendorId: vendor.id,
            status: input.send ? "SENT" : "DRAFT",
            expectedDate: expected,
            firstExpectedDate: input.send ? expected : null,
            payment: input.payment,
            noteToSupplier: note,
            createdById: input.madeByVane ? null : actor.userId,
            madeByVane: input.madeByVane === true,
            createdAt: now,
            ...(input.send ? { sentAt: now, sentById: actor.userId, sentVia: via } : {}),
            lines: {
              create: lines.map((line, index) => {
                const item = resolved.get(line.productId)!;
                return {
                  companyId,
                  inventoryItemId: item.inventoryItemId,
                  itemName: item.itemName,
                  quantity: line.quantity,
                  unitCost: line.unitCost,
                  lineTotal: lineValue(line.quantity, line.unitCost),
                  vatRate: item.vatRate,
                  sentQuantity: input.send ? line.quantity : null,
                  sortOrder: index,
                  createdAt: now,
                };
              }),
            },
          },
          include: { lines: { orderBy: { sortOrder: "asc" } } },
        });
        const totals = orderTotals(order.lines);
        await writeRetailAuditEvent(tx, {
          actor,
          eventType: RETAIL_AUDIT_EVENTS.orderCreated,
          entityType: "RetailPurchaseOrder",
          entityId: order.id,
          payload: { poNo, supplier: vendor.name, lines: order.lines.length, value: auditAmount(totals.total) },
        });
        let asked: Asked | null = null;
        if (input.askForCash) {
          try {
            asked = await askForMoneyIn(
              tx,
              actor,
              { for: "order", orderId: order.id, amount: totals.total.toFixed(2), currency: "US$", payFromId, neededBy: input.expectedDate ?? null },
              { now, requestUrl: deps.requestUrl },
            );
          } catch (error) {
            if (error instanceof RequisitionRefusal) throw new OrderRefusal(error.status === 403 ? 409 : error.status === 404 ? 409 : error.status, error.message, error.fieldErrors ? { ask: Object.values(error.fieldErrors)[0]! } : null);
            throw error;
          }
        }
        let messages: QueuedMessage[] = [];
        if (input.send) {
          messages = await queueMessages(tx, actor, {
            order,
            recipients,
            template: "purchase-order",
            deps,
            slug,
            body: (recipient, link) =>
              orderMessageBody({
                firstName: recipient.firstName,
                poNo,
                shop,
                site: site.name,
                expected,
                lines: order.lines,
                total: toNumberOrZero(totals.total),
                payment: input.payment,
                payTermsDays: vendor.payTermsDays,
                note,
                channel: recipient.channel,
                link,
              }),
          });
          await auditSent(tx, actor, order.id, via!, messages);
        }
        return { id: order.id, poNo, status: order.status, sentVia: via, supplier: vendor.name, messages, asked };
      }).then(async (raised) => {
        if (raised.asked) await tellApprovers(actor, raised.asked, { requestUrl: deps.requestUrl });
        return raised;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") continue;
      throw error;
    }
  }
  throw new OrderRefusal(409, "No order number could be given. Try again.");
}

async function auditSent(tx: Tx, actor: RetailAuditActor, orderId: string, via: RetailOrderSentVia, messages: QueuedMessage[]) {
  await writeRetailAuditEvent(tx, {
    actor,
    eventType: RETAIL_AUDIT_EVENTS.orderSent,
    entityType: "RetailPurchaseOrder",
    entityId: orderId,
    payload: { via, to: [...new Set(messages.map((message) => message.name))] },
  });
}

/* ── Send a draft ───────────────────────────────────────────────────────── */

async function liveOrder(tx: Tx, companyId: string, id: string) {
  const order = await tx.retailPurchaseOrder.findFirst({
    where: { id, companyId, archivedAt: null },
    include: {
      lines: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      vendor: { select: VENDOR_SELECT },
      site: { select: { id: true, name: true } },
    },
  });
  if (!order) throw new OrderRefusal(404, NOT_FOUND);
  return order;
}

export type Sent = { id: string; poNo: string; supplier: string; sentVia: RetailOrderSentVia; messages: QueuedMessage[] };

/**
 * Sends a draft to its supplier. Vane's draft goes only when the person
 * sending confirms it as theirs (`asMine`), which makes them its maker in the
 * same transaction; without it, it is refused (409).
 */
export async function sendOrder(
  actor: RetailAuditActor,
  id: string,
  via: RetailOrderSentVia | null,
  deps: OrderDeps,
  confirm: { asMine?: boolean } = {},
): Promise<Sent> {
  const now = deps.now ?? new Date();
  const [shop, slug] = await Promise.all([shopName(actor.companyId), companySlug(actor.companyId)]);
  return prisma.$transaction(async (tx) => {
    const order = await liveOrder(tx, actor.companyId, id);
    if (order.status !== "DRAFT") throw new OrderRefusal(409, alreadySent(order.poNo));
    let maker: { createdById?: string };
    try {
      maker = takeOn(order, { asMine: confirm.asMine, userId: actor.userId, what: order.poNo, verb: "send" });
    } catch (error) {
      if (error instanceof VaneDraftNotTakenOn) throw new OrderRefusal(409, error.message);
      throw error;
    }
    if (order.lines.length === 0) throw new OrderRefusal(400, LINE_NEEDED);
    if (order.vendor.stoppedAt) throw new OrderRefusal(409, stoppedSupplier(order.vendor.name));
    const recipients = via === "BY_HAND" ? [] : orderRecipients(order.vendor).filter((r) => !via || r.channel === via);
    const sentVia = channelOf(recipients);
    // Claimed first: a second send of the same draft finds it sent.
    const claimed = await tx.retailPurchaseOrder.updateMany({
      where: { id: order.id, status: "DRAFT" },
      data: { status: "SENT", sentAt: now, sentById: actor.userId, sentVia, firstExpectedDate: order.expectedDate, ...maker },
    });
    if (claimed.count === 0) throw new OrderRefusal(409, alreadySent(order.poNo));
    for (const line of order.lines) {
      await tx.retailPurchaseOrderLine.update({ where: { id: line.id }, data: { sentQuantity: line.quantity } });
    }
    const totals = orderTotals(order.lines);
    const messages = await queueMessages(tx, actor, {
      order,
      recipients,
      template: "purchase-order",
      deps,
      slug,
      body: (recipient, link) =>
        orderMessageBody({
          firstName: recipient.firstName,
          poNo: order.poNo,
          shop,
          site: order.site.name,
          expected: order.expectedDate,
          lines: order.lines,
          total: toNumberOrZero(totals.total),
          payment: order.payment,
          payTermsDays: order.vendor.payTermsDays,
          note: order.noteToSupplier,
          channel: recipient.channel,
          link,
        }),
    });
    await auditSent(tx, actor, order.id, sentVia, messages);
    return { id: order.id, poNo: order.poNo, supplier: order.vendor.name, sentVia, messages };
  });
}

/* ── Change ─────────────────────────────────────────────────────────────── */

export type Change = { item: string; from: number | null; to: number | null };

export type ChangeInput = {
  expectedDate?: string | null;
  siteId?: string;
  lines?: LineInput[];
  tell?: boolean;
  supplierId?: string;
  payment?: RetailOrderPayment;
};

export type Changed = { id: string; poNo: string; supplier: string; told: boolean; changes: Change[]; messages: QueuedMessage[] };

const DONE = new Set(["RECEIVED", "CLOSED", "CANCELLED"]);

export async function changeOrder(actor: RetailAuditActor, id: string, input: ChangeInput, deps: OrderDeps): Promise<Changed> {
  const companyId = actor.companyId;
  const slug = await companySlug(companyId);
  const incoming = input.lines ? checkLines(input.lines) : null;
  return prisma.$transaction(async (tx) => {
    const order = await liveOrder(tx, companyId, id);
    if (DONE.has(order.status)) throw new OrderRefusal(409, orderDone(order.poNo));
    const anythingCame = order.lines.some((line) => quantity(line.receivedQuantity).greaterThan(0));
    const draft = order.status === "DRAFT";

    // Where it goes: locked once anything came; a draft's lines follow it to the new site.
    let site = order.site;
    if (input.siteId && input.siteId !== order.siteId) {
      if (anythingCame) throw new OrderRefusal(409, SITE_LOCKED);
      const next = await tx.site.findFirst({ where: { id: input.siteId, companyId, isActive: true }, select: { id: true, name: true } });
      if (!next) throw new OrderRefusal(400, "Validation failed", { site: "Choose where it is delivered." });
      site = next;
    }

    // Who it is from: drafts only.
    let vendor = order.vendor;
    if (input.supplierId && input.supplierId !== order.vendorId) {
      if (!draft) throw new OrderRefusal(409, `${order.poNo} has been sent to ${order.vendor.name}. Its supplier cannot change.`);
      const next = await tx.vendor.findFirst({ where: { id: input.supplierId, companyId }, select: VENDOR_SELECT });
      if (!next) throw new OrderRefusal(400, "Validation failed", { sup: "Choose who you are ordering from." });
      if (next.stoppedAt) throw new OrderRefusal(409, stoppedSupplier(next.name));
      vendor = next;
    }

    const changes: Change[] = [];
    if (incoming) {
      if (incoming.length === 0 && !draft) throw new OrderRefusal(400, LINE_NEEDED, { lines: LINE_NEEDED });
      let plan: ReturnType<typeof planOrderLineEdits<(typeof incoming)[number]>>;
      try {
        plan = planOrderLineEdits(order.lines, incoming);
      } catch (error) {
        if (error instanceof OrderRefused) throw new OrderRefusal(409, error.message);
        throw error;
      }
      const resolved = await linesAt(tx, companyId, site.id, site.name, plan.create.map((line) => line.productId));
      const byId = new Map(order.lines.map((line) => [line.id, line]));
      for (const { id: lineId, line } of plan.update) {
        const current = byId.get(lineId)!;
        const from = toNumberOrZero(current.quantity);
        if (from !== line.quantity) changes.push({ item: current.itemName, from, to: line.quantity });
        await tx.retailPurchaseOrderLine.update({
          where: { id: lineId },
          data: { quantity: line.quantity, unitCost: line.unitCost, lineTotal: lineValue(line.quantity, line.unitCost) },
        });
      }
      const sortStart = order.lines.reduce((top, line) => Math.max(top, line.sortOrder), -1) + 1;
      for (const [index, line] of plan.create.entries()) {
        const item = resolved.get(line.productId)!;
        changes.push({ item: item.itemName, from: null, to: line.quantity });
        await tx.retailPurchaseOrderLine.create({
          data: {
            companyId,
            purchaseOrderId: order.id,
            inventoryItemId: item.inventoryItemId,
            itemName: item.itemName,
            quantity: line.quantity,
            unitCost: line.unitCost,
            lineTotal: lineValue(line.quantity, line.unitCost),
            vatRate: item.vatRate,
            sortOrder: sortStart + index,
          },
        });
      }
      if (plan.remove.length) {
        for (const lineId of plan.remove) changes.push({ item: byId.get(lineId)!.itemName, from: toNumberOrZero(byId.get(lineId)!.quantity), to: null });
        await tx.retailPurchaseOrderLine.deleteMany({ where: { id: { in: plan.remove } } });
      }
    }

    // A draft moved to another site: each line becomes that site's stock line of the same product.
    if (site.id !== order.siteId) {
      const lines = await tx.retailPurchaseOrderLine.findMany({ where: { purchaseOrderId: order.id }, select: { id: true, inventoryItemId: true } });
      const products = await tx.inventoryItem.findMany({
        where: { id: { in: lines.map((line) => line.inventoryItemId).filter((v): v is string => Boolean(v)) } },
        select: { id: true, productId: true },
      });
      const productOf = new Map(products.map((row) => [row.id, row.productId]));
      const moved = await linesAt(
        tx,
        companyId,
        site.id,
        site.name,
        lines.map((line) => productOf.get(line.inventoryItemId ?? "")).filter((v): v is string => Boolean(v)),
      );
      for (const line of lines) {
        const productId = productOf.get(line.inventoryItemId ?? "");
        if (productId) await tx.retailPurchaseOrderLine.update({ where: { id: line.id }, data: { inventoryItemId: moved.get(productId)!.inventoryItemId } });
      }
    }

    const expected = input.expectedDate === undefined ? order.expectedDate : input.expectedDate ? dayStart(input.expectedDate) : null;
    const expectedChanged = (expected?.getTime() ?? null) !== (order.expectedDate?.getTime() ?? null);
    const lines = await tx.retailPurchaseOrderLine.findMany({ where: { purchaseOrderId: order.id }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
    const status = orderStatusFor(lines, { closed: false, sent: !draft });
    await tx.retailPurchaseOrder.update({
      where: { id: order.id },
      data: {
        status,
        siteId: site.id,
        vendorId: vendor.id,
        expectedDate: expected,
        ...(input.payment ? { payment: input.payment } : {}),
      },
    });

    const tell = Boolean(input.tell) && !draft && (changes.length > 0 || expectedChanged);
    let messages: QueuedMessage[] = [];
    if (tell) {
      for (const line of lines) await tx.retailPurchaseOrderLine.update({ where: { id: line.id }, data: { sentQuantity: line.quantity } });
      messages = await queueMessages(tx, actor, {
        order,
        recipients: orderRecipients(vendor),
        template: "order-changed",
        deps,
        slug,
        body: (recipient, link) => changedMessageBody({ poNo: order.poNo, changes, expected, channel: recipient.channel, link }),
      });
    }

    if (incoming) {
      // The sheet: one event for the lines and the date together.
      if (changes.length > 0 || expectedChanged) {
        await writeRetailAuditEvent(tx, {
          actor,
          eventType: RETAIL_AUDIT_EVENTS.orderChanged,
          entityType: "RetailPurchaseOrder",
          entityId: order.id,
          payload: {
            poNo: order.poNo,
            changes,
            expected: expected ? dayKey(expected) : null,
            expectedWords: expectedChanged && expected ? formatDay(expected).replace(/ \d{4}$/, "") : null,
            told: tell,
            toldName: tell ? firstWord(vendor.name) : null,
          },
        });
      }
    } else {
      // The rail: one field at a time.
      const edits: Array<{ field: string; label: string; from: string | null; to: string | null }> = [];
      if (expectedChanged) {
        edits.push({ field: "expectedDate", label: "Expected", from: order.expectedDate ? formatDay(order.expectedDate) : null, to: expected ? formatDay(expected) : null });
      }
      if (site.id !== order.siteId) edits.push({ field: "siteId", label: "Site", from: order.site.name, to: site.name });
      if (vendor.id !== order.vendorId) edits.push({ field: "supplierId", label: "Supplier", from: order.vendor.name, to: vendor.name });
      if (input.payment && input.payment !== order.payment) {
        const words = { ON_ACCOUNT: "On account", CASH_ON_DELIVERY: "Cash on delivery" } as const;
        edits.push({ field: "payment", label: "Pays", from: words[order.payment], to: words[input.payment] });
      }
      for (const edit of edits) {
        await auditRecordEdited(tx, { actor, entityType: "RetailPurchaseOrder", entityId: order.id, ...edit });
      }
    }
    return { id: order.id, poNo: order.poNo, supplier: vendor.name, told: tell, changes, messages };
  });
}

/* ── Duplicate ──────────────────────────────────────────────────────────── */

/** What a product costs from a supplier today: the last delivered cost from them, else the stock line's cost. */
export async function costsToday(
  db: Tx | typeof prisma,
  companyId: string,
  vendorId: string,
  items: Array<{ inventoryItemId: string; productId: string; unitCost: Prisma.Decimal | null }>,
): Promise<Map<string, Prisma.Decimal>> {
  const last = await db.retailGoodsReceiptLine.findMany({
    where: {
      companyId,
      inventoryItem: { productId: { in: items.map((item) => item.productId) } },
      receipt: { vendorId, status: "POSTED" },
    },
    orderBy: { receipt: { postedAt: "desc" } },
    select: { unitCost: true, inventoryItem: { select: { productId: true } } },
  });
  const delivered = new Map<string, Prisma.Decimal>();
  for (const line of last) {
    const productId = line.inventoryItem?.productId;
    if (productId && !delivered.has(productId)) delivered.set(productId, line.unitCost);
  }
  return new Map(items.map((item) => [item.productId, delivered.get(item.productId) ?? item.unitCost ?? money(0)]));
}

export async function duplicateOrder(actor: RetailAuditActor, id: string, deps: OrderDeps): Promise<{ id: string; poNo: string; from: string }> {
  const companyId = actor.companyId;
  const now = deps.now ?? new Date();
  const source = await prisma.retailPurchaseOrder.findFirst({
    where: { id, companyId },
    include: {
      lines: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], include: { inventoryItem: { select: { id: true, productId: true, unitCost: true, product: { select: { defaultTaxRate: true, name: true } } } } } },
      vendor: { select: { id: true, name: true, stoppedAt: true, leadTimeDays: true } },
    },
  });
  if (!source) throw new OrderRefusal(404, NOT_FOUND);
  if (source.vendor.stoppedAt) throw new OrderRefusal(409, stoppedSupplier(source.vendor.name));
  const lines = source.lines.filter((line) => line.inventoryItem?.productId);
  const costs = await costsToday(
    prisma,
    companyId,
    source.vendorId,
    lines.map((line) => ({ inventoryItemId: line.inventoryItem!.id, productId: line.inventoryItem!.productId!, unitCost: line.inventoryItem!.unitCost })),
  );
  const expected = dayStart(expectedFor(source.vendor.leadTimeDays, now));
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const poNo = await reserveIdentifier(prisma, { companyId, entity: "RETAIL_PURCHASE_ORDER" });
    try {
      return await prisma.$transaction(async (tx) => {
        const created = await tx.retailPurchaseOrder.create({
          data: {
            companyId,
            poNo,
            siteId: source.siteId,
            vendorId: source.vendorId,
            status: "DRAFT",
            expectedDate: expected,
            payment: source.payment,
            noteToSupplier: source.noteToSupplier,
            createdById: actor.userId,
            duplicatedFromId: source.id,
            createdAt: now,
            lines: {
              create: lines.map((line, index) => {
                const cost = costs.get(line.inventoryItem!.productId!) ?? money(0);
                return {
                  companyId,
                  inventoryItemId: line.inventoryItem!.id,
                  itemName: line.inventoryItem!.product?.name ?? line.itemName,
                  quantity: line.quantity,
                  unitCost: cost,
                  lineTotal: lineValue(line.quantity, cost),
                  vatRate: line.inventoryItem!.product?.defaultTaxRate ?? line.vatRate,
                  sortOrder: index,
                };
              }),
            },
          },
          select: { id: true, poNo: true },
        });
        await writeRetailAuditEvent(tx, {
          actor,
          eventType: RETAIL_AUDIT_EVENTS.orderDuplicated,
          entityType: "RetailPurchaseOrder",
          entityId: created.id,
          payload: { poNo, from: source.poNo, fromId: source.id },
        });
        return { id: created.id, poNo: created.poNo, from: source.poNo };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") continue;
      throw error;
    }
  }
  throw new OrderRefusal(409, "No order number could be given. Try again.");
}

/* ── Close with what came, reopen ───────────────────────────────────────── */

export const ALREADY_CLOSED = "This order is already closed";
export const NOTHING_TO_CLOSE = "Everything on this order has come; there is nothing to close";
export const NOT_CLOSED = "This order is not closed";

/** "480 units": how many are no longer, or again, expected. */
const unitsWords = (n: number) => `${formatCount(n)} ${n === 1 ? "unit is" : "units are"}`;

export async function closeOrder(actor: RetailAuditActor, id: string, note: string | null, now = new Date()): Promise<{ poNo: string; units: number; message: string }> {
  return prisma.$transaction(async (tx) => {
    const order = await liveOrder(tx, actor.companyId, id);
    if (order.status === "CLOSED") throw new OrderRefusal(409, ALREADY_CLOSED);
    if (order.status === "RECEIVED") throw new OrderRefusal(409, NOTHING_TO_CLOSE);
    if (order.status === "DRAFT") throw new OrderRefusal(409, `${order.poNo} has not been sent. Remove it instead.`);
    if (order.status === "CANCELLED") throw new OrderRefusal(409, `${order.poNo} was cancelled.`);
    const owed = order.lines.filter((line) => outstanding(line).greaterThan(0));
    const units = owed.reduce((sum, line) => sum + toNumberOrZero(outstanding(line)), 0);
    await tx.retailPurchaseOrderLine.updateMany({ where: { id: { in: owed.map((line) => line.id) } }, data: { closedShortAt: now, closedShortById: actor.userId } });
    await tx.retailPurchaseOrder.update({
      where: { id: order.id },
      data: { status: "CLOSED", closedAt: now, closedById: actor.userId, closeNote: note?.trim() || null },
    });
    await writeRetailAuditEvent(tx, {
      actor,
      eventType: RETAIL_AUDIT_EVENTS.orderClosed,
      entityType: "RetailPurchaseOrder",
      entityId: order.id,
      reason: note?.trim() || null,
      payload: {
        poNo: order.poNo,
        supplier: order.vendor.name,
        owedValue: auditAmount(sumMoney(owed.map((line) => lineValue(outstanding(line), line.unitCost)))),
        owed: owed.map((line) => ({ itemName: line.itemName, quantity: outstanding(line).toString() })),
      },
    });
    return { poNo: order.poNo, units, message: `${order.poNo} closed with what came. ${unitsWords(units)} no longer expected.` };
  });
}

export async function reopenOrder(actor: RetailAuditActor, id: string): Promise<{ poNo: string; units: number; message: string }> {
  return prisma.$transaction(async (tx) => {
    const order = await liveOrder(tx, actor.companyId, id);
    if (order.status !== "CLOSED") throw new OrderRefusal(409, NOT_CLOSED);
    const open = order.lines.map((line) => ({ ...line, closedShortAt: null }));
    const units = open.reduce((sum, line) => sum + toNumberOrZero(outstanding(line)), 0);
    await tx.retailPurchaseOrderLine.updateMany({ where: { purchaseOrderId: order.id }, data: { closedShortAt: null, closedShortById: null } });
    await tx.retailPurchaseOrder.update({
      where: { id: order.id },
      data: { status: orderStatusFor(open, { closed: false, sent: true }), closedAt: null, closedById: null, closeNote: null },
    });
    await writeRetailAuditEvent(tx, {
      actor,
      eventType: RETAIL_AUDIT_EVENTS.orderReopened,
      entityType: "RetailPurchaseOrder",
      entityId: order.id,
      payload: { poNo: order.poNo, closedAt: order.closedAt?.toISOString() ?? null },
    });
    return { poNo: order.poNo, units, message: `${order.poNo} reopened. ${unitsWords(units)} expected again.` };
  });
}

/* ── A failed message, again ────────────────────────────────────────────── */

/** "Send again": a failed message of this order back in the outbox. */
export async function sendAgain(actor: RetailAuditActor, orderId: string, messageId: string): Promise<void> {
  const moved = await prisma.retailMessage.updateMany({
    where: { id: messageId, companyId: actor.companyId, entityType: "RetailPurchaseOrder", entityId: orderId, direction: "OUT", status: "FAILED" },
    data: { status: "QUEUED", attempts: 0, lastError: null },
  });
  if (moved.count === 0) throw new OrderRefusal(409, "Only a message that failed can be sent again.");
}


/* ── Chase a late order (W-34) ──────────────────────────────────────────── */

export const PROMISE_FROM_TODAY = "Promise a date from today on.";
export const hasAllCome = (poNo: string) => `${poNo} has all come.`;

/** Why a chase or a cancel of the rest is refused: the order is not waiting for anything. */
function notWaiting(order: { poNo: string; status: string }): string {
  if (order.status === "DRAFT") return `${order.poNo} has not been sent yet.`;
  if (order.status === "RECEIVED") return hasAllCome(order.poNo);
  return orderDone(order.poNo);
}

const waiting = (status: string) => status === "SENT" || status === "PARTIAL";

/** What each line still owes, by name. */
const owedLines = (lines: Array<{ itemName: string; quantity: Prisma.Decimal; receivedQuantity: Prisma.Decimal; closedShortAt: Date | null }>): OwedLine[] =>
  lines.map((line) => ({ name: line.itemName, outstanding: toNumberOrZero(outstanding(line)) }));

/**
 * Who a reminder goes to: the chosen contact (their phone on WhatsApp, else
 * their email), or with none chosen the supplier's own WhatsApp number, else
 * its email. Null: nowhere to send it.
 */
export function chaseRecipient(
  vendor: { whatsapp: string | null; email: string | null },
  contact: { name: string; phone: string | null; email: string | null } | null,
): Recipient | null {
  if (contact) {
    const first = firstWord(contact.name) || null;
    if (contact.phone) return { name: contact.name, firstName: first, channel: "WHATSAPP", to: e164Of(contact.phone) };
    if (contact.email) return { name: contact.name, firstName: first, channel: "EMAIL", to: contact.email.trim() };
    return null;
  }
  if (vendor.whatsapp) return { name: null, firstName: null, channel: "WHATSAPP", to: e164Of(vendor.whatsapp) };
  if (vendor.email) return { name: null, firstName: null, channel: "EMAIL", to: vendor.email.trim() };
  return null;
}

/** One text message about an order, in the outbox: no attachment. */
async function queueText(
  tx: Tx,
  input: { companyId: string; createdById: string | null; orderId: string; recipient: Recipient; template: "order-reminder" | "order-cancel-rest"; body: string; now: Date },
): Promise<QueuedMessage> {
  const created = await tx.retailMessage.create({
    data: {
      companyId: input.companyId,
      channel: input.recipient.channel,
      to: input.recipient.to,
      template: input.template,
      body: input.body,
      direction: "OUT",
      entityType: "RetailPurchaseOrder",
      entityId: input.orderId,
      createdById: input.createdById,
      createdAt: input.now,
    },
    select: { id: true },
  });
  return { id: created.id, to: input.recipient.to, channel: input.recipient.channel, name: input.recipient.name ?? input.recipient.to };
}

export type ChaseInput = {
  /** A contact of the order's supplier; null sends to the supplier's own number. */
  contactId: string | null;
  message: string;
  /** `YYYY-MM-DD`, a shop day from today on. */
  promisedFor: string;
  then: RetailOrderChaseAction;
};

export type Chased = { id: string; poNo: string; supplier: string; promisedFor: string; message: QueuedMessage; toast: string };

/**
 * "Send a reminder" (W-34): the message goes to the chosen person, the order
 * is now expected on the day promised (the first expected day stays, so the
 * order is as late as it was), and what happens if it does not come is kept
 * for the morning's follow-ups.
 */
export async function chaseOrder(actor: RetailAuditActor, id: string, input: ChaseInput, now = new Date()): Promise<Chased> {
  const body = input.message.trim();
  if (!body) throw new OrderRefusal(400, "Validation failed", { msg: "Write the message." });
  if (body.length > 1000) throw new OrderRefusal(400, "Validation failed", { msg: "Keep it to 1,000 characters." });
  if (input.promisedFor < dayKey(now)) throw new OrderRefusal(400, "Validation failed", { new: PROMISE_FROM_TODAY });
  return prisma.$transaction(async (tx) => {
    const order = await liveOrder(tx, actor.companyId, id);
    if (!waiting(order.status)) throw new OrderRefusal(409, notWaiting(order));
    const contact = input.contactId
      ? await tx.vendorContact.findFirst({
          where: { id: input.contactId, vendorId: order.vendorId, companyId: actor.companyId, removedAt: null },
          select: { name: true, phone: true, email: true },
        })
      : null;
    if (input.contactId && !contact) throw new OrderRefusal(400, "Validation failed", { to: `Choose someone at ${order.vendor.name}.` });
    const recipient = chaseRecipient(order.vendor, contact);
    if (!recipient) {
      throw new OrderRefusal(409, contact ? `${contact.name} has no phone number or email.` : `${order.vendor.name} has no WhatsApp number or email.`);
    }
    const message = await queueText(tx, {
      companyId: actor.companyId,
      createdById: actor.userId,
      orderId: order.id,
      recipient,
      template: "order-reminder",
      body,
      now,
    });
    await tx.retailPurchaseOrder.update({
      where: { id: order.id },
      data: { expectedDate: dayStart(input.promisedFor), chaseAction: input.then, chasedAt: now, chasedById: actor.userId, followUpDoneAt: null },
    });
    await writeRetailAuditEvent(tx, {
      actor,
      eventType: RETAIL_AUDIT_EVENTS.orderChased,
      entityType: "RetailPurchaseOrder",
      entityId: order.id,
      payload: { poNo: order.poNo, supplier: order.vendor.name, to: recipient.name ?? recipient.to, channel: recipient.channel, promisedFor: input.promisedFor, then: input.then },
    });
    return {
      id: order.id,
      poNo: order.poNo,
      supplier: order.vendor.name,
      promisedFor: input.promisedFor,
      message,
      toast: `Reminder sent. Expected date moved to ${dayMonth(input.promisedFor)}.`,
    };
  });
}

/* ── Cancel what is left (W-34) ─────────────────────────────────────────── */

/** Who cancels: a person, or nobody when the morning's follow-ups do it ("Automatic"). */
export type CancelActor = { companyId: string; userId: string | null; userName?: string | null; userRole?: string | null };

export type RestCancelled = { id: string; poNo: string; supplier: string; status: "RECEIVED" | "CANCELLED"; units: number; told: boolean; message: string };

/**
 * "Cancel what is left": every line comes down to what came, so nothing more
 * is expected; nothing came at all and the order is cancelled, else it is
 * received. The supplier is always asked to cancel the rest (the route's
 * `{ tell: true }`). A requisition for the order not yet paid out is
 * cancelled with it, and its asker told.
 */
export async function cancelRest(
  actor: CancelActor,
  id: string,
  options: { automatic?: boolean; now?: Date } = {},
): Promise<RestCancelled> {
  const now = options.now ?? new Date();
  const automatic = options.automatic === true;
  const by = automatic ? null : actor.userId;
  const done = await prisma.$transaction(async (tx) => {
    const order = await liveOrder(tx, actor.companyId, id);
    if (!waiting(order.status)) throw new OrderRefusal(409, notWaiting(order));
    const owed = owedLines(order.lines);
    const units = owed.reduce((sum, line) => sum + line.outstanding, 0);
    const value = sumMoney(order.lines.map((line) => lineValue(outstanding(line), line.unitCost)));
    const anythingCame = order.lines.some((line) => quantity(line.receivedQuantity).greaterThan(0));
    const status = anythingCame ? ("RECEIVED" as const) : ("CANCELLED" as const);
    // Claimed first: a second cancel of the same order finds it done.
    const claimed = await tx.retailPurchaseOrder.updateMany({
      where: { id: order.id, status: { in: ["SENT", "PARTIAL"] } },
      data: { status, ...(status === "CANCELLED" ? { cancelledAt: now, cancelledById: by } : {}) },
    });
    if (claimed.count === 0) throw new OrderRefusal(409, notWaiting({ poNo: order.poNo, status: "RECEIVED" }));
    for (const line of order.lines) {
      await tx.retailPurchaseOrderLine.update({
        where: { id: line.id },
        data: { quantity: line.receivedQuantity, lineTotal: lineValue(line.receivedQuantity, line.unitCost), closedShortAt: null, closedShortById: null },
      });
    }
    const body = cancelRestMessage(order.poNo, owed);
    const told: QueuedMessage[] = [];
    for (const recipient of orderRecipients(order.vendor)) {
      told.push(await queueText(tx, { companyId: actor.companyId, createdById: by, orderId: order.id, recipient, template: "order-cancel-rest", body, now }));
    }
    await writePlatformAuditEvent(
      {
        companyId: actor.companyId,
        actorId: by,
        eventType: RETAIL_AUDIT_EVENTS.orderRestCancelled,
        entityType: "RetailPurchaseOrder",
        entityId: order.id,
        payload: {
          actorRole: automatic ? null : (actor.userRole ?? null),
          actorName: automatic ? null : (actor.userName ?? null),
          poNo: order.poNo,
          supplier: order.vendor.name,
          units,
          value: auditAmount(value),
          lines: owed.filter((line) => line.outstanding > 0).map((line) => ({ itemName: line.name, quantity: String(line.outstanding) })),
          status,
          told: told.map((message) => message.name),
          automatic,
        },
      },
      tx,
    );
    // Its money not yet paid out is no longer asked for (W-72).
    const afters = await cancelOrderRequisitionsIn(tx, actor, order.id, now);
    const short = firstWord(order.vendor.name);
    return {
      afters,
      result: {
        id: order.id,
        poNo: order.poNo,
        supplier: order.vendor.name,
        status,
        units,
        told: told.length > 0,
        message: `What was left of ${order.poNo} is cancelled.${told.length > 0 ? ` ${short} has been told.` : ""}`,
      },
    };
  });
  for (const after of done.afters) await after();
  return done.result;
}

/* ── Several at once (Orders' bulk) ─────────────────────────────────────── */

export type Skipped = { poNo: string; why: string };

const plural = (n: number, one: string, many: string) => `${formatCount(n)} ${n === 1 ? one : many}`;

/** The ticked orders of this shop, in number order. */
async function ordersOf(companyId: string, ids: string[]) {
  return prisma.retailPurchaseOrder.findMany({
    where: { id: { in: ids }, companyId, archivedAt: null },
    orderBy: { poNo: "asc" },
    select: { id: true, poNo: true, status: true },
  });
}

/** A skipped order as the toast says it: "PO-0007 has no lines.", "PO-0003 was already sent.". */
const skippedWords = (skipped: Skipped[]) =>
  skipped.map((row) => (row.why === "Already sent" ? `${row.poNo} was already sent.` : row.why === "Already done" ? `${row.poNo} was already done.` : row.why)).join(" ");

/**
 * "Send to suppliers": each ticked draft with lines goes as its own send
 * does. A draft with no lines, or one already sent, is skipped and said.
 */
export async function sendOrders(
  actor: RetailAuditActor,
  ids: string[],
  deps: OrderDeps,
): Promise<{ sent: string[]; skipped: Skipped[]; message: string }> {
  const sent: string[] = [];
  const skipped: Skipped[] = [];
  for (const order of await ordersOf(actor.companyId, ids)) {
    if (order.status !== "DRAFT") {
      skipped.push({ poNo: order.poNo, why: "Already sent" });
      continue;
    }
    try {
      await sendOrder(actor, order.id, null, deps);
      sent.push(order.poNo);
    } catch (error) {
      if (!(error instanceof OrderRefusal)) throw error;
      const why = error.message === LINE_NEEDED ? `${order.poNo} has no lines.` : error.message === alreadySent(order.poNo) ? "Already sent" : error.message;
      skipped.push({ poNo: order.poNo, why });
    }
  }
  const lead = `${plural(sent.length, "order", "orders")} sent.`;
  return { sent, skipped, message: skipped.length ? `${lead} ${skippedWords(skipped)}` : lead };
}

/**
 * "Cancel": drafts go to the bin (with the right to remove them), sent and
 * part-delivered orders have what is left cancelled and their suppliers told,
 * and orders already done are left alone.
 */
export async function cancelOrders(
  actor: RetailAuditActor,
  ids: string[],
  options: { canRemoveDrafts: boolean; now?: Date },
): Promise<{ binned: string[]; cancelled: string[]; skipped: Skipped[]; message: string }> {
  const binned: string[] = [];
  const cancelled: string[] = [];
  const skipped: Skipped[] = [];
  for (const order of await ordersOf(actor.companyId, ids)) {
    try {
      if (order.status === "DRAFT") {
        if (!options.canRemoveDrafts) {
          skipped.push({ poNo: order.poNo, why: `Your role cannot remove a draft; ${order.poNo} is kept.` });
          continue;
        }
        await moveToBin(actor, { kind: "order", id: order.id }, options.now);
        binned.push(order.poNo);
      } else if (waiting(order.status)) {
        await cancelRest(actor, order.id, { now: options.now });
        cancelled.push(order.poNo);
      } else {
        skipped.push({ poNo: order.poNo, why: "Already done" });
      }
    } catch (error) {
      if (error instanceof OrderRefusal || error instanceof BinRefusal) skipped.push({ poNo: order.poNo, why: error.message });
      else throw error;
    }
  }
  const parts = [
    ...(binned.length ? [`${plural(binned.length, "draft", "drafts")} in the bin`] : []),
    ...(cancelled.length ? [`${plural(cancelled.length, "order", "orders")} cancelled and ${cancelled.length === 1 ? "its supplier" : "their suppliers"} told`] : []),
  ];
  const lead = parts.length ? `${parts.join(", ")}.` : "Nothing cancelled.";
  return { binned, cancelled, skipped, message: skipped.length ? `${lead} ${skippedWords(skipped)}` : lead };
}
