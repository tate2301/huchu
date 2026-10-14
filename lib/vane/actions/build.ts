import { z } from "zod";

import { formChangeSchema, type FormChange } from "@/lib/build/form-changes";
import { FormChangeRefused, keepFormChange } from "@/lib/build/keep-form-change";
import { QuestionEditError } from "@/lib/crm/site-visits/question-editing";

import { refuseUnlessRoute } from "./gate";
import { VaneActionError, type VaneActionKind } from "./types";

type Change = { setId: string; form: string; change: FormChange; headline: string; reason: string; read: string; basis?: string };

/**
 * A change to a site-visit form, from its answers (PageVaneForm). In Build,
 * Keep puts it in the person's draft of the form and Publish sends it to
 * reps; approved anywhere else, it is kept through the form's own save, as
 * that person. Either way Vane changes no form by itself.
 */
const formChange = {
  kind: "build.form.change",
  module: "build",
  description:
    "Propose one change to a site-visit form (CrmQuestionSet), from what its answers show: make a question required that reps skip and whose quotes do worse " +
    "without it; add a choice reps keep writing in a note; change a quote line's waste factor to what invoiced jobs used. One action per change. headline names it " +
    '("Make Subfloor required"), reason gives the figures in a sentence, read names what you read ("Site visit answers"), basis what they came from ("From 86 visits since July").',
  params: z.object({
    setId: z.string().min(1),
    form: z.string().min(1).describe("The form's name."),
    change: formChangeSchema,
    headline: z.string().trim().min(1).max(80),
    reason: z.string().trim().min(1).max(300),
    read: z.string().trim().min(1).max(120),
    basis: z.string().trim().max(120).optional(),
  }),
  fields: [],
  verb: () => "Keep",
  title: (p) => `${p.headline} on ${p.form}`,
  target: (p) => `/build/forms/${encodeURIComponent(p.setId)}`,
  refuse: (context) => refuseUnlessRoute(context, "/api/v2/crm/question-sets/x", "PATCH"),
  async run(context, p) {
    try {
      const kept = await keepFormChange(context.session, p.setId, p.change);
      return kept.already ? `${p.headline}: kept on ${kept.form}.` : `${p.headline}: kept and saved on ${kept.form}.`;
    } catch (error) {
      if (error instanceof FormChangeRefused || error instanceof QuestionEditError) throw new VaneActionError(error.message);
      throw error;
    }
  },
} satisfies VaneActionKind<Change>;

export const BUILD_ACTIONS = [formChange] as const;
