import { Prisma, type CrmRequisitionRejectReason, type NotificationType } from "@prisma/client";

import { assertTransition } from "@/lib/crm/requisitions";
import { reserveIdentifier } from "@/lib/id-generator";
import { money, toNumberOrZero } from "@/lib/money";
import { emitRetailNotification } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { activeOwners, getApprovalLimits } from "@/lib/retail/approvals/limits";
import { approvalLink, notifyApprover } from "@/lib/retail/approvals/notify";
import { writePlatformAuditEvent } from "@/lib/audit/platform";
import { auditAmount, auditRecordEdited, RETAIL_AUDIT_EVENTS, writeRetailAuditEvent, type RetailAuditActor } from "@/lib/retail/audit";
import { defaultSiteFor } from "@/lib/retail/floor/default-site";
import { canRetailRoleDo, type RetailAction } from "@/lib/retail/permission-matrix";
import { startOfDayIn } from "@/lib/reports/list-query";
import { dayKey, DEFAULT_TIME_ZONE, formatDay, formatMoney } from "@/lib/workspace/format";

import { AttachmentRefusal, recordAttachment, type UploadedFile } from "./attachments";
import { orderTotals } from "./figures";
import { currencyWords, findMoneyAccount, listMoneyAccounts, moneyAccountSub } from "./money-accounts";
import {
  approvedWords,
  firstName,
  LIVE_STATES,
  orderPurpose,
  REJECT_REASON_WORD,
  sentForApproval,
  type RequisitionState,
} from "./requisition-words";

/**
 * Requisitions in a shop (40-buying W-31, W-32, W-72, BUY-04): ask for money
 * for an order or an expense, approve it (an owner any amount; a manager at
 * or under the owner limit snapshotted when it was asked, never their own),
 * approve less, reject, ask a question and answer it, change it while it
 * waits, and cancel it before it is paid out. The CRM's state machine
 * (`lib/crm/requisitions.ts`) is the one in force: every move here is one it
 * allows. Each write is one transaction with its audit; who is told is told
 * after it commits, in the app and, when the approvals settings say so, on
 * WhatsApp through the outbox. No money moves in this unit: paying out and
 * accounting for it are BUY-05's.
 */

type Tx = Prisma.TransactionClient;

export class RequisitionRefusal extends Error {
  constructor(
    readonly status: 400 | 403 | 404 | 409,
    message: string,
    readonly fieldErrors: Record<string, string> | null = null,
  ) {
    super(message);
    this.name = "RequisitionRefusal";
  }
}

export const NOT_FOUND = "Requisition not found";
const invalid = (fieldErrors: Record<string, string>) => new RequisitionRefusal(400, "Validation failed", fieldErrors);

export type RequisitionDeps = { now?: Date; requestUrl?: string | null };

/* ── Who may do what ────────────────────────────────────────────────────── */

const can = (actor: RetailAuditActor, action: RetailAction) => canRetailRoleDo(actor.userRole, "retail.requisitions", action);
export const isOwner = (actor: RetailAuditActor) => (actor.userRole ?? "").toUpperCase() === "SUPERADMIN";
/** `view` reads every requisition; `view-own` (cashier, stock clerk) only the caller's own. */
export const readsEvery = (actor: RetailAuditActor) => can(actor, "view");

/** The shop's requisitions this person may read. */
export function requisitionScope(actor: RetailAuditActor): Prisma.CrmRequisitionWhereInput {
  return { companyId: actor.companyId, siteId: { not: null }, ...(readsEvery(actor) ? {} : { requestedById: actor.userId }) };
}

type Decidable = { requestedById: string; amount: Prisma.Decimal; approvalLimit: Prisma.Decimal | null };

/** "Over US$500.00 needs Tendai Mhlanga." */
export const overLimitWords = (limit: Prisma.Decimal | number, owner: string | null) =>
  `Over ${formatMoney(toNumberOrZero(limit))} needs ${owner ?? "the owner"}.`;
export const OWN_REQUEST = "Somebody else has to approve your own request.";

/**
 * Why this person may not approve or reject it, or null when they may: an
 * owner decides anything, their own too; a manager only at or under the
 * limit it was asked under, and never their own.
 */
export function decideRefusal(actor: RetailAuditActor, requisition: Decidable, ownerName: string | null): string | null {
  if (!can(actor, "approve")) return "Your role cannot approve requisitions";
  if (isOwner(actor)) return null;
  if (requisition.requestedById === actor.userId) return OWN_REQUEST;
  if (requisition.approvalLimit && requisition.amount.greaterThan(requisition.approvalLimit)) return overLimitWords(requisition.approvalLimit, ownerName);
  return null;
}

/** The asker cancels their own; owners and managers any. */
export const mayCancel = (actor: RetailAuditActor, requestedById: string) => requestedById === actor.userId || can(actor, "update");

/* ── Reading one ────────────────────────────────────────────────────────── */

const PERSON = { select: { id: true, name: true, phone: true, role: true } } as const;

const ONE_INCLUDE = {
  requestedBy: PERSON,
  approver: PERSON,
  approvedBy: PERSON,
  purchaseOrder: { select: { id: true, poNo: true, status: true, archivedAt: true, siteId: true, vendor: { select: { id: true, name: true } } } },
} satisfies Prisma.CrmRequisitionInclude;

type One = Prisma.CrmRequisitionGetPayload<{ include: typeof ONE_INCLUDE }>;

