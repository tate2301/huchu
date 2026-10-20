import type { PrismaClient } from "@prisma/client";
import { docLabel } from "@/lib/books/doc-number";

import { dayOf, methodWord, money, shortDay, storedDay } from "@/lib/books/format";

import type { InboxModule, Subject, SubjectKind } from "./describe";

/**
 * What a notification concerns, read from the record at read time: its
 * reference, one key fact, its status, where it opens, and for the drawer
 * its facts and thread. Nothing of this is stored on the notification, so a
 * paid invoice reads as paid in a week-old notice.
 */

export type ConcernTone = "success" | "warning" | "danger" | "info" | "live";

export type Concern = {
  kind: SubjectKind;
  module: InboxModule;
  /** "INV-00017", "Rusape Transport handheld scanners". */
  ref: string;
  /** One key fact after the reference: "Plumtree Freight · $19,435.00". */
  fact: string | null;
  status: { label: string; tone: ConcernTone | null } | null;
  href: string;
  /** The primary action's verb: "Open invoice". */
  open: string;
  /** Who did it, when the record knows better than the notice (a comment's author). */
  actorName: string | null;
  /** The drawer's fact list. */
  facts: Array<{ label: string; value: string }>;
  /** The comment and its replies, oldest first. */
  thread: Array<{ author: string; body: string; at: string }>;
};

type Db = Pick<
  PrismaClient,
  | "salesInvoice"
  | "salesReceipt"
  | "crmDeal"
  | "crmLead"
  | "crmComment"
  | "leaveRequest"
  | "customReport"
  | "vaneItem"
  | "payrollRun"
>;

const keyOf = (subject: Subject) => `${subject.kind}:${subject.id}`;

function idsOf(subjects: Subject[], kind: SubjectKind) {
  return [...new Set(subjects.filter((subject) => subject.kind === kind).map((subject) => subject.id))];
}

const isUuid = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

const join = (...parts: Array<string | null | undefined | false>) => parts.filter(Boolean).join(" · ");

/** An invoice's state as Books says it: draft, owed, overdue, paid, void. */
export function invoiceStatus(
  invoice: { status: string; total: number; amountPaid: number; dueDate: Date | null },
  today: string,
): { label: string; tone: ConcernTone | null } {
  if (invoice.status === "DRAFT") return { label: "Draft", tone: null };
  if (invoice.status === "VOIDED") return { label: "Void", tone: null };
  if (invoice.status === "PAID") return { label: "Paid", tone: "success" };
  if (invoice.dueDate && storedDay(invoice.dueDate) < today) return { label: "Overdue", tone: "danger" };
  if (invoice.amountPaid > 0) return { label: "Part paid", tone: "warning" };
  return { label: "Owed", tone: "info" };
}

const LEAVE_STATUS: Record<string, { label: string; tone: ConcernTone | null }> = {
  DRAFT: { label: "Draft", tone: null },
  SUBMITTED: { label: "Waiting for you", tone: "warning" },
  APPROVED: { label: "Approved", tone: "success" },
  REJECTED: { label: "Declined", tone: "danger" },
  CANCELLED: { label: "Cancelled", tone: null },
  WITHDRAWN: { label: "Withdrawn", tone: null },
};

const VANE_STATUS: Record<string, { label: string; tone: ConcernTone | null }> = {
  OPEN: { label: "Open", tone: "info" },
  DONE: { label: "Done", tone: "success" },
  MUTED: { label: "Not now", tone: null },
};

const RUN_STATUS: Record<string, { label: string; tone: ConcernTone | null }> = {
  DRAFT: { label: "Draft", tone: null },
  SUBMITTED: { label: "Waiting for you", tone: "warning" },
  APPROVED: { label: "Approved", tone: "success" },
  REJECTED: { label: "Declined", tone: "danger" },
  POSTED: { label: "Posted", tone: "success" },
};

