import { z } from "zod";

import { sendFeeReminders } from "@/lib/schools/fee-reminders";
import { schoolPermissionDenial } from "@/lib/schools/permissions";

import { listOf, refuseUnlessRoute } from "./gate";
import { VaneActionError, type VaneActionKind } from "./types";

type Remind = { termId: string; term: string; studentIds: string[]; message: string; leaveOut: string[]; leaveOutWhy?: string };

/**
 * Fee reminders (PageVaneSchool): Vane drafts one reminder for the families
 * who have paid nothing this term; a person changes the words and who it goes
 * to on Remind families (`/schools/fees/remind`), then sends it. Each family
 * gets its own, through the school's notices, as that person.
 */
const remind = {
  kind: "schools.fees.remind",
  module: "schools",
  description:
    "Remind the families who have paid nothing on this term's fees: one reminder in the school's words, with [family], [pupil] and [amount] where each family sees its own " +
    "(\"Dear [family], … for [pupil]: [amount]. You can pay at the bursary …\"). List every such pupil; put in leaveOut the ones the school should not remind now " +
    "(a payment plan, a bursary case) and say why in leaveOutWhy. A person checks the words and the list, then sends.",
  params: z.object({
    termId: z.string().min(1),
    term: z.string().min(1).describe('As the school names it: "Term 3".'),
    studentIds: z.array(z.string().min(1)).min(1).max(1000),
    message: z.string().trim().min(1).max(2000),
    leaveOut: z.array(z.string().min(1)).max(1000).default([]),
    leaveOutWhy: z.string().max(120).optional().describe('Why the families left out are: "they have a payment plan".'),
  }),
  fields: [
    { name: "message", label: "The reminder", type: "text", multiline: true },
    { name: "leaveOut", label: "Left out", type: "pick" },
  ],
  verb: (p) => {
    const count = p.studentIds.filter((id) => !p.leaveOut.includes(id)).length;
    return count === 1 ? "Send 1 reminder" : `Send ${count} reminders`;
  },
  title: (p) => {
    const count = p.studentIds.filter((id) => !p.leaveOut.includes(id)).length;
    return `Remind ${count === 1 ? "1 family" : `${count} families`} about ${p.term}'s fees`;
  },
  target: () => "/schools/fees/remind",
  refuse: (context) =>
    refuseUnlessRoute(context, "/api/v2/schools/notices") ??
    (schoolPermissionDenial(context.session, "schools.reports", "notify-families") ? "Your role cannot write to families, so Vane cannot do it for you." : null),
  async run(context, p) {
    const going = p.studentIds.filter((id) => !p.leaveOut.includes(id));
    if (going.length === 0) throw new VaneActionError("Every family is unticked, so no reminder went.");
    const outcome = await sendFeeReminders({ companyId: context.companyId, userId: context.userId }, { termId: p.termId, term: p.term, studentIds: going, message: p.message });
    if (outcome.sent.length === 0) {
      throw new VaneActionError(`No reminder went: ${outcome.skipped.map((row) => `${row.family} ${row.why}`).join("; ") || "nobody owes now"}.`);
    }
    const skipped = outcome.skipped.length
      ? ` Not sent: ${listOf(outcome.skipped.slice(0, 3).map((row) => `${row.family} (${row.why})`))}${outcome.skipped.length > 3 ? ` and ${outcome.skipped.length - 3} more` : ""}.`
      : "";
    return `Sent ${outcome.sent.length === 1 ? "1 reminder" : `${outcome.sent.length} reminders`} to the parents' portal.${skipped}`;
  },
} satisfies VaneActionKind<Remind>;

export const SCHOOLS_ACTIONS = [remind] as const;
