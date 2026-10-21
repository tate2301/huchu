/**
 * Development only: Corelith's own workspace, set to where a Teams workflow starts.
 *
 *   pnpm exec tsx scripts/seed-teams-members.ts --stage w2   5 of 5 seats, Tatenda asks for a sixth (W2)
 *   pnpm exec tsx scripts/seed-teams-members.ts --stage w4   6 of 6 seats, Tariro in (W4, the default)
 *   pnpm exec tsx scripts/seed-teams-members.ts --stage w7   Tatenda owns it, Munashe suspended (W7)
 *
 * Run seed-staging-tenant.ts (--slug corelith) and seed-teams-corelith.ts first: this only sets the members,
 * seats, invites and ownership back to where the workflow starts, and leaves the deals alone.
 * Everyone signs in with Corelith2026! on corelith.apps.pagka.local:3000.
 * People, roles and times come from design/teams/world.json. Running it again puts the workspace back.
 */
import "dotenv/config";


import { prisma } from "@/lib/prisma";
import { recordTeamsChange } from "@/lib/teams/audit";
import { suspendMember } from "@/lib/teams/members";
import { acceptOwnership, offerOwnership } from "@/lib/teams/ownership";
import { notifySeatRequest } from "@/lib/teams/notify";

const SLUG = "corelith";

type Stage = "w2" | "w4" | "w7";

function stageArg(): Stage {
  const index = process.argv.indexOf("--stage");
  const value = index >= 0 ? process.argv[index + 1] : "w4";
  if (value !== "w2" && value !== "w4" && value !== "w7") throw new Error("--stage is w2, w4 or w7.");
  return value;
}