/** Read every subject's record in one query per kind, scoped to the workspace. */
export async function resolveConcerns(
  db: Db,
  companyId: string,
  subjects: Subject[],
  options: { now?: Date; detail?: boolean } = {},
): Promise<Map<string, Concern>> {
  const now = options.now ?? new Date();
  const today = dayOf(now);
  const out = new Map<string, Concern>();
  const valid = subjects.filter((subject) => isUuid(subject.id));

  const [invoices, receipts, deals, leads, comments, leave, reports, vane, runs] = await Promise.all([
    idsOf(valid, "invoice").length
      ? db.salesInvoice.findMany({
          where: { companyId, id: { in: idsOf(valid, "invoice") } },
          select: {
            id: true,
            invoiceNumber: true,
            status: true,
            total: true,
            amountPaid: true,
            currency: true,
            dueDate: true,
            invoiceDate: true,
            customer: { select: { name: true } },
          },
        })
      : [],
    idsOf(valid, "receipt").length
      ? db.salesReceipt.findMany({
          where: { companyId, id: { in: idsOf(valid, "receipt") } },
          select: {
            id: true,
            receiptNumber: true,
            amount: true,
            method: true,
            receivedAt: true,
            reference: true,
            invoice: { select: { invoiceNumber: true, currency: true, total: true, amountPaid: true, customer: { select: { name: true } } } },
          },
        })
      : [],
    idsOf(valid, "deal").length
      ? db.crmDeal.findMany({
          where: { companyId, id: { in: idsOf(valid, "deal") } },
          select: {
            id: true,
            title: true,
            value: true,
            currency: true,
            expectedCloseDate: true,
            client: { select: { name: true } },
            stage: { select: { name: true, status: true } },
            assignedTo: { select: { name: true } },
          },
        })
      : [],
    idsOf(valid, "lead").length
      ? db.crmLead.findMany({
          where: { companyId, id: { in: idsOf(valid, "lead") } },
          select: { id: true, title: true, contactName: true, stage: true, estimatedValue: true },
        })
      : [],
    idsOf(valid, "comment").length
      ? db.crmComment.findMany({
          where: { companyId, id: { in: idsOf(valid, "comment") } },
          select: {
            id: true,
            body: true,
            createdAt: true,
            createdBy: { select: { name: true } },
            deal: { select: { id: true, title: true, value: true, currency: true, client: { select: { name: true } }, stage: { select: { name: true, status: true } } } },
            lead: { select: { id: true, title: true, contactName: true } },
            replies: options.detail
              ? { select: { body: true, createdAt: true, createdBy: { select: { name: true } } }, orderBy: { createdAt: "asc" }, take: 6 }
              : false,
          },
        })
      : [],
    idsOf(valid, "leave").length
      ? db.leaveRequest.findMany({
          where: { companyId, id: { in: idsOf(valid, "leave") } },
          select: {
            id: true,
            startDate: true,
            endDate: true,
            workingDays: true,
            reason: true,
            status: true,
            employee: { select: { name: true, jobTitle: true } },
            leaveType: { select: { name: true } },
            coveringEmployee: { select: { name: true } },
          },
        })
      : [],
    idsOf(valid, "report").length
      ? db.customReport.findMany({
          where: { companyId, id: { in: idsOf(valid, "report") } },
          select: { id: true, title: true, description: true, updatedAt: true },
        })
      : [],
    idsOf(valid, "vane").length
      ? db.vaneItem.findMany({
          where: { companyId, id: { in: idsOf(valid, "vane") } },
          select: { id: true, kind: true, headline: true, body: true, status: true, sourceModule: true, action: true, createdAt: true },
        })
      : [],
    idsOf(valid, "payroll-run").length
      ? db.payrollRun.findMany({
          where: { companyId, id: { in: idsOf(valid, "payroll-run") } },
          select: { id: true, status: true, netTotal: true, period: { select: { periodKey: true } } },
        })
      : [],
  ]);

  for (const invoice of invoices) {
    const balance = invoice.total - invoice.amountPaid;
    out.set(keyOf({ kind: "invoice", id: invoice.id }), {
      kind: "invoice",
      module: "books",
      ref: docLabel(invoice.invoiceNumber),
      fact: join(invoice.customer.name, money(invoice.total, invoice.currency)),
      status: invoiceStatus(invoice, today),
      href: invoice.invoiceNumber ? `/books/invoices?q=${encodeURIComponent(invoice.invoiceNumber)}` : `/books/invoices/${invoice.id}`,
      open: "Open invoice",
      actorName: null,
      facts: [
        { label: "Customer", value: invoice.customer.name },
        { label: "Total", value: money(invoice.total, invoice.currency) },
        { label: "Still owed", value: money(Math.max(0, balance), invoice.currency) },
        { label: "Issued", value: shortDay(storedDay(invoice.invoiceDate)) },
        ...(invoice.dueDate ? [{ label: "Due", value: shortDay(storedDay(invoice.dueDate)) }] : []),
      ],
      thread: [],
    });
  }

  for (const receipt of receipts) {
    const currency = receipt.invoice?.currency ?? "USD";
    out.set(keyOf({ kind: "receipt", id: receipt.id }), {
      kind: "receipt",
      module: "books",
      ref: receipt.receiptNumber,
      fact: join(receipt.invoice?.customer.name, money(receipt.amount, currency), methodWord(receipt.method)),
      status: { label: "Received", tone: "success" },
      href: `/books/payments?q=${encodeURIComponent(receipt.receiptNumber)}`,
      open: "Open payment",
      actorName: null,
      facts: [
        ...(receipt.invoice ? [{ label: "Customer", value: receipt.invoice.customer.name }] : []),
        { label: "Amount", value: money(receipt.amount, currency) },
        { label: "By", value: methodWord(receipt.method) },
        { label: "Received", value: shortDay(dayOf(receipt.receivedAt)) },
        ...(receipt.invoice ? [{ label: "Against", value: docLabel(receipt.invoice.invoiceNumber) }] : []),
        ...(receipt.invoice
          ? [{ label: "Invoice still owes", value: money(Math.max(0, receipt.invoice.total - receipt.invoice.amountPaid), currency) }]
          : []),
      ],
      thread: [],
    });
  }

  const dealConcern = (deal: (typeof deals)[number] | NonNullable<(typeof comments)[number]["deal"]>): Omit<Concern, "kind" | "thread" | "actorName"> => {
    const value = deal.value != null ? money(deal.value, deal.currency) : null;
    const won = deal.stage.status === "WON";
    const lost = deal.stage.status === "LOST";
    return {
      module: "crm",
      ref: deal.title,
      fact: join(deal.client?.name, value),
      status: { label: deal.stage.name, tone: won ? "success" : lost ? "danger" : null },
      href: `/crm/deals/${deal.id}`,
      open: "Open deal",
      facts: [
        ...(deal.client?.name ? [{ label: "Client", value: deal.client.name }] : []),
        ...(value ? [{ label: "Value", value }] : []),
        { label: "Stage", value: deal.stage.name },
        ...("assignedTo" in deal && deal.assignedTo?.name ? [{ label: "Owner", value: deal.assignedTo.name }] : []),
        ...("expectedCloseDate" in deal && deal.expectedCloseDate
          ? [{ label: "Expected to close", value: shortDay(storedDay(deal.expectedCloseDate)) }]
          : []),
      ],
    };
  };

  for (const deal of deals) {
    out.set(keyOf({ kind: "deal", id: deal.id }), { kind: "deal", actorName: null, thread: [], ...dealConcern(deal) });
  }

  for (const lead of leads) {
    const name = lead.title || lead.contactName || "Lead";
    const stage = lead.stage.charAt(0) + lead.stage.slice(1).toLowerCase().replace(/_/g, " ");
    out.set(keyOf({ kind: "lead", id: lead.id }), {
      kind: "lead",
      module: "crm",
      ref: name,
      fact: join(lead.contactName !== name ? lead.contactName : null, lead.estimatedValue != null ? money(lead.estimatedValue) : null),
      status: { label: stage, tone: null },
      href: `/crm/leads/${lead.id}`,
      open: "Open lead",
      actorName: null,
      facts: [
        ...(lead.contactName ? [{ label: "Contact", value: lead.contactName }] : []),
        { label: "Stage", value: stage },
        ...(lead.estimatedValue != null ? [{ label: "Estimated value", value: money(lead.estimatedValue) }] : []),
      ],
      thread: [],
    });
  }

  for (const comment of comments) {
    const replies = (Array.isArray(comment.replies) ? comment.replies : []) as unknown as Array<{
      body: string;
      createdAt: Date;
      createdBy: { name: string };
    }>;
    const thread = [
      { author: comment.createdBy.name, body: comment.body, at: comment.createdAt.toISOString() },
      ...replies.map((reply) => ({ author: reply.createdBy.name, body: reply.body, at: reply.createdAt.toISOString() })),
    ];
    if (comment.deal) {
      out.set(keyOf({ kind: "comment", id: comment.id }), {
        kind: "comment",
        actorName: comment.createdBy.name,
        thread,
        ...dealConcern(comment.deal),
        open: "Open the thread",
      });
    } else {
      const name = comment.lead?.title || comment.lead?.contactName || "Comment";
      out.set(keyOf({ kind: "comment", id: comment.id }), {
        kind: "comment",
        module: "crm",
        ref: name,
        fact: null,
        status: null,
        href: comment.lead ? `/crm/leads/${comment.lead.id}` : "/crm",
        open: "Open the thread",
        actorName: comment.createdBy.name,
        facts: [],
        thread,
      });
    }
  }

  for (const request of leave) {
    const from = storedDay(request.startDate);
    const to = storedDay(request.endDate);
    const days = Number(request.workingDays);
    const dates = from === to ? shortDay(from) : `${shortDay(from)} to ${shortDay(to)}`;
    const dayWord = `${days % 1 === 0 ? days : days.toFixed(1)} ${days === 1 ? "day" : "days"}`;
    out.set(keyOf({ kind: "leave", id: request.id }), {
      kind: "leave",
      module: "people",
      ref: request.employee.name,
      fact: join(request.leaveType.name, dates, dayWord),
      status: LEAVE_STATUS[request.status] ?? null,
      href: "/people/leave",
      open: "Open leave",
      actorName: null,
      facts: [
        { label: "Who", value: request.employee.jobTitle ? `${request.employee.name}, ${request.employee.jobTitle}` : request.employee.name },
        { label: "Leave", value: request.leaveType.name },
        { label: "Dates", value: dates },
        { label: "Working days", value: dayWord },
        ...(request.coveringEmployee ? [{ label: "Cover", value: request.coveringEmployee.name }] : []),
        ...(request.reason ? [{ label: "Reason", value: request.reason }] : []),
      ],
      thread: [],
    });
  }

  for (const report of reports) {
    out.set(keyOf({ kind: "report", id: report.id }), {
      kind: "report",
      module: "reports",
      ref: report.title,
      fact: report.description ?? null,
      status: null,
      href: `/reports/custom/${report.id}`,
      open: "Open report",
      actorName: null,
      facts: [
        { label: "Report", value: report.title },
        ...(report.description ? [{ label: "About", value: report.description }] : []),
        { label: "Last changed", value: shortDay(dayOf(report.updatedAt)) },
      ],
      thread: [],
    });
  }

  for (const item of vane) {
    const action = item.action && typeof item.action === "object" ? (item.action as { label?: unknown }) : {};
    out.set(keyOf({ kind: "vane", id: item.id }), {
      kind: "vane",
      module: "vane",
      ref: item.kind === "ISSUE" ? "Issue" : item.kind === "SUGGESTION" ? "Suggestion" : "Insight",
      fact: `From ${item.sourceModule.charAt(0).toUpperCase()}${item.sourceModule.slice(1)}`,
      status: VANE_STATUS[item.status] ?? null,
      href: `/vane?card=${item.id}`,
      open: "Open in Vane",
      actorName: null,
      facts: [
        { label: "Kind", value: item.kind === "ISSUE" ? "Issue" : item.kind === "SUGGESTION" ? "Suggestion" : "Insight" },
        { label: "From", value: item.sourceModule.charAt(0).toUpperCase() + item.sourceModule.slice(1) },
        { label: "What Vane says", value: item.body },
        ...(typeof action.label === "string" ? [{ label: "Its proposal", value: action.label }] : []),
      ],
      thread: [],
    });
  }

  for (const run of runs) {
    out.set(keyOf({ kind: "payroll-run", id: run.id }), {
      kind: "payroll-run",
      module: "payroll",
      ref: `Pay run ${run.period.periodKey}`,
      fact: `${money(Number(run.netTotal))} net`,
      status: RUN_STATUS[run.status] ?? { label: run.status.charAt(0) + run.status.slice(1).toLowerCase(), tone: null },
      href: `/payroll/runs?runId=${run.id}`,
      open: "Check the run",
      actorName: null,
      facts: [
        { label: "Period", value: run.period.periodKey },
        { label: "Net pay", value: money(Number(run.netTotal)) },
      ],
      thread: [],
    });
  }

  return out;
}

export function concernKey(subject: Subject) {
  return keyOf(subject);
}
