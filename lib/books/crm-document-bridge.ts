import type { Prisma } from "@prisma/client";
import type { DocumentOwnerRef } from "@/lib/crm/accounting-bridge";
import { reserveIdentifier } from "@/lib/id-generator";
import { prisma } from "@/lib/prisma";

export const CRM_DOCUMENT_INCLUDE = {
  approval: {
    select: {
      token: true,
      status: true,
      respondedAt: true,
      responseNote: true,
      responderName: true,
      firstViewedAt: true,
    },
  },
  quotation: {
    select: {
      id: true,
      quotationNumber: true,
      status: true,
      validUntil: true,
      total: true,
    },
  },
  invoice: {
    select: {
      id: true,
      invoiceNumber: true,
      status: true,
      dueDate: true,
      total: true,
      amountPaid: true,
      creditTotal: true,
      writeOffTotal: true,
      fiscalStatus: true,
      fiscalReceipt: { select: { id: true } },
      _count: {
        select: {
          receipts: { where: { voidedAt: null } },
          creditNotes: { where: { status: { not: "VOIDED" } } },
          writeOffs: { where: { status: { not: "VOIDED" } } },
        },
      },
    },
  },
  receipt: {
    select: {
      id: true,
      receiptNumber: true,
      receivedAt: true,
      amount: true,
      method: true,
      voidedAt: true,
      invoice: { select: { id: true, invoiceNumber: true } },
    },
  },
  deal: {
    select: { id: true, title: true },
  },
  lead: {
    select: { id: true, title: true },
  },
} satisfies Prisma.CrmLeadDocumentInclude;

export type EnsuredCrmDocument = Prisma.CrmLeadDocumentGetPayload<{
  include: typeof CRM_DOCUMENT_INCLUDE;
}>;

/**
 * Resolve `id` (which may be a `CrmLeadDocument.id`, `SalesQuotation.id`,
 * `SalesInvoice.id`, or `SalesReceipt.id`) to its `CrmLeadDocument` row,
 * creating the bridge row on the fly if the accounting record was raised
 * directly in Books before bridge rows were written for standalone documents.
 */
export async function ensureCrmDocument(
  companyId: string,
  id: string,
): Promise<EnsuredCrmDocument | null> {
  const existing = await prisma.crmLeadDocument.findFirst({
    where: {
      companyId,
      OR: [{ id }, { quotationId: id }, { invoiceId: id }, { receiptId: id }],
    },
    include: CRM_DOCUMENT_INCLUDE,
  });
  if (existing) return existing;

  const quotation = await prisma.salesQuotation.findFirst({
    where: { id, companyId },
    select: { id: true, total: true, currency: true, createdById: true },
  });
  if (quotation) {
    return prisma.crmLeadDocument.upsert({
      where: { companyId_quotationId: { companyId, quotationId: quotation.id } },
      update: {},
      create: {
        companyId,
        type: "QUOTATION",
        quotationId: quotation.id,
        amount: quotation.total,
        currency: quotation.currency,
        createdById: quotation.createdById ?? undefined,
      },
      include: CRM_DOCUMENT_INCLUDE,
    });
  }

  const invoice = await prisma.salesInvoice.findFirst({
    where: { id, companyId },
    select: { id: true, quotationId: true, total: true, currency: true, createdById: true },
  });
  if (invoice) {
    const quoteDoc = invoice.quotationId
      ? await prisma.crmLeadDocument.findFirst({
          where: { companyId, type: "QUOTATION", quotationId: invoice.quotationId },
          select: { leadId: true, dealId: true },
        })
      : null;
    return prisma.crmLeadDocument.upsert({
      where: { companyId_invoiceId: { companyId, invoiceId: invoice.id } },
      update: {},
      create: {
        companyId,
        leadId: quoteDoc?.leadId ?? undefined,
        dealId: quoteDoc?.dealId ?? undefined,
        type: "INVOICE",
        invoiceId: invoice.id,
        amount: invoice.total,
        currency: invoice.currency,
        createdById: invoice.createdById ?? undefined,
      },
      include: CRM_DOCUMENT_INCLUDE,
    });
  }

  const receipt = await prisma.salesReceipt.findFirst({
    where: { id, companyId },
    select: { id: true, invoiceId: true, amount: true, currency: true, createdById: true },
  });
  if (receipt) {
    const invoiceDoc = receipt.invoiceId
      ? await prisma.crmLeadDocument.findFirst({
          where: { companyId, type: "INVOICE", invoiceId: receipt.invoiceId },
          select: { leadId: true, dealId: true },
        })
      : null;
    return prisma.crmLeadDocument.upsert({
      where: { companyId_receiptId: { companyId, receiptId: receipt.id } },
      update: {},
      create: {
        companyId,
        leadId: invoiceDoc?.leadId ?? undefined,
        dealId: invoiceDoc?.dealId ?? undefined,
        type: "RECEIPT",
        receiptId: receipt.id,
        amount: receipt.amount,
        currency: receipt.currency ?? "USD",
        createdById: receipt.createdById ?? undefined,
      },
      include: CRM_DOCUMENT_INCLUDE,
    });
  }

  return null;
}

