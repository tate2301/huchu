/**
 * Development only: a realistic spread of notifications for one workspace, so
 * the bell and /activity can be looked at with the range they are built for.
 *
 *   pnpm exec tsx scripts/notify-seed.ts [workspace-slug] [email]   (default: floorcode, its first superadmin)
 *
 * It notifies the person named (or the workspace's first superadmin) about
 * the workspace's own records: an invoice approved, a payment received, a
 * mention in a deal's comments, a leave request, a report sent, a Vane card,
 * a deal won and a comment. Where the workspace has no such record it adds a
 * small one (two people who cannot sign in, an employee, a leave type and
 * request, a comment). Every notification it writes carries `"seed":"notify"`
 * in its payload, and running it again replaces them.
 *
 * Notification types have no value yet for Books, leave, reports or Vane, so
 * those carry the record as `payload.subject` and their module as
 * `payload.module` (see lib/inbox/describe.ts).
 */
import "dotenv/config";

import type { NotificationType, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { createMember } from "@/lib/teams/members";

const SEED = "notify";

function ago(minutes: number) {
  return new Date(Date.now() - minutes * 60_000);
}

async function personNamed(companyId: string, name: string) {
  const existing = await prisma.user.findFirst({ where: { companyId, name, email: null } });
  if (existing) return existing;
  return createMember(prisma, { data: { companyId, name, role: "MANAGER", isActive: false } });
}

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("notify-seed is for development databases only.");
  const slug = process.argv[2] ?? "floorcode";
  const email = process.argv[3];

  const company = await prisma.company.findFirst({ where: { slug }, select: { id: true, name: true } });
  if (!company) throw new Error(`No workspace "${slug}".`);
  const companyId = company.id;

  const viewer = email
    ? await prisma.user.findFirst({ where: { companyId, email } })
    : await prisma.user.findFirst({ where: { companyId, role: "SUPERADMIN", isActive: true }, orderBy: { createdAt: "asc" } });
  if (!viewer) throw new Error("Nobody to notify.");

  const tendai = await personNamed(companyId, "Tendai Moyo");
  const rudo = await personNamed(companyId, "Rudo Chari");

  // The records each one is about.
  const owed = await prisma.salesInvoice.findFirst({ where: { companyId, status: "ISSUED" }, orderBy: { invoiceDate: "desc" } });
  const receipt = await prisma.salesReceipt.findFirst({ where: { companyId, invoiceId: { not: null } }, orderBy: { receivedAt: "desc" }, include: { invoice: { include: { customer: true } } } });
  const deal = await prisma.crmDeal.findFirst({ where: { companyId, stage: { status: "OPEN" } }, orderBy: { updatedAt: "desc" } });
  const wonDeal = await prisma.crmDeal.findFirst({ where: { companyId, stage: { status: "WON" } }, orderBy: { updatedAt: "desc" } });
  const report = await prisma.customReport.findFirst({ where: { companyId }, orderBy: { updatedAt: "desc" } });
  const vane = await prisma.vaneItem.findFirst({ where: { companyId, status: "OPEN", kind: { in: ["ISSUE", "SUGGESTION"] } }, orderBy: { createdAt: "desc" } });

  // Leave: an employee and a request for this week, if the workspace has none.
  const employee =
    (await prisma.employee.findFirst({ where: { companyId, employeeId: "FC-014" } })) ??
    (await prisma.employee.create({
      data: {
        companyId,
        employeeId: "FC-014",
        name: "Kuda Chigumba",
        jobTitle: "Fitter",
        phone: "+263 77 214 5590",
        nextOfKinName: "Ruth Chigumba",
        nextOfKinPhone: "+263 77 214 5591",
        passportPhotoUrl: "",
        villageOfOrigin: "Mutoko",
      },
    }));
  const annual =
    (await prisma.leaveType.findFirst({ where: { companyId, code: "AL" } })) ??
    (await prisma.leaveType.create({
      data: { companyId, code: "AL", name: "Annual leave", defaultEntitlement: 22, effectiveFrom: new Date(Date.UTC(2026, 0, 1)) },
    }));
  const leave =
    (await prisma.leaveRequest.findFirst({ where: { companyId, employeeId: employee.id, status: "SUBMITTED" } })) ??
    (await prisma.leaveRequest.create({
      data: {
        companyId,
        employeeId: employee.id,
        leaveTypeId: annual.id,
        startDate: new Date(Date.UTC(2026, 9, 20)),
        endDate: new Date(Date.UTC(2026, 9, 22)),
        workingDays: 3,
        reason: "Family wedding in Mutoko.",
        status: "SUBMITTED",
        submittedAt: ago(9),
        createdById: viewer.id,
      },
    }));

  // A comment on the open deal that names the viewer, and an earlier one by Rudo.
  const mention = deal
    ? (await prisma.crmComment.findFirst({ where: { companyId, dealId: deal.id, createdById: tendai.id } })) ??
      (await prisma.crmComment.create({
        data: {
          companyId,
          dealId: deal.id,
          createdById: tendai.id,
          body: `@${viewer.name.split(" ")[0]} can you confirm the site visit with them before Friday? They want everything in before month end.`,
          createdAt: ago(42),
        },
      }))
    : null;
  const remark = deal
    ? (await prisma.crmComment.findFirst({ where: { companyId, dealId: deal.id, createdById: rudo.id } })) ??
      (await prisma.crmComment.create({
        data: { companyId, dealId: deal.id, createdById: rudo.id, body: "Their buyer asked for the quote in ZWG as well.", createdAt: ago(60 * 24 * 3 + 30) },
      }))
    : null;

  await prisma.notification.deleteMany({ where: { companyId, payloadJson: { contains: `"seed":"${SEED}"` } } });

  type Seed = {
    type: NotificationType;
    title: string;
    summary: string;
    at: Date;
    read?: boolean;
    severity?: "INFO" | "WARNING" | "CRITICAL";
    entityType?: Prisma.NotificationCreateInput["entityType"];
    entityId?: string;
    payload: Record<string, unknown>;
  };

  const seeds: Seed[] = [];

  seeds.push({
    type: "CRM_RECORD_ACTIVITY",
    title: `${employee.name} asked for annual leave`,
    summary: "Two of four fitters would be out on Wednesday.",
    at: ago(8),
    payload: { module: "people", subject: { kind: "leave", id: leave.id }, actorName: employee.name, needsYou: true },
  });

  if (mention && deal) {
    seeds.push({
      type: "CRM_MENTIONED",
      title: `${tendai.name} mentioned you`,
      summary: mention.body,
      at: ago(42),
      entityType: "CRM_COMMENT",
      entityId: mention.id,
      payload: { viewPath: `/crm/deals/${deal.id}` },
    });
  }

  if (owed) {
    seeds.push({
      type: "CRM_RECORD_ACTIVITY",
      title: "Invoice approved",
      summary: `${rudo.name} approved ${owed.invoiceNumber}`,
      at: ago(125),
      payload: {
        module: "books",
        subject: { kind: "invoice", id: owed.id },
        actorName: rudo.name,
        needsYou: false,
        changes: [{ label: "Due", from: "3 Nov", to: "10 Nov" }],
      },
    });
  }

  if (vane) {
    seeds.push({
      type: "CRM_RECORD_ACTIVITY",
      title: `Vane raised: ${vane.headline}`,
      summary: vane.body,
      at: ago(190),
      payload: { module: "vane", subject: { kind: "vane", id: vane.id }, needsYou: true },
    });
  }

  if (receipt?.invoice) {
    seeds.push({
      type: "CRM_RECORD_ACTIVITY",
      title: `${receipt.receiptNumber} received from ${receipt.invoice.customer.name}`,
      summary: `It settles ${receipt.invoice.invoiceNumber} in full.`,
      at: ago(320),
      read: true,
      payload: { module: "books", subject: { kind: "receipt", id: receipt.id }, needsYou: false },
    });
  }

  if (report) {
    seeds.push({
      type: "CRM_DAILY_REPORT_READY",
      title: `${report.title} was sent to 4 people`,
      summary: "The weekly copy went to the sales team at 07:00.",
      at: ago(60 * 24 + 90),
      read: true,
      payload: { module: "reports", subject: { kind: "report", id: report.id }, needsYou: false },
    });
  }

  if (wonDeal) {
    seeds.push({
      type: "CRM_RECORD_ACTIVITY",
      title: `${tendai.name} marked ${wonDeal.title} won`,
      summary: "Accounting can raise the invoice from the accepted quote.",
      at: ago(60 * 24 * 2 + 200),
      read: true,
      payload: { subject: { kind: "deal", id: wonDeal.id }, actorName: tendai.name, changes: [{ label: "Stage", from: "Quoted", to: "Won" }] },
    });
  }

  if (remark && deal) {
    seeds.push({
      type: "CRM_COMMENT_ADDED",
      title: `${rudo.name} commented`,
      summary: remark.body,
      at: ago(60 * 24 * 3 + 30),
      read: true,
      entityType: "CRM_COMMENT",
      entityId: remark.id,
      payload: { viewPath: `/crm/deals/${deal.id}` },
    });
  }

  for (const seed of seeds) {
    await prisma.notification.create({
      data: {
        companyId,
        type: seed.type,
        title: seed.title,
        summary: seed.summary,
        severity: seed.severity ?? "INFO",
        entityType: seed.entityType,
        entityId: seed.entityId,
        payloadJson: JSON.stringify({ ...seed.payload, seed: SEED }),
        createdAt: seed.at,
        recipients: {
          create: { userId: viewer.id, isRead: !!seed.read, readAt: seed.read ? seed.at : null, createdAt: seed.at },
        },
      },
    });
  }

  console.log(`${seeds.length} notifications for ${viewer.name} in ${company.name}.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
