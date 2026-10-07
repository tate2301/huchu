import type { CrmDocumentType } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { answerValue, fieldFromQuestion } from "@/lib/crm/site-visits/fields";
import { draftSectionQuote } from "@/lib/crm/site-visits/visit-quote";
import { DISPLAY_FIELD_TYPES, formatAnswer, measureOf } from "@/lib/forms/fields";
import { draftSubtotal } from "@/lib/forms/quote";
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

/** An answer that says something: a value, or that the question does not apply. */
function answered(answer: { notApplicable: boolean; valueText: string | null; valueNumber: number | null; valueBool: boolean | null; valueOptions: string[]; valueDate: Date | null; valueJson: unknown }) {
  return (
    answer.notApplicable ||
    answer.valueText !== null ||
    answer.valueNumber !== null ||
    answer.valueBool !== null ||
    answer.valueDate !== null ||
    answer.valueOptions.length > 0 ||
    (answer.valueJson !== null && answer.valueJson !== undefined)
  );
}

/** The square metres an answer measured: an area, areas, or an old width × height. */
function areaOf(answer: { questionType: string; valueNumber: number | null; valueJson: unknown }): number {
  if (answer.questionType === "AREA" || answer.questionType === "AREAS") return answer.valueNumber ?? 0;
  if (answer.questionType === "DIMENSION") {
    const size = (answer.valueJson ?? {}) as { widthM?: number | null; heightM?: number | null };
    return (size.widthM ?? 0) * (size.heightM ?? 0);
  }
  return 0;
}

const visitSelect = {
  appointmentNo: true,
  scheduledStart: true,
  client: { select: { name: true } },
  lead: { select: { contactName: true, title: true } },
  deal: { select: { status: true, value: true } },
  assignedTo: { select: { name: true, email: true } },
} as const;

async function loadVisitForms(ctx: ReportContext, params: ReportParams): Promise<ReportLoadResult> {
  const found = await prisma.crmSiteVisitSection.findMany({
    where: { companyId: ctx.companyId, appointment: { scheduledStart: dateRange(params) } },
    include: {
      answers: true,
      questionSet: { include: { questions: { where: { archivedAt: null }, orderBy: { position: "asc" } } } },
      appointment: { select: visitSelect },
    },
    orderBy: { createdAt: "desc" },
    take: TAKE,
  });
  return result(
    found.map((section) => {
      const visit = section.appointment;
      const asked = (section.questionSet?.questions ?? []).filter((question) => !DISPLAY_FIELD_TYPES.includes(fieldFromQuestion(question).type)).length;
      const measured = section.answers.reduce((sum, answer) => sum + (answer.notApplicable ? 0 : areaOf(answer)), 0);
      return {
        id: section.id,
        visitNo: visit.appointmentNo,
        visited: day(visit.scheduledStart),
        form: section.name,
        rep: personName(visit.assignedTo),
        customer: visit.client?.name ?? visit.lead?.contactName ?? visit.lead?.title ?? null,
        answered: section.answers.filter(answered).length,
        asked,
        measured: Math.round(measured * 100) / 100,
        drafted: draftSubtotal(draftSectionQuote(section)),
        outcome: visit.deal ? label(visit.deal.status) : null,
        dealValue: num(visit.deal?.value),
      };
    }),
  );
}

async function loadVisitAnswers(ctx: ReportContext, params: ReportParams): Promise<ReportLoadResult> {
  const found = await prisma.crmSiteVisitAnswer.findMany({
    where: { companyId: ctx.companyId, section: { appointment: { scheduledStart: dateRange(params) } } },
    include: {
      question: true,
      section: { select: { name: true, appointment: { select: visitSelect } } },
    },
    orderBy: [{ answeredAt: "desc" }, { position: "asc" }],
    take: TAKE,
  });
  return result(
    found.map((answer) => {
      const visit = answer.section.appointment;
      // The live question when it is still there; the snapshot taken at capture when not.
      const field = fieldFromQuestion(
        answer.question ?? { key: answer.questionKey, label: answer.questionLabel, helpText: null, type: answer.questionType, unit: null, isRequired: false },
      );
      const value = answerValue(answer);
      return {
        id: answer.id,
        visitNo: visit.appointmentNo,
        visited: day(visit.scheduledStart),
        form: answer.section.name,
        question: answer.questionLabel,
        questionKey: answer.questionKey,
        answer: answer.notApplicable ? "Not applicable" : formatAnswer(field, value) || null,
        figure: answer.notApplicable ? null : (measureOf(field, value) ?? answer.valueNumber),
        rep: personName(visit.assignedTo),
        notApplicable: answer.notApplicable ? "Yes" : "No",
      };
    }),
  );
}

export const CRM_LOADERS: Record<string, ReportLoader> = {
  "crm-visit-forms": { load: loadVisitForms },
  "crm-visit-answers": { load: loadVisitAnswers },
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