/** One requisition this person may read, or 404 (another's, for a view-own role, is not found). */
async function readOne(client: Tx | typeof prisma, actor: RetailAuditActor, id: string, anyone = false): Promise<One> {
  const where = anyone ? { id, companyId: actor.companyId, siteId: { not: null } } : { id, ...requisitionScope(actor) };
  const row = await client.crmRequisition.findFirst({ where, include: ONE_INCLUDE });
  if (!row) throw new RequisitionRefusal(404, NOT_FOUND);
  return row;
}

/** Why a requisition in this state cannot be decided: "REQ-0014 has already been approved." */
function notWaiting(requisitionNo: string, status: string): string {
  if (status === "REJECTED") return `${requisitionNo} has been rejected.`;
  if (status === "CANCELLED") return `${requisitionNo} has been cancelled.`;
  if (status === "DRAFT") return `${requisitionNo} has not been sent for approval.`;
  return `${requisitionNo} has already been approved.`;
}

/* ── Telling people ─────────────────────────────────────────────────────── */

type Person = { id: string; name: string; phone: string | null };

const viewPath = (id: string) => `/retail/buying/requisitions/${id}`;

/**
 * In the app, and on WhatsApp (template `template`) to those with a phone
 * while the approvals settings say "WhatsApp and the app". Never the actor.
 */
async function tell(
  actor: RetailAuditActor,
  input: {
    people: Person[];
    type: NotificationType;
    requisition: { id: string; requisitionNo: string };
    title: string;
    summary: string;
    template: string;
    text: string;
    severity?: "INFO" | "WARNING";
  },
): Promise<void> {
  const people = input.people.filter((person, index, all) => person.id !== actor.userId && all.findIndex((p) => p.id === person.id) === index);
  if (people.length === 0) return;
  await emitRetailNotification({
    companyId: actor.companyId,
    recipientIds: people.map((person) => person.id),
    type: input.type,
    title: input.title,
    summary: input.summary,
    entityType: "CRM_REQUISITION",
    entityId: input.requisition.id,
    viewPath: viewPath(input.requisition.id),
    severity: input.severity ?? "INFO",
  });
  const limits = await getApprovalLimits(actor.companyId);
  const phones = limits.askBy === "WHATSAPP_AND_APP" ? people.filter((person) => person.phone) : [];
  if (phones.length === 0) return;
  await prisma.retailMessage.createMany({
    data: phones.map((person) => ({
      companyId: actor.companyId,
      channel: "WHATSAPP" as const,
      to: person.phone!,
      template: input.template,
      body: input.text,
      direction: "OUT" as const,
      entityType: "CrmRequisition",
      entityId: input.requisition.id,
      createdById: actor.userId,
    })),
  });
}

/** Managers who could decide one at this site for this asker: active, at the site (or every site), not the asker. */
async function managersAt(companyId: string, siteId: string | null, askerId: string): Promise<Person[]> {
  const rows = await prisma.user.findMany({
    where: {
      companyId,
      isActive: true,
      role: { in: ["MANAGER", "SHOP_MANAGER"] },
      id: { not: askerId },
      ...(siteId ? { OR: [{ allSites: true }, { siteAccess: { some: { siteId } } }] } : {}),
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, name: true, phone: true },
  });
  return rows;
}

/** Who it waits for, by name: the owner approver over the limit; else the one manager who can decide it, or null ("the managers"). */
async function waitsForName(companyId: string, over: boolean, siteId: string | null, askerId: string, ownerName: string | null): Promise<string | null> {
  if (over) return ownerName ?? "the owner";
  const managers = await managersAt(companyId, siteId, askerId);
  return managers.length === 1 ? managers[0]!.name : null;
}

/* ── Ask for money (W-31, W-32) ─────────────────────────────────────────── */

export type AskInput = {
  for: "order" | "expense";
  orderId?: string | null;
  expenseTypeId?: string | null;
  whatFor?: string | null;
  amount: string | number;
  currency: "US$" | "ZiG";
  payFromId?: string | null;
  payToId?: string | null;
  /** `YYYY-MM-DD`, a shop day. */
  neededBy?: string | null;
  why?: string | null;
  quote?: UploadedFile | null;
};

export type Asked = {
  id: string;
  requisitionNo: string;
  /** "Tendai Mhlanga" when over the limit or exactly one manager can decide; null: "the managers". */
  waitsFor: string | null;
  message: string;
  over: boolean;
  siteId: string | null;
  title: string;
  summary: string;
};

const MAX_AMOUNT = new Prisma.Decimal("1000000");

function parseAmount(value: string | number, field = "amt"): Prisma.Decimal {
  const text = String(value ?? "").replace(/,/g, "").trim();
  const n = Number(text);
  if (!text || !Number.isFinite(n)) throw invalid({ [field]: "Write the amount, like 85.00." });
  return money(n);
}

/** The order's total with VAT, from its lines. */
async function orderTotal(client: Tx | typeof prisma, orderId: string): Promise<{ total: Prisma.Decimal; units: number }> {
  const lines = await client.retailPurchaseOrderLine.findMany({ where: { purchaseOrderId: orderId }, select: { quantity: true, unitCost: true, vatRate: true } });
  return { total: orderTotals(lines).total, units: lines.reduce((sum, line) => sum + toNumberOrZero(line.quantity), 0) };
}

/** The live requisition (Submitted, Approved, Paid out) for this order, if any. */
export async function liveRequisitionFor(client: Tx | typeof prisma, companyId: string, orderId: string, exceptId?: string) {
  return client.crmRequisition.findFirst({
    where: { companyId, purchaseOrderId: orderId, status: { in: LIVE_STATES }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true, requisitionNo: true, status: true },
  });
}

