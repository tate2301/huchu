/**
 * CRM client dedupe / find-or-create.
 *
 * Match order: normalized email first, then E.164 phone, else create a new
 * CrmClient with a reserved CLI- number. Dedupe keys are indexed (not unique)
 * so concurrent intake/webhook writes never hard-fail; a slim merge helper
 * folds accidental duplicates together.
 */
import type { Prisma } from "@corelithzw/db";

import { prisma } from "@corelithzw/db/client";
import { reserveIdentifier } from "@corelithzw/platform/id-generator";
import { normalizeEmail, normalizePhoneE164 } from "@/lib/crm/phone";

type Tx = Prisma.TransactionClient;

export type FindOrCreateClientInput = {
  companyId: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  phoneCountry?: string | null;
  assignedToId?: string | null;
  source?: string | null;
};

export async function findOrCreateClient(
  tx: Tx,
  input: FindOrCreateClientInput,
): Promise<{ id: string; created: boolean }> {
  const emailNormalized = normalizeEmail(input.email);
  const phoneE164 = normalizePhoneE164(input.phone, input.phoneCountry);

  if (emailNormalized) {
    const byEmail = await tx.crmClient.findFirst({
      where: { companyId: input.companyId, emailNormalized },
      select: { id: true },
    });
    if (byEmail) return { id: byEmail.id, created: false };
  }
  if (phoneE164) {
    const byPhone = await tx.crmClient.findFirst({
      where: { companyId: input.companyId, phoneE164 },
      select: { id: true },
    });
    if (byPhone) return { id: byPhone.id, created: false };
  }

  const clientNo = await reserveIdentifier(tx, {
    companyId: input.companyId,
    entity: "CRM_CLIENT",
  });

  const created = await tx.crmClient.create({
    data: {
      companyId: input.companyId,
      clientNo,
      name: input.name,
      email: input.email ?? undefined,
      emailNormalized: emailNormalized ?? undefined,
      phone: input.phone ?? undefined,
      phoneE164: phoneE164 ?? undefined,
      assignedToId: input.assignedToId ?? undefined,
    },
    select: { id: true },
  });
  return { id: created.id, created: true };
}

/**
 * Merge `mergeClientId` into `keepClientId`: re-point every child record then
 * archive the merged client. Both must belong to the same company.
 */
export async function mergeClients(params: {
  companyId: string;
  keepClientId: string;
  mergeClientId: string;
}): Promise<void> {
  if (params.keepClientId === params.mergeClientId) return;
  await prisma.$transaction(async (tx) => {
    const [keep, merge] = await Promise.all([
      tx.crmClient.findFirst({
        where: { id: params.keepClientId, companyId: params.companyId },
        select: { id: true },
      }),
      tx.crmClient.findFirst({
        where: { id: params.mergeClientId, companyId: params.companyId },
        select: { id: true },
      }),
    ]);
    if (!keep || !merge) throw new Error("Both clients must exist in this company");

    const where = { companyId: params.companyId, clientId: params.mergeClientId };
    const data = { clientId: params.keepClientId };
    await tx.crmLead.updateMany({ where, data });
    await tx.crmActivity.updateMany({ where, data });
    await tx.crmFollowUp.updateMany({ where, data });
    await tx.crmAppointment.updateMany({ where, data });
    await tx.crmIntakeSubmission.updateMany({ where, data });

    await tx.crmClient.update({
      where: { id: params.mergeClientId },
      data: { archivedAt: new Date() },
    });
  });
}
