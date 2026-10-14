import { z } from "zod";

import { chaseOrder, OrderRefusal, raiseOrder, sendOrder } from "@/lib/retail/buying/orders";
import { buyingActor } from "@/lib/retail/buying/routes";
import { sentWords } from "@/lib/retail/buying/words";
import { signOffShift, SignOffRefused } from "@/lib/retail/floor/sign-off";
import { canRetailSessionDo } from "@/lib/retail/permission-matrix";

import { listOf, longDay, refuseUnlessRoute } from "./gate";
import { VaneActionError, type VaneActionContext, type VaneActionKind } from "./types";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Write it as a day, like 2026-10-30.");

/** The order routes' checks: the route, then what the person's retail role may do with orders. */
function refuseOrders(context: VaneActionContext, path: string, action: "create" | "update"): string | null {
  const route = refuseUnlessRoute(context, path);
  if (route) return route;
  return canRetailSessionDo(context.session, "retail.purchasing", action) ? null : "Your role cannot order stock, so Vane cannot do it for you.";
}

/** An order refused by Retail, as the sentence (and the field's own words) a person can act on. */
async function asRetail<T>(act: () => Promise<T>): Promise<T> {
  try {
    return await act();
  } catch (error) {
    if (error instanceof OrderRefusal) {
      const field = error.fieldErrors ? Object.values(error.fieldErrors)[0] : null;
      throw new VaneActionError(field ?? error.message);
    }
    throw error;
  }
}

const lookInto = {
  kind: "retail.shift.look_into",
  module: "retail",
  description:
    "Sign off a till shift whose cash-up did not balance as Look into it, with a note saying what to check. The shift's own sign-off: it needs a person who may approve cash control, and nobody signs off their own drawer.",
  params: z.object({
    shiftId: z.string().min(1),
    shiftNo: z.string().min(1).describe('As the shift shows it: "SH-0412".'),
    note: z.string().trim().min(1).max(500),
  }),
  fields: [{ name: "note", label: "What to look into", type: "text", multiline: true }],
  verb: () => "Look into it",
  title: (p) => `Sign off ${p.shiftNo} as Look into it: ${p.note}`,
  target: () => "/retail/shifts?state=needs-sign-off",
  refuse: (context) => refuseUnlessRoute(context, "/api/v2/retail/shifts"),
  async run(context, p) {
    try {
      const done = await signOffShift(
        { user: { id: context.userId, companyId: context.companyId, role: context.role, name: context.session.user.name } },
        p.shiftId,
        { outcome: "LOOK_INTO", note: p.note },
      );
      return `${done.shiftNo} is signed off to be looked into${done.amount ? `, ${done.amount}` : ""}.`;
    } catch (error) {
      if (error instanceof SignOffRefused) throw new VaneActionError(error.message);
      throw error;
    }
  },
} satisfies VaneActionKind<{ shiftId: string; shiftNo: string; note: string }>;

type OrderLine = { productId: string; name: string; quantity: number; unitCost: number };

const draftOrder = {
  kind: "retail.order.draft",
  module: "retail",
  description:
    "Draft a reorder from one supplier for one branch: the products running low there, each with a quantity (whole units, enough for the supplier's lead time and the recent rate of sale) and the cost last paid. It stays a draft; a person checks and sends it.",
  params: z.object({
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
  refuse: (context) => refuseOrders(context, "/api/v2/retail/buying/orders", "create"),
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
} satisfies VaneActionKind<{
  supplierId: string;
  supplier: string;
  siteId: string;
  site: string;
  expectedDate?: string;
  payment: "ON_ACCOUNT" | "CASH_ON_DELIVERY";
  lines: OrderLine[];
}>;

const sendDraft = {
  kind: "retail.order.send",
  module: "retail",
  description:
    "Send a draft order to its supplier, the way the supplier takes orders (WhatsApp or email, with the PDF). A draft you wrote goes as the approving person's: approving it confirms it as theirs.",
  params: z.object({
    orderId: z.string().min(1),
    poNo: z.string().min(1),
    supplier: z.string().min(1),
  }),
  fields: [],
  verb: (p) => `Send to ${p.supplier}`,
  title: (p) => `Send ${p.poNo} to ${p.supplier}`,
  target: (p) => `/retail/buying/orders/${p.orderId}`,
  refuse: (context) => refuseOrders(context, "/api/v2/retail/buying/orders", "create"),
  async run(context, p) {
    // The person approving the send is the one confirming Vane's draft as theirs.
    const sent = await asRetail(() =>
      sendOrder(buyingActor(context.session), p.orderId, null, { requestUrl: context.requestUrl }, { asMine: true }),
    );
    return sentWords(sent.poNo, sent.supplier, sent.sentVia);
  },
} satisfies VaneActionKind<{ orderId: string; poNo: string; supplier: string }>;

const chase = {
  kind: "retail.order.chase",
  module: "retail",
  description:
    "Chase a late order: a message to the supplier asking when it comes, and the day they are expected to promise becomes its expected date. Write the message as the shop would, short, naming the order and what is still owed.",
  params: z.object({
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
  refuse: (context) => refuseOrders(context, "/api/v2/retail/buying/orders", "update"),
  async run(context, p) {
    const chased = await asRetail(() =>
      chaseOrder(buyingActor(context.session), p.orderId, { contactId: null, message: p.message, promisedFor: p.promisedFor, then: "REMIND" }),
    );
    return chased.toast;
  },
} satisfies VaneActionKind<{ orderId: string; poNo: string; supplier: string; message: string; promisedFor: string }>;

export const RETAIL_ACTIONS = [lookInto, draftOrder, sendDraft, chase] as const;
