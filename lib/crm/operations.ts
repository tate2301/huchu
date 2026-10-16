import { z } from "zod";

import type { CrmLeadStage } from "@prisma/client";

import { createCrmTask, CrmTaskRefused } from "@/lib/crm/create-task";
import { DealStageRefused, moveDealStage } from "@/lib/crm/deal-stage";
import { ActivityRefused, logCrmActivity } from "@/lib/crm/log-activity";
import { CRM_LEAD_STAGES, CRM_STAGE_LABELS } from "@/lib/crm/pipeline";
import { applyRecordBulk, BulkRefused, type BulkResult } from "@/lib/crm/registers/server/bulk";
import { DEAL_BULK, LEAD_BULK } from "@/lib/crm/registers/server/record-bulk";
import { CRM_TASK_TYPES } from "@/lib/crm/tasks";

import {
  createInvoiceForLead,
  createQuotationForLead,
  DocumentLockedError,
  recordReceiptForLead,
} from "@/lib/crm/accounting-bridge";
import { createLead, LeadRefused } from "@/lib/crm/create-lead";
import { emailDocumentToClient, NoRecipientError } from "@/lib/crm/document-email";
import { canEditRecord, canUser, denialMessage, type CrmCapability } from "@/lib/crm/permissions";
import { EmailRefused, sendCrmEmail } from "@/lib/crm/send-email";
import { EmailNotConfiguredError, isEmailConfigured } from "@/lib/email/send";
import { listOf, longDay, routeGate } from "@/lib/operations/gate";
import { OperationRefused, type Operation, type OperationActor } from "@/lib/operations/types";
import { prisma } from "@/lib/prisma";
import { VaneDraftNotTakenOn } from "@/lib/vane/drafts";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Write it as a day, like 2026-10-30.");

const task = {
  key: "crm.task.create",
  name: "Create a task",
  risk: "change",
  product: "crm",
  description:
    "Raise a CRM task, filed against a deal, lead, company or person, for the person approving or for someone else (that needs their permission to assign others). Use for a follow-up that a person must do: ring a customer, chase a quote.",
  input: z.object({
    title: z.string().trim().min(1).max(200),
    dueOn: day,
    type: z.enum(CRM_TASK_TYPES).default("GENERAL"),
    assignedToId: z.string().min(1).optional(),
    assignedToName: z.string().min(1).optional(),
    dealId: z.string().min(1).optional(),
    leadId: z.string().min(1).optional(),
    clientId: z.string().min(1).optional(),
    personId: z.string().min(1).optional(),
    about: z.string().max(120).optional().describe('What it is filed against, in words: "Pomona Offices".'),
  }),
  fields: [
    { name: "title", label: "Task", type: "text" },
    { name: "dueOn", label: "Due on", type: "date" },
  ],
  verb: () => "Raise the task",
  title: (p) => `${p.title}${p.about ? `, for ${p.about}` : ""}, due ${longDay(p.dueOn)}${p.assignedToName ? `, for ${p.assignedToName}` : ""}`,
  target: (p) => (p.dealId ? `/crm/deals/${p.dealId}` : p.leadId ? `/crm/leads/${p.leadId}` : "/crm/tasks"),
  authorize: (context) => routeGate(context, "/api/v2/crm/tasks"),
  async run(context, p) {
    try {
      const created = await createCrmTask(context.session, {
        title: p.title,
        type: p.type,
        dueAt: new Date(`${p.dueOn}T00:00:00Z`).toISOString(),
        hasDueTime: false,
        assignedToId: p.assignedToId ?? null,
        dealId: p.dealId ?? null,
        leadId: p.leadId ?? null,
        clientId: p.clientId ?? null,
        personId: p.personId ?? null,
      });
      return `Raised "${created.title}" for ${created.assignedTo?.name ?? "you"}, due ${longDay(p.dueOn)}.`;
    } catch (error) {
      if (error instanceof CrmTaskRefused) throw new OperationRefused(error.message);
      throw error;
    }
  },
} satisfies Operation<{
  title: string;
  dueOn: string;
  type: (typeof CRM_TASK_TYPES)[number];
  assignedToId?: string;
  assignedToName?: string;
  dealId?: string;
  leadId?: string;
  clientId?: string;
  personId?: string;
  about?: string;
}>;

