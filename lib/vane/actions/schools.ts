import { z } from "zod";

import { formatSchoolMoney } from "@/lib/schools/format";
import { NoticeError, sendSchoolNotice } from "@/lib/schools/notices";
import { schoolPermissionDenial } from "@/lib/schools/permissions";

import { refuseUnlessRoute } from "./gate";
import { VaneActionError, type VaneActionKind } from "./types";

export type ReminderFamily = { studentId: string; family: string; pupil: string; owed: number; why?: string };
export type ReminderParams = { term: string; currency: string; subject: string; body: string; families: ReminderFamily[]; skip: string[] };
type Family = ReminderFamily;
type Params = ReminderParams;

/** The wording with one family's own name, pupil and amount in it. */
export function reminderFor(body: string, family: Family, currency: string): string {
  return body
    .replaceAll("[family]", family.family)
    .replaceAll("[pupil]", family.pupil)
    .replaceAll("[amount]", formatSchoolMoney(family.owed, currency));
}

/** The families a reminder goes to: every one Vane drafted for, less the unticked. */
export const remindedFamilies = (p: Pick<Params, "families" | "skip">) => p.families.filter((family) => !p.skip.includes(family.studentId));

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

export const remindParams = z
  .object({
    term: z.string().min(1).max(60).describe('"Third term".'),
    currency: z.string().min(3).max(3).describe('"USD".'),
    subject: z.string().trim().min(1).max(120),
    body: z.string().trim().min(1).max(1500),
    families: z
      .array(
        z.object({
          studentId: z.string().min(1),
          family: z.string().min(1).max(80).describe('"The Moyo family".'),
          pupil: z.string().min(1).max(80).describe('"Rumbidzai, Form 3B".'),
          owed: z.number().positive(),
          why: z.string().min(1).max(120).optional().describe("Why it is unticked: \"payment plan agreed\"."),
        }),
      )
      .min(1)
      .max(500),
    skip: z.array(z.string()).max(500).describe("The studentIds of the families not to remind."),
  })
  .refine((p) => p.skip.every((id) => p.families.some((family) => family.studentId === id)), { message: "Only a family on the list can be left out.", path: ["skip"] })
  .refine((p) => remindedFamilies(p).length > 0, { message: "Tick at least one family.", path: ["skip"] });

const remind = {
  kind: "schools.fees.remind",
  module: "schools",
  description:
    "Send this term's fee reminder to the families who owe (the PageVaneSchool board): one notice per family, each with its own name, pupil and amount, written once with [family], [pupil] and [amount] in it. " +
    "List every family who owes. One that has agreed a payment plan or paid since stays listed with why, and its studentId goes in skip, so it is unticked. " +
    "The person ticks and unticks families and changes the words on the reminder's own page before it goes; the words change for every family.",
  params: remindParams,
  fields: [
    { name: "subject", label: "Subject", type: "text" },
    { name: "body", label: "The reminder ([family], [pupil] and [amount] are each family's own)", type: "text", multiline: true },
  ],
  pageFields: ["skip"],
  verb: (p) => `Send ${plural(remindedFamilies(p).length, "reminder", "reminders")}`,
  title: (p) => {
    const why = p.families.find((family) => p.skip.includes(family.studentId) && family.why)?.why;
    return `Remind ${plural(remindedFamilies(p).length, "family", "families")} of ${p.term} fees${p.skip.length ? `; ${p.skip.length} left out${why ? ` (${why})` : ""}` : ""}`;
  },
  target: (_p, id) => `/schools/finance/reminders/${id}`,
  refuse: (context) => refuseUnlessRoute(context, "/api/v2/schools/notices") ?? schoolPermissionDenial(context.session, "schools.reports", "notify-families"),
  async run(context, p) {
    let sent = 0;
    let unreached = 0;
    const failed: string[] = [];
    for (const family of remindedFamilies(p)) {
      try {
        const notice = await sendSchoolNotice({
          companyId: context.companyId,
          senderUserId: context.userId,
          title: p.subject,
          body: reminderFor(p.body, family, p.currency),
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
