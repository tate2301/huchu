import { z } from "zod";

import { chaseOrder, OrderRefusal, raiseOrder, sendOrder } from "@/lib/retail/buying/orders";
import { buyingActor } from "@/lib/retail/buying/routes";
import { sentWords } from "@/lib/retail/buying/words";
import { signOffShift, SignOffRefused } from "@/lib/retail/floor/sign-off";
import { canRetailSessionDo } from "@/lib/retail/permission-matrix";
import { promotionActor } from "@/lib/retail/promotions/routes";
import { createPromotion, PromotionRefusal, promotionInput, type PromotionInput } from "@/lib/retail/promotions/service";

import { listOf, longDay, routeGate } from "@/lib/operations/gate";
import { OperationRefused, type OperationActor, type Operation } from "@/lib/operations/types";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Write it as a day, like 2026-10-30.");

/** The order routes' checks: the route, then what the person's retail role may do with orders. */
function refuseOrders(context: OperationActor, path: string, action: "create" | "update"): string | null {
  const route = routeGate(context, path);
  if (route) return route;
  return canRetailSessionDo(context.session, "retail.purchasing", action) ? null : "Your role cannot order stock.";
}

/** An order refused by Retail, as the sentence (and the field's own words) a person can act on. */
async function asRetail<T>(act: () => Promise<T>): Promise<T> {
  try {
    return await act();
  } catch (error) {
    if (error instanceof OrderRefusal) {
      const field = error.fieldErrors ? Object.values(error.fieldErrors)[0] : null;
      throw new OperationRefused(field ?? error.message);
    }
    throw error;
  }
}

const lookInto = {
  key: "retail.shift.look_into",
  name: "Flag a shift to look into",
  risk: "change",
  product: "retail",
  description:
    "Sign off a till shift whose cash-up did not balance as Look into it, with a note saying what to check. The shift's own sign-off: it needs a person who may approve cash control, and nobody signs off their own drawer.",
  input: z.object({
    shiftId: z.string().min(1),
    shiftNo: z.string().min(1).describe('As the shift shows it: "SH-0412".'),
    note: z.string().trim().min(1).max(500),
  }),
  fields: [{ name: "note", label: "What to look into", type: "text", multiline: true }],
  verb: () => "Look into it",
  title: (p) => `Sign off ${p.shiftNo} as Look into it: ${p.note}`,
  target: () => "/retail/shifts?state=needs-sign-off",
  authorize: (context) => routeGate(context, "/api/v2/retail/shifts"),
  async run(context, p) {
    try {
      const done = await signOffShift(
        { user: { id: context.userId, companyId: context.companyId, role: context.role, name: context.session.user.name } },
        p.shiftId,
        { outcome: "LOOK_INTO", note: p.note },
      );
      return `${done.shiftNo} is signed off to be looked into${done.amount ? `, ${done.amount}` : ""}.`;
    } catch (error) {
      if (error instanceof SignOffRefused) throw new OperationRefused(error.message);
      throw error;
    }
  },
} satisfies Operation<{ shiftId: string; shiftNo: string; note: string }>;

type OrderLine = { productId: string; name: string; quantity: number; unitCost: number };

const draftOrder = {
  key: "retail.order.draft",
  name: "Draft a purchase order",
  risk: "change",
  product: "retail",
  description:
    "Draft a reorder from one supplier for one branch: the products running low there, each with a quantity (whole units, enough for the supplier's lead time and the recent rate of sale) and the cost last paid. It stays a draft; a person checks and sends it.",
  input: z.object({
    supplierId: z.string().min(1),
    supplier: z.string().min(1),
    siteId: z.string().min(1),
    site: z.string().min(1).describe("The branch it is delivered to."),
    expectedDate: z.preprocess((value) => (value === "" || value === null ? undefined : value), day.optional()),
    payment: z.enum(["ON_ACCOUNT", "CASH_ON_DELIVERY"]).default("ON_ACCOUNT"),
    lines: z
      .array(
        z.object({
          productId: z.string().min(1),
          name: z.string().min(1),
          quantity: z.number().int().positive(),
          unitCost: z.number().min(0),
        }),
      )
      .min(1)
      .max(100),
  }),
  fields: [{ name: "expectedDate", label: "Expected on", type: "date" }],
  verb: () => "Draft the order",
  title: (p) =>
    `Draft an order from ${p.supplier} for ${p.site}: ${listOf(p.lines.slice(0, 3).map((line) => `${line.quantity} ${line.name}`).concat(p.lines.length > 3 ? [`${p.lines.length - 3} more`] : []))}`,
  target: (p) => `/retail/buying/orders?tab=drafts&supplier=${encodeURIComponent(p.supplierId)}`,
  authorize: (context) => refuseOrders(context, "/api/v2/retail/buying/orders", "create"),
  async run(context, p) {
    const raised = await asRetail(() =>
      raiseOrder(
        buyingActor(context.session),
        {
          supplierId: p.supplierId,
          siteId: p.siteId,
          expectedDate: p.expectedDate ?? null,
          payment: p.payment,
          lines: p.lines.map((line: OrderLine) => ({ productId: line.productId, quantity: line.quantity, unitCost: line.unitCost })),
          send: false,
        },
        { requestUrl: context.requestUrl },
      ),
    );
    return `${raised.poNo} is a draft for ${raised.supplier}. Check it and send it from the order.`;
  },
} satisfies Operation<{
  supplierId: string;
  supplier: string;
  siteId: string;
  site: string;
  expectedDate?: string;
  payment: "ON_ACCOUNT" | "CASH_ON_DELIVERY";
  lines: OrderLine[];
}>;