const dealStage = {
  key: "crm.deal.stage",
  name: "Move a deal to a stage",
  risk: "change",
  product: "crm",
  description:
    "Move one deal to another stage of its pipeline: a deal the customer has signed to Won, one gone quiet past its close date to Lost with the reason. The stage's own gates still apply: a missing required field stops it, and the result says what is missing.",
  input: z.object({
    dealId: z.string().min(1),
    deal: z.string().min(1).describe('The deal as people know it: "Pomona Offices, fit-out".'),
    stageId: z.string().min(1),
    stage: z.string().min(1).describe("The stage's name."),
    lostReason: z.string().trim().max(500).optional().describe("Moving to a lost stage: why, in the customer's words where you have them."),
  }),
  fields: [],
  verb: (p) => `Move to ${p.stage}`,
  title: (p) => `Move ${p.deal} to ${p.stage}${p.lostReason ? `: ${p.lostReason}` : ""}`,
  target: (p) => `/crm/deals/${p.dealId}`,
  authorize: (context) => routeGate(context, "/api/v2/crm/deals"),
  async run(context, p) {
    try {
      const moved = await moveDealStage(context.session, p.dealId, { stageId: p.stageId, lostReason: p.lostReason });
      return moved.moved ? `${p.deal} moved from ${moved.from} to ${moved.to}.` : `${p.deal} was already in ${moved.to}.`;
    } catch (error) {
      if (error instanceof DealStageRefused) throw new OperationRefused(error.blockers ? `Not moved. ${error.blockers.join(" ")}` : error.message);
      throw error;
    }
  },
} satisfies Operation<{ dealId: string; deal: string; stageId: string; stage: string; lostReason?: string }>;

const leadStage = {
  key: "crm.lead.stage",
  name: "Move leads to a stage",
  risk: "change",
  product: "crm",
  description: `Move one or more leads to a stage (${CRM_LEAD_STAGES.join(", ")}). Past Contacted a lead becomes a deal, as on the board. Lost needs lostReason.`,
  input: z
    .object({
      leadIds: z.array(z.string().min(1)).min(1).max(50),
      leads: z.array(z.string().min(1)).min(1).max(50).describe("Each lead's title, in the same order."),
      stage: z.enum(CRM_LEAD_STAGES as [CrmLeadStage, ...CrmLeadStage[]]),
      lostReason: z.string().trim().max(500).optional(),
    })
    .refine((p) => p.stage !== "LOST" || Boolean(p.lostReason), { message: "Say why they were lost.", path: ["lostReason"] }),
  fields: [],
  verb: (p) => `Move to ${CRM_STAGE_LABELS[p.stage]}`,
  title: (p) => `Move ${listOf(p.leads)} to ${CRM_STAGE_LABELS[p.stage]}${p.lostReason ? `: ${p.lostReason}` : ""}`,
  target: (p) => (p.leadIds.length === 1 ? `/crm/leads/${p.leadIds[0]}` : `/crm/leads?stage=${p.stage}`),
  authorize: (context) => routeGate(context, "/api/v2/crm/leads/bulk"),
  async run(context, p) {
    const result = await bulkOrSay(() => applyRecordBulk(LEAD_BULK, context.session, { action: "status", ids: p.leadIds, value: p.stage, reason: p.lostReason }));
    return bulkWords(result, { one: "lead", many: "leads" }, `moved to ${CRM_STAGE_LABELS[p.stage]}`, `in ${CRM_STAGE_LABELS[p.stage]}`);
  },
} satisfies Operation<{ leadIds: string[]; leads: string[]; stage: CrmLeadStage; lostReason?: string }>;

const RECORDS = { deals: { one: "deal", many: "deals", spec: DEAL_BULK }, leads: { one: "lead", many: "leads", spec: LEAD_BULK } } as const;

