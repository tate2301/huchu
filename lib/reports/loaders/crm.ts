import type { CrmDocumentType } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { dateRange } from "@/lib/reports/params";
import { day, label, num, personName, result, TAKE } from "@/lib/reports/loaders/shared";
import type {
  ReportContext,
  ReportLoader,
  ReportLoadResult,
  ReportParams,
  ReportRow,
} from "@/lib/reports/types";

/** Quotes and invoices share a shape: a numbered document for a customer. */
async function documentsOf(
  companyId: string,
  type: CrmDocumentType,
  range: { gte?: Date; lte?: Date } | undefined,
): Promise<ReportLoadResult> {
  const found = await prisma.crmLeadDocument.findMany({
    where: {
      companyId,
      type,
      ...(type === "QUOTATION"
        ? { quotation: { quotationDate: range } }
        : { invoice: { invoiceDate: range } }),
    },
    select: {
      id: true,
      version: true,
      dealId: true,
      leadId: true,
      quotation: {
        select: {
          quotationNumber: true,
          quotationDate: true,
          validUntil: true,
          status: true,
          total: true,
          customer: { select: { name: true } },
        },
      },
      invoice: {
        select: {
          invoiceNumber: true,
          invoiceDate: true,
          dueDate: true,
          status: true,
          total: true,
          amountPaid: true,
          customer: { select: { name: true } },
        },
      },
      deal: { select: { title: true } },
      lead: { select: { title: true } },
    },
    orderBy: { createdAt: "desc" },
    take: TAKE,
  });
  return result(
    found.flatMap((document): ReportRow[] => {
      const base = {
        id: document.id,
        dealId: document.dealId,
        leadId: document.leadId,
        record: document.deal?.title ?? document.lead?.title ?? null,
        version: document.version,
      };
      if (document.quotation) {
        const quote = document.quotation;
        return [
          {
            ...base,
            number: quote.quotationNumber,
            customer: quote.customer?.name ?? null,
            status: label(quote.status),
            issued: day(quote.quotationDate),
            due: day(quote.validUntil),
            total: quote.total,
          },
        ];
      }
      if (document.invoice) {
        const invoice = document.invoice;
        return [
          {
            ...base,
            number: invoice.invoiceNumber,
            customer: invoice.customer?.name ?? null,
            status: label(invoice.status),
            issued: day(invoice.invoiceDate),
            due: day(invoice.dueDate),
            total: invoice.total,
            paid: invoice.amountPaid,
            balance: invoice.status === "VOIDED" ? 0 : invoice.total - invoice.amountPaid,
          },
        ];
      }
      return [];
    }),
  );
}

