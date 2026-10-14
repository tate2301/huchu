import { z } from "zod";

import { NoticeError, sendSchoolNotice } from "@/lib/schools/notices";
import { schoolPermissionDenial } from "@/lib/schools/permissions";

import { refuseUnlessRoute } from "./gate";
import { VaneActionError, type VaneActionKind } from "./types";

type Family = { studentId: string; family: string; pupil: string; amount: string };
type Params = { term: string; subject: string; body: string; families: Family[]; leftOut?: Array<{ family: string; why: string }> };

/** The wording with one family's own name, pupil and amount in it. */
export function reminderFor(body: string, family: Family): string {
  return body.replaceAll("[family]", family.family).replaceAll("[pupil]", family.pupil).replaceAll("[amount]", family.amount);
}

const remind = {
  kind: "schools.fees.remind",
  module: "schools",
  description:
    "Send this term's fee reminder to the families who owe (the PageVaneSchool board): one notice per family, each with its own name, pupil and amount, written once with [family], [pupil] and [amount] in it. " +
    "Leave out a family that has agreed a payment plan or paid since, and say why in leftOut. The person may change the words before it goes; it changes them for every family.",
  params: z.object({
    term: z.string().min(1).max(60).describe('"Third term".'),
    subject: z.string().trim().min(1).max(120),
    body: z.string().trim().min(1).max(1500),
    families: z
      .array(
        z.object({
          studentId: z.string().min(1),
          family: z.string().min(1).max(80).describe('"The Moyo family".'),
          pupil: z.string().min(1).max(80).describe('"Rumbidzai, Form 3B".'),
          amount: z.string().min(1).max(40).describe('"USD 1,420.00".'),
        }),
      )
      .min(1)
      .max(500),
    leftOut: z.array(z.object({ family: z.string().min(1).max(80), why: z.string().min(1).max(120) })).max(500).optional(),
  }),
  fields: [
    { name: "subject", label: "Subject", type: "text" },
    { name: "body", label: "The reminder ([family], [pupil] and [amount] are each family's own)", type: "text", multiline: true },
  ],
  verb: (p) => `Send ${p.families.length} ${p.families.length === 1 ? "reminder" : "reminders"}`,
  title: (p) =>
    `Remind ${p.families.length} ${p.families.length === 1 ? "family" : "families"} of ${p.term} fees${p.leftOut?.length ? `; ${p.leftOut.length} left out (${p.leftOut[0]!.why})` : ""}`,
  target: () => "/schools/fees",
  refuse: (context) => refuseUnlessRoute(context, "/api/v2/schools/notices") ?? schoolPermissionDenial(context.session, "schools.reports", "notify-families"),
  async run(context, p) {
    let sent = 0;
    let unreached = 0;
    const failed: string[] = [];
    for (const family of p.families) {
      try {
        const notice = await sendSchoolNotice({
          companyId: context.companyId,
          senderUserId: context.userId,
          title: p.subject,
          body: reminderFor(p.body, family),
          audience: "PARENTS",
          studentIds: [family.studentId],
          severity: "WARNING",
        });
        sent += 1;
        unreached += notice.withoutAccount;
      } catch (error) {
        if (!(error instanceof NoticeError)) throw error;
        failed.push(family.family);
      }
    }
    if (sent === 0) throw new VaneActionError(`No reminder went: ${failed.length ? `${failed.slice(0, 3).join(", ")}${failed.length > 3 ? " and others" : ""} have nobody on the portal` : "nobody to write to"}.`);
    return [
      `Sent ${sent} ${sent === 1 ? "reminder" : "reminders"}.`,
      failed.length ? `${failed.length} could not be: nobody in the family is on the portal.` : null,
      unreached ? `${unreached} ${unreached === 1 ? "guardian has" : "guardians have"} no portal account yet.` : null,
    ]
      .filter(Boolean)
      .join(" ");
  },
} satisfies VaneActionKind<Params>;

export const SCHOOLS_ACTIONS = [remind] as const;
