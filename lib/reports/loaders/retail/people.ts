import { prisma } from "@/lib/prisma";
import { result } from "@/lib/reports/loaders/shared";
import type { ListOption, ReportContext, ReportLoader, ReportOption, ReportRow } from "@/lib/reports/types";
import { PERSON_ROLES } from "@/lib/retail/people/roles";
import { loadPeople } from "@/lib/retail/people/view";
import { STATE_TONES } from "@/lib/retail/people/words";

/**
 * Staff and PINs (80-admin 5.1, `retail-people`): every person through the
 * same reader as `GET /api/v2/retail/people`, as the viewer sees them ("Now"
 * is the viewer). A person's site keys are every open site when they work at
 * all of them, so the Site filter matches them at each.
 */
async function loadPeopleRows(ctx: ReportContext) {
  const [people, sites] = await Promise.all([
    loadPeople(ctx.companyId, { userId: ctx.userId, roleKey: ctx.role }),
    prisma.site.findMany({ where: { companyId: ctx.companyId, isActive: true }, select: { id: true } }),
  ]);
  const everySite = sites.map((site) => site.id).join(",");
  return result(
    people.map(
      (person): ReportRow => ({
        id: person.id,
        name: person.name,
        email: person.email ?? "",
        role: person.roleLabel,
        roleKey: person.role,
        roleOrder: PERSON_ROLES.indexOf(person.role),
        sites: person.sitesLabel,
        siteKeys: person.sites.all ? everySite : person.sites.ids.join(","),
        phone: person.phoneDisplay,
        phoneDigits: (person.phone ?? "").replace(/\D/g, ""),
        pin: person.pin.column,
        pinKey: person.pin.state,
        lastIn: person.lastIn,
        lastSeenAt: person.lastSeenAt,
        state: person.stateLabel,
        stateKey: person.state,
        stateTone: STATE_TONES[person.state],
        canEdit: person.can.edit ? "yes" : "",
        canRemove: person.can.removeAccess ? "yes" : "",
        canInviteAgain: person.can.inviteAgain ? "yes" : "",
        // For the Remove access ask: "SH-00244 on Back till".
        openShift: person.openShifts.map((shift) => `${shift.shiftNo} on ${shift.registerName}`).join(", "),
      }),
    ),
  );
}

async function peopleOptions(ctx: ReportContext): Promise<Record<string, ReportOption[]>> {
  const sites = await prisma.site.findMany({
    where: { companyId: ctx.companyId, isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  const site: ListOption[] = sites.map((row) => ({
    value: row.id,
    label: row.name,
    where: [{ column: "siteKeys", op: "contains", value: row.id }],
  }));
  return { site };
}

export const PEOPLE_LOADERS: Record<string, ReportLoader> = {
  "retail-people": { load: loadPeopleRows, options: peopleOptions },
};
