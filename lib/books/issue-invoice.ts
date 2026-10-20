import { fiscaliseIssuedInvoice, postInvoice } from "@/lib/books/core/issue-invoice";
import { numberAtIssue } from "@/lib/books/core/numbering";
import { moveReceiptsToRevision } from "@/lib/books/core/revision-payments";
import { docLabel } from "@/lib/books/doc-number";
import { onAccountingInvoiceCreated } from "@/lib/crm/accounting-hooks";
import { prisma } from "@/lib/prisma";
import { datesOnIssue, takeOn, waitsForAPerson } from "@/lib/vane/drafts";

type Issued = { id: string; invoiceNumber: string | null; invoiceDate: Date; total: number; subTotal: number; taxTotal: number; currency?: string | null };

/**
 * What issuing an invoice does to the books, through the core: its journal and
 * sub-ledger line are posted, and it is fiscalised where the workspace
 * fiscalises. Neither stops the invoice being issued; a failure waits for the
 * drain or the fiscal register.
 */
export async function postIssuedInvoice(companyId: string, invoice: Issued, userId: string, options: { costCenterId?: string | null } = {}): Promise<void> {
  try {
    const posting = await postInvoice(prisma, { companyId, invoice, actor: { userId }, costCenterId: options.costCenterId });
    if (posting.error) console.error(`[Books] Invoice ${invoice.invoiceNumber} waits to post: ${posting.error}`);
  } catch (error) {
    console.error("[Accounting] Sales invoice auto-post failed:", error);
  }
  await fiscaliseIssuedInvoice(companyId, invoice.id, userId);
}

/** Why a draft was not issued or deleted, in a sentence. */
export class DraftInvoiceRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DraftInvoiceRefused";
  }
}

/**
 * Issues a draft as the person, posted and fiscalised. Vane's draft
 * (`madeByVane`, no maker) is issued only when the person confirms it as
 * theirs (`asMine`; approving `books.invoice.issue` is that confirmation),
 * else `VaneDraftNotTakenOn` (409). Taken on in the same write
 * (`lib/vane/drafts.ts`), it is dated the day it is issued with its terms
 * kept, and the CRM hears of it then.
 */
export async function issueDraftInvoice(actor: { companyId: string; userId: string }, invoiceId: string, confirm: { asMine?: boolean } = {}) {
  const now = new Date();
  const draft = await prisma.salesInvoice.findFirst({
    where: { id: invoiceId, companyId: actor.companyId },
    select: { invoiceNumber: true, status: true, madeByVane: true, createdById: true, invoiceDate: true, dueDate: true },
  });
  if (!draft) throw new DraftInvoiceRefused("That invoice is not here any more.");
  const takingOn = draft.status === "DRAFT" && waitsForAPerson(draft);
  const maker = takingOn ? takeOn(draft, { asMine: confirm.asMine, userId: actor.userId, what: docLabel(draft.invoiceNumber), verb: "issue" }) : {};
  // Numbered at issue (D8), in the same write as the status, so a draft that
  // does not issue takes no number and two issued at once never share one.
  const count = await prisma.$transaction(async (tx) => {
    const locked = await tx.salesInvoice.updateMany({
      where: { id: invoiceId, companyId: actor.companyId, status: "DRAFT" },
      data: {
        status: "ISSUED",
        issuedById: actor.userId,
        issuedAt: now,
        ...(takingOn ? { ...maker, ...datesOnIssue(draft, now) } : {}),
      },
    });
    if (locked.count === 0) return 0;
    const invoiceNumber = await numberAtIssue(tx, actor.companyId, "invoice", draft.invoiceNumber);
    if (invoiceNumber !== draft.invoiceNumber) await tx.salesInvoice.update({ where: { id: invoiceId }, data: { invoiceNumber } });
    return locked.count;
  });
  const invoice = await prisma.salesInvoice.findFirst({
    where: { id: invoiceId, companyId: actor.companyId },
    select: { id: true, invoiceNumber: true, invoiceDate: true, total: true, subTotal: true, taxTotal: true, status: true, currency: true, customer: { select: { name: true } } },
  });
  if (!invoice) throw new DraftInvoiceRefused("That invoice is not here any more.");
  if (count === 0) throw new DraftInvoiceRefused(`${docLabel(invoice.invoiceNumber)} is not a draft: it was issued already.`);
  // Vane's draft is the CRM's work invoiced only now a person has issued it (`createSalesInvoice` held it back).
  if (takingOn) await onAccountingInvoiceCreated({ companyId: actor.companyId, invoiceId: invoice.id, userId: actor.userId });
  await postIssuedInvoice(actor.companyId, invoice, actor.userId);
  // A revision takes back the payments the invoice it replaces left on account, for the same customer (§4.3).
  await moveReceiptsToRevision(actor.companyId, invoice.id, actor.userId).catch((error: unknown) => console.error("[Books] moving payments to the revision failed:", error));
  return invoice;
}

/** Deletes a draft Vane made, which nobody has issued: a person's own drafts are theirs to delete in Books. */
export async function deleteVaneDraftInvoice(companyId: string, invoiceId: string) {
  const invoice = await prisma.salesInvoice.findFirst({ where: { id: invoiceId, companyId }, select: { invoiceNumber: true, status: true, madeByVane: true } });
  if (!invoice) throw new DraftInvoiceRefused("That invoice is not here any more.");
  if (invoice.status !== "DRAFT") throw new DraftInvoiceRefused(`${docLabel(invoice.invoiceNumber)} was issued, so it stays.`);
  if (!invoice.madeByVane) throw new DraftInvoiceRefused(`${docLabel(invoice.invoiceNumber)} is a person's draft, not Vane's.`);
  await prisma.salesInvoice.deleteMany({ where: { id: invoiceId, companyId, status: "DRAFT", madeByVane: true } });
  return invoice;
}
