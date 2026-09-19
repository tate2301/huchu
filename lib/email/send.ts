/**
 * Outbound mail.
 *
 * One sender for the whole platform, over Resend's REST API — the same
 * transport `lib/auth.ts` already uses for superuser magic links, called the
 * same way, so there is no second provider and no new dependency to keep
 * current.
 *
 * ## Who the mail is from
 *
 * Mail is sent from the platform's own verified domain and *presented* as the
 * tenant: the display name is the tenant's trading name and `Reply-To` is the
 * tenant's own address, so a customer sees "Floorcode Zimbabwe" in their inbox
 * and a reply lands in Floorcode's mailbox rather than ours.
 *
 * Sending from `sales@thetenant.co.zw` for real is a different feature: it
 * needs that tenant to publish SPF and DKIM records for their domain and to
 * verify it with the provider. Faking the address without those records is not
 * an option worth taking — it is precisely what spam filters reject, and it
 * would make every tenant's quotations undeliverable at once.
 */

export type EmailAttachment = {
  filename: string;
  content: Buffer;
};

export type EmailSender = {
  /** The tenant's name, shown to the recipient in place of the platform's. */
  name: string;
  /** Where a reply goes. Null falls back to the platform address. */
  replyTo?: string | null;
};

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
  sender: EmailSender;
  attachments?: EmailAttachment[];
};

export type EmailConfig = {
  apiKey: string;
  /** The verified address everything is sent from. */
  fromAddress: string;
};

/** Raised when mail cannot be sent, with a reason worth showing an operator. */
export class EmailNotConfiguredError extends Error {
  constructor() {
    super(
      "Outbound email is not configured. Set RESEND_API_KEY and EMAIL_FROM_ADDRESS to send documents to clients.",
    );
    this.name = "EmailNotConfiguredError";
  }
}

export function getEmailConfig(): EmailConfig | null {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const fromAddress = process.env.EMAIL_FROM_ADDRESS?.trim();
  if (!apiKey || !fromAddress) return null;
  return { apiKey, fromAddress };
}

export function isEmailConfigured(): boolean {
  return getEmailConfig() !== null;
}

/**
 * `Display Name <address@domain>`, with the display name quoted.
 *
 * A tenant called `Mabvuku Hardware (Pvt) Ltd` carries parentheses, which are
 * comment syntax in an address header; a quoted string is the only form that
 * survives them. Quotes and backslashes inside the name are escaped rather
 * than stripped, so a name cannot break out of the header.
 */
export function formatFromHeader(displayName: string, address: string): string {
  const name = displayName.trim().replace(/[\r\n]+/g, " ");
  if (!name) return address;
  const escaped = name.replace(/([\\"])/g, "\\$1");
  return `"${escaped}" <${address}>`;
}

/**
 * Send one message. Throws on a refusal so the caller can report why rather
 * than telling somebody their quotation went out when it did not.
 */
export async function sendEmail(input: SendEmailInput): Promise<void> {
  const config = getEmailConfig();
  if (!config) throw new EmailNotConfiguredError();

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      from: formatFromHeader(input.sender.name, config.fromAddress),
      to: [input.to],
      ...(input.sender.replyTo ? { reply_to: input.sender.replyTo } : {}),
      subject: input.subject,
      text: input.text,
      html: input.html,
      ...(input.attachments?.length
        ? {
            attachments: input.attachments.map((attachment) => ({
              filename: attachment.filename,
              content: attachment.content.toString("base64"),
            })),
          }
        : {}),
    }),
  });

  if (!response.ok) {
    // Resend puts the reason in the body; a bare status leaves an operator
    // guessing between an unverified domain and a malformed address.
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Email delivery failed (${response.status})${detail ? `: ${detail.slice(0, 300)}` : ""}`,
    );
  }
}
