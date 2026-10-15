import { randomUUID } from "node:crypto";

import type { PrismaClient } from "@prisma/client";
import { z } from "zod";

import { getDocumentBranding } from "@/lib/documents/branding-snapshot";

import { askClaude, VaneError, type MessagesClient } from "./claude";
import { jobsStartedThisMonthFor } from "./jobs";

/**
 * Vane writing something for a person to send: one request to Claude, kept
 * as a job (kind `write`) so it counts against the month's allowance with
 * what it cost. Refused while Vane is paused or the month's jobs are used.
 * What it writes is a draft in the person's hands: nothing is sent.
 */

/** Why Vane wrote nothing, in a sentence for the person who asked. */
export class VaneWriteRefused extends Error {
  constructor(
    readonly status: 409 | 404 | 503,
    message: string,
  ) {
    super(message);
    this.name = "VaneWriteRefused";
  }
}

export type Who = { companyId: string; userId: string; name: string | null };

const VOICE = `You are Vane, the helper inside Corelith, a business platform used by shops, mines, schools and service firms in Zimbabwe. You write what a person at the business will send to a client, in their voice: plain, warm, short, specific. Use the client's first name when you have it, the exact figures and dates given, and nothing you were not given. No marketing words, no exclamation marks, no emoji. Never mention Vane, Claude or anything automatic.`;

/**
 * One piece of writing as one job: the guards, the job and its cost, around
 * `work`, which may ask Claude more than once (to correct what did not check).
 */
export async function writeAsJob<T>(
  db: PrismaClient,
  who: Who,
  label: string,
  work: (ask: (prompt: string) => Promise<string>) => Promise<T>,
  client?: MessagesClient,
  system: string = VOICE,
): Promise<T> {
  const settings = await db.vaneSettings.findUnique({ where: { companyId: who.companyId }, select: { paused: true, monthlyAllowance: true } });
  if (settings?.paused) throw new VaneWriteRefused(409, "Vane is paused. Resume it to have it write anything new.");
  if ((await jobsStartedThisMonthFor(db, who.companyId, new Date())) >= (settings?.monthlyAllowance ?? 5000)) {
    throw new VaneWriteRefused(409, "This month's jobs are used. Vane starts again on the 1st.");
  }
  const job = await db.vaneJob.create({
    data: {
      companyId: who.companyId,
      key: `write:${randomUUID()}`,
      kind: "write",
      label,
      trigger: "PERSON",
      requestedById: who.userId,
      status: "RUNNING",
      attempts: 1,
      startedAt: new Date(),
    },
    select: { id: true },
  });
  const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  let model: string | null = null;
  const ask = async (prompt: string) => {
    const answer = await askClaude({ system, messages: [{ role: "user", content: prompt }], maxTokens: 2_000, client });
    model = answer.model;
    usage.input += answer.usage.input;
    usage.output += answer.usage.output;
    usage.cacheRead += answer.usage.cacheRead;
    usage.cacheWrite += answer.usage.cacheWrite;
    return answer.text;
  };
  try {
    const result = await work(ask);
    await db.vaneJob.update({
      where: { id: job.id },
      data: {
        status: "DONE",
        finishedAt: new Date(),
        result: label,
        model,
        tokensIn: usage.input,
        tokensOut: usage.output,
        cacheReadTokens: usage.cacheRead,
        cacheWriteTokens: usage.cacheWrite,
      },
    });
    return result;
  } catch (error) {
    await db.vaneJob.update({
      where: { id: job.id },
      data: { status: "FAILED", finishedAt: new Date(), error: error instanceof Error ? error.message : String(error), tokensIn: usage.input, tokensOut: usage.output },
    });
    if (error instanceof VaneError) {
      throw new VaneWriteRefused(
        503,
        error.code === "misconfigured" ? "Vane is not set up on this server yet." : error.retryable ? "Vane cannot be reached just now. Try again in a minute." : "Vane could not write it. Try again.",
      );
    }
    throw error;
  }
}

