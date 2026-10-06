import { prisma } from "@/lib/prisma";
import { clearUserFeatureOverrides } from "@/lib/platform/user-entitlements";
import { RETAIL_AUDIT_EVENTS, writeRetailAuditEvent } from "@/lib/retail/audit";
import type { Sent } from "@/lib/retail/messages/send-now";

import { viewerOf, type PeopleActor } from "./actor";
import { sendPin } from "./deliver";
import { checkPhone, cleanName, EMAIL_NEEDED_ON_FILE, NAME_NEEDED, type ChangeInput } from "./fields";
import type { HandOver } from "./invite";
import { issueTillPin } from "./pins";
import { fieldRefusal, PeopleRefusal, PERSON_NOT_FOUND } from "./refusal";
import { mayChangeRole, needsEmail, PERSON_ROLE_LABELS, rolesCallerMayGive, userRoleOf } from "./roles";
import { checkSites, siteScopeOf, writeSites, type SiteScope } from "./scope";
import { loadPerson, type PersonView } from "./view";
import { phoneDisplay } from "./words";

/**
 * Changing a person (80-admin W-57, PersonEdit "Save"): name, phone, role,
 * sites, and a new till PIN. A role change takes effect on their next request
 * (`enrichTokenClaims` reads the role every time).
 */

export const ROLE_REFUSAL_CHANGE = "Managers change cashiers and stock clerks only.";
export const OWN_ROLE = "Ask another owner to change your role.";
export const onlyOwner = (name: string) => `${name} is the only owner. Make someone else an owner first.`;
export const noAccessYet = (name: string) => `${name} has no access. Give access back first.`;

export type Change = { field: string; label: string; from: string; to: string };
export type ChangeResult = { data: PersonView; changed: Change[]; sent?: Sent; handOver?: HandOver };

/** Whether this person is the shop's last active owner. */
export async function isLastOwner(companyId: string, userId: string): Promise<boolean> {
  const owners = await prisma.user.findMany({
    where: { companyId, role: "SUPERADMIN", isActive: true },
    select: { id: true },
    take: 2,
  });
  return owners.length === 1 && owners[0]!.id === userId;
}

function scopeLabel(scope: SiteScope, names: Map<string, string>): string {
  return scope.all ? "All sites" : scope.ids.map((id) => names.get(id) ?? "").sort().join(", ");
}

export async function changePerson(actor: PeopleActor, id: string, input: ChangeInput, now = new Date()): Promise<ChangeResult> {
  const person = await loadPerson(actor.companyId, viewerOf(actor), id, { now });
  if (!person) throw new PeopleRefusal(PERSON_NOT_FOUND, 404);
  if (person.state === "NO_ACCESS") throw new PeopleRefusal(noAccessYet(person.name), 409);
  if (!mayChangeRole(actor.roleKey, person.role)) throw new PeopleRefusal(ROLE_REFUSAL_CHANGE, 403);

  const role = input.role ?? person.role;
  if (role !== person.role) {
    if (id === actor.userId) throw new PeopleRefusal(OWN_ROLE, 409);
    if (!rolesCallerMayGive(actor.roleKey).includes(role)) throw new PeopleRefusal(ROLE_REFUSAL_CHANGE, 403);
    if (person.role === "OWNER" && (await isLastOwner(actor.companyId, id))) {
      throw new PeopleRefusal(onlyOwner(person.name), 409);
    }
  }

  const fieldErrors: Record<string, string> = {};
  const name = input.name === undefined ? person.name : cleanName(input.name);
  if (!name) fieldErrors.name = NAME_NEEDED;
  let phone = person.phone;
  if (input.phone !== undefined || !person.phone) {
    const checked = await checkPhone(actor.companyId, input.phone ?? "", id);
    if ("error" in checked) fieldErrors.phone = checked.error;
    else phone = checked.phone;
  }
  if (role !== person.role && needsEmail(role) && !person.email) fieldErrors.role = EMAIL_NEEDED_ON_FILE;
  if (Object.keys(fieldErrors).length > 0) throw fieldRefusal(fieldErrors);

  const current: SiteScope = person.sites.all ? { all: true } : { all: false, ids: person.sites.ids };
  const wantsSites = input.sites ?? (current.all ? "ALL" : current.ids);
  const scope =
    input.sites === undefined && role === person.role
      ? current
      : await checkSites({
          companyId: actor.companyId,
          sites: wantsSites,
          role,
          caller: await siteScopeOf(actor.companyId, actor.userId),
        });

  const siteRows = await prisma.site.findMany({ where: { companyId: actor.companyId }, select: { id: true, name: true } });
  const siteNames = new Map(siteRows.map((site) => [site.id, site.name]));
  const changes: Change[] = [];
  if (name !== person.name) changes.push({ field: "name", label: "Name", from: person.name, to: name! });
  if (phone !== person.phone) {
    changes.push({ field: "phone", label: "Phone", from: phoneDisplay(person.phone), to: phoneDisplay(phone) });
  }
  if (role !== person.role) {
    changes.push({ field: "role", label: "Role", from: PERSON_ROLE_LABELS[person.role], to: PERSON_ROLE_LABELS[role] });
  }
  const fromSites = scopeLabel(current, siteNames);
  const toSites = scopeLabel(scope, siteNames);
  if (fromSites !== toSites) changes.push({ field: "sites", label: "Sites", from: fromSites, to: toSites });

  const pin = await prisma.$transaction(async (tx) => {
    if (changes.length > 0) {
      await tx.user.update({
        where: { id },
        data: { name: name!, phone, role: userRoleOf(role), allSites: scope.all },
      });
      if (changes.some((change) => change.field === "sites")) {
        await writeSites(tx, { companyId: actor.companyId, userId: id, scope });
      }
      await writeRetailAuditEvent(tx, {
        actor,
        eventType: RETAIL_AUDIT_EVENTS.personChanged,
        entityType: "User",
        entityId: id,
        payload: { changes },
      });
    }
    if (!input.sendNewPin) return null;
    const issued = await issueTillPin(tx, { companyId: actor.companyId, userId: id, issuedById: actor.userId, now });
    await writeRetailAuditEvent(tx, {
      actor,
      eventType: RETAIL_AUDIT_EVENTS.personPinSent,
      entityType: "User",
      entityId: id,
      payload: { wasLocked: person.pin.state === "LOCKED" },
    });
    return issued;
  });
  if (role !== person.role) await clearUserFeatureOverrides(id);

  const delivery = pin ? await sendPin({ companyId: actor.companyId, phone, pin, createdById: actor.userId }) : {};
  const data = await loadPerson(actor.companyId, viewerOf(actor), id, { now });
  return {
    data: data!,
    changed: changes,
    ...delivery,
  };
}
