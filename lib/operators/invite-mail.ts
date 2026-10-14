import { EmailNotConfiguredError, isEmailConfigured, sendEmail } from "@/lib/email/send";

/**
 * An operator's invite: the link to choose a password. Without a mail
 * provider, development prints it to the server log; the owner can also copy
 * the link from the portal and send it another way.
 */
export async function sendOperatorInviteMail(input: { to: string; name: string; invitedBy: string; link: string; again: boolean }) {
  const subject = input.again ? "A new link to the Corelith admin portal" : "You are invited to the Corelith admin portal";
  const lead = input.again
    ? `${input.invitedBy} sent you a new link to choose a password for the Corelith admin portal. Your old password no longer works.`
    : `${input.invitedBy} invited you to the Corelith admin portal.`;
  const text = `Hello ${input.name},\n\n${lead}\n\nChoose your password here, within three days: ${input.link}\n\nYou will then set up an authenticator app on your phone. You need both every time you sign in.\n`;
  const html = `<p>Hello ${input.name},</p><p>${lead}</p><p><a href="${input.link}">Choose your password</a>, within three days.</p><p>You will then set up an authenticator app on your phone. You need both every time you sign in.</p>`;
  if (!isEmailConfigured()) {
    if (process.env.NODE_ENV !== "production") {
      console.info(`[operator-invite] email to ${input.to}: ${subject}\n${text}`);
      return;
    }
    throw new EmailNotConfiguredError();
  }
  await sendEmail({ to: input.to, subject, text, html, sender: { name: "Corelith admin" } });
}
