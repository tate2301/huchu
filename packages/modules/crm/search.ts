/**
 * The CRM's arm of global search.
 *
 * One query across every record type a CRM user might be looking for, including
 * document numbers — someone holding a printed quotation should be able to
 * type QTN-0042 and land on the deal.
 *
 * Results carry enough context to tell two similar records apart. "John Dube"
 * alone is useless when there are three; "John Dube — Finance Manager, Delta
 * Interiors, 2 active deals" is not.
 *
 * The result shape, the group labels and the order they appear in are
 * module-neutral and live in `lib/records/search-result.ts` — S-4.5 gave the
 * schools module an arm of its own, and two copies of the shape would be two
 * search experiences one refactor apart from disagreeing. `searchCrm` is called
 * by `lib/records/search.ts`, which decides which arms a tenant is entitled to.
 */
import type { Prisma } from "@corelithzw/db";

import { normalizePhoneE164 } from "./phone";
import { PRODUCT_KIND_LABELS, UNIT_LABELS } from "@corelithzw/module-stock/catalogue";
import {
  facts,
  pluralise,
  SEARCH_PER_TYPE_LIMIT,
  type SearchResult,
} from "@corelithzw/module-records/search-result";

type Tx = Prisma.TransactionClient;

/**
 * Search the CRM and the ledgers beside it. Every query is tenant-scoped; the
 * caller supplies the companyId and no result can cross that boundary.
 *
 * Deliberately not CRM-only. Someone typing a product code is looking for the
 * item in the shared catalogue whether they are quoting from the CRM, ringing
 * it up in Retail or costing a work order — and someone typing a customer name
 * should find the accounting account as readily as the CRM company.
 */
