import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/**
 * Where a department sits, and what hangs off it.
 *
 * `Departments.dc.html` draws four things the row itself does not carry: who
 * runs it, which cost centre it posts to, which site it belongs to, and the
 * sections underneath it. Three of those are nullable foreign keys added in
 * `20260922090000_department_placement_and_period_archive`; the fourth is the
 * `Section.departmentId` back-relation from the same migration.
 *
 * The shape lives here rather than in either route because the register reads
 * the **list** payload and then renders the selected row as the record — the
 * detail pane is a `rows.find(...)`, not a second fetch. If the list and the
 * record disagreed about what a department is, the record would lose its
 * placement the moment somebody navigated to it from the list.
 */

/**
 * The head is an `Employee`, not a `User`: a head of department is a person on
 * the payroll, and plenty of them never sign in. `jobTitle` comes along because
 * "Tendai Moyo" on its own does not tell an administrator they picked the right
 * Tendai.
 */
const headSelect = {
  id: true,
  employeeId: true,
  name: true,
  jobTitle: true,
} satisfies Prisma.EmployeeSelect;

/**
 * Sections are ordered by code then name so the list reads the way the codes
 * were issued — `SC-11`, `SC-12`, `SC-13` — with the codeless ones (every row
 * created before sections had a code) falling to the end rather than jumbled
 * through it.
 *
 * There is no People count. Counting people in a section needs
 * `Employee.sectionId`, which does not exist and is a product decision rather
 * than a column: it would be a second assignment axis on the employee, and
 * payroll groups by department only. The shift-report count is what a section
 * genuinely knows about itself, so that is what is returned.
 */
const sectionsSelect = {
  select: {
    id: true,
    code: true,
    name: true,
    isActive: true,
    siteId: true,
    _count: { select: { shiftReports: true } },
  },
  orderBy: [{ code: "asc" }, { name: "asc" }],
} satisfies Prisma.Department$sectionsArgs;

export const departmentInclude = {
  _count: { select: { employees: true } },
  head: { select: headSelect },
  costCenter: { select: { id: true, code: true, name: true, isActive: true } },
  site: { select: { id: true, code: true, name: true } },
  sections: sectionsSelect,
} satisfies Prisma.DepartmentInclude;

export type DepartmentWithPlacement = Prisma.DepartmentGetPayload<{
  include: typeof departmentInclude;
}>;

/**
 * A placement the caller asked for, as the fields `prisma.department.update`
 * wants them — or the sentence to show whoever asked.
 *
 * Every one of the three is nullable on the way in as well as in the column:
 * sending `null` clears the field, and omitting it leaves it alone. That is
 * what a combobox with a "None" option sends, and the difference between the
 * two matters — a PATCH that only renames a department must not quietly unset
 * its head.
 */
export type PlacementInput = {
  headEmployeeId?: string | null;
  costCenterId?: string | null;
  siteId?: string | null;
};

export type PlacementResolution =
  | { ok: true; data: PlacementInput }
  | { ok: false; error: string };

/**
 * Each reference is checked against the caller's own company before it is
 * written. The foreign keys do not do this for us: `Employee`, `CostCenter` and
 * `Site` are all company-scoped tables, and the constraint only asks that the
 * row exists — not that it belongs to the tenant sending the id.
 */
export async function resolveDepartmentPlacement(
  companyId: string,
  input: PlacementInput,
): Promise<PlacementResolution> {
  const data: PlacementInput = {};

  if (input.headEmployeeId !== undefined) {
    if (input.headEmployeeId === null) {
      data.headEmployeeId = null;
    } else {
      const head = await prisma.employee.findFirst({
        where: { id: input.headEmployeeId, companyId },
        select: { id: true },
      });
      if (!head) return { ok: false, error: "That employee is not in this organisation" };
      data.headEmployeeId = head.id;
    }
  }

  if (input.costCenterId !== undefined) {
    if (input.costCenterId === null) {
      data.costCenterId = null;
    } else {
      const costCenter = await prisma.costCenter.findFirst({
        where: { id: input.costCenterId, companyId },
        select: { id: true },
      });
      if (!costCenter) {
        return { ok: false, error: "That cost centre is not in this organisation" };
      }
      data.costCenterId = costCenter.id;
    }
  }

  if (input.siteId !== undefined) {
    if (input.siteId === null) {
      data.siteId = null;
    } else {
      const site = await prisma.site.findFirst({
        where: { id: input.siteId, companyId },
        select: { id: true },
      });
      if (!site) return { ok: false, error: "That site is not in this organisation" };
      data.siteId = site.id;
    }
  }

  return { ok: true, data };
}
