/**
 * Notifications, by email.
 *
 * Every notification the app raises is shown in the app and also emailed to
 * each recipient who has not turned email off. The mail is the notification
 * itself: its title as the subject, its summary as the body, and one link to
 * the thing it is about, on the workspace's own host.
 *
 * It goes out after the response (`after()`), so nobody waits on the mail
 * provider to save a record, and a failed send is logged rather than thrown:
 * the notification is already in the app.
 */
import { after } from "next/server";

import { isEmailConfigured, sendEmail } from "@/lib/email/send";
import { prisma } from "@/lib/prisma";
import { buildWorkspaceUrl } from "@/lib/platform/tenant-url";
import { getSiteUrl } from "@/lib/site-url";

export type NotificationEmail = {
  companyId: string;
  userIds: string[];
  title: string;
  summary: string;
  /** Where the notification leads, inside the workspace. */
  viewPath?: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Plain, like the covering note on a quote: a notice, not a newsletter. */
export function buildNotificationEmail(input: {
  title: string;
  summary: string;
  link: string;
  workspaceName: string;
}): { subject: string; text: string; html: string } {
  const text = [input.summary, "", `Open it: ${input.link}`, "", input.workspaceName].join("\n");
  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#18181b">
  <p style="margin:0 0 4px;font-weight:600">${escapeHtml(input.title)}</p>
  <p style="margin:0 0 16px;white-space:pre-line">${escapeHtml(input.summary)}</p>
  <p style="margin:0 0 16px"><a href="${escapeHtml(input.link)}">Open it in ${escapeHtml(input.workspaceName)}</a></p>
</div>`;
  return { subject: input.title, text, html };
}

/**
 * Email a notification once the response has gone. Outside a request — a
 * script, a cron — there is no response to wait for, so it sends straight
 * away instead.
 */
export function emailNotificationAfterResponse(input: NotificationEmail): void {
  if (input.userIds.length === 0 || !isEmailConfigured()) return;
  const send = () => deliverNotificationEmail(input);
  try {
    after(send);
  } catch {
    void send();
  }
}

export async function deliverNotificationEmail(input: NotificationEmail): Promise<void> {
  try {
    const [company, users] = await Promise.all([
      prisma.company.findUnique({
        where: { id: input.companyId },
        select: { name: true, slug: true },
      }),
      prisma.user.findMany({
        where: { id: { in: input.userIds }, companyId: input.companyId, isActive: true },
        select: { email: true },
      }),
    ]);
    if (!company) return;

    const path = input.viewPath ?? "/";
    const link = company.slug
      ? buildWorkspaceUrl({ slug: company.slug, path, currentUrl: getSiteUrl() }).toString()
      : new URL(path, getSiteUrl()).toString();
    const { subject, text, html } = buildNotificationEmail({
      title: input.title,
      summary: input.summary,
      link,
      workspaceName: company.name,
    });

    for (const user of users) {
      if (!user.email) continue;
      try {
        await sendEmail({ to: user.email, subject, text, html, sender: { name: company.name } });
      } catch (error) {
        console.error("[notification-email] send failed", { to: user.email, subject, error });
      }
    }
  } catch (error) {
    console.error("[notification-email] delivery failed", { subject: input.title, error });
  }
}