const assignOwner = {
  key: "crm.owner.assign",
  name: "Give records to an owner",
  risk: "access",
  product: "crm",
  description:
    "Give deals or leads an owner: unassigned ones, or those left with someone who has gone. Only records the approving person may edit move; the rest are left and the result says why.",
  input: z.object({
    records: z.enum(["deals", "leads"]),
    ids: z.array(z.string().min(1)).min(1).max(50),
    names: z.array(z.string().min(1)).min(1).max(50).describe("Each record's title, in the same order."),
    ownerId: z.string().min(1),
    owner: z.string().min(1).describe("The new owner's name."),
  }),
  fields: [],
  verb: (p) => `Give ${p.ids.length === 1 ? "it" : `all ${p.ids.length}`} to ${p.owner.split(/\s+/)[0]}`,
  title: (p) => `Give ${listOf(p.names)} to ${p.owner}`,
  target: (p) => (p.ids.length === 1 ? `/crm/${p.records}/${p.ids[0]}` : `/crm/${p.records}?owner=${encodeURIComponent(p.ownerId)}`),
  authorize: (context, p) => routeGate(context, `/api/v2/crm/${p.records}/bulk`),
  async run(context, p) {
    const record = RECORDS[p.records];
    const result = await bulkOrSay(() => applyRecordBulk(record.spec, context.session, { action: "assign", ids: p.ids, value: p.ownerId }));
    return bulkWords(result, record, `given to ${p.owner}`, `with ${p.owner}`);
  },
} satisfies Operation<{ records: "deals" | "leads"; ids: string[]; names: string[]; ownerId: string; owner: string }>;

const ACTIVITY_TYPES = ["NOTE", "CALL", "EMAIL", "WHATSAPP", "MEETING"] as const;
const ACTIVITY_WORD: Record<(typeof ACTIVITY_TYPES)[number], string> = { NOTE: "note", CALL: "call", EMAIL: "email", WHATSAPP: "WhatsApp", MEETING: "meeting" };

const logNote = {
  key: "crm.note.log",
  name: "Log a note, call or message",
  risk: "change",
  product: "crm",
  description:
    "Log a note, call, email, WhatsApp or meeting on a deal, lead, company or person, so its history says what happened: a customer's reply Vane found, what was agreed. It moves the record's last contacted date.",
  input: z
    .object({
      type: z.enum(ACTIVITY_TYPES).default("NOTE"),
      subject: z.string().trim().min(1).max(200),
      body: z.string().trim().max(4000).optional(),
      about: z.string().min(1).max(120).describe('The record, in words: "Pomona Offices".'),
      dealId: z.string().uuid().optional(),
      leadId: z.string().uuid().optional(),
      clientId: z.string().uuid().optional(),
      personId: z.string().uuid().optional(),
    })
    .refine((p) => Boolean(p.dealId || p.leadId || p.clientId || p.personId), { message: "Name the record it goes on." }),
  fields: [
    { name: "subject", label: "Subject", type: "text" },
    { name: "body", label: "Note", type: "text", multiline: true },
  ],
  verb: () => "Log it",
  title: (p) => `Log a ${ACTIVITY_WORD[p.type]} on ${p.about}: ${p.subject}`,
  target: (p) =>
    p.dealId ? `/crm/deals/${p.dealId}` : p.leadId ? `/crm/leads/${p.leadId}` : p.clientId ? `/crm/companies/${p.clientId}` : `/crm/people/${p.personId}`,
  authorize: (context) => routeGate(context, "/api/v2/crm/activities"),
  async run(context, p) {
    try {
      await logCrmActivity({ companyId: context.companyId, userId: context.userId }, p);
      return `Logged on ${p.about}.`;
    } catch (error) {
      if (error instanceof ActivityRefused) throw new OperationRefused(`${error.message}.`);
      throw error;
    }
  },
} satisfies Operation<{
  type: (typeof ACTIVITY_TYPES)[number];
  subject: string;
  body?: string;
  about: string;
  dealId?: string;
  leadId?: string;
  clientId?: string;
  personId?: string;
}>;

