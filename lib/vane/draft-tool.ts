import { z } from "zod";

import { InvoiceRefused } from "@/lib/books/create-invoice";
import { draftInvoiceFromQuote, QuotationRefused } from "@/lib/books/quotations";
import { prisma } from "@/lib/prisma";
import { OrderRefusal, raiseOrder } from "@/lib/retail/buying/orders";
import { absoluteUrl } from "@/lib/site-url";

import { usualTerms } from "./drafts";
import { ReaderError } from "./reader";

/**
 * The `draft` tool: Vane writes a draft through the module's own create code,
 * never raw SQL, so numbers, tax and totals are the module's. The draft is
 * marked `madeByVane` with no maker. Nothing is issued, sent, posted or paid:
 * the routes that do that refuse it until a person confirms it as theirs
 * (`lib/vane/drafts.ts`).
 */

const day = (date: Date) => date.toISOString().slice(0, 10);

const invoiceDraft = z.object({
  quotationId: z.string().min(1).describe("An accepted SalesQuotation not yet invoiced: the invoice is drafted line for line from it."),
  dueInDays: z
    .number()
    .int()
    .min(0)
    .max(365)
    .optional()
    .describe("Days after it is issued that it falls due. Leave it out for the customer's usual terms from their past invoices."),
});

const orderDraft = z.object({
  supplierId: z.string().min(1).describe("The Vendor it is ordered from."),
  siteId: z.string().min(1).describe("The branch (Site) it is delivered to."),
  expectedDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe("YYYY-MM-DD: the supplier's usual delivery day."),
  lines: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.number().int().positive().describe("Whole units: enough for the supplier's lead time at the recent rate of sale."),
        unitCost: z.number().min(0).describe("The cost last paid."),
      }),
    )
    .min(1)
    .max(100),
});

/** One object, as Claude's tools take: the kind of draft, and that kind's inputs. */
export const draftInput = z
  .object({
    type: z.enum(["invoice", "retail_order"]),
    invoice: invoiceDraft.optional().describe('With type "invoice".'),
    retail_order: orderDraft.optional().describe('With type "retail_order".'),
  })
  .refine((input) => Boolean(input[input.type]), { message: "Give the inputs for the type you chose." });

export type DraftInput = z.infer<typeof draftInput>;

export type Drafted = {
  type: "invoice" | "retail_order";
  id: string;
  /** "INV-…", "PO-0218". */
  number: string;
  /** The page a person checks it on, for the card's button. */
  target: string;
  total: number;
  currency: string;
};

/** Writes Vane's draft. A draft the module refuses comes back as a ReaderError, for Vane to correct. */
export async function writeDraft(companyId: string, input: DraftInput, now: Date = new Date()): Promise<Drafted> {
  try {
    if (input.type === "invoice" && input.invoice) {
      const draft = input.invoice;
      const quote = await prisma.salesQuotation.findFirst({ where: { id: draft.quotationId, companyId }, select: { customerId: true } });
      let terms = draft.dueInDays ?? null;
      if (terms === null && quote) {
        const past = await prisma.salesInvoice.findMany({
          where: { companyId, customerId: quote.customerId, status: { in: ["ISSUED", "PAID"] }, dueDate: { not: null } },
          orderBy: { invoiceDate: "desc" },
          take: 20,
          select: { invoiceDate: true, dueDate: true },
        });
        terms = usualTerms(past);
      }
      const due = terms === null ? null : new Date(now.getTime() + terms * 86_400_000);
      const invoice = await draftInvoiceFromQuote(
        { companyId, userId: null },
        { quotationId: draft.quotationId, invoiceDate: day(now), dueDate: due ? day(due) : null },
      );
      return {
        type: "invoice",
        id: invoice.id,
        number: invoice.invoiceNumber,
        target: `/books/invoices/${invoice.id}`,
        total: invoice.total,
        currency: invoice.currency,
      };
    }

    const order = input.retail_order;
    if (!order) throw new ReaderError("refused", "Give the inputs for the type you chose.");
    const raised = await raiseOrder(
      // The audit trail names Vane as the one who raised it; no person is its maker until one sends it.
      { companyId, userId: "vane", userName: "Vane", userRole: null },
      {
        supplierId: order.supplierId,
        siteId: order.siteId,
        expectedDate: order.expectedDate ?? null,
        payment: "ON_ACCOUNT",
        lines: order.lines,
        send: false,
        madeByVane: true,
      },
      // Raised as a draft, nothing is sent, so no link is built from this address.
      { requestUrl: absoluteUrl("/"), now },
    );
    const written = await prisma.retailPurchaseOrder.findUniqueOrThrow({
      where: { id: raised.id },
      select: { lines: { select: { lineTotal: true } } },
    });
    return {
      type: "retail_order",
      id: raised.id,
      number: raised.poNo,
      target: `/retail/buying/orders/${raised.id}`,
      total: written.lines.reduce((sum, line) => sum + Number(line.lineTotal), 0),
      currency: "USD",
    };
  } catch (error) {
    if (error instanceof QuotationRefused || error instanceof InvoiceRefused) throw new ReaderError("refused", error.message);
    if (error instanceof OrderRefusal) {
      const field = error.fieldErrors ? Object.values(error.fieldErrors)[0] : null;
      throw new ReaderError("refused", field ?? error.message);
    }
    throw error;
  }
}
