import { prisma } from "@/lib/prisma";
import { canRetailRoleDo, RETAIL_ACTIONS, RETAIL_RESOURCES, type RetailAction, type RetailResource } from "@/lib/retail/permission-matrix";
import { peopleActor } from "@/lib/retail/people/actor";
import { invitePerson } from "@/lib/retail/people/invite";
import { PeopleRefusal } from "@/lib/retail/people/refusal";
import {
  PEOPLE_USER_ROLES,
  PERSON_ROLE_LABELS,
  PERSON_ROLES,
  personRoleOf,
  pinByDefault,
  type PersonRole,
} from "@/lib/retail/people/roles";

import { LookupFieldErrors, type LookupNoun } from "./types";

/**
 * People's noun (80-admin 4.1): `person`, for "Cashier", "Counted by",
 * "Owner approvals go to" and the manager pickers. Active people (an invite
 * waiting included), never someone whose access was removed. `context`
 * narrows it: `{ roles: ["OWNER"] }`, `{ can: "retail.adjustments:approve" }`,
 * `{ sells: true, siteId }` (who may open a shift at that site). The inline add
 * invites them (`invitePerson`) with the context's role, Cashier when none.
 */

const NAME = "Name";
const PHONE = "Phone or WhatsApp";

function grantOf(value: unknown): [RetailResource, RetailAction] | null {
  if (typeof value !== "string") return null;
  const [resource, action] = value.split(":");
  return (RETAIL_RESOURCES as readonly string[]).includes(resource ?? "") &&
    (RETAIL_ACTIONS as readonly string[]).includes(action ?? "")
    ? [resource as RetailResource, action as RetailAction]
    : null;
}

function rolesOf(value: unknown): PersonRole[] | null {
  if (!Array.isArray(value)) return null;
  const roles = value.filter((role): role is PersonRole => (PERSON_ROLES as readonly string[]).includes(String(role)));
  return roles.length ? roles : null;
}

const person: LookupNoun = {
  noun: "person",
  read: [
    ["retail.people", "view"],
    // "Cashier" on Open a shift.
    ["retail.cash-control", "open-shift"],
    // "Taken by" on Move stock; "Counted by"; who approves an adjustment.
    ["retail.transfers", "create"],
    ["retail.counts", "create"],
    ["retail.adjustments", "create"],
    ["retail.sell", "view"],
  ],
  create: ["retail.people", "create"],
  quick: [
    { key: NAME, label: NAME, placeholder: "" },
    { key: PHONE, label: PHONE, placeholder: "+263 7" },
  ],
  async search(ctx, q, context) {
    const roles = rolesOf(context.roles);
    const grant = grantOf(context.can);
    const sells = context.sells === true;
    const siteId = typeof context.siteId === "string" ? context.siteId : null;
    const users = await prisma.user.findMany({
      where: {
        companyId: ctx.companyId,
        isActive: true,
        role: { in: PEOPLE_USER_ROLES },
        ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
        ...(siteId ? { OR: [{ allSites: true }, { siteAccess: { some: { siteId } } }] } : {}),
      },
      orderBy: [{ name: "asc" }],
      take: 200,
      select: { id: true, name: true, role: true },
    });
    return users
      .filter((user) => {
        const role = personRoleOf(user.role);
        if (!role) return false;
        if (roles && !roles.includes(role)) return false;
        if (grant && !canRetailRoleDo(user.role, grant[0], grant[1])) return false;
        if (sells && !canRetailRoleDo(user.role, "retail.sell", "open-shift")) return false;
        return true;
      })
      .map((user) => ({ id: user.id, label: user.name, sub: PERSON_ROLE_LABELS[personRoleOf(user.role)!] }));
  },
  async add(ctx, fields, context) {
    const role = rolesOf([context.role])?.[0] ?? "CASHIER";
    const siteId = typeof context.siteId === "string" ? context.siteId : null;
    const actor = peopleActor(
      { user: { id: ctx.userId, companyId: ctx.companyId, name: ctx.userName, role: ctx.session.user.role ?? null, supportSessionId: ctx.session.user.supportSessionId ?? null } },
      ctx.requestUrl ?? "",
    );
    try {
      const result = await invitePerson(actor, {
        name: fields[NAME] ?? "",
        phone: fields[PHONE] ?? "",
        email: null,
        role,
        sites: siteId ? [siteId] : "ALL",
        givePin: pinByDefault(role),
        pin: null,
      });
      const { data, sent } = result;
      return {
        id: data.id,
        label: data.name,
        sub: data.roleLabel,
        ...(sent.whatsapp
          ? {}
          : { notice: `${data.name} is added. ${sent.error ?? "WhatsApp did not take it"}, so give them their link from People.` }),
      };
    } catch (error) {
      if (error instanceof PeopleRefusal && error.fieldErrors) {
        const { name, phone, ...rest } = error.fieldErrors;
        const fieldErrors: Record<string, string> = {};
        if (name) fieldErrors[NAME] = name;
        if (phone) fieldErrors[PHONE] = phone;
        const other = Object.values(rest)[0];
        if (other && !fieldErrors[NAME]) fieldErrors[NAME] = other;
        throw new LookupFieldErrors(fieldErrors);
      }
      if (error instanceof PeopleRefusal) throw new LookupFieldErrors({ [NAME]: error.message });
      throw error;
    }
  },
};

export const PEOPLE_LOOKUPS: LookupNoun[] = [person];