/**
 * The ask, inside a transaction (an order raised with "Ask for the cash now"
 * makes it in the order's own): validated, numbered, audited. Who decides it
 * is told by `tellApprovers` once the transaction commits.
 */
export async function askForMoneyIn(tx: Tx, actor: RetailAuditActor, input: AskInput, deps: RequisitionDeps = {}): Promise<Asked> {
  const companyId = actor.companyId;
  const now = deps.now ?? new Date();
  if (!can(actor, "create")) throw new RequisitionRefusal(403, "Your role cannot ask for money");
  const amount = parseAmount(input.amount);
  if (!amount.greaterThan(0)) throw invalid({ amt: "Ask for more than nought." });
  const currency = input.currency === "ZiG" ? "ZWG" : "USD";
  const why = input.why?.trim() || null;
  if (why && why.length > 1000) throw invalid({ why: "Keep it to 1,000 characters." });

  if (!input.payFromId) throw invalid({ from: "Choose where the money comes from." });
  const from = await findMoneyAccount(companyId, input.payFromId, tx);
  if (!from) throw invalid({ from: "Choose where the money comes from." });
  if (from.currency.toUpperCase() !== currency) throw invalid({ from: `${from.name} holds ${currencyWords(from.currency)}.` });

  let neededBy: Date | null = null;
  if (input.neededBy) {
    if (input.neededBy < dayKey(now)) throw invalid({ by: "Pick today or a later day." });
    neededBy = startOfDayIn(input.neededBy, DEFAULT_TIME_ZONE);
  }

  let data: Omit<Prisma.CrmRequisitionUncheckedCreateInput, "requisitionNo" | "companyId" | "amount" | "currency" | "requestedById">;
  let orderRef: string | null = null;
  if (input.for === "order") {
    if (!input.orderId) throw invalid({ po: "Choose the order." });
    const order = await tx.retailPurchaseOrder.findFirst({
      where: { id: input.orderId, companyId, archivedAt: null },
      select: { id: true, poNo: true, status: true, siteId: true, expectedDate: true, vendorId: true, vendor: { select: { name: true } } },
    });
    if (!order || !["DRAFT", "SENT", "PARTIAL"].includes(order.status)) throw invalid({ po: "Choose an open order." });
    const { total } = await orderTotal(tx, order.id);
    if (amount.greaterThan(total)) throw invalid({ amt: "Ask for the order total or less." });
    const live = await liveRequisitionFor(tx, companyId, order.id);
    if (live) throw new RequisitionRefusal(409, `${live.requisitionNo} already asks for ${order.poNo}.`);
    orderRef = order.poNo;
    data = {
      category: "STOCK",
      purpose: orderPurpose(order.vendor.name, order.poNo),
      notes: why,
      purchaseOrderId: order.id,
      payeeVendorId: order.vendorId,
      siteId: order.siteId,
      neededBy: neededBy ?? order.expectedDate,
    };
  } else {
    if (!input.expenseTypeId) throw invalid({ cat: "Choose what kind of expense it is." });
    const type = await tx.retailExpenseType.findFirst({ where: { id: input.expenseTypeId, companyId, archivedAt: null }, select: { id: true, category: true } });
    if (!type) throw invalid({ cat: "Choose what kind of expense it is." });
    const whatFor = input.whatFor?.replace(/\s+/g, " ").trim() ?? "";
    if (!whatFor) throw invalid({ what: "Say what the money is for." });
    if (whatFor.length > 200) throw invalid({ what: "Keep it to 200 characters." });
    if (amount.greaterThan(MAX_AMOUNT)) throw invalid({ amt: "Ask for US$1,000,000.00 or less." });
    let payee: string | null = null;
    if (input.payToId) {
      const vendor = await tx.vendor.findFirst({ where: { id: input.payToId, companyId }, select: { id: true } });
      if (!vendor) throw invalid({ to: "Choose who it is paid to." });
      payee = vendor.id;
    }
    const siteId = await defaultSiteFor(companyId, actor.userId);
    if (!siteId) throw new RequisitionRefusal(409, "Add a site first.");
    data = { category: type.category, purpose: whatFor, notes: why, expenseTypeId: type.id, payeeVendorId: payee, siteId, neededBy };
  }

  const limits = await getApprovalLimits(companyId, tx);
  const over = amount.greaterThan(limits.requisitionOwnerOver);
  const requisitionNo = await reserveIdentifier(tx, { companyId, entity: "CRM_REQUISITION" });
  const created = await tx.crmRequisition.create({
    data: {
      ...data,
      companyId,
      requisitionNo,
      amount,
      currency,
      bankAccountId: from.id,
      requestedById: actor.userId,
      status: "SUBMITTED",
      submittedAt: now,
      approvalLimit: limits.requisitionOwnerOver,
      approverId: over ? (limits.ownerApprover?.id ?? null) : null,
      createdAt: now,
    },
    select: { id: true, siteId: true, purpose: true },
  });
  if (input.for === "expense" && input.quote) {
    try {
      await recordAttachment(tx, actor, { entityType: "CrmRequisition", entityId: created.id, kind: "QUOTE", file: input.quote });
    } catch (error) {
      if (error instanceof AttachmentRefusal) throw invalid({ q: error.message });
      throw error;
    }
  }
  await writeRetailAuditEvent(tx, {
    actor,
    eventType: RETAIL_AUDIT_EVENTS.requisitionAsked,
    entityType: "CrmRequisition",
    entityId: created.id,
    payload: { requisitionNo, amount: auditAmount(amount), currency, order: orderRef, whatFor: orderRef ? null : created.purpose, over },
  });
  const waitsFor = await waitsForName(companyId, over, created.siteId, actor.userId, limits.ownerApprover?.name ?? null);
  const money2 = formatMoney(toNumberOrZero(amount), currency);
  return {
    id: created.id,
    requisitionNo,
    waitsFor,
    over,
    siteId: created.siteId,
    message: sentForApproval(requisitionNo, waitsFor),
    title: `${requisitionNo}: ${money2} to approve`,
    summary: `${actor.userName ?? "Someone"} asks for ${money2}: ${created.purpose}.`,
  };
}