export async function searchCrm(
  db: Tx,
  input: { companyId: string; query: string; limitPerType?: number },
): Promise<SearchResult[]> {
  const query = input.query.trim();
  if (query.length < 2) return [];

  const take = input.limitPerType ?? SEARCH_PER_TYPE_LIMIT;
  const contains = { contains: query, mode: "insensitive" as const };
  const phoneE164 = normalizePhoneE164(query);
  const companyId = input.companyId;

  const [
    people,
    companies,
    leads,
    deals,
    sites,
    quotations,
    invoices,
    receipts,
    products,
    customers,
  ] =
    await Promise.all([
      db.crmPerson.findMany({
        where: {
          companyId,
          archivedAt: null,
          mergedIntoId: null,
          OR: [
            { fullName: contains },
            { email: contains },
            { personNo: contains },
            { phone: contains },
            ...(phoneE164 ? [{ phoneE164 }] : []),
          ],
        },
        select: {
          id: true,
          personNo: true,
          fullName: true,
          jobTitle: true,
          // Read for the preview pane, which is the difference between a
          // result you recognise and one you have to open to identify.
          email: true,
          phone: true,
          client: { select: { name: true } },
          _count: { select: { dealContacts: true } },
        },
        take,
      }),

      db.crmClient.findMany({
        where: {
          companyId,
          archivedAt: null,
          mergedIntoId: null,
          OR: [
            { name: contains },
            { tradingName: contains },
            { clientNo: contains },
            { email: contains },
            { phone: contains },
            { registrationNumber: contains },
            { city: contains },
            ...(phoneE164 ? [{ phoneE164 }] : []),
          ],
        },
        select: {
          id: true,
          clientNo: true,
          name: true,
          city: true,
          accountStatus: true,
          _count: { select: { deals: true, people: true } },
        },
        take,
      }),

      db.crmLead.findMany({
        where: {
          companyId,
          // Archived, not merely unconverted. Search offers things to go and
          // work on; a lead that has been put away is not one of them, and
          // hiding only the converted ones let every archived lead back in.
          archivedAt: null,
          OR: [
            { leadNo: contains },
            { title: contains },
            { contactName: contains },
            { contactEmail: contains },
            { contactPhone: contains },
          ],
        },
        select: {
          id: true,
          leadNo: true,
          title: true,
          contactName: true,
          stage: true,
        },
        take,
      }),

      db.crmDeal.findMany({
        where: {
          companyId,
          archivedAt: null,
          OR: [{ dealNo: contains }, { title: contains }, { client: { name: contains } }],
        },
        select: {
          id: true,
          dealNo: true,
          title: true,
          value: true,
          currency: true,
          client: { select: { name: true } },
          stage: { select: { name: true } },
        },
        take,
      }),

      db.crmSite.findMany({
        where: {
          companyId,
          archivedAt: null,
          OR: [
            { siteNo: contains },
            { name: contains },
            { addressLine: contains },
            { city: contains },
          ],
        },
        select: {
          id: true,
          siteNo: true,
          name: true,
          addressLine: true,
          city: true,
          client: { select: { name: true } },
        },
        take,
      }),

      // Sales documents are reached through the CrmLeadDocument that links
      // them to a lead or deal, which keeps the tenant scope explicit.
      db.crmLeadDocument.findMany({
        where: {
          companyId,
          type: "QUOTATION",
          quotation: { quotationNumber: contains },
        },
        select: {
          id: true,
          leadId: true,
          dealId: true,
          amount: true,
          currency: true,
          quotation: { select: { quotationNumber: true, customer: { select: { name: true } } } },
        },
        take,
      }),

      db.crmLeadDocument.findMany({
        where: { companyId, type: "INVOICE", invoice: { invoiceNumber: contains } },
        select: {
          id: true,
          leadId: true,
          dealId: true,
          amount: true,
          currency: true,
          invoice: { select: { invoiceNumber: true, customer: { select: { name: true } } } },
        },
        take,
      }),

      db.crmLeadDocument.findMany({
        where: { companyId, type: "RECEIPT", receipt: { receiptNumber: contains } },
        select: {
          id: true,
          leadId: true,
          dealId: true,
          amount: true,
          currency: true,
          receipt: { select: { receiptNumber: true } },
        },
        take,
      }),

      // The shared catalogue — the same rows Retail lists and the CRM quotes.
      db.product.findMany({
        where: {
          companyId,
          archivedAt: null,
          OR: [{ name: contains }, { code: contains }, { description: contains }],
        },
        select: { id: true, code: true, name: true, kind: true, unit: true, isActive: true },
        take,
      }),

      // Accounting customers. A CRM company and an accounting account are two
      // records for one relationship, and people search for either by name.
      db.customer.findMany({
        where: {
          companyId,
          OR: [{ name: contains }, { email: contains }, { contactName: contains }],
        },
        select: { id: true, name: true, email: true, contactName: true },
        take,
      }),
    ]);

  const results: SearchResult[] = [];

  for (const person of people) {
    const context = [
      person.jobTitle,
      person.client?.name,
      person._count.dealContacts > 0 ? pluralise(person._count.dealContacts, "deal") : null,
    ].filter(Boolean);
    results.push({
      type: "PERSON",
      id: person.id,
      reference: person.personNo,
      title: person.fullName,
      subtitle: context.length > 0 ? context.join(" · ") : null,
      facts: facts([
        ["Job title", person.jobTitle],
        ["Company", person.client?.name],
        ["Email", person.email],
        ["Phone", person.phone],
        ["Deals", person._count.dealContacts || null],
      ]),
      href: `/crm/people/${person.id}`,
    });
  }

  for (const company of companies) {
    const context = [
      company.city,
      company._count.people > 0 ? pluralise(company._count.people, "contact") : null,
      company._count.deals > 0 ? pluralise(company._count.deals, "deal") : null,
      company.accountStatus !== "ACTIVE" ? company.accountStatus.toLowerCase() : null,
    ].filter(Boolean);
    results.push({
      type: "COMPANY",
      id: company.id,
      reference: company.clientNo,
      title: company.name,
      subtitle: context.length > 0 ? context.join(" · ") : null,
      facts: facts([
        ["Status", company.accountStatus.toLowerCase()],
        ["City", company.city],
        ["Contacts", company._count.people || null],
        ["Deals", company._count.deals || null],
      ]),
      href: `/crm/companies/${company.id}`,
    });
  }

  for (const lead of leads) {
    results.push({
      type: "LEAD",
      id: lead.id,
      reference: lead.leadNo,
      title: lead.title ?? lead.contactName ?? lead.leadNo,
      subtitle: [lead.contactName, lead.stage].filter(Boolean).join(" · ") || null,
      facts: facts([
        ["Stage", lead.stage],
        ["Contact", lead.contactName],
      ]),
      href: `/crm/leads/${lead.id}`,
    });
  }

  for (const deal of deals) {
    const context = [
      deal.client?.name,
      deal.stage?.name,
      typeof deal.value === "number" ? `${deal.currency} ${deal.value.toLocaleString()}` : null,
    ].filter(Boolean);
    results.push({
      type: "DEAL",
      id: deal.id,
      reference: deal.dealNo,
      title: deal.title,
      subtitle: context.length > 0 ? context.join(" · ") : null,
      facts: facts([
        ["Company", deal.client?.name],
        ["Stage", deal.stage?.name],
        [
          "Value",
          typeof deal.value === "number"
            ? `${deal.currency} ${deal.value.toLocaleString()}`
            : null,
        ],
      ]),
      href: `/crm/deals/${deal.id}`,
    });
  }

  for (const site of sites) {
    const context = [site.client?.name, site.addressLine, site.city].filter(Boolean);
    results.push({
      type: "SITE",
      id: site.id,
      reference: site.siteNo,
      title: site.name,
      subtitle: context.length > 0 ? context.join(" · ") : null,
      facts: facts([
        ["Company", site.client?.name],
        ["Address", site.addressLine],
        ["City", site.city],
      ]),
      href: `/crm/sites/${site.id}`,
    });
  }

  const documentHref = (doc: { leadId: string | null; dealId: string | null }) =>
    doc.dealId ? `/crm/deals/${doc.dealId}` : `/crm/leads/${doc.leadId}`;

  for (const doc of quotations) {
    results.push({
      type: "QUOTATION",
      id: doc.id,
      reference: doc.quotation?.quotationNumber ?? null,
      title: doc.quotation?.quotationNumber ?? "Quotation",
      subtitle: [doc.quotation?.customer?.name, `${doc.currency} ${doc.amount.toLocaleString()}`]
        .filter(Boolean)
        .join(" · "),
      facts: facts([
        ["Customer", doc.quotation?.customer?.name],
        ["Amount", `${doc.currency} ${doc.amount.toLocaleString()}`],
      ]),
      href: documentHref(doc),
    });
  }

  for (const doc of invoices) {
    results.push({
      type: "INVOICE",
      id: doc.id,
      reference: doc.invoice?.invoiceNumber ?? null,
      title: doc.invoice?.invoiceNumber ?? "Invoice",
      subtitle: [doc.invoice?.customer?.name, `${doc.currency} ${doc.amount.toLocaleString()}`]
        .filter(Boolean)
        .join(" · "),
      facts: facts([
        ["Customer", doc.invoice?.customer?.name],
        ["Amount", `${doc.currency} ${doc.amount.toLocaleString()}`],
      ]),
      href: documentHref(doc),
    });
  }

  for (const doc of receipts) {
    results.push({
      type: "RECEIPT",
      id: doc.id,
      reference: doc.receipt?.receiptNumber ?? null,
      title: doc.receipt?.receiptNumber ?? "Receipt",
      subtitle: `${doc.currency} ${doc.amount.toLocaleString()}`,
      facts: facts([["Amount", `${doc.currency} ${doc.amount.toLocaleString()}`]]),
      href: documentHref(doc),
    });
  }

  for (const product of products) {
    results.push({
      type: "PRODUCT",
      id: product.id,
      reference: product.code,
      title: product.name,
      subtitle: [
        PRODUCT_KIND_LABELS[product.kind],
        `per ${UNIT_LABELS[product.unit]}`,
        product.isActive ? null : "archived",
      ]
        .filter(Boolean)
        .join(" · "),
      facts: facts([
        ["Kind", PRODUCT_KIND_LABELS[product.kind]],
        ["Sold by", UNIT_LABELS[product.unit]],
        ["Status", product.isActive ? null : "Archived"],
      ]),
      href: `/stores/catalogue?product=${product.id}`,
    });
  }

  for (const customer of customers) {
    results.push({
      type: "CUSTOMER",
      id: customer.id,
      reference: null,
      title: customer.name,
      subtitle: [customer.contactName, customer.email].filter(Boolean).join(" · ") || null,
      facts: facts([
        ["Contact", customer.contactName],
        ["Email", customer.email],
      ]),
      // The accounting account has no page of its own; its sales history is
      // the useful destination.
      href: `/accounting/sales?customerId=${customer.id}`,
    });
  }

  return results;
}
