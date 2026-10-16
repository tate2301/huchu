import type { PrismaClient } from "@prisma/client";

import { createQuotationForLead, type CrmDocumentLineInput } from "@/lib/crm/accounting-bridge";
import { prisma } from "@/lib/prisma";
import type { VaneQuoteView } from "@/lib/vane/blocks";

/**
 * A quote Vane drafts on a deal or lead from the knowledge base: each line
 * priced from a kept knowledge price takes that price, exactly, and keeps
 * which one; a line with no price behind it is Vane's estimate and says so.
 * It is a draft nobody has issued, with no person as its maker, until a person
 * issues it from the quote's page (or deletes it).
 */

/** Why a quote could not be drafted, issued or deleted, in a sentence Vane or a person can act on. */
export class VaneQuoteRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VaneQuoteRefused";
  }
}

export type VaneQuoteLine = {
  description?: string;
  quantity: number;
  /** For a line priced from the knowledge base: that price. Its amount is the price's own. */
  knowledgePriceId?: string;
  /** For a line with no price behind it: Vane's estimate. */
  unitPrice?: number;
  taxRate?: number;
};

export type VaneQuoteDraft = {
  dealId?: string;
  leadId?: string;
  lines: VaneQuoteLine[];
  notes?: string | null;
  /** How long it holds: 30 days unless said. */
  validDays?: number;
  /** A sales rep's chat: their own deal or lead only. */
  rep?: string | null;
};

const lineText = (name: string, unit: string | null) => (unit ? `${name}, per ${unit}` : name);

export async function draftQuoteForVane(companyId: string, draft: VaneQuoteDraft) {
  if (Boolean(draft.dealId) === Boolean(draft.leadId)) throw new VaneQuoteRefused("Name one deal or one lead to quote on.");
  const record = draft.dealId
    ? await prisma.crmDeal.findFirst({ where: { id: draft.dealId, companyId }, select: { assignedToId: true, title: true } })
    : await prisma.crmLead.findFirst({ where: { id: draft.leadId, companyId }, select: { assignedToId: true, title: true } });
  if (!record) throw new VaneQuoteRefused(`There is no such ${draft.dealId ? "deal" : "lead"} in this workspace.`);
  if (draft.rep && record.assignedToId !== draft.rep) throw new VaneQuoteRefused(`That ${draft.dealId ? "deal" : "lead"} is not theirs: a rep's quotes are on their own.`);
  if (draft.lines.length === 0) throw new VaneQuoteRefused("A quote needs at least one line.");

  const ids = [...new Set(draft.lines.flatMap((line) => (line.knowledgePriceId ? [line.knowledgePriceId] : [])))];
  const prices = await prisma.crmKnowledgePrice.findMany({
    where: { id: { in: ids }, companyId, kept: true },
    select: { id: true, name: true, unit: true, unitPrice: true, currency: true },
  });
  const byId = new Map(prices.map((price) => [price.id, price]));
  const missing = ids.filter((id) => !byId.has(id));
  if (missing.length) throw new VaneQuoteRefused(`${missing.join(", ")} is not a kept price in the knowledge base. Search it again.`);
  const currencies = new Set(prices.map((price) => price.currency));
  if (currencies.size > 1) throw new VaneQuoteRefused(`Those prices are in ${[...currencies].join(" and ")}: a quote is in one currency.`);
  const currency = [...currencies][0] ?? "USD";

  const lines: CrmDocumentLineInput[] = draft.lines.map((line, index) => {
    if (line.knowledgePriceId) {
      const price = byId.get(line.knowledgePriceId)!;
      return {
        description: (line.description?.trim() || lineText(price.name, price.unit)).slice(0, 300),
        quantity: line.quantity,
        unitPrice: Number(price.unitPrice),
        taxRate: line.taxRate,
        knowledgePriceId: price.id,
      };
    }
    if (line.unitPrice === undefined || !line.description?.trim()) {
      throw new VaneQuoteRefused(`Line ${index + 1} has no knowledge price: give it a description and your estimate of its price, or price it from the knowledge base.`);
    }
    return { description: line.description.trim().slice(0, 300), quantity: line.quantity, unitPrice: line.unitPrice, taxRate: line.taxRate };
  });

  const validUntil = new Date(Date.now() + (draft.validDays ?? 30) * 86_400_000);
  try {
    const made = await createQuotationForLead({
      companyId,
      userId: null,
      madeByVane: true,
      ...(draft.dealId ? { dealId: draft.dealId } : { leadId: draft.leadId! }),
      lines,
      currency,
      validUntil,
      notes: draft.notes ?? null,
    });
    return {
      ...made,
      currency,
      href: `/crm/quotes/${made.leadDocumentId}`,
      unpriced: lines.filter((line) => !line.knowledgePriceId).length,
    };
  } catch (error) {
    // The module's own refusals (a lost deal, a deal with no company) are sentences already.
    if (error instanceof Error && !(error instanceof VaneQuoteRefused) && /deal|lead|company|quote/i.test(error.message)) throw new VaneQuoteRefused(error.message);
    throw error;
  }
}

type QuoteDb = Pick<PrismaClient, "salesQuotation" | "crmLeadDocument">;