/** After the ask commits: the owner approver (over the limit) or the managers at its site, in the app and on WhatsApp. */
export async function tellApprovers(actor: RetailAuditActor, asked: Asked, deps: RequisitionDeps = {}): Promise<void> {
  await notifyApprover({
    companyId: actor.companyId,
    level: asked.over ? "owner" : "manager",
    siteId: asked.siteId,
    type: "CRM_REQUISITION_SUBMITTED",
    title: asked.title,
    summary: asked.summary,
    entityType: "CRM_REQUISITION",
    entityId: asked.id,
    viewPath: viewPath(asked.id),
    askedById: actor.userId,
    requestUrl: deps.requestUrl ?? null,
  });
}

export async function askForMoney(actor: RetailAuditActor, input: AskInput, deps: RequisitionDeps = {}): Promise<Asked> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const asked = await prisma.$transaction((tx) => askForMoneyIn(tx, actor, input, deps));
      await tellApprovers(actor, asked, deps);
      return asked;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") continue;
      throw error;
    }
  }
  throw new RequisitionRefusal(409, "No requisition number could be given. Try again.");
}

/* ── Approve (W-31) ─────────────────────────────────────────────────────── */

export type Decided = { id: string; requisitionNo: string; message: string };

async function ownerName(companyId: string, requisition: One): Promise<string | null> {
  if (requisition.approver) return requisition.approver.name;
  return (await getApprovalLimits(companyId)).ownerApprover?.name ?? null;
}

export async function approveRequisition(
  actor: RetailAuditActor,
  id: string,
  input: { amount?: string | number | null; note?: string | null },
  deps: RequisitionDeps = {},
): Promise<Decided> {
  const now = deps.now ?? new Date();
  const requisition = await readOne(prisma, actor, id);
  const refusal = decideRefusal(actor, requisition, await ownerName(actor.companyId, requisition));
  if (refusal) throw new RequisitionRefusal(403, refusal);
  if (requisition.status !== "SUBMITTED") throw new RequisitionRefusal(409, notWaiting(requisition.requisitionNo, requisition.status));
  assertTransition(requisition.status, "APPROVED");

  const asker = requisition.requestedBy;
  let approved = requisition.amount;
  const typed = input.amount === null || input.amount === undefined || String(input.amount).trim() === "" ? null : parseAmount(input.amount);
  const note = input.note?.trim() || null;
  if (note && note.length > 1000) throw invalid({ why: "Keep it to 1,000 characters." });
  if (typed && !typed.equals(requisition.amount)) {
    if (!typed.greaterThan(0) || typed.greaterThan(requisition.amount)) throw invalid({ amt: "Approve the amount asked for, or less." });
    if (!note) throw invalid({ why: `Tell ${firstName(asker.name)} why.` });
    approved = typed;
  }
  const cut = !approved.equals(requisition.amount);

  await prisma.$transaction(async (tx) => {
    const moved = await tx.crmRequisition.updateMany({
      where: { id, status: "SUBMITTED" },
      data: { status: "APPROVED", approvedById: actor.userId, approvedAt: now, approvedAmount: cut ? approved : null, decisionNote: note },
    });
    if (moved.count === 0) throw new RequisitionRefusal(409, notWaiting(requisition.requisitionNo, "APPROVED"));
    await writeRetailAuditEvent(tx, {
      actor,
      eventType: RETAIL_AUDIT_EVENTS.requisitionApproved,
      entityType: "CrmRequisition",
      entityId: id,
      payload: { requisitionNo: requisition.requisitionNo, amount: auditAmount(approved), asked: auditAmount(requisition.amount), currency: requisition.currency, note },
    });
  });

  const figure = formatMoney(toNumberOrZero(approved), requisition.currency);
  await tell(actor, {
    people: [asker],
    type: "CRM_REQUISITION_DECIDED",
    requisition,
    title: `${requisition.requisitionNo} approved`,
    summary: `${figure} approved by ${actor.userName ?? "the owner"}.${note ? ` ${note}` : ""}`,
    template: "requisition-decided",
    text: `${requisition.requisitionNo}: ${figure} approved by ${actor.userName ?? "the owner"}.${note ? ` ${note}` : ""}`,
  });
  const askerPays = canRetailRoleDo(asker.role, "retail.requisitions", "update");
  return { id, requisitionNo: requisition.requisitionNo, message: approvedWords(toNumberOrZero(approved), requisition.currency, firstName(asker.name), askerPays) };
}

export type BulkAnswer = { done: string[]; skipped: Array<{ requisitionNo: string; why: string }> };