const sendDraft = {
  key: "retail.order.send",
  name: "Send a purchase order",
  risk: "send",
  product: "retail",
  description:
    "Send a draft order to its supplier, the way the supplier takes orders (WhatsApp or email, with the PDF). A draft you wrote goes as the approving person's: approving it confirms it as theirs.",
  input: z.object({
    orderId: z.string().min(1),
    poNo: z.string().min(1),
    supplier: z.string().min(1),
  }),
  fields: [],
  verb: (p) => `Send ${p.poNo}`,
  title: (p) => `Send ${p.poNo} to ${p.supplier}`,
  target: (p) => `/retail/buying/orders/${p.orderId}`,
  authorize: (context) => refuseOrders(context, "/api/v2/retail/buying/orders", "create"),
  async run(context, p) {
    // The person approving the send is the one confirming Vane's draft as theirs.
    const sent = await asRetail(() =>
      sendOrder(buyingActor(context.session), p.orderId, null, { requestUrl: context.requestUrl }, { asMine: true }),
    );
    return sentWords(sent.poNo, sent.supplier, sent.sentVia);
  },
} satisfies Operation<{ orderId: string; poNo: string; supplier: string }>;

const chase = {
  key: "retail.order.chase",
  name: "Chase a supplier",
  risk: "send",
  product: "retail",
  description:
    "Chase a late order: a message to the supplier asking when it comes, and the day they are expected to promise becomes its expected date. Write the message as the shop would, short, naming the order and what is still owed.",
  input: z.object({
    orderId: z.string().min(1),
    poNo: z.string().min(1),
    supplier: z.string().min(1),
    message: z.string().trim().min(1).max(1000),
    promisedFor: day,
  }),
  fields: [
    { name: "message", label: "Message", type: "text", multiline: true },
    { name: "promisedFor", label: "Now expected on", type: "date" },
  ],
  verb: () => "Send the reminder",
  title: (p) => `Chase ${p.poNo} with ${p.supplier}, expected ${longDay(p.promisedFor)}`,
  target: (p) => `/retail/buying/orders/${p.orderId}`,
  authorize: (context) => refuseOrders(context, "/api/v2/retail/buying/orders", "update"),
  async run(context, p) {
    const chased = await asRetail(() =>
      chaseOrder(buyingActor(context.session), p.orderId, { contactId: null, message: p.message, promisedFor: p.promisedFor, then: "REMIND" }),
    );
    return chased.toast;
  },
} satisfies Operation<{ orderId: string; poNo: string; supplier: string; message: string; promisedFor: string }>;

/** "15% off", "$2.00 off", "buy 3, pay for 2", "for $5.00". */
function dealWords(p: Pick<PromotionInput, "kind" | "value" | "buyQuantity">): string {
  if (p.kind === "PERCENT") return `${p.value}% off`;
  if (p.kind === "AMOUNT") return `$${p.value} off`;
  if (p.kind === "BUY_X_PAY") return `buy ${p.buyQuantity ?? "?"}, pay for ${p.value}`;
  return `for $${p.value}`;
}

const promotion = {
  key: "retail.promotion.create",
  name: "Create a promotion",
  risk: "change",
  product: "retail",
  description:
    "Set up a promotion at the till, as the person who approves it: a percent or an amount off, buy X pay for Y, or a fixed price, on everything, some categories or some products, from a start to an end, for everyone, loyalty members or staff. It is checked as the Promotions page checks it (a percent is at most 90, products and categories are this shop's, it ends after it starts). Use it for stock that is not moving or a date the owner names; say why in the name.",
  input: promotionInput.extend({
    value: z.string().min(1).max(40).describe('The number: "15" for 15% off, "2.00" for $2.00 off, "2" for buy 3 pay for 2, "5.00" for a fixed price.'),
    starts: z.string().min(1).max(60).describe('"2026-10-25" or "2026-10-25 08:00".'),
    ends: z.string().max(60).optional().nullable().describe("When it stops; open-ended when left out."),
    what: z.string().min(1).max(160).describe('What it is on, in words: "Castle Lager 340ml", "all ciders".'),
  }),
  fields: [
    { name: "name", label: "Name", type: "text" },
    { name: "value", label: "Value", type: "text" },
    { name: "starts", label: "Starts", type: "text" },
    { name: "ends", label: "Ends", type: "text" },
  ],
  verb: () => "Start the promotion",
  title: (p) => `${p.name}: ${dealWords(p)} ${p.what}, from ${p.starts}${p.ends ? ` to ${p.ends}` : ""}`,
  target: () => "/retail/products/promotions",
  authorize: (actor) => {
    const route = routeGate(actor, "/api/v2/retail/promotions");
    if (route) return route;
    return canRetailSessionDo(actor.session, "retail.promotions", "create") ? null : "Your role cannot set up promotions.";
  },
  async run(actor, p) {
    try {
      // `what` is the line a person reads; the promotion is the rest.
      const input: PromotionInput & { what?: string } = { ...p };
      delete input.what;
      const made = await createPromotion(promotionActor(actor.session), input);
      return { said: made.message, record: { id: made.id, href: `/retail/products/promotions/${made.id}` } };
    } catch (error) {
      if (error instanceof PromotionRefusal) {
        const field = Object.values(error.fieldErrors)[0];
        throw new OperationRefused(field ?? error.message);
      }
      throw error;
    }
  },
} satisfies Operation<PromotionInput & { what: string }>;

export const RETAIL_OPERATIONS = [lookInto, draftOrder, sendDraft, chase, promotion] as const;