/** The quote a block or the quote's page draws: its lines with where each price came from. Null when it is gone. */
export async function vaneQuoteView(db: QuoteDb, companyId: string, quotationId: string): Promise<VaneQuoteView | null> {
  const quote = await db.salesQuotation.findFirst({
    where: { id: quotationId, companyId },
    select: {
      id: true,
      quotationNumber: true,
      status: true,
      madeByVane: true,
      currency: true,
      subTotal: true,
      taxTotal: true,
      total: true,
      customer: { select: { name: true } },
      crmLeadDocuments: { select: { id: true }, take: 1 },
      lines: {
        orderBy: { createdAt: "asc" },
        select: {
          description: true,
          quantity: true,
          unitPrice: true,
          lineTotal: true,
          knowledgePrice: { select: { name: true, doc: { select: { id: true, title: true } } } },
        },
      },
    },
  });
  if (!quote) return null;
  const doc = quote.crmLeadDocuments[0];
  const STATUS: Record<string, string> = { DRAFT: "Draft", SENT: "Sent", ACCEPTED: "Accepted", EXPIRED: "Expired", VOIDED: "Voided" };
  return {
    kind: "quote",
    quotationId: quote.id,
    number: quote.quotationNumber,
    status: STATUS[quote.status] ?? quote.status,
    madeByVane: quote.madeByVane,
    customer: quote.customer.name,
    currency: quote.currency,
    href: doc ? `/crm/quotes/${doc.id}` : "/crm/quotes",
    lines: quote.lines.map((line) => ({
      description: line.description,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      amount: line.lineTotal,
      source: line.knowledgePrice ? { title: `${line.knowledgePrice.doc.title}: ${line.knowledgePrice.name}`, href: `/crm/knowledge/${line.knowledgePrice.doc.id}` } : null,
    })),
    subTotal: quote.subTotal,
    taxTotal: quote.taxTotal,
    total: quote.total,
    unpriced: quote.madeByVane ? quote.lines.filter((line) => !line.knowledgePrice).length : 0,
  };
}

async function vaneDraftOf(companyId: string, documentId: string) {
  const doc = await prisma.crmLeadDocument.findFirst({
    where: { id: documentId, companyId, type: "QUOTATION" },
    select: {
      id: true,
      leadId: true,
      dealId: true,
      lead: { select: { clientId: true } },
      deal: { select: { clientId: true } },
      quotation: { select: { id: true, quotationNumber: true, status: true, madeByVane: true } },
    },
  });
  if (!doc?.quotation) throw new VaneQuoteRefused("That quote is not here any more.");
  if (!doc.quotation.madeByVane) throw new VaneQuoteRefused(`${doc.quotation.quotationNumber} is a person's quote, not Vane's draft.`);
  if (doc.quotation.status !== "DRAFT") throw new VaneQuoteRefused(`${doc.quotation.quotationNumber} was issued already.`);
  return { ...doc, clientId: doc.deal?.clientId ?? doc.lead?.clientId ?? null, quotation: doc.quotation };
}

/** A person issues Vane's draft quote: pressing Issue it confirms it as theirs, so they become its maker; it is sent as any quote is, and a lead moves to Quoted. */
export async function issueVaneQuote(actor: { companyId: string; userId: string }, documentId: string) {
  const doc = await vaneDraftOf(actor.companyId, documentId);
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.salesQuotation.updateMany({
      where: { id: doc.quotation.id, status: "DRAFT", madeByVane: true },
      // Issuing it is confirming it as theirs (`lib/vane/drafts.ts`): they become its maker in the same write.
      data: { status: "SENT", createdById: actor.userId, issuedById: actor.userId, issuedAt: new Date(), quotationDate: new Date() },
    });
    if (count === 0) throw new VaneQuoteRefused(`${doc.quotation.quotationNumber} was issued already.`);
    await tx.crmLeadDocument.updateMany({ where: { id: doc.id, createdById: null }, data: { createdById: actor.userId } });
    await tx.crmActivity.create({
      data: {
        companyId: actor.companyId,
        type: "DOCUMENT_CREATED",
        ...(doc.dealId ? { dealId: doc.dealId } : { leadId: doc.leadId }),
        clientId: doc.clientId,
        subject: `Quotation ${doc.quotation.quotationNumber} issued from Vane's draft`,
        metadata: { documentId: doc.id, quotationId: doc.quotation.id },
        createdById: actor.userId,
      },
    });
    if (doc.leadId) {
      await tx.crmLead.updateMany({ where: { id: doc.leadId, stage: { in: ["NEW", "CONTACTED", "QUALIFIED", "SITE_VISIT"] } }, data: { stage: "QUOTED" } });
    }
    return { number: doc.quotation.quotationNumber };
  });
}

/** Deletes Vane's draft quote, which nobody issued. A person's quote, or an issued one, stays. */
export async function deleteVaneQuote(companyId: string, documentId: string) {
  const doc = await vaneDraftOf(companyId, documentId);
  await prisma.$transaction([
    prisma.crmLeadDocument.deleteMany({ where: { id: doc.id, companyId } }),
    prisma.salesQuotation.deleteMany({ where: { id: doc.quotation.id, companyId, status: "DRAFT", madeByVane: true } }),
  ]);
  return { number: doc.quotation.quotationNumber };
}