async function loadLeads(ctx: ReportContext, params: ReportParams): Promise<ReportLoadResult> {
  const found = await prisma.crmLead.findMany({
    where: { companyId: ctx.companyId, archivedAt: null, createdAt: dateRange(params) },
    select: {
      id: true,
      leadNo: true,
      title: true,
      contactName: true,
      contactPhone: true,
      contactEmail: true,
      stage: true,
      source: true,
      sourceChannel: true,
      estimatedValue: true,
      lostReason: true,
      createdAt: true,
      client: { select: { name: true } },
      assignedTo: { select: { name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
    take: TAKE,
  });
  return result(
    found.map((lead) => ({
      id: lead.id,
      leadNo: lead.leadNo,
      title: lead.title ?? lead.contactName,
      client: lead.client?.name ?? lead.contactName,
      stage: label(lead.stage),
      source: lead.source,
      channel: label(lead.sourceChannel),
      owner: personName(lead.assignedTo),
      value: lead.estimatedValue,
      arrived: day(lead.createdAt),
      phone: lead.contactPhone,
      email: lead.contactEmail,
      lostReason: lead.lostReason,
    })),
  );
}

async function loadDeals(ctx: ReportContext, params: ReportParams): Promise<ReportLoadResult> {
  const range = dateRange(params);
  const found = await prisma.crmDeal.findMany({
    where: {
      companyId: ctx.companyId,
      archivedAt: null,
      // A deal with no expected close is still in the pipeline; leaving it
      // out of every window would hide exactly the deals needing a date.
      ...(range ? { OR: [{ expectedCloseDate: range }, { expectedCloseDate: null }] } : {}),
    },
    select: {
      id: true,
      dealNo: true,
      title: true,
      status: true,
      value: true,
      probability: true,
      expectedCloseDate: true,
      wonAt: true,
      source: true,
      lostReason: true,
      client: { select: { name: true } },
      stage: { select: { name: true } },
      assignedTo: { select: { name: true, email: true } },
    },
    orderBy: { expectedCloseDate: "asc" },
    take: TAKE,
  });
  return result(
    found.map((deal) => ({
      id: deal.id,
      dealNo: deal.dealNo,
      title: deal.title,
      client: deal.client?.name ?? null,
      stage: deal.stage.name,
      status: label(deal.status),
      owner: personName(deal.assignedTo),
      value: deal.value,
      probability: deal.probability,
      closes: day(deal.expectedCloseDate),
      wonAt: day(deal.wonAt),
      source: deal.source,
      lostReason: deal.lostReason,
    })),
  );
}

async function loadSiteVisits(ctx: ReportContext, params: ReportParams): Promise<ReportLoadResult> {
  const found = await prisma.crmAppointment.findMany({
    where: { companyId: ctx.companyId, scheduledStart: dateRange(params) },
    select: {
      id: true,
      appointmentNo: true,
      title: true,
      status: true,
      scheduledStart: true,
      completedAt: true,
      location: true,
      outcomeNotes: true,
      client: { select: { name: true } },
      lead: { select: { contactName: true, title: true } },
      site: { select: { name: true } },
      assignedTo: { select: { name: true, email: true } },
    },
    orderBy: { scheduledStart: "desc" },
    take: TAKE,
  });
  return result(
    found.map((visit) => ({
      id: visit.id,
      appointmentNo: visit.appointmentNo,
      title: visit.title,
      client: visit.client?.name ?? visit.lead?.contactName ?? visit.lead?.title ?? null,
      site: visit.site?.name ?? null,
      rep: personName(visit.assignedTo),
      status: label(visit.status),
      scheduled: day(visit.scheduledStart),
      completed: day(visit.completedAt),
      location: visit.location,
      outcome: visit.outcomeNotes,
    })),
  );
}

async function loadProjects(ctx: ReportContext, params: ReportParams): Promise<ReportLoadResult> {
  const found = await prisma.crmProject.findMany({
    where: {
      companyId: ctx.companyId,
      ...(params.status === "all" ? {} : { status: { in: ["PLANNING", "ACTIVE", "ON_HOLD"] } }),
    },
    select: {
      id: true,
      projectNo: true,
      name: true,
      status: true,
      budget: true,
      startDate: true,
      targetEndDate: true,
      actualEndDate: true,
      client: { select: { name: true } },
      manager: { select: { name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
    take: TAKE,
  });
  const ids = found.map((project) => project.id);
  // Money against each project, in two queries rather than one per row.
  const [requisitioned, spent] = ids.length
    ? await Promise.all([
        prisma.crmRequisition.groupBy({
          by: ["projectId"],
          where: {
            companyId: ctx.companyId,
            projectId: { in: ids },
            status: { in: ["APPROVED", "DISBURSED", "ACQUITTED"] },
          },
          _sum: { approvedAmount: true, amount: true },
        }),
        prisma.crmDailyCostEntry.groupBy({
          by: ["projectId"],
          where: { companyId: ctx.companyId, projectId: { in: ids }, direction: "SPENT" },
          _sum: { amount: true },
        }),
      ])
    : [[], []];
  const committedBy = new Map(
    requisitioned.map((entry) => [entry.projectId, num(entry._sum.approvedAmount ?? entry._sum.amount)]),
  );
  const spentBy = new Map(spent.map((entry) => [entry.projectId, num(entry._sum.amount)]));
  return result(
    found.map((project) => ({
      id: project.id,
      projectNo: project.projectNo,
      name: project.name,
      client: project.client?.name ?? null,
      status: label(project.status),
      manager: personName(project.manager),
      budget: num(project.budget),
      committed: committedBy.get(project.id) ?? 0,
      spent: spentBy.get(project.id) ?? 0,
      start: day(project.startDate),
      target: day(project.targetEndDate),
      ended: day(project.actualEndDate),
    })),
  );
}

async function loadJobs(ctx: ReportContext, params: ReportParams): Promise<ReportLoadResult> {
  const range = dateRange(params);
  const found = await prisma.crmWorkOrder.findMany({
    where: {
      companyId: ctx.companyId,
      ...(range ? { OR: [{ scheduledStart: range }, { scheduledStart: null, createdAt: range }] } : {}),
    },
    select: {
      id: true,
      workOrderNo: true,
      title: true,
      status: true,
      priority: true,
      scheduledStart: true,
      completedAt: true,
      customerRating: true,
      signOffRating: true,
      client: { select: { name: true } },
      project: { select: { name: true } },
      assignedTo: { select: { name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
    take: TAKE,
  });
  return result(
    found.map((job) => ({
      id: job.id,
      workOrderNo: job.workOrderNo,
      title: job.title,
      client: job.client?.name ?? null,
      project: job.project?.name ?? null,
      status: label(job.status),
      priority: label(job.priority),
      assignee: personName(job.assignedTo),
      scheduled: day(job.scheduledStart),
      completed: day(job.completedAt),
      rating: job.signOffRating ?? job.customerRating,
    })),
  );
}

function loadQuotes(ctx: ReportContext, params: ReportParams): Promise<ReportLoadResult> {
  return documentsOf(ctx.companyId, "QUOTATION", dateRange(params));
}

function loadInvoices(ctx: ReportContext, params: ReportParams): Promise<ReportLoadResult> {
  return documentsOf(ctx.companyId, "INVOICE", dateRange(params));
}

async function loadRequisitions(ctx: ReportContext, params: ReportParams): Promise<ReportLoadResult> {
  const found = await prisma.crmRequisition.findMany({
    where: { companyId: ctx.companyId, createdAt: dateRange(params) },
    select: {
      id: true,
      requisitionNo: true,
      purpose: true,
      category: true,
      status: true,
      amount: true,
      approvedAmount: true,
      acquittedAmount: true,
      createdAt: true,
      disbursedAt: true,
      project: { select: { name: true } },
      requestedBy: { select: { name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
    take: TAKE,
  });
  return result(
    found.map((requisition) => ({
      id: requisition.id,
      requisitionNo: requisition.requisitionNo,
      purpose: requisition.purpose,
      category: label(requisition.category),
      project: requisition.project?.name ?? null,
      requestedBy: personName(requisition.requestedBy),
      status: label(requisition.status),
      amount: num(requisition.amount),
      approved: num(requisition.approvedAmount),
      accounted: num(requisition.acquittedAmount),
      raised: day(requisition.createdAt),
      disbursed: day(requisition.disbursedAt),
    })),
  );
}

async function loadSpend(ctx: ReportContext, params: ReportParams): Promise<ReportLoadResult> {
  const found = await prisma.crmDailyCostEntry.findMany({
    where: { companyId: ctx.companyId, log: { logDate: dateRange(params) } },
    select: {
      id: true,
      direction: true,
      category: true,
      amount: true,
      description: true,
      receiptUrl: true,
      log: { select: { logDate: true, user: { select: { name: true, email: true } } } },
      project: { select: { name: true } },
      requisition: { select: { requisitionNo: true } },
    },
    orderBy: { createdAt: "desc" },
    take: TAKE,
  });
  return result(
    found.map((entry) => ({
      id: entry.id,
      date: day(entry.log.logDate),
      person: personName(entry.log.user),
      direction: label(entry.direction),
      category: label(entry.category),
      description: entry.description,
      project: entry.project?.name ?? null,
      requisition: entry.requisition?.requisitionNo ?? null,
      amount: num(entry.amount),
      receipt: entry.receiptUrl ? "Attached" : "Missing",
    })),
  );
}

export const CRM_LOADERS: Record<string, ReportLoader> = {
  "crm-leads": { load: loadLeads },
  "crm-deals": { load: loadDeals },
  "crm-site-visits": { load: loadSiteVisits },
  "crm-projects": { load: loadProjects },
  "crm-jobs": { load: loadJobs },
  "crm-quotes": { load: loadQuotes },
  "crm-invoices": { load: loadInvoices },
  "crm-requisitions": { load: loadRequisitions },
  "crm-spend": { load: loadSpend },
};