/** Several at once, each at the amount asked; those this person cannot decide are skipped, each with why. */
export async function approveMany(actor: RetailAuditActor, ids: string[], deps: RequisitionDeps = {}): Promise<{ approved: string[]; skipped: BulkAnswer["skipped"] }> {
  const approved: string[] = [];
  const skipped: BulkAnswer["skipped"] = [];
  for (const id of [...new Set(ids)]) {
    try {
      const done = await approveRequisition(actor, id, {}, deps);
      approved.push(done.requisitionNo);
    } catch (error) {
      if (!(error instanceof RequisitionRefusal)) throw error;
      if (error.status === 404) continue;
      const row = await prisma.crmRequisition.findFirst({ where: { id, companyId: actor.companyId }, select: { requisitionNo: true } });
      skipped.push({ requisitionNo: row?.requisitionNo ?? id, why: error.message });
    }
  }
  return { approved, skipped };
}

/* ── Reject (W-32) ──────────────────────────────────────────────────────── */

export type RejectInput = { reason: string; message?: string | null };

function rejectReason(word: string): CrmRequisitionRejectReason {
  const key = Object.entries(REJECT_REASON_WORD).find(([, label]) => label === word)?.[0];
  if (!key) throw invalid({ why: "Choose why." });
  return key as CrmRequisitionRejectReason;
}

async function rejectOne(actor: RetailAuditActor, id: string, reason: CrmRequisitionRejectReason, message: string | null, now: Date): Promise<One> {
  const requisition = await readOne(prisma, actor, id);
  const refusal = decideRefusal(actor, requisition, await ownerName(actor.companyId, requisition));
  if (refusal) throw new RequisitionRefusal(403, refusal);
  if (requisition.status !== "SUBMITTED") throw new RequisitionRefusal(409, notWaiting(requisition.requisitionNo, requisition.status));
  assertTransition(requisition.status, "REJECTED");
  await prisma.$transaction(async (tx) => {
    const moved = await tx.crmRequisition.updateMany({
      where: { id, status: "SUBMITTED" },
      data: { status: "REJECTED", rejectReason: reason, decisionNote: message, approvedById: actor.userId, approvedAt: now },
    });
    if (moved.count === 0) throw new RequisitionRefusal(409, notWaiting(requisition.requisitionNo, "APPROVED"));
    await writeRetailAuditEvent(tx, {
      actor,
      eventType: RETAIL_AUDIT_EVENTS.requisitionRejected,
      entityType: "CrmRequisition",
      entityId: id,
      payload: { requisitionNo: requisition.requisitionNo, reason: REJECT_REASON_WORD[reason], message },
    });
  });
  const said = `${requisition.requisitionNo} was not approved: ${REJECT_REASON_WORD[reason]}.${message ? ` ${message}` : ""}`;
  await tell(actor, {
    people: [requisition.requestedBy],
    type: "CRM_REQUISITION_DECIDED",
    requisition,
    title: `${requisition.requisitionNo} not approved`,
    summary: said,
    template: "requisition-decided",
    text: said,
    severity: "WARNING",
  });
  return requisition;
}

function checkReject(input: RejectInput, askerFirst: string | null): { reason: CrmRequisitionRejectReason; message: string | null } {
  const reason = rejectReason(input.reason);
  const message = input.message?.trim() || null;
  if (message && message.length > 1000) throw invalid({ msg: "Keep it to 1,000 characters." });
  if (reason === "OTHER" && !message) throw invalid({ msg: askerFirst ? `Tell ${askerFirst} why.` : "Tell them why." });
  return { reason, message };
}

export async function rejectRequisition(actor: RetailAuditActor, id: string, input: RejectInput, deps: RequisitionDeps = {}): Promise<Decided> {
  const peek = await readOne(prisma, actor, id);
  const { reason, message } = checkReject(input, firstName(peek.requestedBy.name));
  const requisition = await rejectOne(actor, id, reason, message, deps.now ?? new Date());
  return { id, requisitionNo: requisition.requisitionNo, message: `${requisition.requisitionNo} rejected. ${firstName(requisition.requestedBy.name)} has been told why.` };
}

export async function rejectMany(actor: RetailAuditActor, ids: string[], input: RejectInput, deps: RequisitionDeps = {}): Promise<{ rejected: string[]; skipped: BulkAnswer["skipped"] }> {
  const { reason, message } = checkReject(input, null);
  const rejected: string[] = [];
  const skipped: BulkAnswer["skipped"] = [];
  for (const id of [...new Set(ids)]) {
    try {
      rejected.push((await rejectOne(actor, id, reason, message, deps.now ?? new Date())).requisitionNo);
    } catch (error) {
      if (!(error instanceof RequisitionRefusal)) throw error;
      if (error.status === 404) continue;
      const row = await prisma.crmRequisition.findFirst({ where: { id, companyId: actor.companyId }, select: { requisitionNo: true } });
      skipped.push({ requisitionNo: row?.requisitionNo ?? id, why: error.message });
    }
  }
  return { rejected, skipped };
}

/* ── A question, and its answer (5.21) ──────────────────────────────────── */