/**
 * Resolve any owner identifier (`CrmDeal.id`, `CrmLead.id`, `CrmClient.id`,
 * `Customer.id`, or `CrmPerson.id`) into a `DocumentOwnerRef` that
 * `lib/crm/accounting-bridge.ts` can raise or edit documents against.
 */
export async function resolveOwnerRef(
  companyId: string,
  ownerId: string,
): Promise<DocumentOwnerRef | null> {
  const deal = await prisma.crmDeal.findFirst({
    where: { id: ownerId, companyId },
    select: { id: true },
  });
  if (deal) return { dealId: deal.id };

  const lead = await prisma.crmLead.findFirst({
    where: { id: ownerId, companyId },
    select: { id: true },
  });
  if (lead) return { leadId: lead.id };

  const client = await prisma.crmClient.findFirst({
    where: { id: ownerId, companyId },
    select: { id: true },
  });
  if (client) return { clientId: client.id };

  const customer = await prisma.customer.findFirst({
    where: { id: ownerId, companyId },
    select: { id: true },
  });
  if (customer) return { customerId: customer.id };

  const person = await prisma.crmPerson.findFirst({
    where: { id: ownerId, companyId },
    select: { id: true, fullName: true, email: true, phone: true, clientId: true },
  });
  if (person) {
    if (person.clientId) return { clientId: person.clientId };
    const clientId = await prisma.$transaction(async (tx) => {
      const existingClient = await tx.crmClient.findFirst({
        where: { companyId, name: person.fullName },
        select: { id: true },
      });
      const resolvedId =
        existingClient?.id ??
        (
          await tx.crmClient.create({
            data: {
              companyId,
              clientNo: await reserveIdentifier(tx, { companyId, entity: "CRM_CLIENT" }),
              name: person.fullName,
              email: person.email ?? undefined,
              phone: person.phone ?? undefined,
            },
            select: { id: true },
          })
        ).id;
      await tx.crmPerson.update({
        where: { id: person.id },
        data: { clientId: resolvedId },
      });
      return resolvedId;
    });
    return { clientId };
  }

  return null;
}

/**
 * Find all accounting `Customer` IDs linked to a CRM company (`CrmClient`) or
 * matching its name, linking `CrmClient.customerId` if it was still unlinked.
 */
