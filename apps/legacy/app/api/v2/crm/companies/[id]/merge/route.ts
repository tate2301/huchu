import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { canUser, denialMessage } from "@/lib/crm/permissions";
import {
  COMPANY_MERGE_FIELDS,
  mergeLists,
  planMerge,
  resolveMerge,
  validateMergePair,
  type FieldChoice,
} from "@/lib/crm/merge";

const mergeSchema = z.object({
  loserId: z.string().uuid(),
  choices: z.record(z.string(), z.enum(["SURVIVOR", "LOSER"])).optional(),
  commit: z.boolean().default(false),
});

const companySelect = {
  id: true,
  clientNo: true,
  name: true,
  tradingName: true,
  contactName: true,
  email: true,
  phone: true,
  website: true,
  registrationNumber: true,
  taxNumber: true,
  industry: true,
  companyType: true,
  billingAddress: true,
  city: true,
  country: true,
  assignedToId: true,
  notes: true,
  tags: true,
  customerId: true,
  parentClientId: true,
  mergedIntoId: true,
} as const;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;
    const { id } = await params;

    if (!(await canUser(session, "records.merge"))) {
      return errorResponse(denialMessage("records.merge"), 403);
    }

    const body = mergeSchema.parse(await request.json());

    const [survivor, loser] = await Promise.all([
      prisma.crmClient.findFirst({ where: { id, companyId }, select: companySelect }),
      prisma.crmClient.findFirst({
        where: { id: body.loserId, companyId },
        select: companySelect,
      }),
    ]);

    const problem = validateMergePair(survivor, loser);
    if (problem) return errorResponse(problem, 400);
    if (!survivor || !loser) return errorResponse("Record not found", 404);

    // A company wired to an accounting customer carries invoices and a ledger
    // balance. Folding two of those together silently would move money between
    // customer accounts, so it needs the books sorted out first.
    if (survivor.customerId && loser.customerId && survivor.customerId !== loser.customerId) {
      return errorResponse(
        "Both companies are linked to different accounting customers. Merge those in Accounting first.",
        409,
      );
    }

    const plans = planMerge(COMPANY_MERGE_FIELDS, survivor, loser);

    if (!body.commit) {
      return successResponse({
        survivor: { id: survivor.id, label: survivor.name, reference: survivor.clientNo },
        loser: { id: loser.id, label: loser.name, reference: loser.clientNo },
        fields: plans,
      });
    }

    const updates = resolveMerge(plans, (body.choices ?? {}) as Record<string, FieldChoice>);

    const result = await prisma.$transaction(async (tx) => {
      const merged = await tx.crmClient.update({
        where: { id: survivor.id },
        data: {
          ...updates,
          tags: mergeLists(survivor.tags, loser.tags),
          // The survivor takes the accounting link if it didn't have one.
          customerId: survivor.customerId ?? loser.customerId ?? undefined,
        },
        select: companySelect,
      });

      const moved = { clientId: survivor.id };
      await Promise.all([
        tx.crmLead.updateMany({ where: { clientId: loser.id }, data: moved }),
        tx.crmDeal.updateMany({ where: { clientId: loser.id }, data: moved }),
        tx.crmSite.updateMany({ where: { clientId: loser.id }, data: moved }),
        tx.crmActivity.updateMany({ where: { clientId: loser.id }, data: moved }),
        tx.crmTask.updateMany({ where: { clientId: loser.id }, data: moved }),
        tx.crmComment.updateMany({ where: { clientId: loser.id }, data: moved }),
        tx.crmPerson.updateMany({ where: { clientId: loser.id }, data: moved }),
        tx.crmAppointment.updateMany({ where: { clientId: loser.id }, data: moved }),
        // A company that sat under the loser now sits under the survivor,
        // rather than under a record marked as merged away.
        tx.crmClient.updateMany({
          where: { parentClientId: loser.id },
          data: { parentClientId: survivor.id },
        }),
      ]);

      // Person-to-company links are unique per pair, so the clashes are
      // dropped and the rest move.
      const links = await tx.crmPersonCompany.findMany({
        where: { clientId: loser.id },
        select: { id: true, personId: true },
      });
      for (const link of links) {
        const clash = await tx.crmPersonCompany.findFirst({
          where: { clientId: survivor.id, personId: link.personId },
          select: { id: true },
        });
        if (clash) await tx.crmPersonCompany.delete({ where: { id: link.id } });
        else await tx.crmPersonCompany.update({ where: { id: link.id }, data: moved });
      }

      await tx.crmClient.update({
        where: { id: loser.id },
        data: {
          mergedIntoId: survivor.id,
          archivedAt: new Date(),
          accountStatus: "INACTIVE",
          // The accounting link moves with the records, so the merged-away
          // company can't keep pulling invoices onto a dead page.
          customerId: null,
        },
      });

      await tx.crmActivity.create({
        data: {
          companyId,
          type: "SYSTEM",
          clientId: survivor.id,
          subject: `Merged ${loser.name} (${loser.clientNo}) into this record`,
          createdById: session.user.id,
          occurredAt: new Date(),
          metadata: { kind: "MERGE", mergedId: loser.id, mergedRef: loser.clientNo },
        },
      });

      return merged;
    });

    return successResponse(result);
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    console.error("[API] POST /api/v2/crm/companies/[id]/merge error:", error);
    return errorResponse("Failed to merge the records");
  }
}
