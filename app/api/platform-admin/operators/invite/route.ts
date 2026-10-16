import { z } from "zod";

import { AdminRefusal } from "@/lib/admin/refusal";
import { sendOperatorInviteMail } from "@/lib/operators/invite-mail";
import { inviteOperator } from "@/lib/operators/manage";

import { ownerAnswer } from "../_answer";
import { inviteLink } from "../_find";

const body = z.object({
  name: z.string().max(120),
  email: z.string().max(200),
  role: z.enum(["OWNER", "SUPPORT", "BILLING"]),
});

/** Operators › Invite: emailed, and the link answered once so the owner can send it another way. */
export async function POST(request: Request) {
  return ownerAnswer(async (owner) => {
    const parsed = body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new AdminRefusal("Enter their name, work email and role.");
    const { operator, token } = await inviteOperator(owner, parsed.data);
    const link = await inviteLink(token);
    await sendOperatorInviteMail({ to: operator.email, name: operator.name, invitedBy: owner.name, link, again: false });
    return { message: `${operator.name} is invited.`, name: operator.name, link };
  });
}