/** The JSON object in Claude's answer, whatever it wrapped it in. */
export function jsonIn(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

const emailSchema = z.object({ subject: z.string().trim().min(1).max(200), message: z.string().trim().min(1).max(5000) });

function parseEmail(text: string) {
  return emailSchema.safeParse(jsonIn(text)).data ?? null;
}

const money = (currency: string, amount: number) => `${currency} ${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const longDay = (value: Date) => value.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/**
 * The covering email for a CRM quote, invoice or receipt, written by Vane
 * from the document and its record: what it is for, the figures, how long a
 * quote holds or when an invoice is due, and what was said last on the deal.
 * The link to answer and the PDF go under it as always.
 */
export async function writeDocumentEmail(db: PrismaClient, who: Who, documentId: string, client?: MessagesClient) {
  const doc = await db.crmLeadDocument.findFirst({
    where: { id: documentId, companyId: who.companyId },
    select: {
      type: true,
      amount: true,
      currency: true,
      quotation: { select: { quotationNumber: true, validUntil: true, lines: { select: { description: true, quantity: true }, orderBy: { createdAt: "asc" } } } },
      invoice: { select: { invoiceNumber: true, dueDate: true, lines: { select: { description: true, quantity: true }, orderBy: { createdAt: "asc" } } } },
      receipt: { select: { receiptNumber: true, receivedAt: true, method: true } },
      deal: { select: { id: true, title: true, primaryContact: { select: { firstName: true, lastName: true } }, client: { select: { name: true } } } },
      lead: { select: { id: true, title: true, contactName: true, client: { select: { name: true } } } },
    },
  });
  if (!doc) throw new VaneWriteRefused(404, "Document not found");
  const recent = await db.crmActivity.findMany({
    where: { companyId: who.companyId, ...(doc.deal ? { dealId: doc.deal.id } : doc.lead ? { leadId: doc.lead.id } : { id: "none" }), type: { in: ["NOTE", "CALL", "EMAIL", "WHATSAPP", "MEETING"] } },
    orderBy: { occurredAt: "desc" },
    take: 4,
    select: { type: true, subject: true, body: true, occurredAt: true },
  });
  const branding = await getDocumentBranding(who.companyId);

  const label = doc.type === "QUOTATION" ? "quotation" : doc.type === "INVOICE" ? "invoice" : "receipt";
  const number = doc.quotation?.quotationNumber ?? doc.invoice?.invoiceNumber ?? doc.receipt?.receiptNumber ?? "";
  const contact = doc.deal?.primaryContact
    ? [doc.deal.primaryContact.firstName, doc.deal.primaryContact.lastName].filter(Boolean).join(" ")
    : (doc.lead?.contactName ?? null);
  const lines = doc.quotation?.lines ?? doc.invoice?.lines ?? [];
  const facts = [
    `What: our ${label} ${number} for ${money(doc.currency, doc.amount)}.`,
    `For: ${doc.deal?.client?.name ?? doc.lead?.client?.name ?? "the client"}${contact ? `, to ${contact}` : ""}.`,
    `The work: ${doc.deal?.title ?? doc.lead?.title ?? "—"}.`,
    lines.length ? `Its lines: ${lines.slice(0, 8).map((line) => `${line.quantity} × ${line.description}`).join("; ")}.` : null,
    doc.quotation?.validUntil ? `It holds until ${longDay(doc.quotation.validUntil)}.` : null,
    doc.invoice?.dueDate ? `It is due on ${longDay(doc.invoice.dueDate)}.` : null,
    doc.receipt ? `Paid on ${longDay(doc.receipt.receivedAt)} by ${doc.receipt.method}.` : null,
    recent.length
      ? `Said lately on the record, newest first: ${recent.map((row) => `${longDay(row.occurredAt)}, ${row.type.toLowerCase()}: ${row.subject}${row.body ? ` (${row.body.slice(0, 160)})` : ""}`).join(" | ")}.`
      : null,
    `From: ${who.name ?? "the team"}, ${branding.displayName}.`,
  ].filter(Boolean);

  const prompt = `Write the email that goes with this ${label}. The PDF is attached and a link to review and answer it goes under your message, so do not paste a link or say "click". Three to six short sentences: greet, say what it is and for what, the figure, ${doc.type === "QUOTATION" ? "how long it holds, and the next step if one was agreed" : doc.type === "INVOICE" ? "when it is due" : "thank them for the payment"}, and sign off with the sender's name. Answer with only a JSON object: {"subject": "...", "message": "..."}, the message with blank lines between paragraphs.

${facts.join("\n")}`;

  return writeAsJob(
    db,
    who,
    `Wrote the email for ${number}`,
    async (ask) => {
      const email = parseEmail(await ask(prompt));
      if (!email) throw new VaneWriteRefused(503, "Vane's email did not come back whole. Try again, or write it yourself.");
      return email;
    },
    client,
  );
}
