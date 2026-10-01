/**
 * A record's members hear about new activity on it, in the app and by email.
 *
 * Members are the record's followers and its owner. The person who did it is
 * not told about their own work, and nobody else in the team is told at all.
 * Each channel follows its own switch: email off still notifies in the app,
 * and in-app off still emails.
 *
 * The records are real. The mail provider is mocked.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { ActivityRequest } from "@/lib/activity/context";
import { runWithActivityRequest } from "@/lib/activity/context";
import { prisma } from "@/lib/prisma";

const { sendEmailMock } = vi.hoisted(() => ({ sendEmailMock: vi.fn() }));

vi.mock("@/lib/email/send", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email/send")>()),
  isEmailConfigured: () => true,
  sendEmail: sendEmailMock,
}));

const { notifyRecordMembers } = await import("./record-members");

const SLUG = "crm-record-members-test";

let companyId: string;
let dealId: string;
const users: Record<"actor" | "owner" | "follower" | "quiet" | "away" | "outsider", { id: string; email: string }> =
  {} as never;

function openRequest(actorId: string): ActivityRequest {
  return {
    method: "POST",
    path: "/api/v2/crm/activities",
    companyId,
    actorId,
    actorName: "Tendai",
    actorRole: "MANAGER",
    changes: [],
    crmActivityIds: [],
    failed: false,
    explicit: false,
    flushed: false,
  };
}

async function cleanUp() {
  const stale = await prisma.company.findMany({ where: { slug: SLUG }, select: { id: true } });
  const companyIds = stale.map((company) => company.id);
  await prisma.notification.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.userNotificationPreference.deleteMany({ where: { user: { email: { startsWith: SLUG } } } });
  await prisma.crmActivity.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.crmDeal.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: SLUG } } });
  await prisma.company.deleteMany({ where: { slug: SLUG } });
}

beforeAll(async () => {
  await cleanUp();
  companyId = (await prisma.company.create({ data: { name: "Hurudza Creative", slug: SLUG } })).id;

  for (const key of ["actor", "owner", "follower", "quiet", "away", "outsider"] as const) {
    const email = `${SLUG}-${key}@example.invalid`;
    const user = await prisma.user.upsert({
      where: { email },
      update: { companyId },
      create: { email, name: key, companyId, role: "CLERK" },
    });
    users[key] = { id: user.id, email };
  }
  // Follows the deal, but has email turned off.
  await prisma.userNotificationPreference.create({
    data: { userId: users.quiet.id, emailEnabled: false },
  });
  // Follows the deal, but has the app's notifications turned off.
  await prisma.userNotificationPreference.create({
    data: { userId: users.away.id, inAppEnabled: false },
  });

  const pipeline = await prisma.crmPipeline.create({ data: { companyId, name: "Sales", isDefault: true } });
  const stage = await prisma.crmPipelineStage.create({
    data: { companyId, pipelineId: pipeline.id, name: "Quoted", position: 1 },
  });
  dealId = (
    await prisma.crmDeal.create({
      data: {
        companyId,
        dealNo: "D-M1",
        title: "Msasa fit-out",
        pipelineId: pipeline.id,
        stageId: stage.id,
        assignedToId: users.owner.id,
      },
    })
  ).id;
  await prisma.crmFollower.createMany({
    data: [users.follower, users.quiet, users.away, users.actor].map((user) => ({
      companyId,
      userId: user.id,
      entity: "DEAL" as const,
      recordId: dealId,
    })),
  });
});

afterAll(cleanUp);

describe("new activity on a record", () => {
  it("is collected from the request that wrote it", async () => {
    const request = openRequest(users.actor.id);
    // Awaited inside: a Prisma query does not run until it is awaited, and it
    // has to run inside the request to be counted as the request's.
    const entry = await runWithActivityRequest(request, async () =>
      await prisma.crmActivity.create({
        data: { companyId, dealId, type: "CALL", subject: "Agreed the site visit", createdById: users.actor.id },
      }),
    );
    expect(request.crmActivityIds).toEqual([entry.id]);
  });

  it("notifies the followers and the owner, not whoever did it", async () => {
    const request = openRequest(users.actor.id);
    await runWithActivityRequest(request, async () => {
      await prisma.crmActivity.create({
        data: { companyId, dealId, type: "CALL", subject: "Agreed the site visit", createdById: users.actor.id },
      });
      await prisma.crmActivity.create({
        data: {
          companyId,
          dealId,
          type: "SYSTEM",
          subject: "Stage changed",
          metadata: {
            kind: "FIELD_CHANGE",
            entity: "DEAL",
            recordId: dealId,
            changes: [{ field: "stageId", label: "Stage", from: "Quoted", to: "Negotiation" }],
          },
          createdById: users.actor.id,
        },
      });
    });

    sendEmailMock.mockClear();
    await notifyRecordMembers(request);

    // One notice for the request, not one per entry.
    const notices = await prisma.notification.findMany({
      where: { companyId, type: "CRM_RECORD_ACTIVITY" },
      include: { recipients: { select: { userId: true } } },
    });
    expect(notices).toHaveLength(1);
    const [notice] = notices;
    expect(notice.title).toBe("Tendai updated deal Msasa fit-out");
    expect(notice.summary).toBe("Call: Agreed the site visit\nStage: Negotiation");
    expect(notice.recipients.map((r) => r.userId).sort()).toEqual(
      [users.owner.id, users.follower.id, users.quiet.id].sort(),
    );

    // By email too, to each member who has not turned it off.
    await vi.waitFor(() => expect(sendEmailMock).toHaveBeenCalledTimes(3));
    expect(sendEmailMock.mock.calls.map(([mail]) => mail.to).sort()).toEqual(
      [users.owner.email, users.follower.email, users.away.email].sort(),
    );
    const [mail] = sendEmailMock.mock.calls[0];
    expect(mail.subject).toBe("Tendai updated deal Msasa fit-out");
    expect(mail.text).toContain(`/crm/deals/${dealId}`);
  });

  it("tells nobody about a request that failed", async () => {
    const request = openRequest(users.actor.id);
    await runWithActivityRequest(request, async () =>
      await prisma.crmActivity.create({
        data: { companyId, dealId, type: "NOTE", subject: "Never sent", createdById: users.actor.id },
      }),
    );
    request.failed = true;
    const before = await prisma.notification.count({ where: { companyId } });
    await notifyRecordMembers(request);
    expect(await prisma.notification.count({ where: { companyId } })).toBe(before);
  });
});