async function bulkOrSay(change: () => Promise<BulkResult>): Promise<BulkResult> {
  try {
    return await change();
  } catch (error) {
    if (error instanceof BulkRefused) throw new OperationRefused(`${error.message}.`);
    throw error;
  }
}

/** "3 leads moved to Qualified. 1 was left: they belong to someone else." */
function bulkWords(result: BulkResult, noun: { one: string; many: string }, done: string, already: string): string {
  const count = (n: number) => `${n} ${n === 1 ? noun.one : noun.many}`;
  if (result.updated === 0 && result.unchanged === 0) {
    throw new OperationRefused(result.skipped ? `None changed: ${result.skippedReason}.` : `None of those ${noun.many} is here any more.`);
  }
  const parts = [result.updated ? `${count(result.updated)} ${done}.` : `They were already ${already}.`];
  if (result.skipped) parts.push(`${count(result.skipped)} left: ${result.skippedReason}.`);
  if (result.notFound) parts.push(`${count(result.notFound)} not found.`);
  return parts.join(" ");
}

// ── Documents, leads and email ─────────────────────────────────────────────

/** A deal or a lead: the record a quote, invoice, receipt or email belongs to, named in words for the line a person reads. */
const recordInput = {
  dealId: z.string().uuid().optional(),
  leadId: z.string().uuid().optional(),
  record: z.string().min(1).max(160).describe('The deal or lead, in words: "Pomona Offices, fit-out".'),
};
const oneRecord = (p: { dealId?: string; leadId?: string }) => Boolean(p.dealId) !== Boolean(p.leadId);
const ONE_RECORD = { message: "Name one deal or one lead." };
type RecordRef = { dealId?: string; leadId?: string; record: string };
const owner = (p: RecordRef) => (p.dealId ? { dealId: p.dealId } : { leadId: p.leadId! });
const recordPage = (p: RecordRef) => (p.dealId ? `/crm/deals/${p.dealId}` : `/crm/leads/${p.leadId}`);

const line = z.object({
  description: z.string().trim().min(1).max(300),
  quantity: z.number().positive(),
  unitPrice: z.number().min(0),
  taxRate: z.number().min(0).max(100).optional(),
  productId: z.string().uuid().optional().describe("The catalogue product it is, when it is one: the quote's price check compares with it."),
});
type Line = z.infer<typeof line>;

const money = (amount: number, currency = "USD") =>
  `${currency === "USD" ? "$" : `${currency} `}${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const linesTotal = (lines: Line[]) =>
  lines.reduce((sum, row) => sum + Math.round(row.quantity * row.unitPrice * (1 + (row.taxRate ?? 0) / 100) * 100) / 100, 0);
const asDate = (value?: string | null) => (value ? new Date(`${value}T00:00:00Z`) : null);

/**
 * The document routes' checks, made again for the person it runs as: the
 * route (role and the CRM being on), the right to change this deal or lead
 * (their own, or anybody's), and the CRM capability the route asks for.
 */
async function recordGate(actor: OperationActor, p: { dealId?: string; leadId?: string }, capability: CrmCapability): Promise<string | null> {
  const route = routeGate(actor, p.dealId ? "/api/v2/crm/deals" : "/api/v2/crm/leads");
  if (route) return route;
  const record = p.dealId
    ? await prisma.crmDeal.findFirst({ where: { id: p.dealId, companyId: actor.companyId }, select: { assignedToId: true } })
    : await prisma.crmLead.findFirst({ where: { id: p.leadId, companyId: actor.companyId }, select: { assignedToId: true } });
  if (!record) return `That ${p.dealId ? "deal" : "lead"} is not in this workspace.`;
  if (!(await canEditRecord(actor.session, record.assignedToId))) return `That ${p.dealId ? "deal" : "lead"} is someone else's, and you can change only your own.`;
  if (!(await canUser(actor.session, capability))) return denialMessage(capability);
  return null;
}

