import type { AuthenticatedSession } from "@/lib/auth-core/types";
import { loadEditableDocument, updateQuotationForDocument, type DocumentOwnerRef } from "@/lib/crm/accounting-bridge";
import { canEditRecord, canUser, denialMessage } from "@/lib/crm/permissions";
import { unitLabel } from "@/lib/inventory/catalogue";
import { priceProducts } from "@/lib/inventory/catalogue-service";
import { toNumberOrZero } from "@/lib/money";
import { prisma } from "@/lib/prisma";

/** A quote line priced differently from the price list: what it says, and what the list says now. */
export type QuoteLineFinding = {
  /** The line's place on the quote, from 0. */
  position: number;
  description: string;
  quoted: number;
  listed: number;
  /** "roll", "m²": the product's unit, for "$46.50 a roll". */
  unit: string | null;
  /** When the list's price last changed, `YYYY-MM-DD`, when it is known. */
  since: string | null;
};

export type QuoteCheck = {
  currency: string;
  /** Lines priced from the catalogue: the ones that could be checked. */
  checked: number;
  /** Lines with no product of that name, which the check cannot price. */
  unpriced: number;
  findings: QuoteLineFinding[];
  /** Whether the quote can still be changed, and why not when it cannot. */
  editLock: string | null;
};

/** Why a line was not changed, in a sentence, with the status the route answers. */
export class QuoteCheckRefused extends Error {
  constructor(
    readonly status: 403 | 404 | 409,
    message: string,
  ) {
    super(message);
    this.name = "QuoteCheckRefused";
  }
}

const key = (text: string) => text.trim().toLowerCase();
const cents = (value: number) => Math.round(value * 100);

async function quoteFor(companyId: string, documentId: string) {
  const doc = await prisma.crmLeadDocument.findFirst({
    where: { id: documentId, companyId, type: "QUOTATION" },
    select: {
      id: true,
      leadId: true,
      dealId: true,
      lead: { select: { assignedToId: true } },
      deal: { select: { assignedToId: true } },
      quotation: { select: { customer: { select: { priceListId: true } } } },
    },
  });
  if (!doc) return null;
  const owner: DocumentOwnerRef | null = doc.dealId ? { dealId: doc.dealId } : doc.leadId ? { leadId: doc.leadId } : null;
  if (!owner) return null;
  const editable = await loadEditableDocument({ ...owner, companyId, leadDocumentId: doc.id });
  if (!editable) return null;
  return {
    owner,
    editable,
    assignedToId: doc.deal?.assignedToId ?? doc.lead?.assignedToId ?? null,
    customerPriceListId: doc.quotation?.customer.priceListId ?? null,
  };
}

/**
 * Checks a CRM quote's lines against the price list, as the catalogue would
 * price each one for this customer and quantity. A line picked from the
 * catalogue keeps its product; a line from before that, matched by name; a
 * line typed by hand has no product and is counted, not checked.
 */
export async function checkQuoteAgainstPriceList(companyId: string, documentId: string): Promise<QuoteCheck | null> {
  const quote = await quoteFor(companyId, documentId);
  if (!quote) return null;
  const { editable } = quote;

  // A line picked from the catalogue names its product; an older or hand-typed one is matched by name.
  const ids = [...new Set(editable.lines.flatMap((line) => (line.productId ? [line.productId] : [])))];
  const names = [...new Set(editable.lines.filter((line) => !line.productId).map((line) => line.description.trim()).filter(Boolean))];
  const products = ids.length || names.length
    ? await prisma.product.findMany({
        where: {
          companyId,
          isActive: true,
          archivedAt: null,
          OR: [...(ids.length ? [{ id: { in: ids } }] : []), ...names.map((name) => ({ name: { equals: name, mode: "insensitive" as const } }))],
        },
        select: { id: true, name: true, unit: true, unitLabel: true },
      })
    : [];
  const byId = new Map(products.map((product) => [product.id, product]));
  const byName = new Map(products.map((product) => [key(product.name), product]));

  const findings: QuoteLineFinding[] = [];
  let checked = 0;
  for (const [position, line] of editable.lines.entries()) {
    const product = line.productId ? byId.get(line.productId) : byName.get(key(line.description));
    if (!product) continue;
    const priced = await priceProducts(
      companyId,
      { ids: [product.id] },
      { quantity: line.quantity, customerPriceListId: quote.customerPriceListId, limit: 1 },
    );
    const listed = priced.products[0]?.line.unitPrice;
    if (listed === undefined) continue;
    checked += 1;
    if (cents(listed) === cents(line.unitPrice)) continue;
    const change = await prisma.productPriceChange.findFirst({
      where: { companyId, productId: product.id, appliedAt: { not: null }, ...(priced.priceList ? { priceListId: priced.priceList.id } : {}) },
      orderBy: { effectiveAt: "desc" },
      select: { effectiveAt: true, toPrice: true },
    });
    findings.push({
      position,
      description: line.description,
      quoted: line.unitPrice,
      listed,
      unit: product.unit === "EACH" ? null : unitLabel(product),
      since: change && cents(toNumberOrZero(change.toPrice)) === cents(listed) ? change.effectiveAt.toISOString().slice(0, 10) : null,
    });
  }

  return {
    currency: editable.currency,
    checked,
    unpriced: editable.lines.length - checked,
    findings,
    editLock: editable.editLock,
  };
}

/**
 * "Change the line": one line of the quote to the price list's price, as the
 * signed-in person, through the same change the quote builder saves. The same
 * checks as editing the quote: the record is theirs to edit, they may issue
 * documents, and the client has not answered.
 */
export async function changeLineToListedPrice(session: AuthenticatedSession, documentId: string, position: number) {
  const companyId = session.user.companyId;
  const quote = await quoteFor(companyId, documentId);
  if (!quote) throw new QuoteCheckRefused(404, "Quote not found");
  if (!(await canEditRecord(session, quote.assignedToId))) throw new QuoteCheckRefused(403, "You can only edit quotes on records assigned to you");
  if (!(await canUser(session, "documents.issue"))) throw new QuoteCheckRefused(403, denialMessage("documents.issue"));
  if (quote.editable.editLock) throw new QuoteCheckRefused(409, quote.editable.editLock);

  const check = await checkQuoteAgainstPriceList(companyId, documentId);
  const finding = check?.findings.find((row) => row.position === position);
  if (!finding) throw new QuoteCheckRefused(409, "That line already matches the price list.");

  const { editable } = quote;
  await updateQuotationForDocument({
    ...quote.owner,
    companyId,
    userId: session.user.id,
    leadDocumentId: documentId,
    lines: editable.lines.map((line, at) => (at === position ? { ...line, unitPrice: finding.listed } : line)),
    notes: editable.notes,
    validUntil: editable.validUntil ? new Date(editable.validUntil) : null,
    renderTemplateId: editable.renderTemplateId,
    resourceIds: editable.resourceIds,
  });
  return finding;
}
