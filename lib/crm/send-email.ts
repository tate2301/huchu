import { logCrmActivity } from "@/lib/crm/log-activity";
import { getDocumentBranding } from "@/lib/documents/branding-snapshot";
import { sendEmail } from "@/lib/email/send";
import { prisma } from "@/lib/prisma";

/**
 * An email from the business to someone on a CRM record: a follow-up, an
 * answer, a reminder. It goes from the platform's address under the
 * workspace's name, with replies to the workspace's own address, and is
 * logged on the record as an email from the person who sent it. It goes only
 * to an address the record holds, so nothing can be sent to a stranger
 * through it.
 */

export type EmailAbout = { leadId?: string; dealId?: string; personId?: string; clientId?: string };

/** Why the email was not sent, in a sentence. */
export class EmailRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmailRefused";
  }
}

const clean = (values: Array<string | null | undefined>) => [...new Set(values.map((value) => value?.trim().toLowerCase()).filter((value): value is string => Boolean(value)))];

/** The addresses a record holds: a lead's contact, a person's, a company's and its people's, a deal's company and contact. */
export async function recordAddresses(companyId: string, about: EmailAbout): Promise<string[]> {
  if (about.leadId) {
    const lead = await prisma.crmLead.findFirst({ where: { id: about.leadId, companyId }, select: { contactEmail: true, client: { select: { email: true } } } });
    if (!lead) throw new EmailRefused("That lead is not in this workspace.");
    return clean([lead.contactEmail, lead.client?.email]);
  }
  if (about.dealId) {
    const deal = await prisma.crmDeal.findFirst({
      where: { id: about.dealId, companyId },
      select: { client: { select: { email: true, people: { select: { email: true } } } }, primaryContact: { select: { email: true } } },
    });
    if (!deal) throw new EmailRefused("That deal is not in this workspace.");
    return clean([deal.primaryContact?.email, deal.client?.email, ...(deal.client?.people ?? []).map((person) => person.email)]);
  }
  if (about.personId) {
    const person = await prisma.crmPerson.findFirst({ where: { id: about.personId, companyId }, select: { email: true } });
    if (!person) throw new EmailRefused("That person is not in this workspace.");
    return clean([person.email]);
  }
  if (about.clientId) {
    const client = await prisma.crmClient.findFirst({ where: { id: about.clientId, companyId }, select: { email: true, people: { select: { email: true } } } });
    if (!client) throw new EmailRefused("That company is not in this workspace.");
    return clean([client.email, ...client.people.map((person) => person.email)]);
  }
  throw new EmailRefused("An email goes to someone on a lead, deal, person or company.");
}

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** The message as a plain letter: a blank line starts a paragraph. */
export function letterHtml(message: string): string {
  const paragraphs = message
    .trim()
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("\n  ");
  return `<div style="font-family: Arial, Helvetica, sans-serif; font-size: 14px; line-height: 1.5; color: #222;">\n  ${paragraphs}\n</div>`;
}

export async function sendCrmEmail(
  actor: { companyId: string; userId: string },
  email: { to: string; subject: string; message: string; about: EmailAbout },
): Promise<{ to: string }> {
  const to = email.to.trim().toLowerCase();
  const addresses = await recordAddresses(actor.companyId, email.about);
  if (!addresses.includes(to)) {
    throw new EmailRefused(addresses.length ? `${email.to} is not an address on that record. It has ${addresses.join(", ")}.` : "That record has no email address. Add one to it first.");
  }
  const branding = await getDocumentBranding(actor.companyId);
  await sendEmail({
    to,
    subject: email.subject,
    text: email.message.trim(),
    html: letterHtml(email.message),
    sender: { name: branding.displayName, replyTo: branding.email ?? undefined },
  });
  await logCrmActivity(actor, { type: "EMAIL", subject: email.subject, body: email.message.trim().slice(0, 4000), ...email.about });
  return { to };
}
