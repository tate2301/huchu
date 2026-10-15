import { z } from "zod";

import { routeGate } from "@/lib/operations/gate";
import { OperationRefused, type Operation } from "@/lib/operations/types";

import { changeUserPermission, mayManagePermissions, PermissionChangeRefused } from "./change-permission";
import { PERMISSION_STATES, type PermissionKind, type PermissionState } from "./permission-catalog";

const STATE_WORDS: Record<PermissionState, string> = { ALLOW: "Allow", DENY: "Deny", DEFAULT: "Their role's default" };

type Params = { userId: string; person: string; kind: PermissionKind; key: string; permission: string; state: PermissionState };

const setPermission = {
  key: "people.permission.set",
  name: "Change what a person may do",
  risk: "access",
  product: "people",
  description:
    "Change one thing a person may do: a part of Corelith (kind FEATURE, its feature key, such as \"crm.quotes\") or a CRM capability (kind CAPABILITY: records.read, records.edit.own, records.edit.any, records.delete, records.merge, records.import, records.export, pipelines.manage, fields.manage, views.share, tasks.assign.others, documents.issue, documents.approve, commissions.manage, money.approve, money.disburse, settings.manage). ALLOW or DENY it, or put it back to their role's default. Only a manager or admin may; nobody changes their own; only an admin changes an admin's. Say why in the title the person reads.",
  input: z.object({
    userId: z.string().uuid(),
    person: z.string().min(1).max(120).describe("Their name, as the team list shows it."),
    kind: z.enum(["FEATURE", "CAPABILITY"]),
    key: z.string().trim().min(1).max(200),
    permission: z.string().min(1).max(120).describe('The permission in words: "Issue quotes and invoices".'),
    state: z.enum(PERMISSION_STATES),
  }),
  fields: [
    {
      name: "state",
      label: "Set it to",
      type: "select",
      options: PERMISSION_STATES.map((value) => ({ value, label: STATE_WORDS[value] })),
    },
  ],
  verb: (p) => (p.state === "ALLOW" ? `Allow ${p.person.split(/\s+/)[0]}` : p.state === "DENY" ? `Stop ${p.person.split(/\s+/)[0]}` : "Put it back"),
  title: (p) =>
    p.state === "DEFAULT"
      ? `Put ${p.person}'s "${p.permission}" back to their role's default`
      : `${p.state === "ALLOW" ? "Allow" : "Stop"} ${p.person}: ${p.permission}`,
  target: (p) => `/preferences/organization/users/${p.userId}`,
  authorize: (actor, p) => {
    const route = routeGate(actor, "/api/users/permissions");
    if (route) return route;
    if (!mayManagePermissions(actor.role)) return "Only an admin or manager can change what people may do.";
    if (p.userId === actor.userId) return "You cannot change your own permissions.";
    return null;
  },
  async run(actor, p) {
    try {
      const changed = await changeUserPermission({ companyId: actor.companyId, userId: actor.userId, role: actor.role }, p);
      return { said: `${changed.user.name ?? p.person}: "${p.permission}" is now ${STATE_WORDS[p.state].toLowerCase()}.`, record: { id: changed.user.id, href: `/preferences/organization/users/${changed.user.id}` } };
    } catch (error) {
      if (error instanceof PermissionChangeRefused) throw new OperationRefused(error.message);
      throw error;
    }
  },
} satisfies Operation<Params>;

/** What a person may do in the workspace, published as operations. */
export const PEOPLE_OPERATIONS = [setPermission] as const;
