import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { canUser, denialMessage } from "@/lib/crm/permissions";
import {
  PERSON_MERGE_FIELDS,
  mergeLists,
  planMerge,
  resolveMerge,
  validateMergePair,
  type FieldChoice,
} from "@/lib/crm/merge";
import { buildFullName } from "@/lib/crm/conversion";

const mergeSchema = z.object({
  loserId: z.string().uuid(),
  /** Per-field overrides; anything not named takes the safe default. */
  choices: z.record(z.string(), z.enum(["SURVIVOR", "LOSER"])).optional(),
  /** Preview by default — nothing moves until this says so. */
  commit: z.boolean().default(false),
});

const personSelect = {
  id: true,
  personNo: true,
  firstName: true,
  lastName: true,
  fullName: true,
  jobTitle: true,
  email: true,
  phone: true,
  contactType: true,
  preferredChannel: true,
  addressLine: true,
  city: true,
  country: true,
  clientId: true,
  assignedToId: true,
  notes: true,
  tags: true,
  additionalEmails: true,
  additionalPhones: true,
  mergedIntoId: true,
} as const;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;
    const { id } = await params;

    // A merge rewrites two people's history at once, so it is a manager's call.
    if (!(await canUser(session, "records.merge"))) {
      return errorResponse(denialMessage("records.merge"), 403);
    }

    const body = mergeSchema.parse(await request.json());

    const [survivor, loser] = await Promise.all([
      prisma.crmPerson.findFirst({ where: { id, companyId }, select: personSelect }),
      prisma.crmPerson.findFirst({
        where: { id: body.loserId, companyId },
        select: personSelect,
      }),
    ]);

    const problem = validateMergePair(survivor, loser);
    if (problem) return errorResponse(problem, 400);
    if (!survivor || !loser) return errorResponse("Record not found", 404);

    const plans = planMerge(PERSON_MERGE_FIELDS, survivor, loser);

    if (!body.commit) {
      return successResponse({
        survivor: { id: survivor.id, label: survivor.fullName, reference: survivor.personNo },
        loser: { id: loser.id, label: loser.fullName, reference: loser.personNo },
        fields: plans,
      });
    }

    const updates = resolveMerge(plans, (body.choices ?? {}) as Record<string, FieldChoice>);
    const firstName = (updates.firstName as string | undefined) ?? survivor.firstName;
    const lastName = (updates.lastName as string | null | undefined) ?? survivor.lastName;

    const result = await prisma.$transaction(async (tx) => {
      // The loser's contact details survive as alternates rather than being
      // thrown away — the number in the old record is the one on the invoice.
      const extraEmails = mergeLists(survivor.additionalEmails, [
        ...loser.additionalEmails,
        ...(loser.email && loser.email !== survivor.email ? [loser.email] : []),
      ]);
      const extraPhones = mergeLists(survivor.additionalPhones, [
        ...loser.additionalPhones,
        ...(loser.phone && loser.phone !== survivor.phone ? [loser.phone] : []),
      ]);

      const merged = await tx.crmPerson.update({
        where: { id: survivor.id },
        data: {
          ...updates,
          firstName,
          lastName,
          fullName: buildFullName(firstName, lastName),
          tags: mergeLists(survivor.tags, loser.tags),
          additionalEmails: extraEmails,
          additionalPhones: extraPhones,
        },
        select: personSelect,
      });

      // Everything hanging off the loser moves across. Nothing is deleted.
      const moved = { personId: survivor.id };
      await Promise.all([
        tx.crmActivity.updateMany({ where: { personId: loser.id }, data: moved }),
        tx.crmTask.updateMany({ where: { personId: loser.id }, data: moved }),
        tx.crmComment.updateMany({ where: { personId: loser.id }, data: moved }),
        tx.crmSite.updateMany({
          where: { primaryContactId: loser.id },
          data: { primaryContactId: survivor.id },
        }),
      ]);

      // Deal and company links are unique per pair, so a straight update would
      // collide where both people were already on the same deal. Move the ones
      // that don't clash and drop the rest as the duplicates they are.
      const [dealLinks, companyLinks] = await Promise.all([
        tx.crmDealContact.findMany({
          where: { personId: loser.id },
          select: { id: true, dealId: true, role: true },
        }),
        tx.crmPersonCompany.findMany({
          where: { personId: loser.id },
          select: { id: true, clientId: true },
        }),
      ]);

      for (const link of dealLinks) {
        const clash = await tx.crmDealContact.findFirst({
          where: { dealId: link.dealId, personId: survivor.id, role: link.role },
          select: { id: true },
        });
        if (clash) await tx.crmDealContact.delete({ where: { id: link.id } });
        else await tx.crmDealContact.update({ where: { id: link.id }, data: moved });
      }

      for (const link of companyLinks) {
        const clash = await tx.crmPersonCompany.findFirst({
          where: { clientId: link.clientId, personId: survivor.id },
          select: { id: true },
        });
        if (clash) await tx.crmPersonCompany.delete({ where: { id: link.id } });
        else await tx.crmPersonCompany.update({ where: { id: link.id }, data: moved });
      }

      // The loser is kept and pointed at the survivor, so a wrong merge costs
      // a conversation rather than somebody's history.
      await tx.crmPerson.update({
        where: { id: loser.id },
        data: { mergedIntoId: survivor.id, archivedAt: new Date() },
      });

      await tx.crmActivity.create({
        data: {
          companyId,
          type: "SYSTEM",
          personId: survivor.id,
          subject: `Merged ${loser.fullName} (${loser.personNo}) into this record`,
          createdById: session.user.id,
          occurredAt: new Date(),
          metadata: { kind: "MERGE", mergedId: loser.id, mergedRef: loser.personNo },
        },
      });

      return merged;
    });

    return successResponse(result);
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    console.error("[API] POST /api/v2/crm/people/[id]/merge error:", error);
    return errorResponse("Failed to merge the records");
  }
}