/** The CRM's own refusals are sentences already ("This deal has no company; attach one before quoting or invoicing"). */
async function asCrm<T>(act: () => Promise<T>): Promise<T> {
  try {
    return await act();
  } catch (error) {
    if (error instanceof DocumentLockedError || error instanceof LeadRefused || error instanceof EmailRefused || error instanceof NoRecipientError || error instanceof VaneDraftNotTakenOn) {
      throw new OperationRefused(error.message);
    }
    if (error instanceof EmailNotConfiguredError) throw new OperationRefused("Email is not set up for this workspace yet, so nothing can be sent.");
    // The document functions throw plain errors whose messages are written for people.
    if (error instanceof Error && error.constructor === Error) throw new OperationRefused(error.message.replace(/\.?$/, "."));
    throw error;
  }
}

const quote = {
  key: "crm.quote.create",
  name: "Create a quote",
  risk: "change",
  product: "crm",
  description:
    "Write a quote on a deal or lead, line by line, as the person who approves it: numbered, filed on the record, ready to send from its page (crm.document.email sends it). Price each line from the catalogue (productId and its price) or from what the person told you; never invent a price. A lead moves to Quoted.",
  input: z
    .object({
      ...recordInput,
      lines: z.array(line).min(1).max(60),
      currency: z.string().length(3).optional().describe('"USD" unless the deal is in another currency.'),
      validUntil: day.optional().describe("When the quote stops holding; 30 days from today unless they said."),
      notes: z.string().trim().max(2000).optional().describe("What the client should know: what it assumes, what it leaves out."),
    })
    .refine(oneRecord, ONE_RECORD),
  fields: [
    { name: "validUntil", label: "Holds until", type: "date" },
    { name: "notes", label: "Notes for the client", type: "text", multiline: true },
  ],
  verb: () => "Create the quote",
  title: (p) => `Quote ${p.record}: ${listOf(p.lines.slice(0, 3).map((row) => row.description))}${p.lines.length > 3 ? ` and ${p.lines.length - 3} more` : ""}, ${money(linesTotal(p.lines), p.currency)}`,
  target: (p) => recordPage(p),
  authorize: (actor, p) => recordGate(actor, p, "documents.issue"),
  async run(actor, p) {
    const made = await asCrm(() =>
      createQuotationForLead({
        companyId: actor.companyId,
        userId: actor.userId,
        ...owner(p),
        lines: p.lines,
        currency: p.currency,
        validUntil: asDate(p.validUntil),
        notes: p.notes ?? null,
      }),
    );
    return { said: `${made.quotationNumber} is ready for ${p.record}, ${money(made.total, p.currency)}. Send it from the quote.`, record: { id: made.leadDocumentId, href: `/crm/quotes/${made.leadDocumentId}` } };
  },
} satisfies Operation<RecordRef & { lines: Line[]; currency?: string; validUntil?: string; notes?: string }>;

