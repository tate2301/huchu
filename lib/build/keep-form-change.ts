import { canUser } from "@/lib/crm/permissions";
import { fieldFromQuestion, questionFromField, quoteLinesOf } from "@/lib/crm/site-visits/fields";
import { questionSetDraftSchema, saveQuestionSet } from "@/lib/crm/site-visits/question-editing";
import type { AuthenticatedSession } from "@/lib/auth-core/types";
import { prisma } from "@/lib/prisma";

import { applyFormChange, changeRefusal, hasChange, type FormChange } from "./form-changes";

/** Why a change was not kept, in a sentence a person can act on. */
export class FormChangeRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FormChangeRefused";
  }
}

/**
 * Keeps one of Vane's changes on a site-visit form, as the person approving
 * it, through the form's own save (`saveQuestionSet`, as
 * `PATCH /api/v2/crm/question-sets/[id]`): only someone who may change the
 * site-visit questions. Already on the form (kept in the builder and
 * published), it says so and writes nothing.
 */
export async function keepFormChange(session: AuthenticatedSession, setId: string, change: FormChange): Promise<{ form: string; already: boolean }> {
  if (!(await canUser(session, "settings.manage"))) throw new FormChangeRefused("You cannot change the site-visit questions, so Vane cannot do it for you.");
  const companyId = session.user.companyId;
  const set = await prisma.crmQuestionSet.findFirst({
    where: { id: setId, companyId },
    include: { questions: { where: { archivedAt: null }, orderBy: { position: "asc" } } },
  });
  if (!set) throw new FormChangeRefused("That form no longer exists.");
  const draft = { fields: set.questions.map(fieldFromQuestion), quoteLines: quoteLinesOf(set.quoteLines) };
  const refusal = changeRefusal(draft, change);
  if (refusal) throw new FormChangeRefused(refusal);
  if (hasChange(draft, change)) return { form: set.name, already: true };

  const next = applyFormChange(draft, change);
  const byKey = new Map(set.questions.map((question) => [question.key, question]));
  const payload = questionSetDraftSchema.parse({
    name: set.name,
    kind: set.kind,
    productId: set.productId,
    isActive: set.isActive,
    questions: next.fields.map((field) => {
      const row = questionFromField(field);
      const before = byKey.get(field.key);
      return {
        ...(before ? { id: before.id } : {}),
        key: row.key,
        label: row.label,
        helpText: row.helpText,
        type: row.type,
        options: row.options,
        unit: row.unit,
        isRequired: row.isRequired,
        requiresPhoto: field.type === "photos" || Boolean(before?.requiresPhoto),
        settings: row.settings,
      };
    }),
    quoteLines: next.quoteLines,
  });
  await prisma.$transaction((tx) => saveQuestionSet(tx, companyId, setId, payload));
  return { form: set.name, already: false };
}