export async function resolveProfileCustomerIds(
  companyId: string,
  params: { clientId?: string | null; customerId?: string | null; name?: string | null },
): Promise<string[]> {
  const ids = new Set<string>();
  if (params.customerId) ids.add(params.customerId);

  let clientName = params.name ?? null;
  if (params.clientId) {
    const client = await prisma.crmClient.findFirst({
      where: { id: params.clientId, companyId },
      select: { id: true, name: true, customerId: true },
    });
    if (client) {
      if (client.customerId) ids.add(client.customerId);
      if (!clientName) clientName = client.name;
    }
  }

  if (clientName?.trim()) {
    const matchingCustomers = await prisma.customer.findMany({
      where: {
        companyId,
        name: { equals: clientName.trim(), mode: "insensitive" },
      },
      select: { id: true },
    });
    for (const c of matchingCustomers) {
      ids.add(c.id);
    }
    const firstCustomer = matchingCustomers[0];
    if (firstCustomer && params.clientId) {
      await prisma.crmClient.updateMany({
        where: { id: params.clientId, companyId, customerId: null },
        data: { customerId: firstCustomer.id },
      });
    }
  }

  return Array.from(ids);
}

/**
 * Ensure all quotes, invoices, and receipts for a set of customers/deals/leads
 * have `CrmLeadDocument` bridge rows, and return the complete unified list sorted
 * newest first.
 */
export async function loadProfileMoneyDocuments(
  companyId: string,
  params: {
    clientId?: string | null;
    customerId?: string | null;
    name?: string | null;
    dealIds?: string[];
    leadIds?: string[];
  },
): Promise<EnsuredCrmDocument[]> {
  const customerIds = await resolveProfileCustomerIds(companyId, {
    clientId: params.clientId,
    customerId: params.customerId,
    name: params.name,
  });

  if (customerIds.length > 0) {
    const [quotes, invoices, receipts] = await Promise.all([
      prisma.salesQuotation.findMany({
        where: { companyId, customerId: { in: customerIds }, crmLeadDocuments: { none: {} } },
        select: { id: true, total: true, currency: true, createdById: true, createdAt: true },
      }),
      prisma.salesInvoice.findMany({
        where: { companyId, customerId: { in: customerIds }, crmLeadDocuments: { none: {} } },
        select: { id: true, quotationId: true, total: true, currency: true, createdById: true, createdAt: true },
      }),
      prisma.salesReceipt.findMany({
        where: {
          companyId,
          OR: [
            { customerId: { in: customerIds } },
            { invoice: { customerId: { in: customerIds } } },
          ],
          crmLeadDocuments: { none: {} },
        },
        select: { id: true, invoiceId: true, amount: true, currency: true, createdById: true, createdAt: true },
      }),
    ]);

    for (const q of quotes) {
      await ensureCrmDocument(companyId, q.id);
    }
    for (const inv of invoices) {
      await ensureCrmDocument(companyId, inv.id);
    }
    for (const rec of receipts) {
      await ensureCrmDocument(companyId, rec.id);
    }
  }

  const orClauses: Prisma.CrmLeadDocumentWhereInput[] = [];
  if (customerIds.length > 0) {
    orClauses.push(
      { quotation: { customerId: { in: customerIds } } },
      { invoice: { customerId: { in: customerIds } } },
      { receipt: { customerId: { in: customerIds } } },
      { receipt: { invoice: { customerId: { in: customerIds } } } },
    );
  }
  if (params.dealIds && params.dealIds.length > 0) {
    orClauses.push({ dealId: { in: params.dealIds } });
  }
  if (params.leadIds && params.leadIds.length > 0) {
    orClauses.push({ leadId: { in: params.leadIds } });
  }

  if (orClauses.length === 0) return [];

  return prisma.crmLeadDocument.findMany({
    where: {
      companyId,
      OR: orClauses,
    },
    orderBy: { createdAt: "desc" },
    include: CRM_DOCUMENT_INCLUDE,
  });
}

export type SupplierProfileItem = {
  id: string;
  kind: "BILL" | "PURCHASE_ORDER" | "PAYMENT";
  number: string;
  date: string;
  detail: string | null;
  status: string;
  currency: string;
  amount: number;
  balance: number | null;
  href: string;
};

/**
 * When a CRM Company or Person profile also matches an accounting Supplier (`Vendor`),
 * return any purchase orders, bills, and supplier payments issued to them so their
 * profile shows all items issued to them across both CRM and Books.
 */
