/**
 * The hand-written lists match the Prisma enums they mirror.
 *
 * `CRM_FIELD_ENTITIES` and `CRM_FIELD_TYPES` are `as const` arrays that feed
 * zod enums. Nothing makes them agree with `CrmFieldEntity` and `CrmFieldType`;
 * they are maintained by hand, and both had already drifted:
 *
 *   - `CRM_FIELD_ENTITIES` did not gain the six school record types when the
 *     Prisma enum did, so a school could not define a field on a pupil and the
 *     error listed only the CRM six.
 *   - `TEXT_EDITABLE` in `components/records/custom-field-attributes.tsx` named
 *     "TEXT" and "TEXTAREA", which have never been `CrmFieldType` values.
 *
 * Neither failed loudly. A missing zod member is a 400 that reads like the
 * caller's fault, and a Set miss is just `false`. Parity has to be asserted or
 * it decays.
 *
 * `satisfies readonly CrmFieldEntity[]` on the array catches a value that is not
 * in the enum. These tests catch the other direction — an enum value the array
 * forgot — which is the one that actually happened.
 */
import { describe, expect, it } from "vitest";

import { CRM_FIELD_ENTITIES, CRM_FIELD_TYPES } from "./custom-fields";

/* Mirrors of the generated enums. Written out rather than imported, because
 * `Object.values(Prisma.CrmFieldEntity)` would make both sides the same source
 * and the test vacuous. If you add an enum value, add it here too — that is the
 * deliberate friction. */
const PRISMA_FIELD_ENTITIES = [
  "PERSON",
  "COMPANY",
  "LEAD",
  "DEAL",
  "SITE",
  "WORK_ORDER",
  "STUDENT",
  "GUARDIAN",
  "TEACHER",
  "CLASS",
  "SUBJECT",
  "HOSTEL",
  "REP",
] as const;

const PRISMA_FIELD_TYPES = [
  "SHORT_TEXT",
  "LONG_TEXT",
  "NUMBER",
  "CURRENCY",
  "PERCENT",
  "DATE",
  "DATETIME",
  "CHECKBOX",
  "SINGLE_SELECT",
  "MULTI_SELECT",
  "PHONE",
  "EMAIL",
  "URL",
  "ADDRESS",
  "USER",
  "PERSON",
  "COMPANY",
  "SITE",
] as const;

describe("custom field enum parity", () => {
  it("CRM_FIELD_ENTITIES is a subset of CrmFieldEntity", () => {
    const known = new Set<string>(PRISMA_FIELD_ENTITIES);
    const unknown = CRM_FIELD_ENTITIES.filter((entity) => !known.has(entity));
    expect(unknown).toEqual([]);
  });

  it("excludes exactly the enum members that are not custom-field targets", () => {
    // REP is a `User`. Its fields belong to the platform, not to a tenant, so it
    // is in the discriminator and not in the list of things a tenant may add a
    // field to. Anything else missing here is drift, not design.
    const covered = new Set<string>(CRM_FIELD_ENTITIES);
    const missing = PRISMA_FIELD_ENTITIES.filter((entity) => !covered.has(entity));
    expect(missing).toEqual(["REP"]);
  });

  it("CRM_FIELD_TYPES covers every CrmFieldType value", () => {
    expect([...CRM_FIELD_TYPES].sort()).toEqual([...PRISMA_FIELD_TYPES].sort());
  });

  it("includes the school record types, which is the drift that was here", () => {
    for (const entity of ["STUDENT", "GUARDIAN", "TEACHER", "CLASS", "SUBJECT", "HOSTEL"]) {
      expect(CRM_FIELD_ENTITIES as readonly string[]).toContain(entity);
    }
  });
});