const invoice = {
  key: "crm.invoice.create",
  name: "Create an invoice",
  risk: "money",
  product: "crm",
  description:
    "Invoice a deal or lead as the person who approves it: from one of its quotes (fromQuotationId, the quote's SalesQuotation id; the quote is then accepted), or line by line. It is issued and posted to the books at once, so propose it only when the work is agreed. A lead moves to Invoiced.",
  input: z
    .object({
      ...recordInput,
      fromQuotationId: z.string().uuid().optional(),
      fromQuote: z.string().max(40).optional().describe('The quote\'s number, for the line a person reads: "QTN-0398".'),
      lines: z.array(line).min(1).max(60).optional(),
      currency: z.string().length(3).optional(),
      dueDate: day.optional().describe("When it falls due: the customer's usual terms."),
      notes: z.string().trim().max(2000).optional(),
      isDeposit: z.boolean().optional().describe("Money down against the quote, not the whole of it."),
    })
    .refine(oneRecord, ONE_RECORD)
    .refine((p) => Boolean(p.fromQuotationId) !== Boolean(p.lines?.length), { message: "Invoice from one quote, or line by line, not both." }),
  fields: [
    { name: "dueDate", label: "Due on", type: "date" },
    { name: "notes", label: "Notes for the client", type: "text", multiline: true },
  ],
  verb: (p) => (p.isDeposit ? "Invoice the deposit" : "Issue the invoice"),
  title: (p) =>
    `Invoice ${p.record}${p.fromQuotationId ? ` for ${p.fromQuote ?? "its quote"}` : `: ${money(linesTotal(p.lines ?? []), p.currency)}`}${p.dueDate ? `, due ${longDay(p.dueDate)}` : ""}`,
  target: (p) => recordPage(p),
  authorize: (actor, p) => recordGate(actor, p, "documents.issue"),
  async run(actor, p) {
    const made = await asCrm(() =>
      createInvoiceForLead({
        companyId: actor.companyId,
        userId: actor.userId,
        ...owner(p),
        fromQuotationId: p.fromQuotationId,
        lines: p.lines,
        currency: p.currency,
        dueDate: asDate(p.dueDate),
        notes: p.notes ?? null,
        isDeposit: p.isDeposit,
      }),
    );
    return { said: `${made.invoiceNumber} is issued to ${p.record}, ${money(made.total, p.currency)}, and posted to the books.`, record: { id: made.leadDocumentId, href: `/crm/invoices/${made.leadDocumentId}` } };
  },
} satisfies Operation<RecordRef & { fromQuotationId?: string; fromQuote?: string; lines?: Line[]; currency?: string; dueDate?: string; notes?: string; isDeposit?: boolean }>;

const RECEIPT_METHODS = ["Cash", "Bank transfer", "Mobile money", "Card", "Cheque", "Other"] as const;

const receipt = {
  key: "crm.receipt.record",
  name: "Record a payment against an invoice",
  risk: "money",
  product: "crm",
  description:
    "Record money received against one of a deal's or lead's invoices (invoiceDocumentId, the invoice's CrmLeadDocument id), as the person who approves it: a receipt is filed and posted, the invoice's balance falls, and a record paid in full is won. Never more than is owed. Propose it only for a payment the person or the bank says arrived.",
  input: z
    .object({
      ...recordInput,
      invoiceDocumentId: z.string().uuid(),
      invoiceNumber: z.string().min(1).max(40),
      amount: z.number().positive(),
      currency: z.string().length(3).optional(),
      method: z.enum(RECEIPT_METHODS),
      receivedOn: day.optional().describe("The day it arrived; today unless they said."),
      reference: z.string().trim().max(120).optional().describe("The bank's or EcoCash's reference."),
    })
    .refine(oneRecord, ONE_RECORD),
  fields: [
    { name: "amount", label: "Amount", type: "number" },
    { name: "method", label: "How it was paid", type: "select", options: RECEIPT_METHODS.map((value) => ({ value, label: value })) },
    { name: "receivedOn", label: "Received on", type: "date" },
    { name: "reference", label: "Reference", type: "text" },
  ],
  verb: () => "Record the payment",
  title: (p) => `Record ${money(p.amount, p.currency)} by ${p.method.toLowerCase()} against ${p.invoiceNumber}, ${p.record}`,
  target: (p) => recordPage(p),
  authorize: (actor, p) => recordGate(actor, p, "documents.issue"),
  async run(actor, p) {
    const made = await asCrm(() =>
      recordReceiptForLead({
        companyId: actor.companyId,
        userId: actor.userId,
        ...owner(p),
        invoiceDocumentId: p.invoiceDocumentId,
        amount: p.amount,
        method: p.method,
        receivedAt: asDate(p.receivedOn),
        reference: p.reference ?? null,
      }),
    );
    return { said: `${money(p.amount, p.currency)} is recorded against ${p.invoiceNumber}.`, record: { id: made.leadDocumentId, href: `/crm/receipts/${made.leadDocumentId}` } };
  },
} satisfies Operation<
  RecordRef & { invoiceDocumentId: string; invoiceNumber: string; amount: number; currency?: string; method: (typeof RECEIPT_METHODS)[number]; receivedOn?: string; reference?: string }
