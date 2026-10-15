import { EmailNotConfiguredError, isEmailConfigured, sendEmail } from "@/lib/email/send";

const TIME = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Harare" });

function escape(value: string) {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

/**
 * Whether the owner can be told before anyone is let in: a mail provider, or
 * development, where the email goes to the server log instead.
 */
export function canTellOwner(): boolean {
  return isEmailConfigured() || process.env.NODE_ENV !== "production";
}

/**
 * The email a workspace's owner gets the moment Corelith support signs in as
 * one of their members: who, as whom, why, how far and until when, and a
 * link that ends it. Sent before anyone is let in.
 *
 * Without a mail provider, development prints it to the server log so the
 * flow can be walked locally. Production refuses: a sign-in the owner is not
 * told about is the thing this email exists to prevent.
 */
export async function sendSignInAsOwnerMail(input: {
  to: string;
  ownerName: string;
  workspaceName: string;
  operatorName: string;
  memberName: string;
  mode: "LOOK" | "CHANGE";
  reason: string;
  code: string;
  until: Date;
  endUrl: string;
}) {
  const how = input.mode === "LOOK" ? "to look only, changing nothing" : "able to make changes";
  const subject = `Corelith support signed in to ${input.workspaceName} as ${input.memberName}`;
  const lines = [
    `${input.operatorName} from Corelith support signed in to ${input.workspaceName} as ${input.memberName}, ${how}, until ${TIME.format(input.until)}.`,
    `Their reason: “${input.reason}”`,
    `Everything they do is in your audit log under ${input.code}.`,
    `If you did not expect this, end it now: ${input.endUrl}`,
  ];
  const text = `Hello ${input.ownerName},\n\n${lines.join("\n\n")}\n`;
  const html = [
    `<p>Hello ${escape(input.ownerName)},</p>`,
    `<p>${escape(lines[0])}</p>`,
    `<p>${escape(lines[1])}</p>`,
    `<p>${escape(lines[2])}</p>`,
    `<p><a href="${escape(input.endUrl)}">End the session</a> if you did not expect this.</p>`,
  ].join("");

  if (!isEmailConfigured()) {
    if (process.env.NODE_ENV !== "production") {
      console.info(`[sign-in-as] email to ${input.to}: ${subject}\n${text}`);
      return;
    }
    throw new EmailNotConfiguredError();
  }
  await sendEmail({ to: input.to, subject, text, html, sender: { name: "Corelith support" } });
}
