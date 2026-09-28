import type { EmailCodePurpose } from "@prisma/client";

import { EmailNotConfiguredError, isEmailConfigured, sendEmail } from "@/lib/email/send";
import { EMAIL_CODE_TTL_MS } from "@/lib/auth-core/email-code";

/**
 * The email that carries a six-digit code.
 *
 * The code is in the subject line as well as the body, because on a phone the
 * subject is what the notification shows, and copying it from there is one
 * tap instead of opening the mail.
 *
 * Without a mail provider, development prints the code to the server log so a
 * signup can be walked end to end locally. Production refuses, because a code
 * nobody receives is a signup nobody finishes.
 */
export async function sendEmailCodeMail(input: {
  to: string;
  code: string;
  productName: string;
  purpose: EmailCodePurpose;
}): Promise<void> {
  const minutes = Math.round(EMAIL_CODE_TTL_MS / 60_000);
  const spaced = `${input.code.slice(0, 3)} ${input.code.slice(3)}`;
  const subject =
    input.purpose === "SIGNUP"
      ? `${input.code} is your ${input.productName} code`
      : `${input.code} is your ${input.productName} sign-in code`;
  const lead =
    input.purpose === "SIGNUP"
      ? `Enter this code to finish setting up ${input.productName}:`
      : `Enter this code to sign in to ${input.productName}:`;
  const text = `${lead}\n\n${spaced}\n\nIt works for ${minutes} minutes. If you did not ask for it, you can ignore this email.`;
  const html = [
    `<p>${lead}</p>`,
    `<p style="font-size:24px;font-weight:600;letter-spacing:4px;font-family:monospace">${spaced}</p>`,
    `<p>It works for ${minutes} minutes. If you did not ask for it, you can ignore this email.</p>`,
  ].join("");

  if (!isEmailConfigured()) {
    if (process.env.NODE_ENV !== "production") {
      console.info(`[email-code] ${input.purpose} code for ${input.to}: ${input.code}`);
      return;
    }
    throw new EmailNotConfiguredError();
  }

  await sendEmail({ to: input.to, subject, text, html, sender: { name: input.productName } });
}
