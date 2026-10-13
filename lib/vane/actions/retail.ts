import { z } from "zod";

import { signOffShift, SignOffRefused } from "@/lib/retail/floor/sign-off";

import { refuseUnlessRoute } from "./gate";
import { VaneActionError, type VaneActionKind } from "./types";

const lookInto = {
  kind: "retail.shift.look_into",
  module: "retail",
  description:
    "Sign off a till shift whose cash-up did not balance as Look into it, with a note saying what to check. The shift's own sign-off: it needs a person who may approve cash control, and nobody signs off their own drawer.",
  params: z.object({
    shiftId: z.string().min(1),
    shiftNo: z.string().min(1).describe('As the shift shows it: "SH-0412".'),
    note: z.string().trim().min(1).max(500),
  }),
  fields: [{ name: "note", label: "What to look into", type: "text", multiline: true }],
  verb: () => "Look into it",
  title: (p) => `Sign off ${p.shiftNo} as Look into it: ${p.note}`,
  target: () => "/retail/shifts?state=needs-sign-off",
  refuse: (context) => refuseUnlessRoute(context, "/api/v2/retail/shifts"),
  async run(context, p) {
    try {
      const done = await signOffShift(
        { user: { id: context.userId, companyId: context.companyId, role: context.role, name: context.session.user.name } },
        p.shiftId,
        { outcome: "LOOK_INTO", note: p.note },
      );
      return `${done.shiftNo} is signed off to be looked into${done.amount ? `, ${done.amount}` : ""}.`;
    } catch (error) {
      if (error instanceof SignOffRefused) throw new VaneActionError(error.message);
      throw error;
    }
  },
} satisfies VaneActionKind<{ shiftId: string; shiftNo: string; note: string }>;

export const RETAIL_ACTIONS = [lookInto] as const;