export async function loadProfileSupplierItems(
  companyId: string,
  params: { vendorId?: string | null; name?: string | null },
): Promise<SupplierProfileItem[]> {
  const vendor = params.vendorId
    ? await prisma.vendor.findFirst({
        where: { id: params.vendorId, companyId },
        select: { id: true, name: true },
      })
    : params.name?.trim()
      ? await prisma.vendor.findFirst({
          where: { companyId, name: { equals: params.name.trim(), mode: "insensitive" } },
          select: { id: true, name: true },
        })
      : null;

  if (!vendor) return [];

  const [purchaseOrders, bills, payments] = await Promise.all([
    prisma.retailPurchaseOrder.findMany({
      where: { companyId, vendorId: vendor.id },
      orderBy: [{ createdAt: "desc" }],
      take: 100,
      select: {
        id: true,
        poNo: true,
        expectedDate: true,
        createdAt: true,
        status: true,
        lines: { select: { quantity: true, unitCost: true, vatRate: true } },
      },
    }),
    prisma.purchaseBill.findMany({
      where: { companyId, vendorId: vendor.id },
      orderBy: [{ billDate: "desc" }, { createdAt: "desc" }],
      take: 100,
      select: {
        id: true,
        billNumber: true,
        billDate: true,
        dueDate: true,
        status: true,
        currency: true,
        total: true,
        amountPaid: true,
      },
    }),
    prisma.purchasePayment.findMany({
      where: {
        companyId,
        OR: [{ vendorId: vendor.id }, { bill: { vendorId: vendor.id } }],
      },
      orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
      take: 100,
      select: {
        id: true,
        paymentNumber: true,
        paidAt: true,
        method: true,
        reference: true,
        amount: true,
        status: true,
        bill: { select: { billNumber: true, currency: true } },
      },
    }),
  ]);

  const items: Array<SupplierProfileItem & { sortAt: number }> = [];

  for (const po of purchaseOrders) {
    const total = po.lines.reduce((sum, l) => {
      const net = Number(l.quantity) * Number(l.unitCost);
      const tax = (net * Number(l.vatRate ?? 0)) / 100;
      return sum + net + tax;
    }, 0);
    items.push({
      id: po.id,
      kind: "PURCHASE_ORDER",
      number: po.poNo,
      date: po.createdAt.toISOString(),
      detail: vendor.name,
      status: po.status,
      currency: "USD",
      amount: Math.round(total * 100) / 100,
      balance: null,
      href: `/books/orders`,
      sortAt: po.createdAt.getTime(),
    });
  }

  for (const b of bills) {
    items.push({
      id: b.id,
      kind: "BILL",
      number: b.billNumber ?? "Draft bill",
      date: b.billDate.toISOString(),
      detail: vendor.name,
      status: b.status,
      currency: b.currency || "USD",
      amount: b.total,
      balance: Math.max(0, b.total - b.amountPaid),
      href: `/books/bills/${b.id}`,
      sortAt: b.billDate.getTime(),
    });
  }

  for (const p of payments) {
    items.push({
      id: p.id,
      kind: "PAYMENT",
      number: p.paymentNumber ?? "Draft payment",
      date: p.paidAt.toISOString(),
      detail: [p.bill?.billNumber, p.method, p.reference].filter(Boolean).join(" · ") || vendor.name,
      status: p.status,
      currency: p.bill?.currency || "USD",
      amount: p.amount,
      balance: null,
      href: `/books/suppliers/${vendor.id}?tab=payments`,
      sortAt: p.paidAt.getTime(),
    });
  }

  items.sort((a, b) => b.sortAt - a.sortAt);
  return items.map((item) => ({
    id: item.id,
    kind: item.kind,
    number: item.number,
    date: item.date,
    detail: item.detail,
    status: item.status,
    currency: item.currency,
    amount: item.amount,
    balance: item.balance,
    href: item.href,
  }));
}