/** Monday 19 October 2026, Harare (UTC+2): "11:41" is 09:41 UTC. */
const at = (hhmm: string, day = "2026-10-19") => new Date(`${day}T${hhmm}:00+02:00`);

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("seed-teams-members is for development databases only.");
  const stage = stageArg();
  const company = await prisma.company.findUnique({ where: { slug: SLUG } });
  if (!company) throw new Error("Create the workspace first (see the top of this file).");
  const people = await prisma.user.findMany({ where: { companyId: company.id }, select: { id: true, email: true, name: true } });
  const by = (email: string) => {
    const found = people.find((user) => user.email === email);
    if (!found) throw new Error(`${email} is missing. Run scripts/seed-teams-corelith.ts first.`);
    return found;
  };
  const [sean, tatenda, gerald, munashe, simbarashe, tariro] = ["sean", "tatenda", "gerald", "munashe", "simbarashe", "tariro"].map((n) => by(`${n}@corelith.co.zw`));
  const membership = async (userId: string) => (await prisma.workspaceMembership.findFirstOrThrow({ where: { companyId: company.id, userId } })).id;

  // Anyone who joined through an invite since the last run goes: the six are the workspace.
  const six = new Set(["sean", "tatenda", "gerald", "munashe", "simbarashe", "tariro"].map((n) => `${n}@corelith.co.zw`));
  for (const user of people.filter((u) => !u.email || !six.has(u.email))) {
    await prisma.user.delete({ where: { id: user.id } }).catch(() => console.warn(`Left ${user.name}: they own records.`));
  }

  // Put the member records back. Records, deals and the team on each are left as they are.
  await prisma.ownershipOffer.deleteMany({ where: { companyId: company.id } });
  await prisma.workspaceInvite.deleteMany({ where: { companyId: company.id } });
  await prisma.inviteLink.deleteMany({ where: { companyId: company.id } });
  await prisma.platformAuditEvent.deleteMany({
    where: { companyId: company.id, OR: [{ eventType: "auth.login.success" }, { eventType: { startsWith: "teams.member." } }, { eventType: { startsWith: "teams.permission" } }, { eventType: { startsWith: "teams.seats" } }, { eventType: { startsWith: "teams.invite" } }, { eventType: { startsWith: "teams.ownership" } }] },
  });
  await prisma.notificationRecipient.deleteMany({ where: { notification: { companyId: company.id, type: { in: ["TEAMS_SEAT_REQUEST", "TEAMS_OWNERSHIP_OFFER"] } } } });
  await prisma.notification.deleteMany({ where: { companyId: company.id, type: { in: ["TEAMS_SEAT_REQUEST", "TEAMS_OWNERSHIP_OFFER"] } } });
  await prisma.userPermissionOverride.deleteMany({ where: { companyId: company.id } });

  await prisma.company.update({ where: { id: company.id }, data: { name: "Corelith", product: "PABASA", seatLimit: stage === "w2" ? 5 : 6 } });
  const roles: Array<[string, "SUPERADMIN" | "MANAGER" | "SALES_REP", boolean, boolean]> = [
    [sean.id, "SUPERADMIN", true, false],
    [tatenda.id, "SUPERADMIN", false, true],
    [gerald.id, "SUPERADMIN", false, true],
    [munashe.id, "MANAGER", false, false],
    [simbarashe.id, "SALES_REP", false, false],
    [tariro.id, "SALES_REP", false, false],
  ];
  for (const [userId, role, isOwner, isAdmin] of roles) {
    const gone = userId === tariro.id && stage === "w2";
    await prisma.user.update({ where: { id: userId }, data: { role, isActive: !gone, accessRemovedAt: gone ? new Date() : null } });
    await prisma.workspaceMembership.updateMany({
      where: { companyId: company.id, userId },
      data: { role, isOwner, isAdmin, status: gone ? "REMOVED" : "ACTIVE", suspendedAt: null, removedAt: gone ? new Date() : null, createdAt: userId === tariro.id ? at("12:06") : undefined },
    });
  }

  // Who changed what, as the boards read it.
  const seed = async (actor: string, entityId: string, when: Date, after: Record<string, unknown>) => {
    await recordTeamsChange(prisma, { companyId: company.id, actorId: actor, change: "member.added", entityType: "membership", entityId, after });
    await prisma.platformAuditEvent.updateMany({ where: { companyId: company.id, entityId, eventType: "teams.member.added" }, data: { createdAt: when } });
  };
  await seed(sean.id, await membership(simbarashe.id), new Date("2026-09-07T08:00:00+02:00"), { role: "SALES_REP", reason: "invite" });
  await seed(sean.id, await membership(munashe.id), new Date("2026-09-07T08:05:00+02:00"), { role: "MANAGER", reason: "invite" });
  await seed(sean.id, await membership(tatenda.id), new Date("2026-09-07T08:10:00+02:00"), { role: "SUPERADMIN", reason: "invite" });

  // Sign-ins, so "Last here" has something to say.
  const signIn = (email: string, when: Date) =>
    prisma.platformAuditEvent.create({
      data: { companyId: company.id, actor: email, eventType: "auth.login.success", entityType: "auth", eventHash: `seed-${email}-${when.getTime()}`, createdAt: when },
    });
  await signIn("gerald@corelith.co.zw", at("10:49"));
  await signIn("munashe@corelith.co.zw", at("08:40"));
  await signIn("sean@corelith.co.zw", at("09:12"));
  await signIn("simbarashe@corelith.co.zw", at("08:12"));

  if (stage === "w2") {
    // Tatenda has typed Tariro in and asked: Sean's Needs you holds the request.
    const ref = crypto.randomUUID();
    await recordTeamsChange(prisma, {
      companyId: company.id,
      actorId: tatenda.id,
      change: "seats.requested",
      entityType: "seats",
      entityId: company.id,
      after: { name: "Tariro Mhlanga", role: "SALES_REP", phone: "+263775402186", used: 5, limit: 5, ref },
    });
    await notifySeatRequest(prisma, {
      companyId: company.id,
      ownerUserId: sean.id,
      requestedById: tatenda.id,
      requestedBy: "Tatenda Chinyamakobvu",
      name: "Tariro Mhlanga",
      role: "field worker",
      ref,
    });
  }

  if (stage === "w7") {
    const actor = { companyId: company.id, userId: tatenda.id };
    await suspendMember(actor, await membership(munashe.id), at("15:12"));
    const offer = await offerOwnership({ companyId: company.id, userId: sean.id }, await membership(tatenda.id), at("15:40"));
    await acceptOwnership(actor, offer.id, at("15:52"));
  }

  console.log(`Corelith at ${stage}: sign in as sean@, tatenda@, gerald@, munashe@ or simbarashe@corelith.co.zw with Corelith2026!.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
