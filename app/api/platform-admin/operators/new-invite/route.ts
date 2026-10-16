import { z } from "zod";

import { AdminRefusal } from "@/lib/admin/refusal";
import { sendOperatorInviteMail } from "@/lib/operators/invite-mail";
import { sendNewInvite } from "@/lib/operators/manage";

import { ownerAnswer } from "../_answer";
import { inviteLink } from "../_find";

const body = z.object({ id: z.string().min(1).max(64) });

/** Operators › Send a new invite: their password stops working, they are signed out, and a new link goes out. */
export async function POST(request: Request) {
  return ownerAnswer(async (owner) => {
    const parsed = body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new AdminRefusal("That request could not be read.");
    const { operator, token } = await sendNewInvite(owner, parsed.data.id);
    const link = await inviteLink(token);
    await sendOperatorInviteMail({ to: operator.email, name: operator.name, invitedBy: owner.name, link, again: true });
    return { message: `${operator.name} is signed out and sent a new invite.`, name: operator.name, link };
  });
}