export async function askQuestion(actor: RetailAuditActor, id: string, input: { message: string }, deps: RequisitionDeps = {}): Promise<Decided> {
  const requisition = await readOne(prisma, actor, id);
  const message = input.message?.replace(/\s+/g, " ").trim() ?? "";
  if (!message) throw invalid({ q: "Write the question." });
  if (message.length > 500) throw invalid({ q: "Keep it to 500 characters." });
  if (requisition.status !== "SUBMITTED") throw new RequisitionRefusal(409, notWaiting(requisition.requisitionNo, requisition.status));
  const answering = requisition.requestedById === actor.userId;
  let to: Person[];
  if (answering) {
    // The asker answers whoever asked last; with no question yet, whoever it waits for.
    const last = await prisma.platformAuditEvent.findFirst({
      where: { companyId: actor.companyId, entityType: "CrmRequisition", entityId: id, eventType: RETAIL_AUDIT_EVENTS.requisitionQuestion, actor: { not: actor.userId } },
      orderBy: { createdAt: "desc" },
      select: { actor: true },
    });
    const asker = last?.actor ? await prisma.user.findFirst({ where: { id: last.actor, companyId: actor.companyId }, select: { id: true, name: true, phone: true } }) : null;
    to = asker ? [asker] : requisition.approver ? [requisition.approver] : await managersAt(actor.companyId, requisition.siteId, actor.userId);
  } else {
    const refusal = decideRefusal(actor, requisition, await ownerName(actor.companyId, requisition));
    if (refusal) throw new RequisitionRefusal(403, refusal);
    to = [requisition.requestedBy];
  }
  await prisma.$transaction((tx) =>
    writeRetailAuditEvent(tx, {
      actor,
      eventType: RETAIL_AUDIT_EVENTS.requisitionQuestion,
      entityType: "CrmRequisition",
      entityId: id,
      payload: { requisitionNo: requisition.requisitionNo, message, answer: answering },
    }),
  );
  const link = await approvalLink(actor.companyId, viewPath(id), deps.requestUrl ?? null);
  const who = actor.userName ?? "Someone";
  await tell(actor, {
    people: to,
    type: "CRM_REQUISITION_QUESTION",
    requisition,
    title: answering ? `${who} answered about ${requisition.requisitionNo}` : `${who} asks about ${requisition.requisitionNo}`,
    summary: message,
    template: "requisition-question",
    text: `${requisition.requisitionNo}: ${who} ${answering ? "answers" : "asks"}: “${message}” Open it: ${link}`,
  });
  const names = to.map((person) => firstName(person.name));
  return {
    id,
    requisitionNo: requisition.requisitionNo,
    message: answering ? `Answer sent to ${names.length === 1 ? names[0] : "them"}.` : `Question sent to ${firstName(requisition.requestedBy.name)}.`,
  };
}

/* ── Cancel (W-72) ──────────────────────────────────────────────────────── */

type Cancelled = { id: string; requisitionNo: string; after: () => Promise<void> };

/**
 * Cancelled inside a transaction (an order cancelled or binned cancels its
 * unpaid requisition with it, `automatic`); `after` tells who needs to know
 * once it commits. Nothing was paid out, so no money moves.
 */
/** Who cancels: a person, or the worker (no one) when an order's rest is cancelled automatically. */
export type CancelActor = { companyId: string; userId: string | null; userName?: string | null; userRole?: string | null };

export async function cancelRequisitionIn(
  tx: Tx,
  actor: CancelActor,
  id: string,
  options: { automatic?: boolean; now?: Date } = {},
): Promise<Cancelled> {
  const now = options.now ?? new Date();
  const person: RetailAuditActor = { ...actor, userId: actor.userId ?? "" };
  const requisition = await readOne(tx, person, id, options.automatic === true);
  if (!options.automatic && !mayCancel(person, requisition.requestedById)) throw new RequisitionRefusal(403, "Only the person who asked, or a manager, can cancel it.");
  if (requisition.status === "DISBURSED") throw new RequisitionRefusal(409, `${requisition.requisitionNo} has been paid out. Account for it instead.`);
  if (requisition.status === "ACQUITTED") throw new RequisitionRefusal(409, `${requisition.requisitionNo} has been accounted for.`);
  if (requisition.status !== "SUBMITTED" && requisition.status !== "APPROVED") throw new RequisitionRefusal(409, notWaiting(requisition.requisitionNo, requisition.status));
  assertTransition(requisition.status, "CANCELLED");
  const moved = await tx.crmRequisition.updateMany({
    where: { id, status: { in: ["SUBMITTED", "APPROVED"] } },
    data: { status: "CANCELLED", cancelledAt: now, cancelledById: actor.userId },
  });
  if (moved.count === 0) throw new RequisitionRefusal(409, `${requisition.requisitionNo} has changed. Open it again.`);
  await writePlatformAuditEvent(
    {
      companyId: actor.companyId,
      actorId: actor.userId,
      eventType: RETAIL_AUDIT_EVENTS.requisitionCancelled,
      entityType: "CrmRequisition",
      entityId: id,
      payload: {
        actorRole: actor.userRole ?? null,
        actorName: actor.userName ?? null,
        requisitionNo: requisition.requisitionNo,
        was: requisition.status,
        automatic: options.automatic === true,
      },
    },
    tx,
  );
  const byAsker = requisition.requestedById === actor.userId;
  const order = requisition.purchaseOrder?.poNo ?? null;
  const after = async () => {
    const said =
      options.automatic && order
        ? `${requisition.requisitionNo} was cancelled with order ${order}. Nothing was paid out.`
        : `${requisition.requisitionNo} was cancelled by ${actor.userName ?? "a manager"}. Nothing was paid out.`;
    let people: Person[];
    if (!byAsker) people = [requisition.requestedBy];
    else if (requisition.status === "APPROVED" && requisition.approvedBy) people = [requisition.approvedBy];
    else if (requisition.approver) people = [requisition.approver];
    else people = [...(await activeOwners(actor.companyId)), ...(await managersAt(actor.companyId, requisition.siteId, person.userId))];
    await tell(person, {
      people,
      type: "CRM_REQUISITION_CANCELLED",
      requisition,
      title: `${requisition.requisitionNo} cancelled`,
      summary: said,
      template: "requisition-cancelled",
      text: said,
    });
  };
  return { id, requisitionNo: requisition.requisitionNo, after };
}

