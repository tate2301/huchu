/**
 * The senders honour who hears about what (`NotificationSetting`, approved 15
 * Oct): a kind the workspace or the person turned off in the app does not
 * reach them there, and whoever did the thing is kept as its actor and never
 * told about it.
 */

import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { emitCrmNotification } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

import { saveSetting } from "./settings";

const suffix = randomUUID().slice(0, 8);
const made = { company: "", james: "", rudo: "", chipo: "" };

beforeAll(async () => {
  const company = await prisma.company.create({ data: { name: `Routing ${suffix}`, slug: `routing-send-${suffix}` }, select: { id: true } });
  made.company = company.id;
  for (const [key, name] of [["james", "James"], ["rudo", "Rudo"], ["chipo", "Chipo"]] as const) {
    const user = await prisma.user.create({
      data: { email: `${key}-${suffix}@routing.test`, name, role: "MANAGER", companyId: company.id },
      select: { id: true },
    });
    made[key] = user.id;
  }
});

afterAll(async () => {
  await prisma.notificationRecipient.deleteMany({ where: { notification: { companyId: made.company } } });
  await prisma.notification.deleteMany({ where: { companyId: made.company } });
  await prisma.notificationSetting.deleteMany({ where: { companyId: made.company } });
  await prisma.user.deleteMany({ where: { companyId: made.company } });
  await prisma.company.deleteMany({ where: { id: made.company } });
});

async function send(type: "CRM_MENTIONED" | "CRM_COMMENT_ADDED", title: string) {
  await emitCrmNotification({
    companyId: made.company,
    recipientIds: [made.james, made.rudo, made.chipo],
    actorId: made.james,
    type,
    title,
    summary: "James commented on the Pomona deal.",
    viewPath: "/crm/deals",
  });
  return prisma.notification.findFirst({
    where: { companyId: made.company, title },
    select: { actorId: true, recipients: { select: { userId: true }, orderBy: { userId: "asc" } } },
  });
}

describe("who hears about what, when a notification is sent", () => {
  it("keeps who did it, and never tells them", async () => {
    const sent = await send("CRM_COMMENT_ADDED", `First ${suffix}`);
    expect(sent?.actorId).toBe(made.james);
    expect(sent?.recipients.map((row) => row.userId).sort()).toEqual([made.rudo, made.chipo].sort());
  });

  it("reaches nobody in the app with a kind the workspace turned off there", async () => {
    await saveSetting(prisma, { companyId: made.company, userId: null, kind: "mentions", channel: "IN_APP", enabled: false, updatedById: made.james });
    expect(await send("CRM_MENTIONED", `Mention ${suffix}`)).toBeNull();
    // The rule is one row, however often it is saved.
    await saveSetting(prisma, { companyId: made.company, userId: null, kind: "mentions", channel: "IN_APP", enabled: false, updatedById: made.james });
    expect(await prisma.notificationSetting.count({ where: { companyId: made.company, userId: null } })).toBe(1);
  });

  it("leaves out a person who turned the kind off for themselves", async () => {
    await saveSetting(prisma, { companyId: made.company, userId: made.chipo, kind: "records", channel: "IN_APP", enabled: false, updatedById: made.chipo });
    const sent = await send("CRM_COMMENT_ADDED", `Second ${suffix}`);
    expect(sent?.recipients.map((row) => row.userId)).toEqual([made.rudo]);
  });
});