>;

const lead = {
  key: "crm.lead.create",
  name: "Create a lead",
  risk: "change",
  product: "crm",
  description:
    "Add a lead, as the person who approves it: someone who asked about work, from an email, a call or a message Vane read. It is numbered, scored and given to someone (assignedToId, or the workspace's lead rules pick), and the lead rules run on it. Look for the person or company first (run_sql on CrmLead, CrmPerson, CrmClient): one already there is not added twice.",
  input: z.object({
    title: z.string().trim().min(1).max(200).describe('What they want: "Carpet tiles for the Pomona offices".'),
    contactName: z.string().trim().max(200).optional(),
    contactEmail: z.string().trim().email().max(200).optional(),
    contactPhone: z.string().trim().max(40).optional(),
    clientId: z.string().uuid().optional().describe("The company, when it is already in the CRM."),
    estimatedValue: z.number().nonnegative().optional(),
    currency: z.string().length(3).optional(),
    services: z.array(z.string().trim().max(80)).max(40).optional(),
    source: z.string().trim().max(120).optional().describe('Where it came from: "Email", "Walk-in", "Referral from Mrs Gumbo".'),
    assignedToId: z.string().uuid().optional(),
    assignedToName: z.string().max(120).optional(),
  }),
  fields: [
    { name: "title", label: "What they want", type: "text" },
    { name: "contactName", label: "Name", type: "text" },
    { name: "contactPhone", label: "Phone", type: "text" },
    { name: "contactEmail", label: "Email", type: "text" },
    { name: "estimatedValue", label: "Worth about", type: "number" },
  ],
  verb: () => "Add the lead",
  title: (p) => `Add a lead: ${p.title}${p.contactName ? `, ${p.contactName}` : ""}${p.assignedToName ? `, for ${p.assignedToName}` : ""}`,
  target: () => "/crm/leads",
  authorize: (actor) => routeGate(actor, "/api/v2/crm/leads"),
  async run(actor, p) {
    const { lead: made } = await asCrm(() => createLead({ companyId: actor.companyId, userId: actor.userId }, p));
    return { said: `${made.leadNo} is added: ${p.title}.`, record: { id: made.id, href: `/crm/leads/${made.id}` } };
  },
} satisfies Operation<{
  title: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  clientId?: string;
  estimatedValue?: number;
  currency?: string;
  services?: string[];
  source?: string;
  assignedToId?: string;
  assignedToName?: string;
}>;

type EmailInput = { to: string; toName?: string; subject: string; message: string; about: string; dealId?: string; leadId?: string; personId?: string; clientId?: string };

/** Writing to someone on a record is changing it: the person must be able to change that record. */
async function emailGate(actor: OperationActor, p: EmailInput): Promise<string | null> {
  const route = routeGate(actor, "/api/v2/crm/activities");
  if (route) return route;
  if (!isEmailConfigured()) return "Email is not set up for this workspace yet, so nothing can be sent.";
  const record = p.dealId
    ? await prisma.crmDeal.findFirst({ where: { id: p.dealId, companyId: actor.companyId }, select: { assignedToId: true } })
    : p.leadId
      ? await prisma.crmLead.findFirst({ where: { id: p.leadId, companyId: actor.companyId }, select: { assignedToId: true } })
      : p.personId
        ? await prisma.crmPerson.findFirst({ where: { id: p.personId, companyId: actor.companyId }, select: { assignedToId: true } })
        : await prisma.crmClient.findFirst({ where: { id: p.clientId, companyId: actor.companyId }, select: { assignedToId: true } });
  if (!record) return `${p.about} is not in this workspace.`;
  if (!(await canEditRecord(actor.session, record.assignedToId))) return `${p.about} is someone else's, and you can write only to your own.`;
  return null;
}