export async function cancelRequisition(actor: RetailAuditActor, id: string, deps: RequisitionDeps = {}): Promise<Decided> {
  const cancelled = await prisma.$transaction((tx) => cancelRequisitionIn(tx, actor, id, { now: deps.now }));
  await cancelled.after();
  return { id, requisitionNo: cancelled.requisitionNo, message: `${cancelled.requisitionNo} cancelled.` };
}

/** An order cancelled or binned takes its not-yet-paid requisition with it. */
export async function cancelOrderRequisitionsIn(tx: Tx, actor: CancelActor, orderId: string, now?: Date): Promise<Array<() => Promise<void>>> {
  const rows = await tx.crmRequisition.findMany({
    where: { companyId: actor.companyId, purchaseOrderId: orderId, status: { in: ["SUBMITTED", "APPROVED"] } },
    select: { id: true },
  });
  const afters: Array<() => Promise<void>> = [];
  for (const row of rows) afters.push((await cancelRequisitionIn(tx, actor, row.id, { automatic: true, now })).after);
  return afters;
}

/* ── Change it while it waits (5.9 rail) ────────────────────────────────── */

export type RequisitionPatch = {
  amount?: string | number;
  payFromId?: string | null;
  payToId?: string | null;
  neededBy?: string | null;
  whatFor?: string;
  expenseTypeId?: string;
};

export type Changed = { id: string; requisitionNo: string; changes: Array<{ field: string; from: string | null; to: string | null }> };

export async function changeRequisition(actor: RetailAuditActor, id: string, patch: RequisitionPatch, deps: RequisitionDeps = {}): Promise<Changed> {
  const now = deps.now ?? new Date();
  return prisma.$transaction(async (tx) => {
    const requisition = await readOne(tx, actor, id);
    if (requisition.requestedById !== actor.userId && !can(actor, "update")) throw new RequisitionRefusal(403, "Only the person who asked, or a manager, can change it.");
    const onlyPayFrom = Object.keys(patch).every((key) => key === "payFromId");
    const open = requisition.status === "SUBMITTED" || (onlyPayFrom && requisition.status === "APPROVED");
    if (!open) {
      throw new RequisitionRefusal(
        409,
        requisition.status === "APPROVED" ? `${requisition.requisitionNo} has been approved. Ask again to change it.` : `${requisition.requisitionNo} can no longer be changed.`,
      );
    }
    const data: Prisma.CrmRequisitionUncheckedUpdateInput = {};
    const changes: Changed["changes"] = [];
    const edited = async (field: string, label: string, from: string | null, to: string | null, kind: "text" | "money" = "text") => {
      if (from === to) return;
      changes.push({ field, from, to });
      await auditRecordEdited(tx, { actor, entityType: "CrmRequisition", entityId: id, field, label, from, to, kind });
    };

    if (patch.amount !== undefined) {
      const amount = parseAmount(patch.amount);
      if (!amount.greaterThan(0)) throw invalid({ amount: "Ask for more than nought." });
      if (requisition.purchaseOrderId) {
        const { total } = await orderTotal(tx, requisition.purchaseOrderId);
        if (amount.greaterThan(total)) throw invalid({ amount: "Ask for the order total or less." });
      } else if (amount.greaterThan(MAX_AMOUNT)) throw invalid({ amount: "Ask for US$1,000,000.00 or less." });
      // The limit stays the one it was asked under; who it waits for follows the new amount.
      const limits = await getApprovalLimits(actor.companyId, tx);
      const limit = requisition.approvalLimit ?? limits.requisitionOwnerOver;
      data.amount = amount;
      data.approverId = amount.greaterThan(limit) ? (requisition.approverId ?? limits.ownerApprover?.id ?? null) : null;
      await edited("amount", "Amount", auditAmount(requisition.amount), auditAmount(amount), "money");
    }
    if (patch.payFromId !== undefined) {
      if (!patch.payFromId) throw invalid({ payFromId: "Choose where the money comes from." });
      const account = await findMoneyAccount(actor.companyId, patch.payFromId, tx);
      if (!account) throw invalid({ payFromId: "Choose where the money comes from." });
      if (account.currency.toUpperCase() !== requisition.currency.toUpperCase()) throw invalid({ payFromId: `${account.name} holds ${currencyWords(account.currency)}.` });
      const before = requisition.bankAccountId ? await tx.bankAccount.findUnique({ where: { id: requisition.bankAccountId }, select: { name: true } }) : null;
      data.bankAccountId = account.id;
      await edited("payFromId", "Pay from", before?.name ?? null, account.name);
    }
    if (patch.payToId !== undefined) {
      if (requisition.purchaseOrderId) throw invalid({ payToId: "An order's money goes to its supplier." });
      const vendor = patch.payToId ? await tx.vendor.findFirst({ where: { id: patch.payToId, companyId: actor.companyId }, select: { id: true, name: true } }) : null;
      if (patch.payToId && !vendor) throw invalid({ payToId: "Choose who it is paid to." });
      const before = requisition.payeeVendorId ? await tx.vendor.findUnique({ where: { id: requisition.payeeVendorId }, select: { name: true } }) : null;
      data.payeeVendorId = vendor?.id ?? null;
      await edited("payToId", "Pay to", before?.name ?? null, vendor?.name ?? null);
    }
    if (patch.neededBy !== undefined) {
      if (patch.neededBy && patch.neededBy < dayKey(now)) throw invalid({ neededBy: "Pick today or a later day." });
      const day = patch.neededBy ? startOfDayIn(patch.neededBy, DEFAULT_TIME_ZONE) : null;
      data.neededBy = day;
      await edited("neededBy", "Needed by", requisition.neededBy ? formatDay(requisition.neededBy) : null, day ? formatDay(day) : null);
    }
    if (patch.whatFor !== undefined) {
      if (requisition.purchaseOrderId) throw invalid({ whatFor: "An order's requisition is named for its order." });
      const whatFor = patch.whatFor.replace(/\s+/g, " ").trim();
      if (!whatFor) throw invalid({ whatFor: "Say what the money is for." });
      if (whatFor.length > 200) throw invalid({ whatFor: "Keep it to 200 characters." });
      data.purpose = whatFor;
      await edited("whatFor", "What for", requisition.purpose, whatFor);
    }
    if (patch.expenseTypeId !== undefined) {
      if (requisition.purchaseOrderId) throw invalid({ expenseTypeId: "An order's requisition is a stock purchase." });
      const type = await tx.retailExpenseType.findFirst({ where: { id: patch.expenseTypeId, companyId: actor.companyId, archivedAt: null }, select: { id: true, name: true, category: true } });
      if (!type) throw invalid({ expenseTypeId: "Choose what kind of expense it is." });
      const before = requisition.expenseTypeId ? await tx.retailExpenseType.findUnique({ where: { id: requisition.expenseTypeId }, select: { name: true } }) : null;
      data.expenseTypeId = type.id;
      data.category = type.category;
      await edited("expenseTypeId", "Expense", before?.name ?? null, type.name);
    }
    if (Object.keys(data).length > 0) await tx.crmRequisition.update({ where: { id }, data });
    return { id, requisitionNo: requisition.requisitionNo, changes };
  });
}

/** For tests and the view: the state a requisition is in. */
export const stateOf = (status: string) => status as RequisitionState;

/* ── What the Ask for money sheet starts from (5.18) ────────────────────── */

type Option = { id: string; label: string; sub: string | null };

export type AskContext = {
  /** The owner limit now, and who approves over it. */
  limit: number;
  approver: string | null;
  /** The first cash account in US dollars: Pay from's default. */
  payFrom: Option | null;
  /** The order asked for: its option, total with VAT and expected day. */
  order: (Option & { total: number; expected: string | null }) | null;
  /** "Change and ask again": the rejected one's values. */
  again: {
    for: "order" | "expense";
    expenseType: Option | null;
    whatFor: string | null;
    amount: number;
    currency: "US$" | "ZiG";
    payFrom: Option | null;
    payTo: Option | null;
    neededBy: string | null;
    why: string | null;
  } | null;
};

export async function askContext(actor: RetailAuditActor, input: { orderId?: string | null; from?: string | null }): Promise<AskContext> {
  const companyId = actor.companyId;
  const limits = await getApprovalLimits(companyId);
  const accounts = (await listMoneyAccounts(companyId)).filter((account) => account.currency.toUpperCase() === "USD");
  const cash = accounts.find((account) => account.kind === "CASH") ?? accounts[0] ?? null;
  const optionOf = (account: Awaited<ReturnType<typeof findMoneyAccount>>) => (account ? { id: account.id, label: account.name, sub: moneyAccountSub(account) } : null);

  let order: AskContext["order"] = null;
  if (input.orderId) {
    const row = await prisma.retailPurchaseOrder.findFirst({
      where: { id: input.orderId, companyId, archivedAt: null },
      select: { id: true, poNo: true, expectedDate: true, vendor: { select: { name: true } } },
    });
    if (row) {
      const { total } = await orderTotal(prisma, row.id);
      const value = toNumberOrZero(total);
      // Needed by defaults to the expected day while it is still ahead.
      const expected = row.expectedDate && dayKey(row.expectedDate) >= dayKey(new Date()) ? dayKey(row.expectedDate) : null;
      order = { id: row.id, label: `${row.poNo} · ${row.vendor.name}`, sub: formatMoney(value), total: value, expected };
    }
  }

  let again: AskContext["again"] = null;
  if (input.from) {
    const rejected = await prisma.crmRequisition.findFirst({
      where: { id: input.from, ...requisitionScope(actor), status: "REJECTED" },
      include: { expenseType: { select: { id: true, name: true } }, payee: { select: { id: true, name: true } } },
    });
    if (rejected) {
      const from = rejected.bankAccountId ? await findMoneyAccount(companyId, rejected.bankAccountId) : null;
      again = {
        for: rejected.purchaseOrderId ? "order" : "expense",
        expenseType: rejected.expenseType ? { id: rejected.expenseType.id, label: rejected.expenseType.name, sub: null } : null,
        whatFor: rejected.purchaseOrderId ? null : rejected.purpose,
        amount: toNumberOrZero(rejected.amount),
        currency: rejected.currency === "ZWG" ? "ZiG" : "US$",
        payFrom: optionOf(from),
        payTo: rejected.payee && !rejected.purchaseOrderId ? { id: rejected.payee.id, label: rejected.payee.name, sub: "Supplier" } : null,
        neededBy: rejected.neededBy && dayKey(rejected.neededBy) >= dayKey(new Date()) ? dayKey(rejected.neededBy) : null,
        why: rejected.notes,
      };
      if (rejected.purchaseOrderId && !order) {
        const live = await liveRequisitionFor(prisma, companyId, rejected.purchaseOrderId);
        if (!live) order = (await askContext(actor, { orderId: rejected.purchaseOrderId })).order;
      }
    }
  }

  return { limit: toNumberOrZero(limits.requisitionOwnerOver), approver: limits.ownerApprover?.name ?? null, payFrom: optionOf(cash), order, again };
}