const email = {
  key: "crm.email.send",
  name: "Send an email",
  risk: "send",
  product: "crm",
  description:
    "Send an email from the business to someone on a lead, deal, person or company: a follow-up, an answer, a nudge. Write it in the person's voice, short and plain, with the facts you read; they can change the words before it goes. It goes only to an address the record holds, from the workspace's name, with replies to its own address, and is logged on the record. For a quote or an invoice, use crm.document.email instead.",
  input: z
    .object({
      to: z.string().trim().email().max(200),
      toName: z.string().max(120).optional(),
      subject: z.string().trim().min(1).max(200),
      message: z.string().trim().min(1).max(5000),
      about: z.string().min(1).max(160).describe('The record, in words: "Pomona Offices".'),
      dealId: z.string().uuid().optional(),
      leadId: z.string().uuid().optional(),
      personId: z.string().uuid().optional(),
      clientId: z.string().uuid().optional(),
    })
    .refine((p) => [p.dealId, p.leadId, p.personId, p.clientId].filter(Boolean).length === 1, { message: "Name the one record it is about." }),
  fields: [
    { name: "subject", label: "Subject", type: "text" },
    { name: "message", label: "Message", type: "text", multiline: true },
  ],
  verb: () => "Send the email",
  title: (p) => `Email ${p.toName ?? p.to} about ${p.about}: ${p.subject}`,
  target: (p) => (p.dealId ? `/crm/deals/${p.dealId}` : p.leadId ? `/crm/leads/${p.leadId}` : p.clientId ? `/crm/companies/${p.clientId}` : `/crm/people/${p.personId}`),
  authorize: (actor, p) => emailGate(actor, p),
  async run(actor, p) {
    const sent = await asCrm(() =>
      sendCrmEmail(
        { companyId: actor.companyId, userId: actor.userId },
        { to: p.to, subject: p.subject, message: p.message, about: { dealId: p.dealId, leadId: p.leadId, personId: p.personId, clientId: p.clientId } },
      ),
    );
    return `Sent to ${p.toName ? `${p.toName} (${sent.to})` : sent.to}, and logged on ${p.about}.`;
  },
} satisfies Operation<EmailInput>;

const sendDocument = {
  key: "crm.document.email",
  name: "Email a quote or invoice",
  risk: "send",
  product: "crm",
  description:
    "Email one of a deal's or lead's quotes or invoices to the client (documentId, its CrmLeadDocument id), with its PDF and the link to accept or pay, as the document's own Send does. Write the note in the person's voice; leave it out and the usual one goes. A draft Vane made goes only once a person has confirmed it as theirs.",
  input: z
    .object({
      ...recordInput,
      documentId: z.string().uuid(),
      number: z.string().min(1).max(40).describe('"QTN-0398".'),
      subject: z.string().trim().min(1).max(200).optional(),
      message: z.string().trim().min(1).max(5000).optional(),
    })
    .refine(oneRecord, ONE_RECORD),
  fields: [
    { name: "subject", label: "Subject", type: "text" },
    { name: "message", label: "Message", type: "text", multiline: true },
  ],
  verb: (p) => `Send ${p.number}`,
  title: (p) => `Email ${p.number} to ${p.record}${p.subject ? `: ${p.subject}` : ""}`,
  target: (p) => recordPage(p),
  authorize: (actor, p) => recordGate(actor, p, "documents.approve"),
  async run(actor, p) {
    const doc = await prisma.crmLeadDocument.findFirst({ where: { id: p.documentId, companyId: actor.companyId, ...owner(p) }, select: { id: true } });
    if (!doc) throw new OperationRefused(`${p.number} is not on ${p.record}.`);
    const sent = await asCrm(() => emailDocumentToClient({ companyId: actor.companyId, leadDocumentId: p.documentId, subject: p.subject, message: p.message }));
    return `${p.number} went to ${sent.to}.`;
  },
} satisfies Operation<RecordRef & { documentId: string; number: string; subject?: string; message?: string }>;

export const CRM_OPERATIONS = [task, dealStage, leadStage, assignOwner, logNote, quote, invoice, receipt, lead, email, sendDocument] as const;
